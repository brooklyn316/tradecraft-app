/**
 * Options pricing utilities — simplified Black-Scholes for Tradecraft.
 *
 * Assumptions:
 *   σ  = 0.30  (30% implied vol, fixed for all stocks in the game)
 *   r  = 0.05  (5% risk-free rate, annual)
 *   Contract size = 100 shares
 */

const SIGMA = 0.30;
const RISK_FREE_RATE = 0.05;
export const CONTRACT_SIZE = 100; // shares per contract

// ── Standard normal CDF (Abramowitz & Stegun 26.2.17) ─────────────────────
function normCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t * (0.319381530 +
    t * (-0.356563782 +
    t * (1.781477937 +
    t * (-1.821255978 +
    t * 1.330274429))));
  const pdf = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const result = 1 - pdf * poly;
  return x >= 0 ? result : 1 - result;
}

// ── Black-Scholes premium (per share) ─────────────────────────────────────
export function blackScholesPremium(
  S: number,          // current stock price
  K: number,          // strike price
  T: number,          // time to expiry in years (0 = expired)
  type: "call" | "put",
): number {
  if (T <= 0) {
    // At expiry: intrinsic value only
    return type === "call" ? Math.max(0, S - K) : Math.max(0, K - S);
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (RISK_FREE_RATE + SIGMA * SIGMA / 2) * T) / (SIGMA * sqrtT);
  const d2 = d1 - SIGMA * sqrtT;

  let price: number;
  if (type === "call") {
    price = S * normCDF(d1) - K * Math.exp(-RISK_FREE_RATE * T) * normCDF(d2);
  } else {
    price = K * Math.exp(-RISK_FREE_RATE * T) * normCDF(-d2) - S * normCDF(-d1);
  }

  // Floor at $0.01 per share
  return Math.max(0.01, Math.round(price * 100) / 100);
}

// ── Time to expiry in years from now ──────────────────────────────────────
export function timeToExpiryYears(expiryDate: string): number {
  const expiry = new Date(expiryDate + "T23:59:59Z"); // treat as end-of-day UTC
  const diffMs = expiry.getTime() - Date.now();
  return Math.max(0, diffMs / (365.25 * 24 * 60 * 60 * 1000));
}

// ── Compute option premium for a position right now ───────────────────────
export function currentPremium(
  currentPrice: number,
  strike: number,
  expiryDate: string,
  type: "call" | "put",
): number {
  const T = timeToExpiryYears(expiryDate);
  return blackScholesPremium(currentPrice, strike, T, type);
}

// ── Total cost to buy N contracts ─────────────────────────────────────────
export function totalPremiumCost(
  premiumPerShare: number,
  contracts: number,
): number {
  return Math.round(premiumPerShare * CONTRACT_SIZE * contracts * 100) / 100;
}

// ── Intrinsic / settlement value per share at expiry ─────────────────────
export function intrinsicValue(
  stockPrice: number,
  strike: number,
  type: "call" | "put",
): number {
  return type === "call"
    ? Math.max(0, stockPrice - strike)
    : Math.max(0, strike - stockPrice);
}

// ── Generate strike ladder around a stock price ───────────────────────────
export type StrikeInfo = {
  strike: number;
  moneyness: "ITM" | "ATM" | "OTM";
};

export function generateStrikes(currentPrice: number): StrikeInfo[] {
  // Tick size: $1 for stocks ≥ $10, $0.25 for stocks < $10
  const tick = currentPrice >= 10 ? 1 : 0.25;
  const atm = Math.round(currentPrice / tick) * tick;

  const offsets = [-0.20, -0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15, 0.20];
  const strikes = offsets.map(pct => {
    const raw = currentPrice * (1 + pct);
    return Math.round(raw / tick) * tick;
  });

  // Deduplicate and sort
  const unique = [...new Set(strikes)].sort((a, b) => a - b);

  return unique.map(strike => {
    const diff = Math.abs(strike - atm);
    const moneyness: StrikeInfo["moneyness"] =
      diff < tick * 0.5 ? "ATM" :
      strike < currentPrice ? "ITM" : "OTM";  // for calls; inverted for puts
    return { strike, moneyness };
  });
}

// ── Generate expiry dates ──────────────────────────────────────────────────
export function generateExpiries(): string[] {
  const today = new Date();
  const result: string[] = [];

  // Today
  result.push(today.toISOString().split("T")[0]);

  // Tomorrow
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  result.push(tomorrow.toISOString().split("T")[0]);

  // Next Friday (or this Friday if today is Mon–Thu)
  const fri = new Date(today);
  const dayOfWeek = fri.getDay(); // 0=Sun, 5=Fri
  const daysToFri = dayOfWeek <= 5 ? 5 - dayOfWeek : 6; // if Fri/Sat/Sun push to next Fri
  fri.setDate(fri.getDate() + (daysToFri === 0 ? 7 : daysToFri));
  const friStr = fri.toISOString().split("T")[0];
  if (!result.includes(friStr)) result.push(friStr);

  return result;
}
