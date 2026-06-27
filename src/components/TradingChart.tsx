"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import type { CandleInterval, ChartType, Candle } from "@/types";
import { getCandles, fetchStockPrices } from "@/lib/stockApi";
import StockPredict from "./StockPredict";

const INTERVALS: { label: string; value: CandleInterval }[] = [
  { label: "5m", value: "5min" },
  { label: "15m", value: "15min" },
  { label: "1H", value: "60min" },
  { label: "1D", value: "1day" },
];

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
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [chartType, setChartType] = useState<ChartType>("candlestick");
  const [interval, setInterval] = useState<CandleInterval>("5min");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredOhlc, setHoveredOhlc] = useState<{
    open: number; high: number; low: number; close: number; time: string;
  } | null>(null);
  const [showPredict, setShowPredict] = useState(false);

  const isPositive = changePercent >= 0;

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
      width: chartContainerRef.current.clientWidth,
      height: 260,
    });

    chartRef.current = chart;

    // Set initial height from container
    const initialHeight = chartContainerRef.current?.clientHeight ?? 260;
    if (initialHeight > 100) chart.applyOptions({ height: initialHeight });

    // v4 API: use addCandlestickSeries / addLineSeries
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#4ade80",
      downColor: "#f87171",
      wickUpColor: "#4ade80",
      wickDownColor: "#f87171",
      borderVisible: false,
    });
    candleSeriesRef.current = candleSeries;

    const lineSeries = chart.addLineSeries({
      color: "#7dd3b0",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      priceLineVisible: false,
      lastValueVisible: true,
      visible: false,
    });
    lineSeriesRef.current = lineSeries;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoveredOhlc(null);
        return;
      }
      const data = param.seriesData.get(candleSeries) as {
        open?: number; high?: number; low?: number; close?: number;
      } | undefined;
      if (data?.open !== undefined) {
        const time = new Date((param.time as number) * 1000);
        setHoveredOhlc({
          open: data.open,
          high: data.high!,
          low: data.low!,
          close: data.close!,
          time: time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        });
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        const h = chartContainerRef.current.clientHeight; chart.applyOptions({ width: chartContainerRef.current.clientWidth, height: h > 100 ? h : 260 });
      }
    });
    if (chartContainerRef.current) resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timer = (setInterval as any)(() => { loadCandles(); }, 60_000);
    return () => clearInterval(timer);
  }, [loadCandles]);

  useEffect(() => {
    if (!candleSeriesRef.current || !lineSeriesRef.current || candles.length === 0) return;

    const ohlcData = candles.map((c) => ({
      time: Math.floor(new Date(c.time).getTime() / 1000) as unknown as import("lightweight-charts").Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const lineData = candles.map((c) => ({
      time: Math.floor(new Date(c.time).getTime() / 1000) as unknown as import("lightweight-charts").Time,
      value: c.close,
    }));

    if (chartType === "candlestick") {
      candleSeriesRef.current.applyOptions({ visible: true });
      lineSeriesRef.current.applyOptions({ visible: false });
      candleSeriesRef.current.setData(ohlcData);
    } else {
      candleSeriesRef.current.applyOptions({ visible: false });
      lineSeriesRef.current.applyOptions({ visible: true });
      lineSeriesRef.current.setData(lineData);
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, chartType]);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Row 1: price + symbol + back button + predict button */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",padding:"10px 16px 0",gap:8}}>
        <div style={{minWidth:0,flex:1}}>
          <div style={{display:"flex",alignItems:"baseline",gap:12}}>
            {isOverview && (
              <span style={{fontSize:11,fontWeight:700,color:"#7dd3b0",letterSpacing:"0.06em",textTransform:"uppercase",alignSelf:"center",marginRight:4}}>
                📈 Market
              </span>
            )}
            <span style={{fontSize:22,fontWeight:700,fontFamily:"monospace",color:"white"}}>${currentPrice.toFixed(2)}</span>
            <span style={{fontSize:15,fontFamily:"monospace",fontWeight:600,color:isPositive?"#4ade80":"#f87171"}}>
              {isPositive?"+":""}{changePercent.toFixed(2)}%
            </span>
          </div>
          {hoveredOhlc ? (
            <div style={{display:"flex",alignItems:"center",gap:10,marginTop:3,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"rgba(232,234,240,0.60)",fontFamily:"monospace"}}>{hoveredOhlc.time}</span>
              <span style={{fontSize:11,color:"rgba(232,234,240,0.60)",fontFamily:"monospace"}}>O <span style={{color:"rgba(232,234,240,0.7)"}}>{hoveredOhlc.open.toFixed(2)}</span></span>
              <span style={{fontSize:11,color:"rgba(232,234,240,0.60)",fontFamily:"monospace"}}>H <span style={{color:"#4ade80"}}>{hoveredOhlc.high.toFixed(2)}</span></span>
              <span style={{fontSize:11,color:"rgba(232,234,240,0.60)",fontFamily:"monospace"}}>L <span style={{color:"#f87171"}}>{hoveredOhlc.low.toFixed(2)}</span></span>
              <span style={{fontSize:11,color:"rgba(232,234,240,0.60)",fontFamily:"monospace"}}>C <span style={{color:"rgba(232,234,240,0.7)"}}>{hoveredOhlc.close.toFixed(2)}</span></span>
            </div>
          ) : (
            <div style={{fontSize:12,color:"rgba(232,234,240,0.60)",marginTop:3}}>
              {isOverview ? "S&P 500 ETF · Market overview" : `${symbol} · ${companyName}`}
            </div>
          )}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,marginTop:2}}>
          {/* Back to overview */}
          {onBack && !isOverview && (
            <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:8,fontSize:11,fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"rgba(232,234,240,0.5)",whiteSpace:"nowrap"}}>
              ← Market
            </button>
          )}
          {/* Predict button — hidden when showing overview or predict overlay */}
          {!showPredict && !isOverview && (
            <button onClick={() => setShowPredict(true)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:9,fontSize:12,fontWeight:700,cursor:"pointer",border:"1px solid rgba(125,211,176,0.25)",background:"rgba(125,211,176,0.08)",color:"#7dd3b0",whiteSpace:"nowrap"}}>
              <span style={{fontSize:12}}>📊</span> Predict
            </button>
          )}
        </div>
      </div>

      {/* Row 2: controls + predict button */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px 8px",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",background:"rgba(255,255,255,0.05)",borderRadius:10,padding:3,border:"1px solid rgba(255,255,255,0.08)"}}>
          {[{label:"Candles",value:"candlestick"},{label:"Line",value:"line"}].map(ct=>(
            <button key={ct.value} onClick={()=>setChartType(ct.value as any)}
              style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",border:"none",transition:"all 0.15s",
                background:chartType===ct.value?"rgba(255,255,255,0.08)":"transparent",
                color:chartType===ct.value?"white":"rgba(232,234,240,0.58)"}}>
              {ct.value==="candlestick"?<CandlestickIcon/>:<LineIcon/>}
              {ct.label}
            </button>
          ))}
        </div>

        <div style={{display:"flex",alignItems:"center",background:"rgba(255,255,255,0.05)",borderRadius:10,padding:3,border:"1px solid rgba(255,255,255,0.08)"}}>
          {INTERVALS.map((iv)=>(
            <button key={iv.value} onClick={()=>setInterval(iv.value)}
              style={{padding:"5px 10px",borderRadius:8,fontSize:12,fontWeight:600,fontFamily:"monospace",cursor:"pointer",border:"none",transition:"all 0.15s",
                background:interval===iv.value?"rgba(255,255,255,0.08)":"transparent",
                color:interval===iv.value?"white":"rgba(232,234,240,0.58)"}}>
              {iv.label}
            </button>
          ))}
        </div>

      </div>

      <div style={{position:"relative",flex:1,minHeight:0}}>
        {/* Prediction overlay */}
        {showPredict && (
          <StockPredict symbol={symbol} currentPrice={currentPrice} onClose={() => setShowPredict(false)} />
        )}

        {loading && candles.length === 0 && (
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}}>
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <div className="w-4 h-4 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
              Loading chart data...
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="chart-container w-full h-full" style={{ minHeight: 260, height: "100%" }} />
      </div>
    </div>
  );
}

function CandlestickIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.9" />
      <line x1="3.5" y1="1" x2="3.5" y2="4" stroke="currentColor" strokeWidth="1.5" />
      <line x1="3.5" y1="10" x2="3.5" y2="13" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="5" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.5" />
      <line x1="10.5" y1="2" x2="10.5" y2="5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <line x1="10.5" y1="10" x2="10.5" y2="12" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <polyline points="1,11 4,7 7,8 10,4 13,5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
