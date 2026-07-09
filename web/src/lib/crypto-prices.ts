// ── Crypto price map ─────────────────────────────────────────────────────────
// Symbols match what Yahoo Finance returns (and what we store in the DB).
// Display strips the "-USD" suffix in StockList.

// Only coins Yahoo Finance actually supports (verified from live data).
// TON, ARB, SUI, UNI, PEPE, SHIB return near-$0 from Yahoo — excluded.
export const COIN_MAP = [
  { symbol: "BTC-USD",  display: "BTC",   name: "Bitcoin"        },
  { symbol: "ETH-USD",  display: "ETH",   name: "Ethereum"       },
  { symbol: "SOL-USD",  display: "SOL",   name: "Solana"         },
  { symbol: "BNB-USD",  display: "BNB",   name: "BNB"            },
  { symbol: "XRP-USD",  display: "XRP",   name: "XRP"            },
  { symbol: "ADA-USD",  display: "ADA",   name: "Cardano"        },
  { symbol: "DOGE-USD", display: "DOGE",  name: "Dogecoin"       },
  { symbol: "AVAX-USD", display: "AVAX",  name: "Avalanche"      },
  { symbol: "DOT-USD",  display: "DOT",   name: "Polkadot"       },
  { symbol: "LINK-USD", display: "LINK",  name: "Chainlink"      },
  { symbol: "ATOM-USD", display: "ATOM",  name: "Cosmos"         },
  { symbol: "LTC-USD",  display: "LTC",   name: "Litecoin"       },
  { symbol: "NEAR-USD", display: "NEAR",  name: "NEAR Protocol"  },
  { symbol: "OP-USD",   display: "OP",    name: "Optimism"       },
] as const;

// Full Yahoo Finance symbols ("BTC-USD") — used for fetching and stored in DB
export const CRYPTO_SYMBOLS = COIN_MAP.map(c => c.symbol);
