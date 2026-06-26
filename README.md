# T-Leng Tuition — Dashboard

A password-protected dashboard for tracking tuition lessons, payments and projected
income. Static frontend on **GitHub Pages**, real accounts + database on **Supabase**.

This is **step 1: the shell** — sign-up / sign-in, session guard (every page bounces
to the login screen if you're not authenticated), navigation, and the house style.
The data screens (planner, ledger, students) are scaffolded and filled in next.

---

## 1 · Supabase (do this once, ~5 min)

1. Create a free project at **supabase.com**.
2. Open **SQL Editor → New query**, paste the contents of **`db/schema.sql`**, and **Run**.
   This builds the tables and the row-level security that isolates your data.
3. *(Recommended for a single-user tool)* **Authentication → Providers → Email** →
   turn **off** "Confirm email" so you can sign in immediately without the email step.
4. **Project Settings → API**, copy the **Project URL** and the **anon public** key.
5. Paste both into **`assets/js/config.js`**. The anon key is safe to commit publicly —
   RLS protects the data, not the secrecy of the key.

## 2 · Push to your empty GitHub repo

**Option A — git CLI**
```bash
cd path/to/these-files
git init
git add .
git commit -m "Dashboard shell"
git branch -M main
git remote add origin https://github.com/<you>/<your-repo>.git
git push -u origin main
```

**Option B — no terminal:** on your repo page click **Add file → Upload files**,
drag everything in (keep the folder structure), and commit.

## 3 · Turn on GitHub Pages

Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
pick **`main`** / **`/ (root)`**, Save. After a minute your site is live at
`https://<you>.github.io/<your-repo>/`.

## 4 · First run

Open the site → **Create account** → you're in. Until `config.js` holds real
Supabase values, every page shows a setup banner instead of signing in.

---

## Project structure
```
login.html          Sign in / create account (public)
index.html          Dashboard (KPI tiles — placeholders for now)
planner.html        Weekly Mon–Sun planner (stub)
ledger.html         Paid / unpaid / pending / projected (stub)
students.html       Roster (stub)
assets/css/app.css  House style: navy / gold / cream / teal
assets/js/
  config.js         ← your Supabase URL + anon key go here
  supabase.js       Client init
  app.js            Auth guard, shell, helpers
db/schema.sql       Run this in Supabase
```

## What's next (we build down this list, one review each)
1. **Students** — roster + add-student form
2. **Weekly planner** — Mon–Sun grid from your recurring slots
3. **Ledger** — paid, unpaid-by-student, total pending, projected month
4. **Add lesson** — auto-fills from a student's slot; "generate this week from template"
5. **Extras** — dashboard KPIs, monthly income chart, exam countdown, WhatsApp reminders, export
6. **PayNow invoice** — per unpaid balance, an "Invoice + QR" button that renders a
   scannable PayNow (SGQR) code with the amount and reference (generated in-browser, no backend)
7. **Import** — load your existing 2026 spreadsheet so you launch with real data