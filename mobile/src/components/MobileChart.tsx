import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Svg, { Rect, Line, Path, Defs, LinearGradient, Stop, Text as SvgText } from "react-native-svg";
import { supabase } from "../lib/supabase";
import { colors } from "../theme";
import type { Candle } from "../types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_HEIGHT = 180;
const CHART_WIDTH = SCREEN_WIDTH;
const PAD_LEFT = 4;
const PAD_RIGHT = 50;
const PAD_TOP = 8;
const PAD_BOTTOM = 20;
const PLOT_W = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

interface MobileChartProps {
  symbol: string;
  chartType: "candlestick" | "line";
  color: string;
}

export default function MobileChart({ symbol, chartType, color }: MobileChartProps) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCandles = useCallback(async () => {
    const { data } = await supabase
      .from("stock_candles")
      .select("*")
      .eq("symbol", symbol)
      .eq("interval", "5min")
      .order("time", { ascending: true })
      .limit(80);

    if (data && data.length > 0) {
      setCandles(data);
    }
    setLoading(false);
  }, [symbol]);

  useEffect(() => {
    setLoading(true);
    loadCandles();
    const interval = setInterval(loadCandles, 60_000);
    return () => clearInterval(interval);
  }, [loadCandles]);

  if (loading || candles.length < 2) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.loadingText}>Loading chart...</Text>
      </View>
    );
  }

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const priceRange = maxPrice - minPrice || 1;

  function priceToY(price: number): number {
    return PAD_TOP + PLOT_H - ((price - minPrice) / priceRange) * PLOT_H;
  }

  function indexToX(i: number): number {
    return PAD_LEFT + (i / (candles.length - 1)) * PLOT_W;
  }

  // Price labels (right axis)
  const priceSteps = 4;
  const priceLabels = Array.from({ length: priceSteps + 1 }, (_, i) => {
    const price = minPrice + (priceRange * i) / priceSteps;
    return { price, y: priceToY(price) };
  });

  // Time labels (x axis)
  const timeLabels = [0, Math.floor(candles.length / 2), candles.length - 1].map((i) => ({
    x: indexToX(i),
    label: new Date(candles[i].time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
  }));

  if (chartType === "line") {
    // Line chart path
    const points = candles.map((c, i) => `${indexToX(i).toFixed(1)},${priceToY(c.close).toFixed(1)}`);
    const linePath = `M ${points.join(" L ")}`;
    const areaPath = `M ${indexToX(0).toFixed(1)},${(PAD_TOP + PLOT_H).toFixed(1)} L ${points.join(" L ")} L ${indexToX(candles.length - 1).toFixed(1)},${(PAD_TOP + PLOT_H).toFixed(1)} Z`;

    return (
      <View style={styles.container}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.25" />
              <Stop offset="1" stopColor={color} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {priceLabels.map(({ y }, i) => (
            <Line key={i} x1={PAD_LEFT} y1={y.toFixed(1)} x2={CHART_WIDTH - PAD_RIGHT} y2={y.toFixed(1)}
              stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          ))}

          {/* Area fill */}
          <Path d={areaPath} fill="url(#areaGrad)" />
          {/* Line */}
          <Path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Price labels */}
          {priceLabels.map(({ price, y }, i) => (
            <SvgText key={i} x={CHART_WIDTH - PAD_RIGHT + 4} y={y + 3} fontSize="9"
              fill="rgba(232,234,240,0.35)" fontFamily="monospace">
              {price.toFixed(0)}
            </SvgText>
          ))}

          {/* Time labels */}
          {timeLabels.map(({ x, label }, i) => (
            <SvgText key={i} x={x} y={CHART_HEIGHT - 4} fontSize="9" textAnchor="middle"
              fill="rgba(232,234,240,0.3)" fontFamily="monospace">
              {label}
            </SvgText>
          ))}
        </Svg>
      </View>
    );
  }

  // Candlestick chart
  const candleWidth = Math.max(2, (PLOT_W / candles.length) * 0.7);

  return (
    <View style={styles.container}>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        {/* Grid lines */}
        {priceLabels.map(({ y }, i) => (
          <Line key={i} x1={PAD_LEFT} y1={y.toFixed(1)} x2={CHART_WIDTH - PAD_RIGHT} y2={y.toFixed(1)}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        ))}

        {/* Candles */}
        {candles.map((c, i) => {
          const x = indexToX(i);
          const openY = priceToY(c.open);
          const closeY = priceToY(c.close);
          const highY = priceToY(c.high);
          const lowY = priceToY(c.low);
          const isUp = c.close >= c.open;
          const candleColor = isUp ? colors.up : colors.down;
          const bodyTop = Math.min(openY, closeY);
          const bodyH = Math.max(1, Math.abs(closeY - openY));

          return (
            <React.Fragment key={i}>
              {/* Wick */}
              <Line x1={x.toFixed(1)} y1={highY.toFixed(1)} x2={x.toFixed(1)} y2={lowY.toFixed(1)}
                stroke={candleColor} strokeWidth="1" opacity="0.8" />
              {/* Body */}
              <Rect
                x={(x - candleWidth / 2).toFixed(1)}
                y={bodyTop.toFixed(1)}
                width={candleWidth.toFixed(1)}
                height={bodyH.toFixed(1)}
                fill={candleColor}
                opacity={isUp ? "0.85" : "0.75"}
                rx="0.5"
              />
            </React.Fragment>
          );
        })}

        {/* Price labels */}
        {priceLabels.map(({ price, y }, i) => (
          <SvgText key={i} x={CHART_WIDTH - PAD_RIGHT + 4} y={y + 3} fontSize="9"
            fill="rgba(232,234,240,0.35)" fontFamily="monospace">
            {price.toFixed(0)}
          </SvgText>
        ))}

        {/* Time labels */}
        {timeLabels.map(({ x, label }, i) => (
          <SvgText key={i} x={x} y={CHART_HEIGHT - 4} fontSize="9" textAnchor="middle"
            fill="rgba(232,234,240,0.3)" fontFamily="monospace">
            {label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

// Need React in scope for JSX fragments
import React from "react";

const styles = StyleSheet.create({
  container: { width: CHART_WIDTH, height: CHART_HEIGHT, backgroundColor: colors.bgPrimary },
  loadingText: { fontSize: 12, color: colors.textMuted },
});
