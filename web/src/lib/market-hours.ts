// ── Market hours utilities ────────────────────────────────────────────────
// Safe to import on both client and server

export interface MarketStatus {
  nyse:   { open: boolean; label: string };
  lse:    { open: boolean; label: string };
  tse:    { open: boolean; label: string };
  asx:    { open: boolean; label: string };
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

/** LSE: 8:00am–4:30pm GMT/BST (Europe/London), Mon–Fri */
export function isLSEOpen(): boolean {
  const { day, mins } = minsInTz("Europe/London");
  if (day === 0 || day === 6) return false;
  return mins >= 8 * 60 && mins < 16 * 60 + 30;
}

/** TSE: 9:00am–11:30am + 12:30pm–3:30pm JST (Asia/Tokyo), Mon–Fri */
export function isTSEOpen(): boolean {
  const { day, mins } = minsInTz("Asia/Tokyo");
  if (day === 0 || day === 6) return false;
  const morning   = mins >= 9 * 60 && mins < 11 * 60 + 30;
  const afternoon = mins >= 12 * 60 + 30 && mins < 15 * 60 + 30;
  return morning || afternoon;
}

/** ASX: 10:00am–4:00pm AEST/AEDT (Australia/Sydney), Mon–Fri */
export function isASXOpen(): boolean {
  const { day, mins } = minsInTz("Australia/Sydney");
  if (day === 0 || day === 6) return false;
  return mins >= 10 * 60 && mins < 16 * 60;
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
  const nyse = isNYSEOpen();
  const lse  = isLSEOpen();
  const tse  = isTSEOpen();
  const asx  = isASXOpen();
  const nzx  = isNZXOpen();
  return {
    nyse:   { open: nyse,  label: nyse  ? "NYSE OPEN"   : "NYSE CLOSED"   },
    lse:    { open: lse,   label: lse   ? "LSE OPEN"    : "LSE CLOSED"    },
    tse:    { open: tse,   label: tse   ? "TSE OPEN"    : "TSE CLOSED"    },
    asx:    { open: asx,   label: asx   ? "ASX OPEN"    : "ASX CLOSED"    },
    nzx:    { open: nzx,   label: nzx   ? "NZX OPEN"    : "NZX CLOSED"    },
    crypto: { open: true,  label: "CRYPTO 24/7"                            },
  };
}
