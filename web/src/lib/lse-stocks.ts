// ── London Stock Exchange symbols ─────────────────────────────────────────────
// Yahoo Finance uses .L suffix. Prices in GBp (pence) — displayed as-is.

export const LSE_STOCKS = [
  // ── Mega cap ───────────────────────────────────────────────────────────────
  { symbol: "AZN.L",   name: "AstraZeneca"              },
  { symbol: "SHEL.L",  name: "Shell"                    },
  { symbol: "HSBA.L",  name: "HSBC Holdings"            },
  { symbol: "BP.L",    name: "BP"                       },
  { symbol: "ULVR.L",  name: "Unilever"                 },
  { symbol: "RIO.L",   name: "Rio Tinto"                },
  { symbol: "GSK.L",   name: "GSK"                      },
  { symbol: "DGE.L",   name: "Diageo"                   },
  { symbol: "REL.L",   name: "RELX"                     },
  { symbol: "GLEN.L",  name: "Glencore"                 },
  // ── Finance & banking ─────────────────────────────────────────────────────
  { symbol: "BARC.L",  name: "Barclays"                 },
  { symbol: "LLOY.L",  name: "Lloyds Banking Group"     },
  { symbol: "NWG.L",   name: "NatWest Group"            },
  { symbol: "STAN.L",  name: "Standard Chartered"       },
  { symbol: "LSEG.L",  name: "LSEG"                     },
  { symbol: "III.L",   name: "3i Group"                 },
  { symbol: "PRU.L",   name: "Prudential"               },
  { symbol: "EXPN.L",  name: "Experian"                 },
  // ── Consumer & retail ─────────────────────────────────────────────────────
  { symbol: "TSCO.L",  name: "Tesco"                    },
  { symbol: "MKS.L",   name: "Marks & Spencer"          },
  { symbol: "SBRY.L",  name: "Sainsbury's"              },
  { symbol: "IMB.L",   name: "Imperial Brands"          },
  { symbol: "BATS.L",  name: "Brit. American Tobacco"   },
  { symbol: "ABF.L",   name: "Assoc. British Foods"     },
  { symbol: "JD.L",    name: "JD Sports"                },
  { symbol: "CPG.L",   name: "Compass Group"            },
  // ── Energy & utilities ────────────────────────────────────────────────────
  { symbol: "NG.L",    name: "National Grid"            },
  { symbol: "SSE.L",   name: "SSE"                      },
  // ── Technology & telecoms ─────────────────────────────────────────────────
  { symbol: "VOD.L",   name: "Vodafone"                 },
  { symbol: "WPP.L",   name: "WPP"                      },
  { symbol: "SGE.L",   name: "Sage Group"               },
  { symbol: "AUTO.L",  name: "Auto Trader Group"        },
  { symbol: "OCDO.L",  name: "Ocado Group"              },
  // ── Defence & industrials ─────────────────────────────────────────────────
  { symbol: "BA.L",    name: "BAE Systems"              },
  { symbol: "RKT.L",   name: "Reckitt Benckiser"        },
  { symbol: "AAL.L",   name: "Anglo American"           },
  { symbol: "RTO.L",   name: "Rentokil Initial"         },
  // ── Property & other ─────────────────────────────────────────────────────
  { symbol: "LAND.L",  name: "Land Securities"          },
  { symbol: "BKG.L",   name: "Berkeley Group"           },
  { symbol: "TW.L",    name: "Taylor Wimpey"            },
] as const;

export const LSE_SYMBOLS = LSE_STOCKS.map(s => s.symbol);
