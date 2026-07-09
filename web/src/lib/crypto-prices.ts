// ── Crypto price map ─────────────────────────────────────────────────────────
// Symbols match Yahoo Finance format (stored as "BTC-USD" in DB).
// Display strips the "-USD" suffix in StockList.
// Note: some newer/micro-cap tokens aren't on Yahoo Finance and will return $0 —
// after first tick, remove any that appear at $0.00 with 0% change.

export const COIN_MAP = [
  // ── Tier 1 — verified working ─────────────────────────────────────────────
  { symbol: "BTC-USD",   display: "BTC",   name: "Bitcoin"           },
  { symbol: "ETH-USD",   display: "ETH",   name: "Ethereum"          },
  { symbol: "BNB-USD",   display: "BNB",   name: "BNB"               },
  { symbol: "SOL-USD",   display: "SOL",   name: "Solana"            },
  { symbol: "XRP-USD",   display: "XRP",   name: "XRP"               },
  { symbol: "ADA-USD",   display: "ADA",   name: "Cardano"           },
  { symbol: "AVAX-USD",  display: "AVAX",  name: "Avalanche"         },
  { symbol: "DOGE-USD",  display: "DOGE",  name: "Dogecoin"          },
  { symbol: "DOT-USD",   display: "DOT",   name: "Polkadot"          },
  { symbol: "LINK-USD",  display: "LINK",  name: "Chainlink"         },
  { symbol: "LTC-USD",   display: "LTC",   name: "Litecoin"          },
  { symbol: "ATOM-USD",  display: "ATOM",  name: "Cosmos"            },
  { symbol: "NEAR-USD",  display: "NEAR",  name: "NEAR Protocol"     },
  { symbol: "OP-USD",    display: "OP",    name: "Optimism"          },
  // ── Tier 2 — established coins ────────────────────────────────────────────
  { symbol: "BCH-USD",   display: "BCH",   name: "Bitcoin Cash"      },
  { symbol: "MATIC-USD", display: "MATIC", name: "Polygon"           },
  { symbol: "XLM-USD",   display: "XLM",   name: "Stellar"           },
  { symbol: "ETC-USD",   display: "ETC",   name: "Ethereum Classic"  },
  { symbol: "TRX-USD",   display: "TRX",   name: "TRON"              },
  { symbol: "XMR-USD",   display: "XMR",   name: "Monero"            },
  { symbol: "HBAR-USD",  display: "HBAR",  name: "Hedera"            },
  { symbol: "ALGO-USD",  display: "ALGO",  name: "Algorand"          },
  { symbol: "XTZ-USD",   display: "XTZ",   name: "Tezos"             },
  { symbol: "FIL-USD",   display: "FIL",   name: "Filecoin"          },
  { symbol: "EOS-USD",   display: "EOS",   name: "EOS"               },
  { symbol: "ZEC-USD",   display: "ZEC",   name: "Zcash"             },
  { symbol: "DASH-USD",  display: "DASH",  name: "Dash"              },
  { symbol: "NEO-USD",   display: "NEO",   name: "NEO"               },
  { symbol: "KSM-USD",   display: "KSM",   name: "Kusama"            },
  // ── Tier 3 — DeFi & ecosystem tokens ─────────────────────────────────────
  { symbol: "MKR-USD",   display: "MKR",   name: "Maker"             },
  { symbol: "AAVE-USD",  display: "AAVE",  name: "Aave"              },
  { symbol: "COMP-USD",  display: "COMP",  name: "Compound"          },
  { symbol: "SNX-USD",   display: "SNX",   name: "Synthetix"         },
  { symbol: "YFI-USD",   display: "YFI",   name: "Yearn Finance"     },
  { symbol: "GRT-USD",   display: "GRT",   name: "The Graph"         },
  // ── Tier 4 — Gaming, metaverse & other ───────────────────────────────────
  { symbol: "MANA-USD",  display: "MANA",  name: "Decentraland"      },
  { symbol: "SAND-USD",  display: "SAND",  name: "The Sandbox"       },
  { symbol: "AXS-USD",   display: "AXS",   name: "Axie Infinity"     },
  { symbol: "ENJ-USD",   display: "ENJ",   name: "Enjin Coin"        },
  { symbol: "CHZ-USD",   display: "CHZ",   name: "Chiliz"            },
  { symbol: "BAT-USD",   display: "BAT",   name: "Basic Attention"   },
  { symbol: "THETA-USD", display: "THETA", name: "Theta Network"     },
  { symbol: "FLOW-USD",  display: "FLOW",  name: "Flow"              },
  { symbol: "EGLD-USD",  display: "EGLD",  name: "MultiversX"        },
  { symbol: "VET-USD",   display: "VET",   name: "VeChain"           },
  // ── Tier 5 — Other established ───────────────────────────────────────────
  { symbol: "FTM-USD",   display: "FTM",   name: "Fantom"            },
  { symbol: "ONE-USD",   display: "ONE",   name: "Harmony"           },
  { symbol: "CRO-USD",   display: "CRO",   name: "Cronos"            },
  { symbol: "ROSE-USD",  display: "ROSE",  name: "Oasis Network"     },
  { symbol: "KAVA-USD",  display: "KAVA",  name: "Kava"              },
] as const;

// Full Yahoo Finance symbols ("BTC-USD") — used for fetching and stored in DB
export const CRYPTO_SYMBOLS = COIN_MAP.map(c => c.symbol);
