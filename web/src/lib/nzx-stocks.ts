// ── NZX (New Zealand Stock Exchange) symbols ──────────────────────────────
// All fetched via Yahoo Finance using .NZ suffix — no API key required

export const NZX_STOCKS = [
  { symbol: "AIR.NZ", name: "Air New Zealand"         },
  { symbol: "ATM.NZ", name: "a2 Milk Company"         },
  { symbol: "FPH.NZ", name: "Fisher & Paykel Health." },
  { symbol: "SPK.NZ", name: "Spark New Zealand"       },
  { symbol: "MFT.NZ", name: "Mainfreight"             },
  { symbol: "RYM.NZ", name: "Ryman Healthcare"        },
  { symbol: "CEN.NZ", name: "Contact Energy"          },
  { symbol: "MEL.NZ", name: "Meridian Energy"         },
  { symbol: "IFT.NZ", name: "Infratil"                },
  { symbol: "WHS.NZ", name: "The Warehouse Group"     },
  { symbol: "SKC.NZ", name: "SkyCity Entertainment"   },
  { symbol: "KMD.NZ", name: "Kathmandu Holdings"      },
  { symbol: "PCT.NZ", name: "Precinct Properties"     },
  { symbol: "HLG.NZ", name: "Hallenstein Glasson"     },
  { symbol: "PFI.NZ", name: "Property for Industry"   },
] as const;

export const NZX_SYMBOLS = NZX_STOCKS.map(s => s.symbol);
