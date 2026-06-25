# Tradecraft Bot Lab — Project Brief

## Overview

A standalone instance of Tradecraft dedicated to running 30–40 automated trading bots across five strategy groups. No real users, no competition UI. Purpose: discover which trading strategies actually work over a 12-month period by running diverse bots in parallel and collecting daily equity data.

**Stack:** Clone of Tradecraft (Next.js 14, Supabase, Vercel). New repo, new Supabase project, new Vercel deployment. Completely isolated from the live Tradecraft app.

---

## Global Rules (all bots)

| Rule | Value |
|---|---|
| Starting capital | $1,000 each |
| Borrowing / shorting | Not allowed — cash only |
| Max single position | 40% of portfolio value |
| Trade cooldown | 30 minutes between trades |
| Dormancy trigger | Bot goes inactive if cash drops below $50 |
| Markets | US stocks and US-listed ETFs only |
| Data source | Yahoo Finance (free, no rate limit) |

---

## Group A — US Stocks, Rule-Based (5 bots)

Straightforward systematic strategies. Each bot has a fixed ruleset that never changes.

### A1 — Index Bot
Rebalances equally across 5 blue chips: AAPL, MSFT, GOOGL, AMZN, NVDA.
- Only trades when any position drifts more than 10% from equal weight
- Sell overweight positions first, then deploy cash into underweight

### A2 — Momentum Bot
Chases daily gainers, cuts losers fast.
- Buy top 2 stocks up >1% today (35% of cash per buy)
- Sell any holding that drops >2% in a single day

### A3 — Value Bot
Contrarian — buys weakness, takes profit on strength.
- Buy stocks near their 52-week low
- Sell when position is up 15%

### A4 — Dividend Bot
Passive income simulation — never sells unless forced.
- Hold only: KO, JNJ, JPM, WMT, XOM
- Only sells if cash balance hits dormancy threshold

### A5 — Chaos Bot
Pure random — control group baseline.
- 35% chance of doing nothing each cycle
- Otherwise: random buy (5–20% of cash) or random partial sell
- No logic, no strategy

---

## Group B — Global Markets via ETFs (3 bots)

All bots in this group trade US-listed ETFs only, avoiding currency and hours complexity while gaining global exposure.

**Allowed symbols:** SPY (US), QQQ (US Tech), ENZL (New Zealand), EWA (Australia), EZU (Europe), EWJ (Japan), FXI (China)

### B1 — Global Rotation Bot
Always holds the 2 ETFs with the best 5-day return.
- Recalculates rankings daily
- Swaps out of underperformers when rankings change

### B2 — Safe Haven Bot
Holds SPY by default, retreats to cash on volatility.
- Switches to full cash (does nothing) if SPY drops >1% in a day
- Re-enters SPY once SPY has a positive day

### B3 — Pacific Focus Bot
Biased toward NZ, AU, and Japan (ENZL, EWA, EWJ).
- Holds equal weight across these three
- Rebalances weekly

---

## Group C — Technical Analysis (3 bots)

Signal-driven bots using price action patterns.

### C1 — RSI Reversal Bot
Buys oversold stocks, exits on recovery or stop-loss.
- Buy any stock that has been down 3 consecutive days
- Sell when +5% gain OR -3% loss from entry price

### C2 — Breakout Bot
Momentum continuation — assumes today's move keeps going.
- Buy any stock up >2% today
- Re-evaluate after 24 hours; sell if move has reversed

### C3 — Mean Reversion Bot
Opposite of Breakout — fades the move.
- Buy any stock down >2% today, expecting a bounce
- Sell when +3% recovery or cut at -5%

---

## Group D — Learning / Adaptive (1 bot)

Watches all other bots collectively and copies the current leader.

### D1 — Shadow Bot
- Starts by copying whichever Group A bot is ranked #1 at launch
- Every 7 days, checks the full leaderboard across all groups
- Switches strategy to mirror whoever is currently winning
- Maximum copy lag: 24 hours behind the leader's trades
- If two bots are tied, stays with current strategy

---

## Group E — Political & Institutional Intelligence (6 bots)

All data comes from legally mandated public disclosures. STOCK Act (2012) requires all US Members of Congress and their spouses to disclose trades within 45 days. SEC 13F filings require institutional investors managing >$100M to disclose all holdings quarterly.

