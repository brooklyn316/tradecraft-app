"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  ColorType,
  CrosshairMode,
  LineStyle,
  Time,
} from "lightweight-charts";
import type { CandleInterval, Candle } from "@/types";
import { getCandles, fetchStockPrices } from "@/lib/stockApi";
import StockPredict from "./StockPredict";

const INTERVALS: { label: string; value: CandleInterval }[] = [
  { label: "5m",  value: "5min" },
  { label: "15m", value: "15min" },
  { label: "1H",  value: "60min" },
  { label: "1D",  value: "1day" },
];

const TRENDLINE_COLORS = ["#f59e0b","#a78bfa","#60a5fa","#f87171","#4ade80","#fb923c"];

interface Trendline {
  id: string;
  p1: { time: number; price: number };
  p2: { time: number; price: number };
  color: string;
  series: ISeriesApi<"Line"> | null;
}

interface TradingChartProps {
  symbol: string;
  companyName: string;
  currentPrice: number;
  changePercent: number;
  isOverview?: boolean;
  onBack?: () => void;
}

export default function TradingChart({
  symbol,
  companyName,
  currentPrice,
  changePercent,
  isOverview = false,
  onBack,
}: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef          = useRef<IChartApi | null>(null);
  const candleSeriesRef   = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [interval,    setInterval]    = useState<CandleInterval>("5min");
  const [candles,     setCandles]     = useState<Candle[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [hoveredOhlc, setHoveredOhlc] = useState<{
    open: number; high: number; low: number; close: number; time: string;
  } | null>(null);
  const [showPredict, setShowPredict] = useState(false);
  const [expanded,    setExpanded]    = useState(false);
  const [drawMode,    setDrawMode]    = useState(false);
  const [trendlines,  setTrendlines]  = useState<Trendline[]>([]);
  const [drawPoint1,  setDrawPoint1]  = useState<{ time: number; price: number; sx: number; sy: number } | null>(null);
  const [previewLine, setPreviewLine] = useState<{ x1:number; y1:number; x2:number; y2:number } | null>(null);

  const isPositive = changePercent >= 0;

  // ── Chart init ───────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(232,234,240,0.5)",
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255,255,255,0.2)", labelBackgroundColor: "#1a2035" },
        horzLine: { color: "rgba(255,255,255,0.2)", labelBackgroundColor: "#1a2035" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: true,
        barSpacing: 3,
        secondsVisible: false,
      },
      width:  chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 260,
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor:       "#4ade80",
      downColor:     "#f87171",
      wickUpColor:   "#4ade80",
      wickDownColor: "#f87171",
      borderVisible: false,
    });
    candleSeriesRef.current = candleSeries;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) { setHoveredOhlc(null); return; }
      const data = param.seriesData?.get(candleSeries) as
        { open?: number; high?: number; low?: number; close?: number } | undefined;
      if (data?.open !== undefined) {
        const t = new Date((param.time as number) * 1000);
        setHoveredOhlc({
          open: data.open, high: data.high!, low: data.low!, close: data.close!,
          time: t.toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:false }),
        });
      }
    });

    // ResizeObserver — keeps working whether chart is inline or expanded (same DOM node)
    const ro = new ResizeObserver(() => {
      if (!chartContainerRef.current) return;
      const w = chartContainerRef.current.clientWidth;
      const h = chartContainerRef.current.clientHeight;
      chart.applyOptions({ width: w || 400, height: h > 80 ? h : 260 });
    });
    ro.observe(chartContainerRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, []);

  // ── Candle data ──────────────────────────────────────────────
  const loadCandles = useCallback(async () => {
    setLoading(true);
    try {
      await fetchStockPrices([symbol], interval, true);
      const data = await getCandles(symbol, interval, 150);
      setCandles(data);
    } catch (err) {
      console.error("Chart load error:", err);
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    loadCandles();
    const timer = setInterval(() => loadCandles(), 60_000);
    return () => clearInterval(timer);
  }, [loadCandles]);

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;
    const ohlcData = candles.map(c => ({
      time: Math.floor(new Date(c.time).getTime() / 1000) as unknown as Time,
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    candleSeriesRef.current.setData(ohlcData);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // ── Trendline helpers ────────────────────────────────────────
  const createTrendSeries = useCallback((
    p1: { time: number; price: number },
    p2: { time: number; price: number },
    color: string,
  ): ISeriesApi<"Line"> | null => {
    if (!chartRef.current) return null;
    const s = chartRef.current.addLineSeries({
      color,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const pts = [
      { time: p1.time as unknown as Time, value: p1.price },
      { time: p2.time as unknown as Time, value: p2.price },
    ].sort((a, b) => (a.time as unknown as number) - (b.time as unknown as number));
    s.setData(pts);
    return s;
  }, []);

  const handleChartClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawMode || !chartRef.current || !candleSeriesRef.current || !chartContainerRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    const rawTime = chartRef.current.timeScale().coordinateToTime(relX);
    const price   = candleSeriesRef.current.coordinateToPrice(relY);
    if (rawTime == null || price == null) return;

    const time = rawTime as unknown as number;

    if (!drawPoint1) {
      setDrawPoint1({ time, price, sx: relX, sy: relY });
    } else {
      const color = TRENDLINE_COLORS[trendlines.length % TRENDLINE_COLORS.length];
      const series = createTrendSeries(drawPoint1, { time, price }, color);
      setTrendlines(prev => [
        ...prev,
        { id: `tl_${Date.now()}`, p1: drawPoint1, p2: { time, price }, color, series },
      ]);
      setDrawPoint1(null);
      setPreviewLine(null);
    }
  }, [drawMode, drawPoint1, trendlines.length, createTrendSeries]);

  const handleChartMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawMode || !drawPoint1 || !chartContainerRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    setPreviewLine({ x1: drawPoint1.sx, y1: drawPoint1.sy, x2: e.clientX - rect.left, y2: e.clientY - rect.top });
  }, [drawMode, drawPoint1]);

  const removeTrendline = useCallback((id: string) => {
    setTrendlines(prev => {
      const tl = prev.find(t => t.id === id);
      if (tl?.series && chartRef.current) {
        try { chartRef.current.removeSeries(tl.series); } catch {}
      }
      return prev.filter(t => t.id !== id);
    });
  }, []);

  const clearAllTrendlines = useCallback(() => {
    setTrendlines(prev => {
      prev.forEach(tl => {
        if (tl.series && chartRef.current) {
          try { chartRef.current.removeSeries(tl.series); } catch {}
        }
      });
      return [];
    });
    setDrawPoint1(null);
    setPreviewLine(null);
  }, []);

  const toggleDrawMode = useCallback(() => {
    setDrawMode(d => !d);
    setDrawPoint1(null);
    setPreviewLine(null);
  }, []);

  const handleCollapse = useCallback(() => {
    setExpanded(false);
    setDrawMode(false);
    setDrawPoint1(null);
    setPreviewLine(null);
  }, []);

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop — only while expanded */}
      {expanded && (
        <div
          onClick={handleCollapse}
          style={{
            position: "fixed", inset: 0, zIndex: 998,
            background: "rgba(6,10,20,0.78)",
            backdropFilter: "blur(3px)",
          }}
        />
      )}

      {/*
        Single wrapper — changes from in-flow to position:fixed when expanded.
        chartContainerRef stays attached to the same DOM node throughout,
        so ResizeObserver and the chart instance never need to reinitialise.
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          ...(expanded
            ? {
                position: "fixed",
                top: "5%", left: "5%", right: "5%", bottom: "5%",
                zIndex: 999,
                background: "#0d1526",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 16,
                boxShadow: "0 40px 80px rgba(0,0,0,0.7)",
                overflow: "hidden",
              }
            : {
                position: "relative",
                height: "100%",
              }),
        }}
      >
        {/* Price / OHLC header */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: expanded ? "14px 16px 0" : "10px 16px 0", gap: 8, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              {isOverview && (
                <span style={{ fontSize:11, fontWeight:700, color:"#7dd3b0", letterSpacing:"0.06em",
                  textTransform:"uppercase", alignSelf:"center", marginRight:4 }}>
                  📈 Market
                </span>
              )}
              <span style={{ fontSize: expanded ? 28 : 22, fontWeight: 700, fontFamily: "monospace", color: "white" }}>
                ${currentPrice.toFixed(2)}
              </span>
              <span style={{ fontSize: expanded ? 17 : 15, fontFamily: "monospace", fontWeight: 600,
                color: isPositive ? "#4ade80" : "#f87171" }}>
                {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
              </span>
            </div>
            {hoveredOhlc ? (
              <div style={{ display:"flex", gap:10, marginTop:3, flexWrap:"wrap" }}>
                {([["O", hoveredOhlc.open,"rgba(232,234,240,0.7)"],
                   ["H", hoveredOhlc.high,"#4ade80"],
                   ["L", hoveredOhlc.low, "#f87171"],
                   ["C", hoveredOhlc.close,"rgba(232,234,240,0.7)"]] as [string,number,string][]).map(([l,v,c]) => (
                  <span key={l} style={{ fontSize:11, color:"rgba(232,234,240,0.55)", fontFamily:"monospace" }}>
                    {l} <span style={{ color:c }}>{v.toFixed(2)}</span>
                  </span>
                ))}
                <span style={{ fontSize:11, color:"rgba(232,234,240,0.4)", fontFamily:"monospace" }}>{hoveredOhlc.time}</span>
              </div>
            ) : (
              <div style={{ fontSize:12, color:"rgba(232,234,240,0.55)", marginTop:3 }}>
                {isOverview ? "S&P 500 ETF · Market overview" : `${symbol} · ${companyName}`}
              </div>
            )}
          </div>

          <div style={{ display:"flex", gap:6, flexShrink:0, marginTop:2 }}>
            {onBack && !isOverview && (
              <button onClick={onBack}
                style={{ padding:"5px 10px", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer",
                  border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"rgba(232,234,240,0.5)" }}>
                ← Market
              </button>
            )}
            {!showPredict && !isOverview && !expanded && (
              <button onClick={() => setShowPredict(true)}
                style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:9,
                  fontSize:12, fontWeight:700, cursor:"pointer",
                  border:"1px solid rgba(125,211,176,0.25)", background:"rgba(125,211,176,0.08)", color:"#7dd3b0" }}>
                📊 Predict
              </button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display:"flex", alignItems:"center", gap:8,
          padding: expanded ? "8px 16px" : "6px 16px", flexWrap:"wrap", flexShrink:0 }}>

          {/* Interval buttons */}
          <div style={{ display:"flex", background:"rgba(255,255,255,0.05)", borderRadius:10,
            padding:3, border:"1px solid rgba(255,255,255,0.08)" }}>
            {INTERVALS.map(iv => (
              <button key={iv.value} onClick={() => setInterval(iv.value)}
                style={{ padding:"5px 10px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer",
                  border:"none", transition:"all 0.15s", fontFamily:"monospace",
                  background: interval === iv.value ? "rgba(255,255,255,0.08)" : "transparent",
                  color:      interval === iv.value ? "white" : "rgba(232,234,240,0.55)" }}>
                {iv.label}
              </button>
            ))}
          </div>

          {/* Draw controls — expanded view only */}
          {expanded && (
            <>
              <button onClick={toggleDrawMode}
                style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:9,
                  fontSize:12, fontWeight:700, cursor:"pointer", transition:"all 0.15s",
                  background: drawMode ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.05)",
                  border:     drawMode ? "1px solid rgba(245,158,11,0.35)" : "1px solid rgba(255,255,255,0.08)",
                  color:      drawMode ? "#f59e0b" : "rgba(232,234,240,0.6)" }}>
                ✏ {drawMode
                    ? (drawPoint1 ? "Click 2nd point…" : "Click 1st point…")
                    : "Draw trend"}
              </button>

              {trendlines.length > 0 && (
                <button onClick={clearAllTrendlines}
                  style={{ display:"flex", alignItems:"center", gap:4, padding:"5px 10px", borderRadius:9,
                    fontSize:12, fontWeight:600, cursor:"pointer",
                    background:"rgba(248,113,113,0.06)", border:"1px solid rgba(248,113,113,0.2)", color:"#f87171" }}>
                  ✕ Clear ({trendlines.length})
                </button>
              )}
            </>
          )}

          {/* Expand / close */}
          {!expanded ? (
            <button onClick={() => { setExpanded(true); setShowPredict(false); }}
              style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4,
                padding:"5px 10px", borderRadius:9, fontSize:12, fontWeight:600, cursor:"pointer",
                background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)",
                color:"rgba(232,234,240,0.55)" }}>
              ↗ Expand
            </button>
          ) : (
            <button onClick={handleCollapse}
              style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4,
                padding:"5px 10px", borderRadius:9, fontSize:12, fontWeight:600, cursor:"pointer",
                background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)",
                color:"rgba(232,234,240,0.55)" }}>
              ✕ Close
            </button>
          )}
        </div>

        {/* Draw hint strip */}
        {expanded && drawMode && (
          <div style={{ padding:"5px 16px", flexShrink:0,
            background:"rgba(245,158,11,0.05)",
            borderTop:"1px solid rgba(245,158,11,0.1)",
            borderBottom:"1px solid rgba(245,158,11,0.1)" }}>
            <span style={{ fontSize:11, color:"rgba(245,158,11,0.8)" }}>
              {drawPoint1
                ? "✏ Now click a second peak or valley to complete the line"
                : "✏ Click any peak or valley to place your first point"}
            </span>
          </div>
        )}

        {/* Chart container */}
        <div style={{ position:"relative", flex:1, minHeight:0 }}>

          {/* Predict overlay */}
          {showPredict && !expanded && (
            <StockPredict symbol={symbol} currentPrice={currentPrice} onClose={() => setShowPredict(false)} />
          )}

          {/* Spinner */}
          {loading && candles.length === 0 && (
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:10, pointerEvents:"none" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, color:"rgba(232,234,240,0.55)", fontSize:13 }}>
                <div style={{ width:16, height:16, border:"2px solid #7dd3b0", borderTopColor:"transparent", borderRadius:"50%", animation:"_spin 0.8s linear infinite" }} />
                Loading chart…
              </div>
              <style>{`@keyframes _spin { to { transform:rotate(360deg); } }`}</style>
            </div>
          )}

          {/*
            The chart lives here. This div never unmounts — only its parent
            changes position (relative ↔ fixed) so ResizeObserver stays valid.
          */}
          <div
            ref={chartContainerRef}
            onClick={handleChartClick}
            onMouseMove={handleChartMouseMove}
            style={{
              width: "100%",
              height: "100%",
              minHeight: expanded ? 460 : 260,
              cursor: drawMode ? "crosshair" : "default",
            }}
          />

          {/* SVG trendline preview */}
          {drawMode && previewLine && (
            <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:20 }}>
              <line
                x1={previewLine.x1} y1={previewLine.y1}
                x2={previewLine.x2} y2={previewLine.y2}
                stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.75}
              />
              <circle cx={previewLine.x1} cy={previewLine.y1} r={4} fill="#f59e0b" opacity={0.9} />
            </svg>
          )}

          {/* First point dot (before cursor has moved) */}
          {drawMode && drawPoint1 && !previewLine && (
            <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:20 }}>
              <circle cx={drawPoint1.sx} cy={drawPoint1.sy} r={5} fill="#f59e0b" opacity={0.9} />
              <circle cx={drawPoint1.sx} cy={drawPoint1.sy} r={9} fill="none" stroke="#f59e0b" strokeWidth={1} opacity={0.35} />
            </svg>
          )}
        </div>

        {/* Trendlines legend — expanded only */}
        {expanded && trendlines.length > 0 && (
          <div style={{ padding:"6px 16px 8px", borderTop:"1px solid rgba(255,255,255,0.05)",
            display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", flexShrink:0 }}>
            <span style={{ fontSize:9, fontWeight:700, color:"rgba(232,234,240,0.4)",
              textTransform:"uppercase", letterSpacing:"0.08em" }}>
              Lines:
            </span>
            {trendlines.map(tl => (
              <div key={tl.id} style={{ display:"flex", alignItems:"center", gap:5 }}>
                <div style={{ width:18, height:1.5, background:tl.color, borderRadius:1 }} />
                <span style={{ fontSize:10, color:"rgba(232,234,240,0.5)", fontFamily:"monospace" }}>
                  ${tl.p1.price.toFixed(2)} → ${tl.p2.price.toFixed(2)}
                </span>
                <button onClick={() => removeTrendline(tl.id)}
                  style={{ fontSize:11, color:"rgba(232,234,240,0.35)", background:"none", border:"none",
                    cursor:"pointer", padding:"0 2px", lineHeight:1 }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
