"use client";

import { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  const tickers = [
    { s: "AAPL", p: "307.34", c: "+1.25%" }, { s: "NVDA", p: "897.12", c: "+3.80%" },
    { s: "TSLA", p: "174.88", c: "-2.24%" }, { s: "META", p: "518.90", c: "+2.07%" },
    { s: "MSFT", p: "424.71", c: "+0.62%" }, { s: "GOOGL", p: "174.50", c: "+0.75%" },
    { s: "AMZN", p: "186.33", c: "-0.46%" }, { s: "AMD", p: "466.38", c: "-10.86%" },
  ];

  return (
    <div className="min-h-screen bg-[#060a14] flex flex-col overflow-hidden relative">
      <div className="orb w-[600px] h-[600px] bg-[#7dd3b0] top-[-200px] right-[-100px]" />
      <div className="orb w-[400px] h-[400px] bg-[#4ade80] bottom-[-100px] left-[-100px]" />

      <header className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7dd3b0] to-[#4ade80] flex items-center justify-center">
            <span className="text-[#060a14] font-bold text-xs">TC</span>
          </div>
          <span className="text-white font-semibold tracking-tight text-lg">Tradecraft</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[rgba(232,234,240,0.4)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] live-dot inline-block" />
          Markets live
        </div>
      </header>

      <div className="relative z-10 border-y border-[rgba(255,255,255,0.05)] py-2 overflow-hidden bg-[rgba(255,255,255,0.02)]">
        <div className="flex gap-8 px-8 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {[...tickers, ...tickers].map((t, i) => (
            <div key={i} className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] font-semibold text-[rgba(232,234,240,0.7)] font-mono">{t.s}</span>
              <span className="text-[11px] font-mono text-[rgba(232,234,240,0.5)]">${t.p}</span>
              <span className={`text-[10px] font-mono font-medium ${t.c.startsWith('+') ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>{t.c}</span>
            </div>
          ))}
        </div>
      </div>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px]">
          <div className="mb-10 text-center">
            <div className="inline-flex items-center gap-2 bg-[rgba(125,211,176,0.1)] border border-[rgba(125,211,176,0.2)] rounded-full px-3 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] live-dot inline-block" />
              <span className="text-[11px] text-[#7dd3b0] font-medium">Real market data · Updates every 60s</span>
            </div>
            <h1 className="text-5xl font-bold text-white mb-3 leading-tight tracking-tight">
              Trade stocks.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7dd3b0] to-[#4ade80]">Beat the market.</span>
            </h1>
            <p className="text-[rgba(232,234,240,0.45)] text-base leading-relaxed">
              Start with $10,000 of virtual cash. Compete against friends or bots. See who comes out on top.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { val: "$10K", label: "Starting cash", color: "#4ade80" },
              { val: "Real", label: "Stock data", color: "#7dd3b0" },
              { val: "60s", label: "Refresh rate", color: "#60a5fa" },
            ].map(({ val, label, color }) => (
              <div key={label} className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-2xl p-3.5 text-center hover:border-[rgba(255,255,255,0.12)] transition-colors">
                <div className="text-lg font-bold font-mono mb-0.5" style={{ color }}>{val}</div>
                <div className="text-[10px] text-[rgba(232,234,240,0.58)] uppercase tracking-wider">{label}</div>
              </div>
            ))}
          </div>

          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-2xl overflow-hidden">
            <div className="flex border-b border-[rgba(255,255,255,0.07)]">
              {(["login", "signup"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(null); }}
                  className={`flex-1 py-3.5 text-sm font-medium transition-all relative ${
                    mode === m ? "text-white" : "text-[rgba(232,234,240,0.35)] hover:text-[rgba(232,234,240,0.6)]"
                  }`}
                >
                  {m === "login" ? "Sign in" : "Create account"}
                  {mode === m && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-gradient-to-r from-[#7dd3b0] to-[#4ade80] rounded-full" />
                  )}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="block text-[10px] font-medium text-[rgba(232,234,240,0.4)] uppercase tracking-widest mb-2">Username</label>
                  <input
                    type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                    placeholder="your_handle" required
                    className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 text-sm text-white placeholder-[rgba(232,234,240,0.2)] focus:outline-none focus:border-[rgba(125,211,176,0.4)] transition-all"
                  />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-medium text-[rgba(232,234,240,0.4)] uppercase tracking-widest mb-2">Email</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" required
                  className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-3 text-sm text-white placeholder-[rgba(232,234,240,0.2)] focus:outline-none focus:border-[rgba(125,211,176,0.4)] transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-[rgba(232,234,240,0.4)] uppercase tracking-widest mb-2">Password</label>
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
                className="w-full py-3.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-[rgba(125,211,176,0.15)] to-[rgba(74,222,128,0.15)] border border-[rgba(125,211,176,0.3)] text-[#7dd3b0] hover:from-[rgba(125,211,176,0.25)] hover:to-[rgba(74,222,128,0.25)] disabled:opacity-40 transition-all mt-2 glow-teal"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-[#7dd3b0] border-t-transparent rounded-full animate-spin" />
                    {mode === "login" ? "Signing in..." : "Creating account..."}
                  </span>
                ) : (
                  mode === "login" ? "Sign in →" : "Create account →"
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-[10px] text-[rgba(232,234,240,0.45)] mt-6">
            Market data by Alpha Vantage · For entertainment only
          </p>
        </div>
      </main>
    </div>
  );
}
