// ── Australian Securities Exchange symbols ────────────────────────────────────
// Yahoo Finance uses .AX suffix. Prices are in AUD.

export const ASX_STOCKS = [
  // ── Resources & mining ────────────────────────────────────────────────────
  { symbol: "BHP.AX",  name: "BHP Group"               },
  { symbol: "RIO.AX",  name: "Rio Tinto"               },
  { symbol: "FMG.AX",  name: "Fortescue"               },
  { symbol: "S32.AX",  name: "South32"                 },
  { symbol: "MIN.AX",  name: "Mineral Resources"       },
  { symbol: "PLS.AX",  name: "Pilbara Minerals"        },
  { symbol: "LYC.AX",  name: "Lynas Rare Earths"       },
  { symbol: "PDN.AX",  name: "Paladin Energy"          },
  // ── Energy ────────────────────────────────────────────────────────────────
  { symbol: "WDS.AX",  name: "Woodside Energy"         },
  { symbol: "STO.AX",  name: "Santos"                  },
  { symbol: "ALD.AX",  name: "Ampol"                   },
  // ── Finance & banking ─────────────────────────────────────────────────────
  { symbol: "CBA.AX",  name: "Commonwealth Bank"       },
  { symbol: "NAB.AX",  name: "Natl. Australia Bank"    },
  { symbol: "WBC.AX",  name: "Westpac Banking"         },
  { symbol: "ANZ.AX",  name: "ANZ Group"               },
  { symbol: "MQG.AX",  name: "Macquarie Group"         },
  { symbol: "ASX.AX",  name: "ASX Limited"             },
  { symbol: "CPU.AX",  name: "Computershare"           },
  // ── Healthcare ────────────────────────────────────────────────────────────
  { symbol: "CSL.AX",  name: "CSL Limited"             },
  { symbol: "RMD.AX",  name: "ResMed"                  },
  { symbol: "COH.AX",  name: "Cochlear"                },
  // ── Consumer & retail ─────────────────────────────────────────────────────
  { symbol: "WES.AX",  name: "Wesfarmers"              },
  { symbol: "WOW.AX",  name: "Woolworths Group"        },
  { symbol: "COL.AX",  name: "Coles Group"             },
  { symbol: "ALL.AX",  name: "Aristocrat Leisure"      },
  { symbol: "QAN.AX",  name: "Qantas Airways"          },
  // ── Property & infrastructure ─────────────────────────────────────────────
  { symbol: "GMG.AX",  name: "Goodman Group"           },
  { symbol: "TCL.AX",  name: "Transurban Group"        },
  // ── Technology ────────────────────────────────────────────────────────────
  { symbol: "XRO.AX",  name: "Xero"                   },
  { symbol: "REA.AX",  name: "REA Group"               },
  { symbol: "NXT.AX",  name: "NextDC"                  },
  { symbol: "IEL.AX",  name: "IDP Education"           },
  // ── Industrials ───────────────────────────────────────────────────────────
  { symbol: "JHX.AX",  name: "James Hardie Ind."       },
  { symbol: "AMC.AX",  name: "Amcor"                   },
  { symbol: "ORI.AX",  name: "Orica"                   },
  { symbol: "TLS.AX",  name: "Telstra"                 },
] as const;

export const ASX_SYMBOLS = ASX_STOCKS.map(s => s.symbol);
