// ── NZX (New Zealand Stock Exchange) symbols ──────────────────────────────
// All fetched via Yahoo Finance using .NZ suffix — no API key required.
// Yahoo returns last-known price when NZX is closed, so we fetch unconditionally.

export const NZX_STOCKS = [
  // ── Large cap / NZX50 core ──────────────────────────────────────────────
  { symbol: "AIR.NZ", name: "Air New Zealand"          },
  { symbol: "AIA.NZ", name: "Auckland Airport"         },
  { symbol: "ATM.NZ", name: "a2 Milk Company"          },
  { symbol: "EBO.NZ", name: "Ebos Group"               },
  { symbol: "FPH.NZ", name: "Fisher & Paykel Health."  },
  { symbol: "IFT.NZ", name: "Infratil"                 },
  { symbol: "MEL.NZ", name: "Meridian Energy"          },
  { symbol: "MCY.NZ", name: "Mercury NZ"               },
  { symbol: "MFT.NZ", name: "Mainfreight"              },
  { symbol: "RYM.NZ", name: "Ryman Healthcare"         },
  { symbol: "SPK.NZ", name: "Spark New Zealand"        },
  { symbol: "SUM.NZ", name: "Summerset Group"          },
  // ── Energy & utilities ───────────────────────────────────────────────────
  { symbol: "CEN.NZ", name: "Contact Energy"           },
  { symbol: "GNE.NZ", name: "Genesis Energy"           },
  { symbol: "VCT.NZ", name: "Vector Limited"           },
  { symbol: "NZO.NZ", name: "New Zealand Oil & Gas"    },
  // ── Infrastructure & property ────────────────────────────────────────────
  { symbol: "CNU.NZ", name: "Chorus"                   },
  { symbol: "PCT.NZ", name: "Precinct Properties"      },
  { symbol: "PFI.NZ", name: "Property for Industry"    },
  { symbol: "ARG.NZ", name: "Argosy Property"          },
  { symbol: "NPH.NZ", name: "Napier Port Holdings"     },
  // ── Construction & industrials ───────────────────────────────────────────
  { symbol: "FBU.NZ", name: "Fletcher Building"        },
  { symbol: "STU.NZ", name: "Steel & Tube Holdings"    },
  { symbol: "SKL.NZ", name: "Skellerup Holdings"       },
  { symbol: "SCL.NZ", name: "Scales Corporation"       },
  { symbol: "FRE.NZ", name: "Freightways"              },
  { symbol: "TIL.NZ", name: "Turners Automotive"       },
  // ── Finance & banking ────────────────────────────────────────────────────
  { symbol: "HGH.NZ", name: "Heartland Group"          },
  { symbol: "NZX.NZ", name: "NZX Limited"              },
  // ── Retail & consumer ────────────────────────────────────────────────────
  { symbol: "WHS.NZ", name: "The Warehouse Group"      },
  { symbol: "HLG.NZ", name: "Hallenstein Glasson"      },
  { symbol: "BGP.NZ", name: "Briscoe Group"            },
  { symbol: "MHJ.NZ", name: "Michael Hill Intl."       },
  { symbol: "RBD.NZ", name: "Restaurant Brands NZ"     },
  // ── Healthcare ───────────────────────────────────────────────────────────
  { symbol: "OCA.NZ", name: "Oceania Healthcare"       },
  { symbol: "PEB.NZ", name: "Pacific Edge"             },
  { symbol: "CVT.NZ", name: "Comvita"                  },
  // ── Entertainment & media ────────────────────────────────────────────────
  { symbol: "SKC.NZ", name: "SkyCity Entertainment"    },
  { symbol: "SKT.NZ", name: "Sky Network Television"   },
  // ── Tourism & hospitality ────────────────────────────────────────────────
  { symbol: "THL.NZ", name: "Tourism Holdings"         },
  // ── Technology ───────────────────────────────────────────────────────────
  { symbol: "GTK.NZ", name: "Gentrack Group"           },
  { symbol: "VGL.NZ", name: "Vista Group Intl."        },
  { symbol: "ERD.NZ", name: "EROAD"                    },
  // ── Agriculture & food ───────────────────────────────────────────────────
  { symbol: "SAN.NZ", name: "Sanford"                  },
  { symbol: "SML.NZ", name: "Synlait Milk"             },
  // ── Smaller cap ─────────────────────────────────────────────────────────
  { symbol: "KMD.NZ", name: "KMD Brands (Kathmandu)"  },
  { symbol: "DGL.NZ", name: "DGL Group"                },
  { symbol: "AWF.NZ", name: "AWF Madison Group"        },
  { symbol: "BRM.NZ", name: "Bremworth"                },
  { symbol: "ALF.NZ", name: "Allied Farmers"           },
] as const;

export const NZX_SYMBOLS = NZX_STOCKS.map(s => s.symbol);
