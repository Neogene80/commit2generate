# Commit 2 Generate — Sales Activity Tracker

A live sales performance dashboard easy to deploy into vercel and uses Supabase backend.

Project is design for a lightweight activity tracker for a sales team and has a Gamification theme with intention of being fun

Medals and Leaderboard included.

🔗 **Live site: [geobyte.uk](https://geobyte.uk)**

---

## What it does

Sales teams live and die by their leading indicators — the weekly activities that drive pipeline and revenue. This tracker gives reps a simple way to log those activities each week, and gives the team a live leaderboard and dashboard to drive friendly competition and accountability.

### Features
- **Activity logging** — reps select their name and enter integer counts for each of 5 leading indicator activity types
- **League table** — all-time ranked leaderboard with animated score counters, gold/silver/bronze medals, and week-on-week change indicators (▲▼)
- **Streak counter** — 🔥 badge for any rep on a 3+ consecutive week submission streak
- **Weekly dashboard** — bar chart of team activity for the current week with a target line, plus trend lines per activity type over the last 8 weeks
- **Submission status board** — live grid showing which reps have and haven't submitted for the current week
- **Live auto-refresh** — data refreshes automatically every 60 seconds
- **Bot protection** — Cloudflare Turnstile CAPTCHA on the entry form

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Database | Supabase (PostgreSQL) |
| Charts | Recharts |
| Hosting | Vercel |
| CDN & Security | Cloudflare |
| Bot Protection | Cloudflare Turnstile |
| Domain | geobyte.uk |

---

## Database structure

Three tables in Supabase:

- **reps** — the 12 sales executives (name, email, team)
- **activity_types** — the 5 leading indicator definitions
- **weekly_entries** — one row per rep per activity type per week (rep_id, activity_type_id, week_commencing, value)

---

## Activity types tracked

1. CUSTOMER – In person engagement
2. CUSTOMER – Remote engagement
3. PARTNER – In person engagement
4. PARTNER – Remote engagement
5. White space intel +1 (heat map)

---

## How it was built

VSCode / React and Claude for database schema design.Cloudflare integration.

Ideal non-Developer project for fun, deploy and maintain full-stack web application.

---

## Running locally

```bash
git clone https://github.com/Neogene80/commit2generate.git
cd commit2generate
npm install
```

Create a `.env` file in the root with:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_TURNSTILE_SITE_KEY=your_turnstile_site_key
```

Then run:
```bash
npm run dev
```
