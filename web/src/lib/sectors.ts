// ── Sector definitions ────────────────────────────────────────────────────
export const SECTOR_MAP: Record<string, string> = {
  // Technology
  AAPL: "Technology", MSFT: "Technology", GOOGL: "Technology",
  NVDA: "Technology", AMD:  "Technology", INTC:  "Technology",
  MU:   "Technology", ORCL: "Technology", ADBE:  "Technology",
  CRM:  "Technology", PLTR: "Technology", META:  "Technology",
  // Finance
  JPM:  "Finance", BAC:  "Finance", GS:   "Finance",
  V:    "Finance", MA:   "Finance", PYPL: "Finance",
  COIN: "Finance", SQ:   "Finance", HOOD: "Finance", SOFI: "Finance",
  // Consumer
  WMT:  "Consumer", KO:   "Consumer", NKE:  "Consumer",
  SBUX: "Consumer", MCD:  "Consumer", DIS:  "Consumer",
  NFLX: "Consumer", BABA: "Consumer", SHOP: "Consumer",
  UBER: "Consumer", SNAP: "Consumer", RBLX: "Consumer",
  // Healthcare
  JNJ: "Healthcare", PFE: "Healthcare",
  // Energy
  XOM: "Energy", CVX: "Energy",
  // Autos
  TSLA: "Autos", RIVN: "Autos", F: "Autos", GM: "Autos",
  // Industrials
  BA: "Industrials", CAT: "Industrials", GE: "Industrials",
  MMM: "Industrials", T: "Industrials",
  // ETFs
  SPY: "ETFs", QQQ: "ETFs",
};

export const SECTOR_EMOJIS: Record<string, string> = {
  Technology:  "💻",
  Finance:     "🏦",
  Consumer:    "🛍️",
  Healthcare:  "💊",
  Energy:      "⚡",
  Autos:       "🚗",
  Industrials: "🏭",
  ETFs:        "📊",
};

export const SECTOR_ORDER = [
  "Technology", "Finance", "Consumer", "Healthcare",
  "Energy", "Autos", "Industrials", "ETFs",
];

export interface SectorStats {
  name:           string;
  emoji:          string;
  avg_change_pct: number;
  stock_count:    number;
  symbols:        string[];
}

export interface PlayerAllocation {
  sector:     string;
  value:      number;
  pct_of_portfolio: number;
}

// ── Compute sector performance from stock prices ───────────────────────────
export function computeSectorStats(
  prices: { symbol: string; change_percent: number | null }[],
): SectorStats[] {
  const groups: Record<string, number[]> = {};
  const symbolsInGroup: Record<string, string[]> = {};

  for (const p of prices) {
    const sector = SECTOR_MAP[p.symbol];
    if (!sector || p.change_percent == null) continue;
    if (!groups[sector]) { groups[sector] = []; symbolsInGroup[sector] = []; }
    groups[sector].push(p.change_percent);
    symbolsInGroup[sector].push(p.symbol);
  }

  return SECTOR_ORDER
    .filter(s => groups[s])
    .map(s => ({
      name:           s,
      emoji:          SECTOR_EMOJIS[s] ?? "📈",
      avg_change_pct: groups[s].reduce((a, b) => a + b, 0) / groups[s].length,
      stock_count:    groups[s].length,
      symbols:        symbolsInGroup[s],
    }));
}

// ── Compute player's sector allocation ────────────────────────────────────
export function computePlayerAllocation(
  holdings: { symbol: string; shares: number }[],
  prices:   Record<string, number>,
): PlayerAllocation[] {
  const sectorValues: Record<string, number> = {};
  let totalValue = 0;

  for (const h of holdings) {
    const sector = SECTOR_MAP[h.symbol];
    if (!sector) continue;
    const value = h.shares * (prices[h.symbol] ?? 0);
    sectorValues[sector] = (sectorValues[sector] ?? 0) + value;
    totalValue += value;
  }

  if (totalValue === 0) return [];

  return SECTOR_ORDER
    .filter(s => sectorValues[s])
    .map(s => ({
      sector:           s,
      value:            sectorValues[s],
      pct_of_portfolio: (sectorValues[s] / totalValue) * 100,
    }))
    .sort((a, b) => b.pct_of_portfolio - a.pct_of_portfolio);
}

// ── Rotation score: 0–100 — how well player is in outperforming sectors ──
export function computeRotationScore(
  allocation: PlayerAllocation[],
  sectorStats: SectorStats[],
): number {
  if (!allocation.length || !sectorStats.length) return 0;

  // Rank sectors by performance (highest = best)
  const ranked = [...sectorStats].sort((a, b) => b.avg_change_pct - a.avg_change_pct);
  const n      = ranked.length;
  const rankWeights: Record<string, number> = {};
  ranked.forEach((s, i) => {
    rankWeights[s.name] = (n - i) / n; // 1.0 for #1, decreasing
  });

  // Weighted sum of player allocation × sector rank weight
  let score = 0;
  for (const alloc of allocation) {
    const weight = rankWeights[alloc.sector] ?? 0;
    score += (alloc.pct_of_portfolio / 100) * weight;
  }

  return Math.round(score * 100);
}
