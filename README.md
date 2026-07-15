# T-Leng Tuition — Dashboard

A password-protected dashboard for running a private tutoring business: students,
weekly schedule, lessons, payments, PayNow invoices, WhatsApp reminders, exams and
per-student profiles. Static frontend on **GitHub Pages**, real accounts + database
on **Supabase**. No build step — plain HTML/CSS/JS.

---

## What it does

- **Dashboard** — KPIs (pending, collected, projected, lessons this week), income
  chart, exam countdown.
- **Planner** — Mon–Sun grid of recurring weekly slots (time, subject, rate).
- **Ledger** — lessons paid/unpaid/scheduled, outstanding-by-student, total pending,
  projected income; log a week or a whole month from the schedule; edit / postpone /
  cancel / delete lessons; mark paid.
- **Students** — roster with add / edit / **merge** (de-dupe safely) / discontinue /
  remove, plus a per-student **Profile** page.
- **Profile** — one page per student: totals, full lesson history (editable),
  recurring slots, exams (editable), and lesson notes (topics / homework / plan).
- **Invoices** — PayNow QR invoices you can print, **save to the app**, or
  **send on WhatsApp** (image attached); a saved-invoices page.
- **WhatsApp reminders** — one-tap reminders with editable, placeholder-driven
  message templates.
- **Exams** — track assessments with type (WA1, SA2, Prelim, PSLE…) and a countdown.
- **Settings** — business name, PayNow ID, invoice prefix, message templates.

---

## Part 1 · One-time setup (~10 min)

