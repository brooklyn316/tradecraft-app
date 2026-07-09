// ── Tokyo Stock Exchange symbols ───────────────────────────────────────────────
// Yahoo Finance uses numeric code + .T suffix (e.g. "7203.T" for Toyota).
// Prices are in JPY.

export const TSE_STOCKS = [
  // ── Automotive ────────────────────────────────────────────────────────────
  { symbol: "7203.T",  name: "Toyota Motor"             },
  { symbol: "7267.T",  name: "Honda Motor"              },
  { symbol: "7270.T",  name: "Subaru"                   },
  // ── Technology & electronics ──────────────────────────────────────────────
  { symbol: "6758.T",  name: "Sony Group"               },
  { symbol: "6861.T",  name: "Keyence"                  },
  { symbol: "7974.T",  name: "Nintendo"                 },
  { symbol: "8035.T",  name: "Tokyo Electron"           },
  { symbol: "6954.T",  name: "Fanuc"                    },
  { symbol: "6367.T",  name: "Daikin Industries"        },
  { symbol: "7751.T",  name: "Canon"                    },
  { symbol: "6501.T",  name: "Hitachi"                  },
  { symbol: "6594.T",  name: "Nidec"                    },
  { symbol: "6902.T",  name: "DENSO"                    },
  { symbol: "7741.T",  name: "Hoya"                     },
  // ── Finance & banking ─────────────────────────────────────────────────────
  { symbol: "8306.T",  name: "Mitsubishi UFJ FG"        },
  { symbol: "8316.T",  name: "SMFG"                     },
  { symbol: "8411.T",  name: "Mizuho Financial"         },
  { symbol: "8766.T",  name: "Tokio Marine Holdings"    },
  // ── Conglomerates & trading ───────────────────────────────────────────────
  { symbol: "8058.T",  name: "Mitsubishi Corp."         },
  { symbol: "8031.T",  name: "Mitsui & Co."             },
  { symbol: "8001.T",  name: "Itochu Corp."             },
  { symbol: "8002.T",  name: "Marubeni"                 },
  // ── Pharma & healthcare ───────────────────────────────────────────────────
  { symbol: "4568.T",  name: "Daiichi Sankyo"           },
  { symbol: "4519.T",  name: "Chugai Pharmaceutical"    },
  { symbol: "4543.T",  name: "Terumo"                   },
  // ── Telecoms & services ───────────────────────────────────────────────────
  { symbol: "9984.T",  name: "SoftBank Group"           },
  { symbol: "9432.T",  name: "NTT"                      },
  { symbol: "9433.T",  name: "KDDI"                     },
  { symbol: "6098.T",  name: "Recruit Holdings"         },
  // ── Consumer & retail ─────────────────────────────────────────────────────
  { symbol: "4063.T",  name: "Shin-Etsu Chemical"       },
  { symbol: "4661.T",  name: "Oriental Land"            },
  { symbol: "3382.T",  name: "Seven & I Holdings"       },
  { symbol: "2802.T",  name: "Ajinomoto"                },
  // ── Transport & infrastructure ────────────────────────────────────────────
  { symbol: "9022.T",  name: "Central Japan Railway"    },
] as const;

export const TSE_SYMBOLS = TSE_STOCKS.map(s => s.symbol);
