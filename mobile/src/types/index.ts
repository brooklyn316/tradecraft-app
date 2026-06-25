// Shared types for the mobile app — mirrors web/src/types/index.ts

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

export type Candle = {
  symbol: string;
  interval: string;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type Holding = {
  id: string;
  participant_id: string;
  symbol: string;
  shares: number;
  avg_cost: number;
  updated_at: string;
};

export type Trade = {
  id: string;
  participant_id: string;
  symbol: string;
  company_name: string | null;
  action: "buy" | "sell";
  shares: number;
  price: number;
  total: number;
  executed_at: string;
};

export type Competition = {
  id: string;
  name: string;
  creator_id: string;
  mode: "solo" | "friends" | "bot";
  duration: "week" | "month" | "year";
  starting_cash: number;
  start_date: string;
  end_date: string;
  status: "active" | "completed" | "cancelled";
  invite_code: string;
};

export type CompetitionParticipant = {
  id: string;
  competition_id: string;
  user_id: string | null;
  is_bot: boolean;
  cash_balance: number;
};