### a. Supabase database
1. Create a free project at **supabase.com**.
2. Open **SQL Editor → New query** and run these files **in order** (paste contents, Run):
   1. `db/schema.sql`            — tables + row-level security (the foundation)
   2. `db/migration_paynow.sql`  — PayNow fields on your profile
   3. `db/migration_exam_type.sql` — assessment type on exams
   4. `db/migration_invoices.sql`  — saved invoices table
   5. `db/migration_messages.sql`  — WhatsApp message templates
   6. `db/migration_recipient.sql` — recipient (parent) name on students
   Each is safe to re-run. *(Going forward: any file under `db/…migration….sql` must
   be run once in the SQL editor before its feature works — a
   `column … does not exist` error always means a migration hasn't been run yet.)*
3. *(Optional)* `db/seed.sql` imports the original spreadsheet data. Run it **after**
   you've created your account (it assigns data to the first user).
4. **Sign-in emails:** for a single-user tool, the simplest path is
   **Authentication → Providers → Email → turn off "Confirm email"** so you can sign in
   instantly. (To send real confirmation/reset emails instead, set up custom SMTP —
   see "Email / SMTP" below.)

### b. Credentials
**Project Settings → API**, copy the **Project URL** and the **publishable (anon)** key
into `assets/js/config.js`. The publishable key is safe to commit — RLS protects the
data, not the secrecy of the key.

### c. Deploy on GitHub Pages
1. Push all files to your repo (drag-and-drop via **Add file → Upload files**, keeping
   the folder structure, or use git).
2. **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**, Save.
3. The site goes live at `https://<you>.github.io/<your-repo>/` after the
   **github-pages** deployment finishes (watch repo → Environments).

### d. Create your account
Open the site → **Create account** → you're in.

---

## Part 2 · After setup — getting your dashboard running

A fresh account starts empty (the dashboard shows zeros). Build it up in this order —
each step feeds the next:

1. **Settings** — enter your **business name**, **PayNow ID** (mobile or UEN) and
   **invoice prefix**. Optionally customise the **WhatsApp message templates**. Do this
   first so invoices and reminders work later.

2. **Students** — add everyone. For each: name, type (individual / pair / centre),
   level, **contact number** (needed for WhatsApp), and **message recipient** (the
   parent's name, if you message a parent rather than the student).

3. **Planner** — for each student, add their **recurring weekly slot(s)**: day,
   start/end time, subject and rate. This builds your repeating timetable.

4. **Ledger → Log the week or month** — press **"Log this week (dates)"** or
   **"Log this month"** to generate lessons from your slots (it skips anything already
   logged). Use **+ Add lesson** for one-offs and trials.

5. **Run the week** — as lessons happen, **mark paid** when money comes in, or
   **Postpone / edit** / **Cancel** as plans change. Finished lessons flip to
   "done / unpaid" automatically when you next open the Ledger or Dashboard, and pile up
   under **Outstanding by student**.

6. **Get paid** — on an outstanding balance: **Invoice** generates a PayNow QR (then
   **Save to app** and/or **Send on WhatsApp** with the invoice attached), or **Remind**
   sends a quick WhatsApp nudge. Saved invoices live on the **Invoices** page.

7. **Exams** — add assessments (with type, e.g. WA1 / PSLE) so the countdown surfaces
   them. You can also add/edit exams straight from a student's Profile.

8. **Profiles & notes** — open a student's **Profile** to see totals and history, edit
   their details/lessons/exams, and after each lesson jot **topics covered, homework,
   and a plan for next time** under Lesson notes.

9. **Dashboard** — once data exists it fills in on its own: pending, collected,
   projected, lessons this week, income chart and exam countdown.

> **Minimum to a working dashboard:** Students → Planner slots → "Log this week".
> Everything else layers on top.

---

## Everyday reference

- **Projected this month** = the sum of this month's ledger lessons (scheduled + done,
  paid + unpaid), excluding cancelled. Fill the month (step 4) to see the full figure.
- **De-duplicating students:** use **Merge** (moves lessons/slots/exams onto the kept
  student), never **Remove** — Remove deletes the student *and* their lessons.
- **Stopped lessons:** use **Discontinue** to hide a student from the slot/lesson
  pickers while keeping their history; Reactivate anytime.
- **WhatsApp templates** (Settings) understand these placeholders:
  `{name}` (recipient — parent if set, else student) · `{student}` · `{business}` ·
  `{amount}` · `{count}` · `{month}` · `{invoice}` · `{paynow}` · `{date}` · `{year}`.

---

## Updating the app (important for deploys)

- **CSS cache-busting:** every page links `assets/css/app.css?v=N`. After changing the
  stylesheet, bump `N` everywhere so browsers fetch the fresh file. The current version
  is marked at the top of `app.css` (e.g. `/* v9 */`); you can confirm the live file by
  opening `…/assets/css/app.css?v=N` and checking the first line.
- **Deploys vs. cache:** a green CI check isn't the same as "live" — wait for the
  **github-pages** environment to go Active, and hard-refresh (or use DevTools → Network
  → Disable cache) when iterating.
- **Email / SMTP (optional):** Supabase's built-in email is rate-limited (testing only).
  To send real confirmation/reset emails, set up **custom SMTP** (e.g. Brevo or Resend)
  under **Authentication → SMTP Settings**, then raise the limit under Rate Limits.

---

## Project structure

```
login.html              Sign in / create account (public)
index.html              Dashboard — KPIs, income chart, exam countdown
planner.html            Weekly Mon–Sun planner (recurring slots)
ledger.html             Lessons, payments, outstanding, projections, invoices
students.html           Roster (add / edit / merge / discontinue)
student.html            Per-student profile (history, slots, exams, notes)
exams.html              Exam tracker (with assessment type)
invoices.html           Saved invoices
settings.html           Business / PayNow / message templates

assets/css/app.css      House style (navy / gold / cream / teal); ?v= cache-bust
assets/js/
  config.js             Supabase URL + publishable key (the only credentials)
  supabase.js           Creates the Supabase client
  app.js                Shell, nav, auth guard, shared helpers
  dashboard.js planner.js ledger.js students.js student.js
  exams.js invoices.js settings.js
  paynow.js             PayNow / SGQR QR payload builder
  (qrlib.js)            Optional self-hosted QR library (if the CDN is ad-blocked)

db/
  schema.sql            Tables + row-level security
  migration_*.sql       Incremental schema additions (run in the SQL editor)
  seed.sql              Optional import of the original spreadsheet
  restore_*.sql         One-off recovery scripts
```

---

## Tech notes

- **Stack:** vanilla HTML/CSS/JS, Supabase (Postgres + Auth), Chart.js, a PayNow QR
  builder, and html2canvas (loaded on demand) for the WhatsApp invoice image.
- **Security:** every table is isolated by row-level security (`tutor_id = auth.uid()`),
  so the publishable key is safe in the repo. Never put service-role keys or SMTP
  passwords in any committed file — those belong only in the Supabase dashboard.
- **Multi-tutor ready:** the schema is keyed per tutor, so additional accounts each get
  their own isolated data.

---
## Raphael's updates

A running log of Raphael's changes, newest first.

### 2026-07-15 — Ledger UI pass (`v19` → `v22`)

Made the Ledger quicker to read and act on. Three commits, all **presentation only** — no
schema change, no new queries, and no change to how any amount is calculated. Same data,
better arranged.

**1 · The Records table is scannable** (`87d8f3a`, `v20`)

- **Weekday on every date** — `Tue 15 Jul` instead of `15 Jul`, so a row ties back to its
  recurring slot without doing date maths. New `recDate()`; scoped to Records, so
  `prettyDate()` and the outstanding cards are untouched.
- **Today's row is highlighted** — cream with a gold left border; a gold-edged cream card
  on mobile, where rows collapse to cards.
- **A "Today" button** in the period bar scrolls today into view with a brief pulse, and
  snaps back to the current month first so it always lands somewhere. Respects
  `prefers-reduced-motion`.
- **A "Today · <date>" divider** appears on days with no lessons, at the past/future
  boundary (rows sort newest-first). It anchors the button and separates booked from done.
- **Cancelled rows dim** to 55% with the amount struck through — legible but clearly inert.

**2 · Outstanding and Records became tabs** (`e6d20b8`, `v21`)

The page was very long: KPIs, a card per owing student plus household blocks, filters, then
a month of rows. Outstanding ("chase the money") and Records ("fix the lesson log") are
different jobs.

- **Segmented control** reusing the Dashboard's `.seg` pattern — `setLedgerMode()` mirrors
  `setDashMode()`. Defaults to Outstanding, then remembers your last tab in `localStorage`
  (`tl_ledger_mode`).
- **KPIs stay above the tabs** — they summarize the whole page, so they belong to neither.
- **The owing count rides on the tab** (`Outstanding · 3`) and stays readable while
  inactive, so tabbing never hides the fact that someone owes you. `setOutCount()` is
  called from both exits of `renderOutstanding()` so it can't drift out of sync.
- **`.seg` moved from `app.html`'s inline `<style>` into `app.css`** now that two pages use
  it. Rules are byte-identical; the Dashboard is unaffected.

**3 · Lesson-creating actions moved into Records** (`2a60ff3`, `v22`)

- `Log this week` / `Log this month` / `Log custom range` / `+ Add lesson` now live in the
  **Records** tab. Nothing in that toolbar ever served Outstanding — every button creates
  lesson rows, while Outstanding has its own verbs (Remind, Invoice, Mark paid, combine
  bar). It was never a page-level toolbar; it was the Records toolbar sitting at page level.
- This also closes a feedback gap: logging from Outstanding used to be mostly invisible,
  since generated future lessons are stamped `scheduled` and Outstanding only lists `done`
  + unpaid. The new rows now land in the table you're already looking at.
- Dropped the `led-sub` "Lessons & payments" line with the old bar — it duplicated the
  subtitle `mountShell()` already renders in the topbar, and no JS referenced it.

**Verification.** The Records anchor logic was tested across seven cases (today has
lessons / no lessons today / all-future / all-past / another month / all-time / cancelled
today) to confirm exactly one anchor lands in the right place. Both tabs were rendered in
headless Chrome at desktop and mobile widths against the real stylesheet. That caught one
bug worth noting: today's mobile card had a *lighter* actions strip than its cream body,
inverting how white cards look — fixed in `v21`.

**Note on `?v=`.** Every commit here bumps the cache-busting number across all pages via
`bump-version.sh`, which is why 13 HTML files show up in each diff with no real change.
Only `ledger.html`, `ledger.js`, `app.css` and `app.html` carry actual edits.

### Notes for future work

- **Households aren't a real concept.** `ledger.js` derives them at render time by
  string-matching normalised phone numbers — there's no `household_id` anywhere in the
  schema. Siblings on different parents' numbers silently don't group, and combined
  invoices are saved with `student_id = null` and recover the name by parsing `data.title`.
  Promoting household to a real column/table is the obvious first structural improvement —
  and unlike everything above, it's a data-model change: a migration against the live
  database, a backfill, and no staging copy to rehearse on.
- **`db/schema.sql` is frozen at the first commit.** The live Supabase database is well
  ahead of it — `invoices` and `materials` tables, plus many columns, exist live but aren't
  in the file, and the `migration_*.sql` files this README references were never committed.
  Harmless day-to-day (the live DB is the source of truth), but it means the repo can't
  rebuild the database, and Part 1's setup instructions would produce a broken app for
  anyone deploying fresh.