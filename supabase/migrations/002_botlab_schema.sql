-- ============================================================
-- Tradecraft Bot Lab — Database Schema
-- New Supabase project, isolated from live Tradecraft app.
-- Run in SQL Editor on a fresh project.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- BOTS
-- One row per bot. Seeded once at project creation.
-- ============================================================
create table public.bots (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,         -- e.g. 'A1', 'E3'
  name          text not null,                -- e.g. 'Index Bot'
  group_id      text not null,               -- 'A' | 'B' | 'C' | 'D' | 'E'
  description   text,
  starting_cash decimal(12,2) not null default 1000.00,
  is_active     boolean not null default true,
  created_at    timestamptz default now() not null
);

-- ============================================================
-- BOT PORTFOLIOS
-- Current financial state of each bot (cash + last activity).
-- ============================================================
create table public.bot_portfolios (
  id              uuid primary key default gen_random_uuid(),
  bot_id          uuid references public.bots(id) on delete cascade not null unique,
  cash_balance    decimal(12,2) not null,
  is_dormant      boolean not null default false,  -- true when cash < $50
  last_traded_at  timestamptz,                     -- for 30-min cooldown
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null
);

-- ============================================================
-- BOT HOLDINGS
-- Current open positions per bot.
-- ============================================================
create table public.bot_holdings (
  id             uuid primary key default gen_random_uuid(),
  bot_id         uuid references public.bots(id) on delete cascade not null,
  symbol         text not null,
  shares         decimal(12,6) not null default 0 check (shares >= 0),
  avg_cost       decimal(12,4) not null,
  updated_at     timestamptz default now() not null,
  unique(bot_id, symbol)
);

create index idx_bot_holdings_bot on public.bot_holdings(bot_id);

-- ============================================================
-- BOT TRADES
-- Full transaction log.
-- ============================================================
create table public.bot_trades (
  id           uuid primary key default gen_random_uuid(),
  bot_id       uuid references public.bots(id) on delete cascade not null,
  symbol       text not null,
  company_name text,
  action       text not null check (action in ('buy', 'sell')),
  shares       decimal(12,6) not null check (shares > 0),
  price        decimal(12,4) not null check (price > 0),
  total        decimal(12,4) not null,
  reason       text,                    -- human-readable trigger (e.g. 'RSI oversold -3 days')
  executed_at  timestamptz default now() not null
);

create index idx_bot_trades_bot on public.bot_trades(bot_id);
create index idx_bot_trades_executed on public.bot_trades(executed_at desc);

-- ============================================================
-- BOT DAILY SNAPSHOTS
-- One row per bot per calendar day. The equity curve.
-- Written by the end-of-day cron job.
-- ============================================================
create table public.bot_daily_snapshots (
  id                uuid primary key default gen_random_uuid(),
  bot_id            uuid references public.bots(id) on delete cascade not null,
  snapshot_date     date not null,
  portfolio_value   decimal(12,2) not null,   -- holdings market value only
  cash_balance      decimal(12,2) not null,
  total_value       decimal(12,2) not null,   -- portfolio_value + cash_balance
  day_pnl           decimal(12,2) not null,   -- today's total_value - yesterday's
  cumulative_return decimal(8,4) not null,    -- ((total_value / 1000) - 1) * 100
  holdings_json     jsonb,                    -- snapshot of positions [{symbol, shares, price, value}]
  created_at        timestamptz default now() not null,
  unique(bot_id, snapshot_date)
);

create index idx_bot_snapshots_bot_date on public.bot_daily_snapshots(bot_id, snapshot_date desc);
create index idx_bot_snapshots_date on public.bot_daily_snapshots(snapshot_date desc);

-- ============================================================
-- STOCK PRICES
-- Shared price cache. Updated by the price-fetcher edge function.
-- Reused from Tradecraft schema — same structure.
-- ============================================================
create table public.stock_prices (
  symbol           text primary key,
  company_name     text,
  price            decimal(12,4) not null,
  open             decimal(12,4),
  high             decimal(12,4),
  low              decimal(12,4),
  prev_close       decimal(12,4),
  change_amount    decimal(12,4),
  change_percent   decimal(8,4),
  volume           bigint,
  week_52_high     decimal(12,4),
  week_52_low      decimal(12,4),
  updated_at       timestamptz default now() not null
);

