import { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

// ── Coin map: CoinGecko ID → display symbol + name ───────────────────────────
export const COIN_MAP = [
  { id: "bitcoin",          symbol: "BTC",   name: "Bitcoin"        },
  { id: "ethereum",         symbol: "ETH",   name: "Ethereum"       },
  { id: "solana",           symbol: "SOL",   name: "Solana"         },
  { id: "binancecoin",      symbol: "BNB",   name: "BNB"            },
  { id: "ripple",           symbol: "XRP",   name: "XRP"            },
  { id: "cardano",          symbol: "ADA",   name: "Cardano"        },
  { id: "dogecoin",         symbol: "DOGE",  name: "Dogecoin"       },
  { id: "avalanche-2",      symbol: "AVAX",  name: "Avalanche"      },
  { id: "polkadot",         symbol: "DOT",   name: "Polkadot"       },
  { id: "matic-network",    symbol: "MATIC", name: "Polygon"        },
  { id: "chainlink",        symbol: "LINK",  name: "Chainlink"      },
  { id: "uniswap",          symbol: "UNI",   name: "Uniswap"        },
  { id: "cosmos",           symbol: "ATOM",  name: "Cosmos"         },
  { id: "litecoin",         symbol: "LTC",   name: "Litecoin"       },
  { id: "near",             symbol: "NEAR",  name: "NEAR Protocol"  },
  { id: "pepe",             symbol: "PEPE",  name: "Pepe"           },
  { id: "shiba-inu",        symbol: "SHIB",  name: "Shiba Inu"      },
  { id: "arbitrum",         symbol: "ARB",   name: "Arbitrum"       },
  { id: "optimism",         symbol: "OP",    name: "Optimism"       },
  { id: "sui",              symbol: "SUI",   name: "Sui"            },
] as const;

export const CRYPTO_SYMBOLS = COIN_MAP.map(c => c.symbol);

// ── Fetch prices from CoinGecko and upsert to stock_prices ───────────────────
export async function refreshCryptoPrices(db: DB): Promise<boolean> {
  const ids = COIN_MAP.map(c => c.id).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;

  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;

    const data: Record<string, { usd: number; usd_24h_change?: number; usd_24h_vol?: number }> = await res.json();

    const rows = COIN_MAP.map(coin => {
      const d = data[coin.id];
      if (!d) return null;
      const price        = d.usd ?? 0;
      const changePct    = d.usd_24h_change ?? 0;
      const prevClose    = price / (1 + changePct / 100);
      const changeAmount = price - prevClose;
      return {
        symbol:         coin.symbol,
        company_name:   coin.name,
        price,
        change_percent: changePct,
        change_amount:  changeAmount,
        prev_close:     prevClose,
        open:           prevClose,
        high:           null,
        low:            null,
        volume:         d.usd_24h_vol ?? null,
        updated_at:     new Date().toISOString(),
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    if (!rows.length) return false;

    const { error } = await db
      .from("stock_prices")
      .upsert(rows, { onConflict: "symbol" });

    return !error;
  } catch {
    return false;
  }
}
