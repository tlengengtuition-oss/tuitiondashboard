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