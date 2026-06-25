# Tradecraft — Setup Guide

Real stocks. Fake money. Compete with friends or a bot.

---

## What's in here

```
tradecraft/
├── supabase/
│   ├── migrations/001_initial_schema.sql   ← run this first
│   └── functions/stock-prices/index.ts     ← edge function
├── web/                                    ← Next.js (Vercel)
└── mobile/                                 ← Expo (App Store / Play Store)
```

---

## Step 1 — Supabase setup

1. Go to [supabase.com](https://supabase.com) and open your project.
2. Open **SQL Editor**, paste the contents of `supabase/migrations/001_initial_schema.sql`, and run it.
3. Go to **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL`
   - Anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - Service role key → needed for the edge function

---

## Step 2 — Alpha Vantage API key

1. Get a free key at [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key)
2. Free tier: 25 requests/day. The app caches aggressively so this is fine to start.
3. Save the key — you'll add it to the edge function next.

---

## Step 3 — Deploy the Supabase Edge Function

Install the Supabase CLI if you haven't:
```bash
npm install -g supabase
```

Log in and link your project:
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Set secrets (from your Supabase project settings):
```bash
supabase secrets set ALPHA_VANTAGE_KEY=your_key_here
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Deploy the function:
```bash
supabase functions deploy stock-prices
```

Test it:
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/stock-prices \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["AAPL", "NVDA"], "interval": "5min"}'
```

---

## Step 4 — Web app (Next.js → Vercel)

### Run locally
```bash
cd web
cp .env.example .env.local
# Fill in your Supabase URL and anon key in .env.local
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### Deploy to Vercel
1. Push the `web/` folder to a GitHub repo (or the whole monorepo).
2. Go to [vercel.com](https://vercel.com), click **New Project**, import the repo.
3. Set the root directory to `web/` if using a monorepo.
4. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Click **Deploy**.

---

## Step 5 — Mobile app (Expo → App Store / Play Store)

### Run locally (development)
```bash
cd mobile
cp .env.example .env
# Fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install
npx expo start
```
Scan the QR code with Expo Go on your phone.

### Build for App Store (iOS)

Install EAS CLI:
```bash
npm install -g eas-cli
eas login
```

Configure your project:
```bash
cd mobile
eas build:configure
```

Build:
```bash
eas build --platform ios
```

Submit to App Store:
```bash
eas submit --platform ios
```

### Build for Play Store (Android)
```bash
eas build --platform android
eas submit --platform android
```

### Important before submitting
- Add your app icon to `mobile/assets/icon.png` (1024×1024 PNG)
- Add splash screen to `mobile/assets/splash.png` (1284×2778 PNG)
- Update `bundleIdentifier` in `app.json` to your actual bundle ID
- Make sure your Apple Developer / Google Play accounts are set up in EAS

---

## How the data flows

```
Alpha Vantage API
      ↓ (fetched by edge function, cached 60s)
Supabase (stock_prices + stock_candles tables)
      ↓ (Supabase Realtime pushes updates)
Web app (Next.js) + Mobile app (Expo)
      both read from the same Supabase project
```

The Alpha Vantage key is **never** exposed to the browser or app — it lives only in the Supabase edge function secrets.

---

## Upgrading Alpha Vantage

Free tier: 25 calls/day (enough for testing).
Premium tiers start at ~$50/month for real-time data and higher limits.

When you're ready to upgrade, just replace the key in Supabase secrets:
```bash
supabase secrets set ALPHA_VANTAGE_KEY=your_premium_key
```
No code changes needed.

---

## Adding more stocks

Edit the seed section at the bottom of `supabase/migrations/001_initial_schema.sql`
and add more symbols. Or insert directly in the Supabase dashboard:

```sql
insert into stock_prices (symbol, company_name, price, change_percent)
values ('PLTR', 'Palantir Technologies', 24.50, 1.35);
```

The edge function will keep prices updated once the symbol is in the table.
