"use client";

import { useState, useEffect } from "react";

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary: string;
  sentiment: "positive" | "negative" | "neutral";
}

interface NewsPanelProps {
  symbol: string;
  companyName: string;
}

const SENTIMENT = {
  positive: { color: "#4ade80", bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.15)",  label: "↑" },
  negative: { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.15)", label: "↓" },
  neutral:  { color: "#94a3b8", bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.1)",  label: "→" },
};

function formatAge(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

export default function NewsPanel({ symbol, companyName }: NewsPanelProps) {
  const [articles, setArticles] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setArticles([]);
    setExpanded(null);

    fetch(`/api/news?symbol=${symbol}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.error && !data.articles?.length) setError(data.error);
        setArticles(data.articles ?? []);
      })
      .catch(err => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [symbol]);

  const posCount = articles.filter(a => a.sentiment === "positive").length;
  const negCount = articles.filter(a => a.sentiment === "negative").length;
  const overallSentiment = posCount > negCount ? "positive" : negCount > posCount ? "negative" : "neutral";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(232,234,240,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {symbol} News
          </div>
          {!loading && articles.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: SENTIMENT[overallSentiment].color }} />
              <span style={{ fontSize: 9, color: SENTIMENT[overallSentiment].color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {overallSentiment}
              </span>
            </div>
          )}
        </div>
        {!loading && articles.length > 0 && (
          <div style={{ fontSize: 10, color: "rgba(232,234,240,0.5)", marginTop: 3 }}>{companyName} · {articles.length} headlines</div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {loading && (
          <div style={{ padding: "24px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ width: "100%", height: 2, background: "rgba(255,255,255,0.04)", borderRadius: 1, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", top: 0, height: "100%", background: "linear-gradient(90deg,transparent,#7dd3b0,transparent)", width: "40%", animation: "scan 1.4s ease-in-out infinite" }} />
            </div>
            <div style={{ fontSize: 11, color: "rgba(232,234,240,0.5)" }}>Loading headlines…</div>
            <style>{`@keyframes scan { 0%{left:-40%} 100%{left:140%} }`}</style>
          </div>
        )}

        {!loading && error && articles.length === 0 && (
          <div style={{ padding: "20px 14px", fontSize: 11, color: "rgba(232,234,240,0.5)", textAlign: "center", lineHeight: 1.6 }}>
            No news available for {symbol} right now.
          </div>
        )}

        {!loading && articles.length === 0 && !error && (
          <div style={{ padding: "20px 14px", fontSize: 11, color: "rgba(232,234,240,0.5)", textAlign: "center", lineHeight: 1.6 }}>
            No recent headlines found for {symbol}.
          </div>
        )}

        {articles.map((article, i) => {
          const s = SENTIMENT[article.sentiment];
          const isExpanded = expanded === i;
          return (
            <div key={i}
              onClick={() => setExpanded(isExpanded ? null : i)}
              style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.15s",
                background: isExpanded ? "rgba(255,255,255,0.025)" : "transparent" }}>

              {/* Top row: sentiment badge + time */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
                    background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                    {s.label}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(232,234,240,0.65)", fontWeight: 600 }}>{article.source}</span>
                </div>
                <span style={{ fontSize: 9, color: "rgba(232,234,240,0.60)", fontFamily: "monospace" }}>
                  {formatAge(article.publishedAt)}
                </span>
              </div>

              {/* Headline */}
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(232,234,240,0.75)", lineHeight: 1.45,
                display: isExpanded ? "block" : "-webkit-box", WebkitLineClamp: isExpanded ? undefined : 2,
                WebkitBoxOrient: isExpanded ? undefined : "vertical", overflow: isExpanded ? "visible" : "hidden" }}>
                {article.title}
              </div>

              {/* Expanded: summary + link */}
              {isExpanded && article.summary && (
                <div style={{ marginTop: 6 }}>
                  <p style={{ fontSize: 10, color: "rgba(232,234,240,0.58)", lineHeight: 1.6, margin: "0 0 8px" }}>
                    {article.summary}{article.summary.length >= 200 ? "…" : ""}
                  </p>
                  <a href={article.url} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700,
                      color: "#7dd3b0", textDecoration: "none", padding: "4px 10px", borderRadius: 6,
                      background: "rgba(125,211,176,0.08)", border: "1px solid rgba(125,211,176,0.18)" }}>
                    Read full article ↗
                  </a>
                </div>
              )}
            </div>
          );
        })}

        {articles.length > 0 && (
          <div style={{ padding: "10px 14px", fontSize: 9, color: "rgba(232,234,240,0.60)", textAlign: "center" }}>
            Via Yahoo Finance · Tap headline to expand
          </div>
        )}
      </div>
    </div>
  );
}