create index idx_stock_prices_updated on public.stock_prices(updated_at desc);

-- ============================================================
-- STOCK PRICE HISTORY
-- Daily OHLCV — used for momentum/RSI calculations.
-- Bot engine reads last N days from here.
-- ============================================================
create table public.stock_price_history (
  id         bigserial primary key,
  symbol     text not null,
  date       date not null,
  open       decimal(12,4) not null,
  high       decimal(12,4) not null,
  low        decimal(12,4) not null,
  close      decimal(12,4) not null,
  volume     bigint,
  unique(symbol, date)
);

create index idx_price_history_symbol_date on public.stock_price_history(symbol, date desc);

-- ============================================================
-- EXTERNAL DATA CACHE
-- Stores raw payloads from Capitol Trades, SEC EDGAR, ARK, etc.
-- Bot Group E reads from here. Updated by separate fetch jobs.
-- ============================================================
create table public.external_data_cache (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,   -- 'capitol_trades' | 'sec_13f' | 'ark_holdings'
  key          text not null,   -- e.g. ticker symbol or fund name
  payload      jsonb not null,
  fetched_at   timestamptz default now() not null,
  unique(source, key)
);

create index idx_ext_cache_source on public.external_data_cache(source, fetched_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- Bot Lab has no end users — RLS is minimal.
-- Service role key bypasses all policies; anon can read for dashboard.
-- ============================================================
alter table public.bots enable row level security;
alter table public.bot_portfolios enable row level security;
alter table public.bot_holdings enable row level security;
alter table public.bot_trades enable row level security;
alter table public.bot_daily_snapshots enable row level security;
alter table public.stock_prices enable row level security;
alter table public.stock_price_history enable row level security;
alter table public.external_data_cache enable row level security;

-- Anon read-only for dashboard (no sensitive data here)
create policy "Public read bots"               on public.bots               for select using (true);
create policy "Public read portfolios"         on public.bot_portfolios      for select using (true);
create policy "Public read holdings"           on public.bot_holdings        for select using (true);
create policy "Public read trades"             on public.bot_trades          for select using (true);
create policy "Public read snapshots"          on public.bot_daily_snapshots for select using (true);
create policy "Public read prices"             on public.stock_prices        for select using (true);
create policy "Public read price history"      on public.stock_price_history for select using (true);
create policy "Public read ext cache"          on public.external_data_cache for select using (true);

-- All writes via service role only (cron jobs, edge functions)
create policy "Service write bots"             on public.bots               for all using (auth.role() = 'service_role');
create policy "Service write portfolios"       on public.bot_portfolios      for all using (auth.role() = 'service_role');
create policy "Service write holdings"         on public.bot_holdings        for all using (auth.role() = 'service_role');
create policy "Service write trades"           on public.bot_trades          for all using (auth.role() = 'service_role');
create policy "Service write snapshots"        on public.bot_daily_snapshots for all using (auth.role() = 'service_role');
create policy "Service write prices"           on public.stock_prices        for all using (auth.role() = 'service_role');
create policy "Service write price history"    on public.stock_price_history for all using (auth.role() = 'service_role');
create policy "Service write ext cache"        on public.external_data_cache for all using (auth.role() = 'service_role');

-- ============================================================
-- SEED: Bot definitions
-- ============================================================
insert into public.bots (code, name, group_id, description) values
  -- Group A: Rule-Based
  ('A1', 'Index Bot',    'A', 'Equal-weight rebalancer across AAPL, MSFT, GOOGL, AMZN, NVDA. Trades only on 10%+ drift.'),
  ('A2', 'Momentum Bot', 'A', 'Buys top daily gainers (>1%), cuts any holding that drops >2% in a day.'),
  ('A3', 'Value Bot',    'A', 'Buys near 52-week lows, sells on +15% gain.'),
  ('A4', 'Dividend Bot', 'A', 'Holds KO, JNJ, JPM, WMT, XOM. Never sells unless forced by dormancy.'),
  ('A5', 'Chaos Bot',    'A', 'Control group. 35% chance of inaction; otherwise random buy or partial sell.'),

  -- Group B: Global ETFs
  ('B1', 'Global Rotation Bot', 'B', 'Holds 2 ETFs with best 5-day return. Recalculates and swaps daily.'),
  ('B2', 'Safe Haven Bot',      'B', 'Holds SPY by default; retreats to full cash if SPY drops >1% in a day.'),
  ('B3', 'Pacific Focus Bot',   'B', 'Equal weight across ENZL, EWA, EWJ. Rebalances weekly.'),

  -- Group C: Technical Analysis
  ('C1', 'RSI Reversal Bot',    'C', 'Buys after 3 consecutive down days. Exits at +5% or -3% from entry.'),
  ('C2', 'Breakout Bot',        'C', 'Buys stocks up >2% today; re-evaluates after 24h.'),
  ('C3', 'Mean Reversion Bot',  'C', 'Buys stocks down >2% today expecting a bounce. Exits at +3% or -5%.'),

  -- Group D: Adaptive
  ('D1', 'Shadow Bot', 'D', 'Starts copying #1 Group A bot. Checks leaderboard weekly and switches to the current leader.'),

  -- Group E: Political & Institutional Intelligence
  ('E1', 'Congress Momentum Bot', 'E', 'Buys stocks purchased by 3+ Congress members in the last 30 days.'),
  ('E2', 'Pelosi Equity Bot',     'E', 'Mirrors Nancy Pelosi''s disclosed equity positions (STOCK Act).'),
  ('E3', 'Pelosi Options Bot',    'E', 'Mirrors Paul Pelosi''s options trades, converted to underlying shares.'),
  ('E4', 'Buffett Bot',           'E', 'Equal weight across Berkshire Hathaway''s top 5 13F holdings. Rebalances quarterly.'),
  ('E5', 'ARK Bot',               'E', 'Top 5 positions from ARK Innovation ETF. Rebalances weekly.'),
  ('E6', 'Hedge Fund Consensus Bot', 'E', 'Buys stocks in top 10 holdings of 5+ major hedge funds simultaneously.');

-- ============================================================
-- SEED: Bot portfolios (one per bot, starting at $1,000 cash)
-- ============================================================
insert into public.bot_portfolios (bot_id, cash_balance)
select id, 1000.00 from public.bots;

-- ============================================================
-- SEED: Stock price stubs for all symbols bots may trade
-- (Real prices fetched on first cron run)
-- ============================================================
insert into public.stock_prices (symbol, company_name, price) values
  -- Group A stocks
  ('AAPL',  'Apple Inc.',                   1.00),
  ('MSFT',  'Microsoft Corporation',        1.00),
  ('GOOGL', 'Alphabet Inc.',                1.00),
  ('AMZN',  'Amazon.com Inc.',              1.00),
  ('NVDA',  'NVIDIA Corporation',           1.00),
  -- Group A Value / Dividend candidates
  ('KO',    'Coca-Cola Co.',                1.00),
  ('JNJ',   'Johnson & Johnson',            1.00),
  ('JPM',   'JPMorgan Chase & Co.',         1.00),
  ('WMT',   'Walmart Inc.',                 1.00),
  ('XOM',   'Exxon Mobil Corporation',      1.00),
  -- Group B ETFs
  ('SPY',   'SPDR S&P 500 ETF',             1.00),
  ('QQQ',   'Invesco QQQ Trust',            1.00),
  ('ENZL',  'iShares MSCI New Zealand ETF', 1.00),
  ('EWA',   'iShares MSCI Australia ETF',   1.00),
  ('EZU',   'iShares MSCI Eurozone ETF',    1.00),
  ('EWJ',   'iShares MSCI Japan ETF',       1.00),
  ('FXI',   'iShares China Large-Cap ETF',  1.00)
on conflict (symbol) do nothing;
