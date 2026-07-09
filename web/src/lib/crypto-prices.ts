import { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

// ── Coin map: Yahoo Finance symbol → display symbol + name ───────────────────
// Using Yahoo Finance ("BTC-USD") so we reuse the same reliable source as stocks.
// Internal symbols stored in DB as "BTC", "ETH", etc. (without -USD).
export const COIN_MAP = [
  { yahoo: "BTC-USD",   symbol: "BTC",   name: "Bitcoin"        },
  { yahoo: "ETH-USD",   symbol: "ETH",   name: "Ethereum"       },
  { yahoo: "SOL-USD",   symbol: "SOL",   name: "Solana"         },
  { yahoo: "BNB-USD",   symbol: "BNB",   name: "BNB"            },
  { yahoo: "XRP-USD",   symbol: "XRP",   name: "XRP"            },
  { yahoo: "ADA-USD",   symbol: "ADA",   name: "Cardano"        },
  { yahoo: "DOGE-USD",  symbol: "DOGE",  name: "Dogecoin"       },
  { yahoo: "AVAX-USD",  symbol: "AVAX",  name: "Avalanche"      },
  { yahoo: "DOT-USD",   symbol: "DOT",   name: "Polkadot"       },
  { yahoo: "LINK-USD",  symbol: "LINK",  name: "Chainlink"      },
  { yahoo: "UNI-USD",   symbol: "UNI",   name: "Uniswap"        },
  { yahoo: "ATOM-USD",  symbol: "ATOM",  name: "Cosmos"         },
  { yahoo: "LTC-USD",   symbol: "LTC",   name: "Litecoin"       },
  { yahoo: "NEAR-USD",  symbol: "NEAR",  name: "NEAR Protocol"  },
  { yahoo: "PEPE-USD",  symbol: "PEPE",  name: "Pepe"           },
  { yahoo: "SHIB-USD",  symbol: "SHIB",  name: "Shiba Inu"      },
  { yahoo: "ARB-USD",   symbol: "ARB",   name: "Arbitrum"       },
  { yahoo: "OP-USD",    symbol: "OP",    name: "Optimism"       },
  { yahoo: "SUI-USD",   symbol: "SUI",   name: "Sui"            },
  { yahoo: "TON-USD",   symbol: "TON",   name: "Toncoin"        },
] as const;

export const CRYPTO_SYMBOLS = COIN_MAP.map(c => c.symbol);

// ── Fetch prices from Yahoo Finance and upsert to stock_prices ───────────────
// Uses the same Yahoo Finance endpoint as the main stock fetcher — no API key,
// more reliable than CoinGecko free tier.
export async function refreshCryptoPrices(db: DB): Promise<boolean> {
  const yahooSymbols = COIN_MAP.map(c => c.yahoo).join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${yahooSymbols}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketChange,regularMarketPreviousClose,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Tradecraft/1.0)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const quotes: any[] = data?.quoteResponse?.result ?? [];
    if (!quotes.length) return false;

    const rows = quotes.map(q => {
      const coin = COIN_MAP.find(c => c.yahoo === q.symbol);
      if (!coin) return null;
      const price     = q.regularMarketPrice     ?? 0;
      const changePct = q.regularMarketChangePercent ?? 0;
      return {
        symbol:         coin.symbol,           // store as "BTC", not "BTC-USD"
        company_name:   coin.name,
        price,
        change_percent: changePct,
        change_amount:  q.regularMarketChange   ?? 0,
        prev_close:     q.regularMarketPreviousClose ?? 0,
        open:           q.regularMarketOpen     ?? 0,
        high:           q.regularMarketDayHigh  ?? null,
        low:            q.regularMarketDayLow   ?? null,
        volume:         q.regularMarketVolume   ?? null,
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
