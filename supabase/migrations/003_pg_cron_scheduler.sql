-- ============================================================
-- Migration 003: pg_cron scheduler for Bot Lab
-- Replaces cron-job.org with Supabase-native scheduling.
-- Runs inside the database — no external service needed,
-- no job limits on free tier.
--
-- HOW TO APPLY:
--   1. Open Supabase Dashboard → SQL Editor
--   2. Paste and run this file on the Bot Lab project
--      (aqamyrjcuozyanrzzlwo — NOT the live Tradecraft project)
--   3. Replace 'YOUR_CRON_SECRET_HERE' with the value of
--      CRON_SECRET from your Vercel environment variables.
--   4. Delete the cron-job.org entry for run-bots.
--
-- VERIFY after applying:
--   select jobname, schedule, active from cron.job;
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────

-- pg_cron is enabled by default on all Supabase projects.
-- pg_net allows outbound HTTP calls from within PostgreSQL.
-- Both live in Supabase by default — these are no-ops if already enabled.
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ── Store the cron secret as a database-level setting ────────
-- This avoids hardcoding the secret in the job definition.
-- Replace the value below with your actual CRON_SECRET.

alter database postgres
  set app.cron_secret = 'YOUR_CRON_SECRET_HERE';

-- ── Remove any existing Bot Lab cron jobs (idempotent) ───────

select cron.unschedule('botlab-run-bots')
  where exists (
    select 1 from cron.job where jobname = 'botlab-run-bots'
  );

-- ── Schedule: run bots every 30 minutes ─────────────────────
-- Fires at :00 and :30 of every hour, every day.
-- The /api/cron/run-bots handler checks isMarketOpen()
-- internally and skips the run outside market hours,
-- so running 24/7 here is harmless and cheap.

select cron.schedule(
  'botlab-run-bots',
  '*/30 * * * *',
  $$
  select net.http_get(
    url     := 'https://web-sigma-neon-3kxj36vwgs.vercel.app/api/cron/run-bots',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || current_setting('app.cron_secret', true)
    )
  );
  $$
);

-- ── Verify ───────────────────────────────────────────────────
-- Run this query to confirm the job is registered:
--
--   select jobname, schedule, active, nextrun
--   from cron.job
--   where jobname = 'botlab-run-bots';
--
-- Run this to see execution history:
--
--   select jobid, status, return_message, start_time
--   from cron.job_run_details
--   order by start_time desc
--   limit 20;
