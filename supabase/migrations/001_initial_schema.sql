-- ============================================================
-- Tradecraft — Initial Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- COMPETITIONS
-- ============================================================
create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  creator_id uuid references public.profiles(id) on delete set null,
  mode text not null check (mode in ('solo', 'friends', 'bot')),
  duration text not null check (duration in ('week', 'month', 'year')),
  starting_cash decimal(12,2) not null default 10000.00,
  start_date date not null default current_date,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  invite_code text unique default upper(substring(gen_random_uuid()::text from 1 for 8)),
  created_at timestamptz default now() not null
);

alter table public.competitions enable row level security;

create policy "Competitions are viewable by participants"
  on public.competitions for select
  using (
    auth.uid() in (
      select user_id from public.competition_participants
      where competition_id = id and not is_bot
    )
    or creator_id = auth.uid()
  );

create policy "Authenticated users can create competitions"
  on public.competitions for insert
  with check (auth.uid() = creator_id);

create policy "Creators can update their competitions"
  on public.competitions for update
  using (auth.uid() = creator_id);

-- ============================================================
-- COMPETITION PARTICIPANTS
-- ============================================================
create table public.competition_participants (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references public.competitions(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade,
  is_bot boolean not null default false,
  bot_strategy text check (bot_strategy in ('index', 'momentum', 'random')),
  cash_balance decimal(12,2) not null,
  joined_at timestamptz default now() not null,
  unique(competition_id, user_id)
);

alter table public.competition_participants enable row level security;

create policy "Participants viewable by competition members"
  on public.competition_participants for select
  using (
    competition_id in (
      select competition_id from public.competition_participants cp2
      where cp2.user_id = auth.uid()
    )
  );

create policy "Users can join competitions"
  on public.competition_participants for insert
  with check (auth.uid() = user_id or is_bot = true);

create policy "Users can update their own participation"
  on public.competition_participants for update
  using (auth.uid() = user_id);

-- ============================================================
-- HOLDINGS (current stock positions per participant)
-- ============================================================
create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references public.competition_participants(id) on delete cascade not null,
  symbol text not null,
  shares decimal(10,4) not null default 0 check (shares >= 0),
  avg_cost decimal(12,4) not null,
  updated_at timestamptz default now() not null,
  unique(participant_id, symbol)
);

alter table public.holdings enable row level security;

create policy "Holdings viewable by competition members"
  on public.holdings for select
  using (
    participant_id in (
      select cp.id from public.competition_participants cp
      where cp.competition_id in (
        select competition_id from public.competition_participants cp2
        where cp2.user_id = auth.uid()
      )
    )
  );

create policy "Users can manage their own holdings"
  on public.holdings for all
  using (
    participant_id in (
      select id from public.competition_participants
      where user_id = auth.uid()
    )
  );

-- ============================================================
-- TRADES (transaction history)
-- ============================================================
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references public.competition_participants(id) on delete cascade not null,
  symbol text not null,
  company_name text,
  action text not null check (action in ('buy', 'sell')),
  shares decimal(10,4) not null check (shares > 0),
  price decimal(12,4) not null check (price > 0),
  total decimal(12,4) not null,
  executed_at timestamptz default now() not null
);

alter table public.trades enable row level security;

create policy "Trades viewable by competition members"
  on public.trades for select
  using (
    participant_id in (
      select cp.id from public.competition_participants cp
      where cp.competition_id in (
        select competition_id from public.competition_participants cp2
        where cp2.user_id = auth.uid()
      )
    )
  );

create policy "Users can insert their own trades"
  on public.trades for insert
  with check (
    participant_id in (
      select id from public.competition_participants
      where user_id = auth.uid()
    )
  );

-- ============================================================
-- STOCK PRICES (live price cache — updated by edge function)
-- ============================================================
create table public.stock_prices (
  symbol text primary key,
  company_name text,
  price decimal(12,4) not null,
  open decimal(12,4),
  high decimal(12,4),
  low decimal(12,4),
  prev_close decimal(12,4),
  change_amount decimal(12,4),
  change_percent decimal(8,4),
  volume bigint,
  market_cap bigint,
  updated_at timestamptz default now() not null
);

