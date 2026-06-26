// Ledger — pending / collected / projected, outstanding grouped by student, mark paid.
(function () {
  var userId = null, nameById = {};
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function todayISO() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function prettyDate(iso) {
    if (!iso) return "";
    var p = iso.split("-"); var mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return (+p[2]) + " " + mo[(+p[1]) - 1];
  }
  // weekday occurrences in the current month; our weekday convention 0=Mon..6=Sun
  function monthOccurrences(weekday) {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth(), count = 0;
    var d = new Date(y, m, 1);
    while (d.getMonth() === m) {
      if (((d.getDay() + 6) % 7) === weekday) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  function monthRange() {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    var first = y + "-" + pad(m + 1) + "-01";
    var last = y + "-" + pad(m + 1) + "-" + pad(new Date(y, m + 1, 0).getDate());
    return { first: first, last: last,
      label: now.toLocaleString("en-SG", { month: "long" }) };
  }

  function renderOutstanding(unpaid) {
    var groups = {};
    unpaid.forEach(function (l) {
      (groups[l.student_id] = groups[l.student_id] || []).push(l);
    });
    var ids = Object.keys(groups).sort(function (a, b) {
      var sa = groups[a].reduce(function (t, l) { return t + Number(l.amount); }, 0);
      var sb = groups[b].reduce(function (t, l) { return t + Number(l.amount); }, 0);
      return sb - sa;
    });

    if (!ids.length) {
      $("outstanding").innerHTML =
        '<div class="card empty"><h3>All settled 🎉</h3><p>No unpaid lessons right now.</p></div>';
      $("out-hint").textContent = "";
      return;
    }
    $("out-hint").textContent = ids.length + (ids.length === 1 ? " student owing" : " students owing");

    $("outstanding").innerHTML = ids.map(function (id) {
      var rows = groups[id].sort(function (a, b) { return a.lesson_date.localeCompare(b.lesson_date); });
      var sum = rows.reduce(function (t, l) { return t + Number(l.amount); }, 0);
      var lessonIds = rows.map(function (l) { return l.id; });
      var inner = rows.map(function (l) {
        return '<div class="lrow">' +
          '<span class="lwhen">' + prettyDate(l.lesson_date) + "</span>" +
          "<span>" + (l.subject ? esc(l.subject) : '<span class="muted">lesson</span>') + "</span>" +
          '<span class="lamt">' + TL.sgd(l.amount) + "</span>" +
          '<button class="mark lite" data-pay="' + l.id + '">Mark paid</button>' +
        "</div>";
      }).join("");
      return '<div class="card group">' +
        '<div class="group-head"><span class="gname">' + esc(nameById[id] || "—") + "</span>" +
          '<span class="right"><span class="gsum">' + TL.sgd(sum) + "</span>" +
          '<button class="mark" data-payall="' + lessonIds.join(",") + '">Mark all paid</button></span></div>' +
        inner + "</div>";
    }).join("");

    $("outstanding").querySelectorAll("[data-pay]").forEach(function (b) {
      b.addEventListener("click", function () { markPaid([b.dataset.pay]); });
    });
    $("outstanding").querySelectorAll("[data-payall]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (confirm("Mark all these lessons as paid?")) markPaid(b.dataset.payall.split(","));
      });
    });
  }

  function renderMonth(rows) {
    var table = $("month-table"), empty = $("month-empty"), body = $("month-body");
    if (!rows.length) { table.style.display = "none"; empty.style.display = "block"; $("month-hint").textContent = ""; return; }
    empty.style.display = "none"; table.style.display = "table";
    rows.sort(function (a, b) { return b.lesson_date.localeCompare(a.lesson_date); });
    $("month-hint").textContent = rows.length + " lessons";
    body.innerHTML = rows.map(function (l) {
      var badge = l.status === "cancelled"
        ? '<span class="kind-tag">cancelled</span>'
        : (l.paid ? '<span class="badge paid">Paid</span>' : '<span class="badge owed">Unpaid</span>');
      return "<tr><td>" + prettyDate(l.lesson_date) + "</td>" +
        '<td class="name">' + esc(nameById[l.student_id] || "—") + "</td>" +
        "<td>" + (l.subject ? esc(l.subject) : '<span class="muted">—</span>') + "</td>" +
        "<td>" + TL.sgd(l.amount) + "</td>" +
        "<td>" + badge + "</td></tr>";
    }).join("");
  }

  async function markPaid(ids) {
    var res = await window.sb.from("lessons").update({ paid: true, paid_date: todayISO() }).in("id", ids);
    if (res.error) { alert("Couldn't update: " + res.error.message); return; }
    load();
  }

  async function load() {
    var st = await window.sb.from("students").select("id,name");
    nameById = {};
    (st.data || []).forEach(function (s) { nameById[s.id] = s.name; });

    var sl = await window.sb.from("recurring_slots").select("weekday,start_time,end_time,rate").eq("active", true);
    var projected = (sl.data || []).reduce(function (t, s) {
      return t + monthOccurrences(s.weekday) * TL.amount(s.rate, s.start_time.slice(0,5), s.end_time.slice(0,5));
    }, 0);
    $("k-projected").textContent = TL.sgd(projected);

    var ls = await window.sb.from("lessons")
      .select("id,student_id,lesson_date,subject,amount,paid,status");
    if (ls.error) { $("k-pending").textContent = "—"; $("out-hint").textContent = "Couldn't load: " + ls.error.message; return; }
    var lessons = ls.data || [];

    // Total pending: done + unpaid (all time)
    var unpaid = lessons.filter(function (l) { return l.status === "done" && !l.paid; });
    var pending = unpaid.reduce(function (t, l) { return t + Number(l.amount); }, 0);
    $("k-pending").textContent = TL.sgd(pending);
    $("k-pending-n").textContent = unpaid.length + " unpaid lessons";

    // This month
    var mr = monthRange();
    var month = lessons.filter(function (l) { return l.lesson_date >= mr.first && l.lesson_date <= mr.last; });
    var collected = month.filter(function (l) { return l.paid; })
      .reduce(function (t, l) { return t + Number(l.amount); }, 0);
    $("k-collected").textContent = TL.sgd(collected);
    $("k-collected-n").textContent = mr.label;

    renderOutstanding(unpaid);
    renderMonth(month);
  }

  function init(user) { userId = user.id; load(); }
  TL.requireAuth("ledger", init);
})();