**Note on data lag:** Congressional trades can be up to 45 days old when they appear. 13F filings are 45–135 days old. This is intentional — the experiment will reveal whether these signals remain profitable despite the lag.

### E1 — Congress Momentum Bot
Follows concentrated congressional buying.
- Data source: Capitol Trades API or Quiver Quantitative
- Buy any stock purchased by 3+ different members of Congress within the past 30 days
- Concentration of buying is the signal — individual trades are noise

### E2 — Pelosi Equity Bot
Mirrors Nancy Pelosi's personal stock disclosures.
- Data source: Nancy Pelosi's STOCK Act periodic transaction reports
- Buys/sells in line with her disclosed equity positions
- Long-hold, tech-heavy strategy
- Historical edge: consistently outperforms the S&P 500

### E3 — Pelosi Options Bot
Mirrors Paul Pelosi's options trades, converted to underlying shares.
- Data source: Paul Pelosi's trades as disclosed in Nancy's spousal filings
- Options → stock conversion: call options = buy underlying shares; put options = sell/skip
- More aggressive than E2; known for large concentrated bets (e.g., NVDA before CHIPS Act)

### E4 — Buffett Bot
Mirrors Berkshire Hathaway's top 5 holdings.
- Data source: SEC EDGAR 13F filings (free, official)
- Holds equal weight across Berkshire's top 5 disclosed positions
- Rebalances quarterly when new 13F drops
- Conservative, high-conviction, long-horizon strategy

### E5 — ARK Bot
Mirrors Cathie Wood's ARK Innovation ETF top holdings.
- Data source: ARK Invest publishes holdings daily for free (ark-funds.com)
- Holds top 5 positions from ARKK
- Rebalances weekly — ARK rotates more aggressively than Buffett
- High-volatility, high-conviction growth strategy

### E6 — Hedge Fund Consensus Bot
Buys only where the biggest funds agree.
- Data source: SEC EDGAR 13F filings from top 20 hedge funds
- Buy stocks that appear in the top 10 holdings of 5 or more funds simultaneously
- Theory: when smart money converges, the signal is strongest
- Rebalances quarterly

---

## Data & Tracking Requirements

### Daily snapshot table
Every 24 hours, record each bot's:
- Total portfolio value
- Cash balance
- Holdings (symbol, shares, current value)
- Day's P&L
- Cumulative return %

This creates the equity curve data needed for year-end analysis.

### Performance summaries
- **Daily:** Top 3 and bottom 3 bots by that day's return
- **Weekly:** Full leaderboard with 7-day return, best trade of the week
- **Monthly:** Full rankings, strategy group averages, biggest winners/losers

### Bot trigger
Bots run via a scheduled cron job (pg_cron in Supabase or Vercel cron) independent of any browser session. Target frequency: every 30–60 minutes during US market hours (9:30am–4:00pm ET, weekdays).

---

## Key Questions This Experiment Will Answer

1. Does congressional trading data outperform systematic rule-based strategies, despite the 45-day disclosure lag?
2. Is it Nancy or Paul Pelosi driving the household's returns — equity selection or options timing?
3. Does the Shadow Bot (Group D) converge on a dominant strategy or keep switching?
4. Do technical bots (Group C) outperform index bots (Group A) over 12 months?
5. Which global ETF market (Group B) performs best in the period?
6. Is the Chaos Bot (A5) ever competitive — and if so, what does that say about the others?

---

## Build Order (recommended)

1. Clone Tradecraft repo → new repo `tradecraft-botlab`
2. New Supabase project — same schema minus user-facing tables
3. Add `bot_daily_snapshots` table for equity tracking
4. Implement Groups A and C first (no external APIs needed)
5. Add Group B (ETF symbols already in Yahoo Finance)
6. Wire up Group D (Shadow Bot — needs leaderboard data)
7. Integrate Capitol Trades / SEC EDGAR APIs → build Group E
8. Set up pg_cron or Vercel cron for autonomous trading
9. Build monitoring dashboard (leaderboard + equity curves per bot)
10. Let it run for 12 months, review summaries as they come in

---

*Brief locked: June 2026. All rules approved.*
