"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { CandleInterval, Candle } from "@/types";
import { getCandles, fetchStockPrices } from "@/lib/stockApi";
import StockPredict from "./StockPredict";

const RANGES: { label: string; interval: CandleInterval; count: number }[] = [
  { label: "30m",  interval: "5min",  count: 6   },
  { label: "2H",   interval: "15min", count: 8   },
  { label: "6H",   interval: "60min", count: 6   },
  { label: "1D",   interval: "1day",  count: 30  },
  { label: "3M",   interval: "1day",  count: 90  },
];

interface TrendChartProps {
  symbol: string;
  companyName: string;
  currentPrice: number;
  changePercent: number;
  isOverview?: boolean;
  onBack?: () => void;
}

interface Point { x: number; y: number; price: number; time: Date }

function buildPath(points: Point[]): string {
  if (points.length < 2) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

function buildArea(points: Point[], height: number): string {
  if (points.length < 2) return "";
  const line = buildPath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x.toFixed(1)} ${height} L ${first.x.toFixed(1)} ${height} Z`;
}

function formatTime(d: Date, interval: CandleInterval): string {
  if (interval === "1day") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function TrendChart({
  symbol,
  companyName,
  currentPrice,
  changePercent,
  isOverview = false,
  onBack,
}: TrendChartProps) {
  const [rangeIdx, setRangeIdx]       = useState(2);
  const [candles, setCandles]         = useState<Candle[]>([]);
  const [loading, setLoading]         = useState(true);
  const [hovered, setHovered]         = useState<Point | null>(null);
  const [showPredict, setShowPredict] = useState(false);
  const svgRef  = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims]               = useState({ w: 600, h: 200 });

  const range = RANGES[rangeIdx];
  const isPositive = changePercent >= 0;

  // Observe container size
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await fetchStockPrices([symbol], range.interval, true);
      const data = await getCandles(symbol, range.interval, range.count);
      setCandles(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [symbol, range.interval, range.count]);

  useEffect(() => {
    load();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (setInterval as any)(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Build SVG points
  const PAD = { top: 12, right: 14, bottom: 22, left: 52 };
  const W = dims.w - PAD.left - PAD.right;
  const H = dims.h - PAD.top  - PAD.bottom;

  const prices = candles.map(c => c.close);
  const minP   = prices.length ? Math.min(...prices) * 0.9995 : 0;
  const maxP   = prices.length ? Math.max(...prices) * 1.0005 : 1;
  const spread = maxP - minP || 1;

  const points: Point[] = candles.map((c, i) => ({
    x: PAD.left + (i / Math.max(candles.length - 1, 1)) * W,
    y: PAD.top  + (1 - (c.close - minP) / spread) * H,
    price: c.close,
    time: new Date(c.time),
  }));

  // Tick lines for Y axis
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks }, (_, i) =>
    minP + (spread * i) / (yTicks - 1)
  );

  // X-axis ticks (4 evenly spaced)
  const xTickIdxs = candles.length > 1
    ? [0, Math.floor(candles.length / 3), Math.floor((candles.length * 2) / 3), candles.length - 1]
    : [];

  // Mouse move handler
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || points.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    // Find closest point
    let best = points[0];
    let bestDist = Infinity;
    for (const p of points) {
      const d = Math.abs(p.x - mx);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    setHovered(best);
  }

  const lineColor  = isPositive ? "#4ade80" : "#f87171";
  const gradientId = `tg-${symbol}-${isOverview ? "ov" : "st"}`;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:0 }}>

      {/* ── Header row ── */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", padding:"10px 16px 0", gap:8, flexShrink:0 }}>
        <div style={{ minWidth:0, flex:1 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap" }}>
            {isOverview && (
              <span style={{ fontSize:11, fontWeight:700, color:"#7dd3b0", letterSpacing:"0.06em", textTransform:"uppercase", alignSelf:"center" }}>
                📈 Market
              </span>
            )}
            <span style={{ fontSize:22, fontWeight:700, fontFamily:"monospace", color:"white" }}>
              ${(hovered ? hovered.price : currentPrice).toFixed(2)}
            </span>
            <span style={{ fontSize:15, fontFamily:"monospace", fontWeight:600, color: isPositive ? "#4ade80" : "#f87171" }}>
              {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
            </span>
          </div>
          <div style={{ fontSize:12, color:"rgba(232,234,240,0.4)", marginTop:3 }}>
            {hovered
              ? formatTime(hovered.time, range.interval)
              : (isOverview ? "S&P 500 ETF · Market overview" : `${symbol} · ${companyName}`)}
          </div>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0, marginTop:2 }}>
          {onBack && !isOverview && (
            <button onClick={onBack} style={{
              display:"flex", alignItems:"center", gap:4, padding:"5px 10px", borderRadius:8,
              fontSize:11, fontWeight:600, cursor:"pointer",
              border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)",
              color:"rgba(232,234,240,0.5)", whiteSpace:"nowrap",
            }}>
              ← Market
            </button>
          )}
          {!showPredict && !isOverview && (
            <button onClick={() => setShowPredict(true)} style={{
              display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:9,
              fontSize:12, fontWeight:700, cursor:"pointer",
              border:"1px solid rgba(125,211,176,0.25)", background:"rgba(125,211,176,0.08)",
              color:"#7dd3b0", whiteSpace:"nowrap",
            }}>
              <span>📊</span> Predict
            </button>
          )}
        </div>
      </div>

      {/* ── Range selector ── */}
      <div style={{ display:"flex", alignItems:"center", gap:4, padding:"8px 16px 6px", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", background:"rgba(255,255,255,0.05)", borderRadius:10, padding:3, border:"1px solid rgba(255,255,255,0.08)" }}>
          {RANGES.map((r, i) => (
            <button key={r.label} onClick={() => setRangeIdx(i)} style={{
              padding:"5px 11px", borderRadius:8, fontSize:12, fontWeight:600,
              fontFamily:"monospace", cursor:"pointer", border:"none", transition:"all 0.15s",
              background: rangeIdx === i ? "rgba(255,255,255,0.1)" : "transparent",
              color:       rangeIdx === i ? "white" : "rgba(232,234,240,0.52)",
            }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart area ── */}
      <div ref={wrapRef} style={{ flex:1, position:"relative", minHeight:0, overflow:"hidden" }}>

        {/* Predict overlay */}
        {showPredict && (
          <StockPredict
            symbol={symbol}
            currentPrice={currentPrice}
            onClose={() => setShowPredict(false)}
          />
        )}

        {loading && candles.length === 0 && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"rgba(232,234,240,0.45)" }}>
              <div style={{ width:14, height:14, border:"2px solid #7dd3b0", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
              Loading…
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          </div>
        )}

        {points.length >= 2 && (
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`0 0 ${dims.w} ${dims.h}`}
            preserveAspectRatio="none"
            style={{ display:"block", cursor:"crosshair" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHovered(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={lineColor} stopOpacity="0.22" />
                <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
              </linearGradient>
              <clipPath id={`clip-${gradientId}`}>
                <rect x={PAD.left} y={PAD.top} width={W} height={H} />
              </clipPath>
            </defs>

            {/* Y grid + labels */}
            {yTickVals.map((val, i) => {
              const y = PAD.top + (1 - (val - minP) / spread) * H;
              return (
                <g key={i}>
                  <line x1={PAD.left} y1={y} x2={PAD.left + W} y2={y}
                    stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  <text x={PAD.left - 6} y={y + 4}
                    fill="rgba(232,234,240,0.35)" fontSize="9"
                    textAnchor="end" fontFamily="JetBrains Mono, monospace">
                    {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* X axis labels */}
            {xTickIdxs.map(idx => {
              const p = points[idx];
              if (!p) return null;
              const anchor = idx === 0 ? "start" : idx === candles.length - 1 ? "end" : "middle";
              return (
                <text key={idx}
                  x={p.x}
                  y={PAD.top + H + 16}
                  fill="rgba(232,234,240,0.35)"
                  fontSize="9"
                  textAnchor={anchor}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {formatTime(p.time, range.interval)}
                </text>
              );
            })}

            {/* Area fill */}
            <path
              d={buildArea(points, PAD.top + H)}
              fill={`url(#${gradientId})`}
              clipPath={`url(#clip-${gradientId})`}
            />

            {/* Line */}
            <path
              d={buildPath(points)}
              fill="none"
              stroke={lineColor}
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              clipPath={`url(#clip-${gradientId})`}
            />

            {/* Crosshair */}
            {hovered && (
              <g>
                <line
                  x1={hovered.x} y1={PAD.top}
                  x2={hovered.x} y2={PAD.top + H}
                  stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="3 3"
                />
                <circle
                  cx={hovered.x} cy={hovered.y}
                  r="4" fill={lineColor} stroke="#060a14" strokeWidth="1.5"
                />
                {/* Price label on Y axis */}
                <rect
                  x={2} y={hovered.y - 8}
                  width={PAD.left - 6} height={16}
                  fill="#1a2035" rx="3"
                />
                <text
                  x={PAD.left - 6} y={hovered.y + 4}
                  fill={lineColor} fontSize="9"
                  textAnchor="end" fontFamily="JetBrains Mono, monospace" fontWeight="700"
                >
                  {hovered.price.toFixed(2)}
                </text>
              </g>
            )}
          </svg>
        )}

        {/* No data state */}
        {!loading && points.length < 2 && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", fontSize:12, color:"rgba(232,234,240,0.3)" }}>
            No chart data available
          </div>
        )}
      </div>
    </div>
  );
}
