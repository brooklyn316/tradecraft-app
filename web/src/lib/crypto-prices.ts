// ── Crypto price map ─────────────────────────────────────────────────────────
// Symbols match what Yahoo Finance returns (and what we store in the DB).
// Display strips the "-USD" suffix in StockList.

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
  { symbol: "UNI-USD",  display: "UNI",   name: "Uniswap"        },
  { symbol: "ATOM-USD", display: "ATOM",  name: "Cosmos"         },
  { symbol: "LTC-USD",  display: "LTC",   name: "Litecoin"       },
  { symbol: "NEAR-USD", display: "NEAR",  name: "NEAR Protocol"  },
  { symbol: "PEPE-USD", display: "PEPE",  name: "Pepe"           },
  { symbol: "SHIB-USD", display: "SHIB",  name: "Shiba Inu"      },
  { symbol: "ARB-USD",  display: "ARB",   name: "Arbitrum"       },
  { symbol: "OP-USD",   display: "OP",    name: "Optimism"       },
  { symbol: "SUI-USD",  display: "SUI",   name: "Sui"            },
  { symbol: "TON-USD",  display: "TON",   name: "Toncoin"        },
] as const;

// Full Yahoo Finance symbols ("BTC-USD") — used for fetching and stored in DB
export const CRYPTO_SYMBOLS = COIN_MAP.map(c => c.symbol);
