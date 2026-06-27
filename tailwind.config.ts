import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tradecraft dark theme palette
        bg: {
          primary: "#0a0e1a",
          secondary: "#0d1220",
          tertiary: "#111827",
          card: "#131929",
        },
        border: {
          dim: "rgba(255,255,255,0.06)",
          subtle: "rgba(255,255,255,0.10)",
          strong: "rgba(255,255,255,0.18)",
        },
        brand: {
          green: "#4ade80",
          "green-dim": "rgba(74,222,128,0.12)",
          teal: "#7dd3b0",
          "teal-dim": "rgba(125,211,176,0.12)",
        },
        up: "#4ade80",
        down: "#f87171",
        text: {
          primary: "#e8eaf0",
          secondary: "rgba(232,234,240,0.65)",
          muted: "rgba(232,234,240,0.35)",
          dim: "rgba(232,234,240,0.20)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "pulse-dot": "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
        "slide-up": "slideUp 0.2s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
      },
      keyframes: {
        slideUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