alter table public.stock_prices enable row level security;

create policy "Stock prices are publicly readable"
  on public.stock_prices for select using (true);

create policy "Only service role can write stock prices"
  on public.stock_prices for all
  using (auth.role() = 'service_role');

-- ============================================================
-- STOCK CANDLES (OHLCV data for candlestick + line charts)
-- ============================================================
create table public.stock_candles (
  id bigserial primary key,
  symbol text not null,
  interval text not null check (interval in ('5min', '15min', '60min', '1day')),
  time timestamptz not null,
  open decimal(12,4) not null,
  high decimal(12,4) not null,
  low decimal(12,4) not null,
  close decimal(12,4) not null,
  volume bigint,
  unique(symbol, interval, time)
);

alter table public.stock_candles enable row level security;

create policy "Candles are publicly readable"
  on public.stock_candles for select using (true);

create policy "Only service role can write candles"
  on public.stock_candles for all
  using (auth.role() = 'service_role');

-- ============================================================
-- WATCHLIST (user's tracked stocks)
-- ============================================================
create table public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  symbol text not null,
  added_at timestamptz default now() not null,
  unique(user_id, symbol)
);

alter table public.watchlist enable row level security;

create policy "Users can manage their own watchlist"
  on public.watchlist for all
  using (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_competition_participants_competition on public.competition_participants(competition_id);
create index idx_competition_participants_user on public.competition_participants(user_id);
create index idx_holdings_participant on public.holdings(participant_id);
create index idx_trades_participant on public.trades(participant_id);
create index idx_trades_executed_at on public.trades(executed_at desc);
create index idx_stock_candles_symbol_interval on public.stock_candles(symbol, interval);
create index idx_stock_candles_time on public.stock_candles(time desc);
create index idx_stock_prices_updated on public.stock_prices(updated_at desc);
create index idx_watchlist_user on public.watchlist(user_id);

-- ============================================================
-- REALTIME (enable for live price updates)
-- ============================================================
alter publication supabase_realtime add table public.stock_prices;
alter publication supabase_realtime add table public.stock_candles;
alter publication supabase_realtime add table public.trades;
alter publication supabase_realtime add table public.competition_participants;

-- ============================================================
-- SEED: popular stocks for the price cache
-- ============================================================
insert into public.stock_prices (symbol, company_name, price, open, high, low, change_amount, change_percent, volume)
values
  ('AAPL', 'Apple Inc.', 213.44, 211.20, 214.80, 210.50, 2.24, 1.06, 52341200),
  ('NVDA', 'NVIDIA Corporation', 897.12, 864.30, 901.50, 860.20, 32.82, 3.80, 41209800),
  ('MSFT', 'Microsoft Corporation', 424.71, 422.10, 426.90, 421.30, 2.61, 0.62, 18432100),
  ('TSLA', 'Tesla Inc.', 174.88, 178.90, 179.40, 173.20, -4.02, -2.24, 89234500),
  ('AMZN', 'Amazon.com Inc.', 186.33, 187.20, 188.50, 185.10, -0.87, -0.46, 33451200),
  ('META', 'Meta Platforms Inc.', 518.90, 508.40, 522.10, 507.80, 10.50, 2.07, 15678900),
  ('GOOGL', 'Alphabet Inc.', 174.50, 173.20, 175.80, 172.40, 1.30, 0.75, 22341800),
  ('AMD', 'Advanced Micro Devices', 178.22, 175.10, 180.40, 174.50, 3.12, 1.78, 44523100),
  ('NFLX', 'Netflix Inc.', 628.45, 622.30, 631.90, 620.10, 6.15, 0.99, 8932400),
  ('COIN', 'Coinbase Global Inc.', 224.18, 218.50, 226.90, 217.40, 5.68, 2.60, 12043200),
  ('SPY', 'SPDR S&P 500 ETF', 529.84, 527.20, 531.40, 526.30, 2.64, 0.50, 65432100),
  ('QQQ', 'Invesco QQQ Trust', 455.23, 452.10, 457.80, 451.20, 3.13, 0.69, 38921400)
on conflict (symbol) do nothing;
