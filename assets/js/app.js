// =====================================================================
// TL core — auth guard + app shell + shared helpers
// Every protected page calls:  TL.requireAuth("dashboard", initFn)
// =====================================================================
window.TL = (function () {
  var OWNER_ID = "ad4e2f4f-90c9-4fd9-8d51-e85b0e0bebb4";  // only this account sees Materials
  var isOwner = false;
  var NAV = [
    { id: "dashboard", label: "Dashboard", href: "app.html",    ic: "◧" },
    { id: "planner",   label: "Planner",   href: "planner.html",  ic: "▦" },
    { id: "calendar",  label: "Calendar",  href: "calendar.html", ic: "⊞" },
    { id: "ledger",    label: "Ledger",    href: "ledger.html",   ic: "₪" },
    { id: "students",  label: "Students",  href: "students.html", ic: "☺" },
    { id: "exams",     label: "Exams",     href: "exams.html",    ic: "◷" },
    { id: "invoices",  label: "Invoices",  href: "invoices.html", ic: "❑" },
    { id: "materials", label: "Materials", href: "materials.html",ic: "▤", ownerOnly: true },
    { id: "settings",  label: "Settings",  href: "settings.html", ic: "⚙" }
  ];

  var DEFAULT_BRAND = "T-Leng Tuition";
  var brandName = DEFAULT_BRAND;   // set per-user from profiles.business_name in requireAuth

  // Two-letter badge from the brand: initials of the first two words
  // ("T-Leng Tuition" → "TL", "Raphael Tuition" → "RT"), else first two letters.
  function monogram(name) {
    var w = String(name || "").split(/[\s-]+/).filter(function (t) { return /[A-Za-z0-9]/.test(t); });
    var s = w.length >= 2 ? (w[0][0] + w[1][0]) : (w[0] || "").slice(0, 2);
    return s.toUpperCase() || "TL";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // "Raphael Tuition" → "Raphael Tuition's"; a name already ending in s takes just "'".
  function possessive(name) {
    var s = String(name || "");
    return /s$/i.test(s) ? s + "’" : s + "’s";
  }

  function mono() {
    return '<span class="mono">' + esc(monogram(brandName)) + '</span><span><b>' +
           esc(possessive(brandName)) + '</b><small>Dashboard</small></span>';
  }

  function configBanner() {
    if (window.TL_CONFIGURED) return "";
    return '<div class="note-banner">⚙︎ Not connected yet — paste your Supabase ' +
           'URL and anon key into <code>assets/js/config.js</code> to enable sign-in and data.</div>';
  }

  // Build sidebar + topbar around the page's <div id="view">
  function mountShell(active, email, title, sub) {
    var nav = NAV.filter(function (n) { return !n.ownerOnly || isOwner; }).map(function (n) {
      return '<a href="' + n.href + '" class="' + (n.id === active ? "active" : "") +
             '"><span class="ic">' + n.ic + '</span>' + n.label + "</a>";
    }).join("");

    var view = document.getElementById("view");
    var inner = view.innerHTML;
    var app = document.createElement("div");
    app.className = "app";
    app.innerHTML = `
      <aside class="sidebar">
        <div class="brand">${mono()}</div>
        <nav class="nav">${nav}</nav>
        <div class="side-foot">
          <div class="who">${email || ""}</div>
          <button id="tl-signout">Sign out</button>
        </div>
      </aside>
      <div class="main">
        <div class="topbar">
          <div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>
        </div>
        ${configBanner()}
        <div class="content" id="content">${inner}</div>
      </div>`;
    document.body.innerHTML = "";
    document.body.appendChild(app);
    document.getElementById("tl-signout").addEventListener("click", signOut);
  }

  async function requireAuth(active, init) {
    var meta = { dashboard: ["Dashboard", "Your week at a glance"],
                 planner: ["Weekly planner", "Mon–Sun schedule"],
                 calendar: ["Calendar", "Lessons across the week"],
                 ledger: ["Ledger", "Lessons, payments & projections"],
                 settings: ["Settings", "Business & PayNow details"],
                 exams: ["Exams", "Upcoming assessments"],
                 invoices: ["Invoices", "Saved invoices"],
                 materials: ["Teaching materials", "Your resource library"],
                 student: ["Student", "Profile"],
                 students: ["Students", "Your roster"] }[active] || ["", ""];

    if (!window.TL_CONFIGURED) {
      // Render the shell so the setup banner is visible, skip the auth call.
      mountShell(active, "", meta[0], meta[1]);
      return;
    }
    var res = await window.sb.auth.getSession();
    var session = res.data && res.data.session;
    if (!session) { location.replace("login.html"); return; }
    isOwner = session.user.id === OWNER_ID;
    window.TL_IS_OWNER = isOwner; window.TL_OWNER_ID = OWNER_ID;
    // If two-factor is enabled but not yet satisfied this session (e.g. after a
    // Google sign-in), send the user to complete the challenge first.
    try {
      var aal = await window.sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.data && aal.data.currentLevel === "aal1" && aal.data.nextLevel === "aal2") {
        location.replace("login.html?mfa=1"); return;
      }
    } catch (e) { /* MFA unavailable — proceed as normal */ }
    // Brand the sidebar with this tutor's business name; fall back to the default.
    try {
      var pr = await window.sb.from("profiles").select("business_name").eq("id", session.user.id).single();
      var bn = pr.data && pr.data.business_name && pr.data.business_name.trim();
      brandName = bn || DEFAULT_BRAND;
    } catch (e) { brandName = DEFAULT_BRAND; }
    mountShell(active, session.user.email, meta[0], meta[1]);
    if (typeof init === "function") init(session.user);
  }

  async function signOut() {
    try { await window.sb.auth.signOut(); } catch (e) {}
    location.replace("login.html");
  }

  // ---- helpers ----
  function sgd(n) {
    return "$" + (Number(n) || 0).toLocaleString("en-SG",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function hoursBetween(start, end) {              // "17:00" → "18:30" = 1.5
    function m(t){ var p=t.split(":"); return (+p[0])*60+(+p[1]); }
    return (m(end) - m(start)) / 60;
  }
  function amount(rate, start, end) { return Math.round(rate * hoursBetween(start, end) * 100) / 100; }

  // Flip any "scheduled" lesson whose time has passed to "done" (unpaid),
  // so completed lessons show up as owed without needing a background server.
  async function promotePastLessons() {
    if (!window.sb) return;
    var n = new Date(), p = function (x) { return (x < 10 ? "0" : "") + x; };
    var today = n.getFullYear() + "-" + p(n.getMonth() + 1) + "-" + p(n.getDate());
    var nowT = p(n.getHours()) + ":" + p(n.getMinutes()) + ":" + p(n.getSeconds());
    try {
      // past dates: always promote
      await window.sb.from("lessons").update({ status: "done" })
        .eq("status", "scheduled").lt("lesson_date", today);
      // today: promote only those whose end time has already passed
      await window.sb.from("lessons").update({ status: "done" })
        .eq("status", "scheduled").eq("lesson_date", today).lte("end_time", nowT);
    } catch (e) { /* non-fatal */ }
  }

  // Singapore postal-code → address via OneMap (public gov API, CORS-open, no key needed).
  // Best-effort convenience: returns { address } or { error }; callers degrade to manual entry.
  function titleCase(s) {
    return String(s || "").toLowerCase().replace(/\b([a-z])/g, function (m, c) { return c.toUpperCase(); });
  }
  async function postalLookup(code) {
    code = String(code || "").replace(/\D/g, "");
    if (code.length !== 6) return { error: "Enter a 6-digit postal code." };
    try {
      var r = await fetch("https://www.onemap.gov.sg/api/common/elastic/search?searchVal=" +
        code + "&returnGeom=N&getAddrDetails=Y&pageNum=1");
      var d = await r.json();
      var res = (d.results || [])[0];
      if (!res || !res.ADDRESS || res.ADDRESS.indexOf("NIL") > -1) return { error: "No address found for " + code + "." };
      return { address: titleCase(res.ADDRESS) };
    } catch (e) { return { error: "Couldn't reach the address lookup." }; }
  }

  // Wire a "postal code → Find" control that APPENDS the found address to a location field.
  function wirePostal(postalId, btnId, msgId, locId) {
    var btn = document.getElementById(btnId); if (!btn) return;
    async function run() {
      var msg = document.getElementById(msgId), loc = document.getElementById(locId), pin = document.getElementById(postalId);
      msg.textContent = "Looking up…"; msg.className = "postal-msg";
      var r = await postalLookup(pin.value);
      if (r.error) { msg.textContent = r.error; msg.className = "postal-msg err"; return; }
      var cur = (loc.value || "").trim();
      loc.value = cur ? cur + ", " + r.address : r.address;   // append; you add the unit number
      pin.value = ""; msg.textContent = "Added ✓"; msg.className = "postal-msg ok"; loc.focus();
    }
    btn.addEventListener("click", run);
    var pin = document.getElementById(postalId);
    if (pin) pin.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(); } });
  }

  return { requireAuth: requireAuth, signOut: signOut, mountShell: mountShell,
           sgd: sgd, hoursBetween: hoursBetween, amount: amount,
           promotePastLessons: promotePastLessons, postalLookup: postalLookup, wirePostal: wirePostal };
})();