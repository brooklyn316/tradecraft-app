// ============================================================
// Tradecraft — Shared TypeScript types
// ============================================================

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type CompetitionMode = "solo" | "friends" | "bot";
export type CompetitionDuration = "week" | "month" | "year";
export type CompetitionStatus = "active" | "completed" | "cancelled";

export type Competition = {
  id: string;
  name: string;
  creator_id: string;
  mode: CompetitionMode;
  duration: CompetitionDuration;
  starting_cash: number;
  start_date: string;
  end_date: string;
  status: CompetitionStatus;
  invite_code: string;
  created_at: string;
};

export type BotStrategy = "index" | "momentum" | "random";

export type CompetitionParticipant = {
  id: string;
  competition_id: string;
  user_id: string | null;
  is_bot: boolean;
  bot_strategy: BotStrategy | null;
  cash_balance: number;
  joined_at: string;
  // joined from profiles
  profile?: Profile;
};

export type Holding = {
  id: string;
  participant_id: string;
  symbol: string;
  shares: number;
  avg_cost: number;
  updated_at: string;
  // derived
  current_price?: number;
  market_value?: number;
  pnl?: number;
  pnl_percent?: number;
};

export type TradeAction = "buy" | "sell";

export type Trade = {
  id: string;
  participant_id: string;
  symbol: string;
  company_name: string | null;
  action: TradeAction;
  shares: number;
  price: number;
  total: number;
  executed_at: string;
};

export type StockPrice = {
  symbol: string;
  company_name: string | null;
  price: number;
  open: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  change_amount: number | null;
  change_percent: number | null;
  volume: number | null;
  updated_at: string;
};

export type CandleInterval = "5min" | "15min" | "60min" | "1day";

export type Candle = {
  symbol: string;
  interval: CandleInterval;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

// For lightweight-charts
export type OhlcData = {
  time: number; // unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
};

export type LineData = {
  time: number;
  value: number;
};

export type ChartType = "candlestick" | "line";

export type LeaderboardEntry = {
  participant_id: string;
  user_id: string | null;
  is_bot: boolean;
  username: string;
  cash_balance: number;
  portfolio_value: number;
  total_value: number;
  return_amount: number;
  return_percent: number;
  rank: number;
};

export type WatchlistItem = {
  id: string;
  user_id: string;
  symbol: string;
  added_at: string;
  price?: StockPrice;
};
