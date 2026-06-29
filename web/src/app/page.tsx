"use client";

import { useState, useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase";

const BOTS = [
  {
    id: "index",
    name: "The Indexer",
    emoji: "🏦",
    tagline: "Slow. Steady. Deadly.",
    description: "Rebalances into 5 blue-chip stocks every cycle. Boring strategy — until you're losing to it.",
    color: "#60a5fa",
    glow: "rgba(96,165,250,0.15)",
    border: "rgba(96,165,250,0.25)",
    winRate: "61%",
    style: "Conservative",
  },
  {
    id: "momentum",
    name: "Surge",
    emoji: "⚡",
    tagline: "Chases winners. Cuts losers fast.",
    description: "Buys the top gainers, dumps anything falling. High risk, high reward — and it never hesitates.",
    color: "#f59e0b",
    glow: "rgba(245,158,11,0.15)",
    border: "rgba(245,158,11,0.25)",
    winRate: "54%",
    style: "Aggressive",
  },
  {
    id: "chaos",
    name: "Wildcard",
    emoji: "🎲",
    tagline: "Nobody knows what it'll do next.",
    description: "Pure chaos. Buys and sells randomly. Somehow it keeps winning — and that's the scary part.",
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.15)",
    border: "rgba(167,139,250,0.25)",
    winRate: "47%",
    style: "Unpredictable",
  },
];

const TICKERS = [
  { s: "AAPL", p: "307.34", c: "+1.25%" }, { s: "NVDA", p: "897.12", c: "+3.80%" },
  { s: "TSLA", p: "174.88", c: "-2.24%" }, { s: "META", p: "518.90", c: "+2.07%" },
  { s: "MSFT", p: "424.71", c: "+0.62%" }, { s: "GOOGL", p: "174.50", c: "+0.75%" },
  { s: "AMZN", p: "186.33", c: "-0.46%" }, { s: "AMD",  p: "466.38", c: "-10.86%" },
  { s: "JPM",  p: "198.42", c: "+0.88%" }, { s: "COIN", p: "221.14", c: "+5.12%" },
];

