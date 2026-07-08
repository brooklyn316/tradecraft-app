// ── Market hours utilities ────────────────────────────────────────────────
// Safe to import on both client and server

export interface MarketStatus {
  nyse:   { open: boolean; label: string };
  nzx:    { open: boolean; label: string };
  crypto: { open: boolean; label: string };
}

function minsInTz(tz: string): { day: number; mins: number } {
  const now = new Date();
  const loc = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  return { day: loc.getDay(), mins: loc.getHours() * 60 + loc.getMinutes() };
}

/** NYSE / NASDAQ: 9:30am–4:00pm ET, Mon–Fri */
export function isNYSEOpen(): boolean {
  const { day, mins } = minsInTz("America/New_York");
  if (day === 0 || day === 6) return false;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

/** NZX: 10:00am–4:45pm NZST/NZDT (Pacific/Auckland), Mon–Fri */
export function isNZXOpen(): boolean {
  const { day, mins } = minsInTz("Pacific/Auckland");
  if (day === 0 || day === 6) return false;
  return mins >= 10 * 60 && mins < 16 * 60 + 45;
}

/** Crypto trades 24/7 */
export function isCryptoOpen(): boolean {
  return true;
}

export function getMarketStatus(): MarketStatus {
  return {
    nyse:   { open: isNYSEOpen(),   label: isNYSEOpen()  ? "NYSE OPEN"   : "NYSE CLOSED"   },
    nzx:    { open: isNZXOpen(),    label: isNZXOpen()   ? "NZX OPEN"    : "NZX CLOSED"    },
    crypto: { open: true,           label: "CRYPTO 24/7"                                    },
  };
}
