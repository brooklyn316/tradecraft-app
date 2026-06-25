import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary: string;
  sentiment: "positive" | "negative" | "neutral";
}

const POSITIVE_WORDS = ["surge", "soar", "jump", "gain", "rise", "beat", "record", "rally", "upgrade", "buy", "profit", "growth", "strong", "bullish", "outperform", "top", "win", "boost", "expand", "breakthrough"];
const NEGATIVE_WORDS = ["fall", "drop", "plunge", "decline", "miss", "loss", "warn", "downgrade", "sell", "cut", "weak", "bearish", "underperform", "layoff", "recall", "crash", "slump", "concern", "risk", "disappoint"];

function guessSentiment(title: string): "positive" | "negative" | "neutral" {
  const lower = title.toLowerCase();
  const pos = POSITIVE_WORDS.filter(w => lower.includes(w)).length;
  const neg = NEGATIVE_WORDS.filter(w => lower.includes(w)).length;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

function parseRSS(xml: string, symbol: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const title   = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(block) ?? /<title>(.*?)<\/title>/.exec(block))?.[1]?.trim() ?? "";
    const link    = (/<link>(.*?)<\/link>/.exec(block))?.[1]?.trim() ?? "";
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/.exec(block))?.[1]?.trim() ?? "";
    const desc    = (/<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(block) ?? /<description>(.*?)<\/description>/.exec(block))?.[1]?.trim() ?? "";
    const source  = (/<source[^>]*>(.*?)<\/source>/.exec(block))?.[1]?.trim() ?? "Yahoo Finance";

    if (!title || title.toLowerCase() === symbol.toLowerCase()) continue;

    // Strip HTML tags from description
    const summary = desc.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim().slice(0, 200);

    items.push({
      title,
      url: link,
      source,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      summary,
      sentiment: guessSentiment(title),
    });

    if (items.length >= 10) break;
  }

  return items;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  try {
    // Check Supabase cache first (30-min TTL)
    const db = getSupabase();
    const cacheKey = `news_${symbol}`;
    const { data: cached } = await db
      .from("stock_prices") // reuse existing table as key-value via metadata — actually we'll use a separate approach
      .select("symbol")
      .eq("symbol", symbol)
      .single();

    // We'll skip DB caching and just use Next.js fetch cache (revalidate 1800s)
    // This avoids needing a new table migration
    void cached;

    const feedUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`;

    const res = await fetch(feedUrl, {
      next: { revalidate: 1800 }, // cache 30 min at CDN/Next edge
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Tradecraft/1.0)" },
    });

    if (!res.ok) {
      return NextResponse.json({ symbol, articles: [], error: "Feed unavailable" });
    }

    const xml = await res.text();
    const articles = parseRSS(xml, symbol);

    return NextResponse.json({ symbol, articles, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error("News fetch error:", err);
    return NextResponse.json({ symbol, articles: [], error: String(err) });
  }
}