export default function LandingPage() {
  const [mode, setMode]         = useState<"login" | "signup">("signup");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [message, setMessage]   = useState<string | null>(null);
  const [hoveredBot, setHoveredBot] = useState<string | null>(null);
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const redirect = localStorage.getItem("tc_join_redirect");
        if (redirect) { localStorage.removeItem("tc_join_redirect"); window.location.href = redirect; }
        else window.location.href = "/dashboard";
      }
    });
  }, []);

  // Ticker scroll animation
  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    let x = 0;
    const speed = 0.5;
    const frame = () => {
      x -= speed;
      if (x < -el.scrollWidth / 2) x = 0;
      el.style.transform = `translateX(${x}px)`;
      requestAnimationFrame(frame);
    };
    const raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = getSupabaseClient();
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { username } },
      });
      if (error) setError(error.message);
      else setMessage("Check your email to confirm your account.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else {
        const redirect = localStorage.getItem("tc_join_redirect");
        if (redirect) { localStorage.removeItem("tc_join_redirect"); window.location.href = redirect; }
        else window.location.href = "/dashboard";
      }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#060a14] overflow-x-hidden">

      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[700px] h-[700px] rounded-full bg-[#7dd3b0] opacity-[0.04] blur-[120px] top-[-200px] right-[-100px]" />
        <div className="absolute w-[500px] h-[500px] rounded-full bg-[#4ade80] opacity-[0.03] blur-[100px] bottom-[-100px] left-[-100px]" />
        <div className="absolute w-[400px] h-[400px] rounded-full bg-[#60a5fa] opacity-[0.03] blur-[100px] top-[40%] left-[20%]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-[rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#7dd3b0] to-[#4ade80] flex items-center justify-center shadow-lg shadow-[rgba(125,211,176,0.2)]">
            <span className="text-[#060a14] font-bold text-xs tracking-tight">TC</span>
          </div>
          <span className="text-white font-semibold tracking-tight text-lg">Tradecraft</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-[rgba(232,234,240,0.55)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse inline-block" />
            Markets live
          </div>
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-xs text-[rgba(232,234,240,0.6)] hover:text-white transition-colors border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-1.5 hover:border-[rgba(255,255,255,0.15)]"
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        </div>
      </header>

      {/* Ticker */}
      <div className="relative z-10 border-b border-[rgba(255,255,255,0.04)] py-2.5 overflow-hidden bg-[rgba(255,255,255,0.015)]">
        <div className="flex overflow-hidden">
          <div ref={tickerRef} className="flex gap-8 px-8 whitespace-nowrap will-change-transform" style={{ width: "max-content" }}>
            {[...TICKERS, ...TICKERS, ...TICKERS].map((t, i) => (
              <div key={i} className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px] font-semibold text-[rgba(232,234,240,0.7)] font-mono">{t.s}</span>
                <span className="text-[11px] font-mono text-[rgba(232,234,240,0.4)]">${t.p}</span>
                <span className={`text-[10px] font-mono font-medium ${t.c.startsWith('+') ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>{t.c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-16">

        {/* ── Hero ── */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-[rgba(125,211,176,0.08)] border border-[rgba(125,211,176,0.18)] rounded-full px-4 py-2 mb-8">
            <span className="text-[10px] font-bold text-[#7dd3b0] uppercase tracking-widest">Real stocks · Virtual money · Real competition</span>
          </div>

          <h1 className="text-6xl sm:text-7xl font-black text-white mb-5 leading-[1.05] tracking-tight">
            Can you beat<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7dd3b0] via-[#4ade80] to-[#60a5fa]">
              the algorithm?
            </span>
          </h1>

          <p className="text-xl text-[rgba(232,234,240,0.6)] max-w-2xl mx-auto leading-relaxed mb-3">
            Start with <span className="text-white font-semibold">$10,000</span> in virtual cash. Trade real stocks with live market data.
            Compete against AI bots — or challenge your friends.
          </p>
          <p className="text-sm text-[rgba(232,234,240,0.38)]">
            The bots are already trading. They won't wait for you.
          </p>
        </div>

        {/* ── Bot Cards ── */}
        <div className="mb-16">
          <div className="text-center mb-8">
            <p className="text-xs font-bold text-[rgba(232,234,240,0.4)] uppercase tracking-widest">Your opponents</p>
            <h2 className="text-2xl font-bold text-white mt-1">Three AIs. One winner.</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {BOTS.map((bot) => (
              <div
                key={bot.id}
                onMouseEnter={() => setHoveredBot(bot.id)}
                onMouseLeave={() => setHoveredBot(null)}
                className="relative rounded-2xl border p-6 transition-all duration-300 cursor-default"
                style={{
                  background: hoveredBot === bot.id ? bot.glow : "rgba(255,255,255,0.02)",
                  borderColor: hoveredBot === bot.id ? bot.border : "rgba(255,255,255,0.07)",
                  transform: hoveredBot === bot.id ? "translateY(-4px)" : "translateY(0)",
                  boxShadow: hoveredBot === bot.id ? `0 20px 40px ${bot.glow}` : "none",
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="text-3xl">{bot.emoji}</div>
                  <span
                    className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full"
                    style={{ color: bot.color, background: bot.glow, border: `1px solid ${bot.border}` }}
                  >
                    {bot.style}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white mb-1">{bot.name}</h3>
                <p className="text-xs font-medium mb-3" style={{ color: bot.color }}>{bot.tagline}</p>
                <p className="text-sm text-[rgba(232,234,240,0.55)] leading-relaxed">{bot.description}</p>

                <div className="mt-5 pt-4 border-t border-[rgba(255,255,255,0.06)] flex items-center justify-between">
                  <span className="text-[10px] text-[rgba(232,234,240,0.38)] uppercase tracking-wider">Win rate</span>
                  <span className="text-sm font-bold font-mono" style={{ color: bot.color }}>{bot.winRate}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-[rgba(232,234,240,0.35)] mt-5">
            All three compete simultaneously. You need to beat all of them to top the leaderboard.
          </p>
        </div>

        {/* ── Two column: stats + signup ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start max-w-4xl mx-auto">

          {/* Left: proof points */}
          <div className="space-y-5">
            <h2 className="text-2xl font-bold text-white">How it works</h2>

            {[
              { icon: "💰", title: "Start with $10,000", body: "Every player gets the same starting cash. Pure skill determines who wins — no pay-to-win." },
              { icon: "📈", title: "Trade real stocks", body: "Live NYSE and NASDAQ prices, updated every 60 seconds. Your decisions, real consequences." },
              { icon: "🤖", title: "The bots are already trading", body: "The moment a competition starts, the AIs go to work. They don't sleep. They don't hesitate. Can you keep up?" },
              { icon: "🏆", title: "Leaderboard updates live", body: "Watch your rank change in real time. Every trade you make shifts the standings." },
            ].map(({ icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] flex items-center justify-center text-lg flex-shrink-0">
                  {icon}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white mb-1">{title}</div>
                  <div className="text-sm text-[rgba(232,234,240,0.55)] leading-relaxed">{body}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Right: signup */}
          <div>
            <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-2xl overflow-hidden">
              <div className="flex border-b border-[rgba(255,255,255,0.07)]">
                {(["signup", "login"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(null); }}
                    className={`flex-1 py-3.5 text-sm font-medium transition-all relative ${
                      mode === m ? "text-white" : "text-[rgba(232,234,240,0.45)] hover:text-[rgba(232,234,240,0.65)]"
                    }`}
                  >
                    {m === "signup" ? "Create account" : "Sign in"}
                    {mode === m && (
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-gradient-to-r from-[#7dd3b0] to-[#4ade80] rounded-full" />
                    )}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {mode === "signup" && (
                  <div>
                    <label className="block text-[10px] font-medium text-[rgba(232,234,240,0.55)] uppercase tracking-widest mb-2">
                      Trader name
                    </label>
                    <input
                      type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                      placeholder="your_handle" required
                      className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 text-sm text-white placeholder-[rgba(232,234,240,0.2)] focus:outline-none focus:border-[rgba(125,211,176,0.4)] transition-all"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-medium text-[rgba(232,234,240,0.55)] uppercase tracking-widest mb-2">Email</label>
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" required
                    className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 text-sm text-white placeholder-[rgba(232,234,240,0.2)] focus:outline-none focus:border-[rgba(125,211,176,0.4)] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-[rgba(232,234,240,0.55)] uppercase tracking-widest mb-2">Password</label>
                  <input
                    type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" required minLength={6}
                    className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 text-sm text-white placeholder-[rgba(232,234,240,0.2)] focus:outline-none focus:border-[rgba(125,211,176,0.4)] transition-all"
                  />
                </div>

                {error && (
                  <div className="text-xs text-[#f87171] bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.2)] rounded-xl px-4 py-3">
                    ⚠ {error}
                  </div>
                )}
                {message && (
                  <div className="text-xs text-[#4ade80] bg-[rgba(74,222,128,0.08)] border border-[rgba(74,222,128,0.2)] rounded-xl px-4 py-3">
                    ✓ {message}
                  </div>
                )}

                <button
                  type="submit" disabled={loading}
                  className="w-full py-4 rounded-xl text-sm font-bold bg-gradient-to-r from-[#7dd3b0] to-[#4ade80] text-[#060a14] hover:opacity-90 disabled:opacity-40 transition-all mt-2 shadow-lg shadow-[rgba(125,211,176,0.2)]"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-[#060a14] border-t-transparent rounded-full animate-spin" />
                      {mode === "login" ? "Signing in…" : "Creating account…"}
                    </span>
                  ) : (
                    mode === "login" ? "Sign in →" : "Start trading free →"
                  )}
                </button>

                {mode === "signup" && (
                  <p className="text-center text-[10px] text-[rgba(232,234,240,0.35)]">
                    Free forever. No credit card. No real money.
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>

      </main>

      <footer className="relative z-10 border-t border-[rgba(255,255,255,0.04)] py-6 mt-16">
        <p className="text-center text-[10px] text-[rgba(232,234,240,0.28)]">
          Tradecraft · Live market data · Virtual trading only · Not financial advice
        </p>
      </footer>
    </div>
  );
}
