// Weekly planner — renders recurring_slots as a Mon–Sun grid, add/remove slots.
(function () {
  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var userId = null, students = [];
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function hhmm(t) { return t ? t.slice(0, 5) : ""; }   // "17:00:00" -> "17:00"
  function nameOf(id) {
    for (var i = 0; i < students.length; i++) if (students[i].id === id) return students[i].name;
    return "—";
  }

  function openModal(open) {
    $("modal").classList.toggle("on", open);
    $("m-msg").textContent = ""; $("m-msg").className = "msg";
    if (open) {
      if (!students.length) {
        $("m-msg").textContent = "Add a student first (Students tab).";
        $("m-msg").className = "msg err";
      }
      $("m-student").focus();
    }
  }
  function clearForm() {
    $("m-subject").value = ""; $("m-start").value = ""; $("m-end").value = ""; $("m-rate").value = "";
    $("m-day").value = "0"; if (students.length) $("m-student").value = students[0].id;
  }

  function studentOptions() {
    $("m-student").innerHTML = students.length
      ? students.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + "</option>"; }).join("")
      : '<option value="">— no students yet —</option>';
  }

  function render(slots) {
    var byDay = [[], [], [], [], [], [], []];
    slots.forEach(function (s) { if (s.weekday >= 0 && s.weekday <= 6) byDay[s.weekday].push(s); });
    byDay.forEach(function (arr) {
      arr.sort(function (a, b) { return (a.start_time || "").localeCompare(b.start_time || ""); });
    });

    var weekTotal = 0;
    var html = byDay.map(function (arr, d) {
      var dayTotal = 0;
      var inner = arr.length ? arr.map(function (s) {
        var cost = TL.amount(s.rate, hhmm(s.start_time), hhmm(s.end_time));
        dayTotal += cost;
        return '<div class="slot">' +
          '<button class="x" data-del="' + s.id + '" title="Remove">×</button>' +
          '<div class="t">' + hhmm(s.start_time) + "–" + hhmm(s.end_time) +
            (s.subject ? " · " + esc(s.subject) : "") + "</div>" +
          '<div class="s">' + esc(nameOf(s.student_id)) + "</div>" +
          '<div class="c">' + TL.sgd(cost) + "</div>" +
        "</div>";
      }).join("") : '<div class="none">—</div>';
      weekTotal += dayTotal;
      return '<div class="day"><h3 class="' + (arr.length ? "has" : "") + '">' +
        '<span>' + SHORT[d] + "</span>" +
        '<span class="dtot">' + (dayTotal ? TL.sgd(dayTotal) : "") + "</span></h3>" +
        '<div class="slots">' + inner + "</div></div>";
    }).join("");

    $("week").innerHTML = html;
    $("p-total").innerHTML = slots.length
      ? "Weekly total <b>" + TL.sgd(weekTotal) + "</b> · " + slots.length + " slots"
      : "No recurring slots yet — add your first.";

    $("week").querySelectorAll("[data-del]").forEach(function (btn) {
      btn.addEventListener("click", function () { removeSlot(btn.dataset.del); });
    });
  }

  async function load() {
    var st = await window.sb.from("students").select("id,name").order("name");
    if (!st.error) { students = st.data || []; studentOptions(); }

    var res = await window.sb.from("recurring_slots")
      .select("id,student_id,weekday,start_time,end_time,subject,rate");
    if (res.error) { $("p-total").textContent = "Couldn't load schedule: " + res.error.message; return; }
    render(res.data || []);
  }

  async function removeSlot(id) {
    if (!confirm("Remove this weekly slot?")) return;
    var res = await window.sb.from("recurring_slots").delete().eq("id", id);
    if (res.error) { alert("Couldn't remove: " + res.error.message); return; }
    load();
  }

  async function save() {
    var msg = $("m-msg");
    var sid = $("m-student").value;
    var start = $("m-start").value, end = $("m-end").value;
    var rate = parseFloat($("m-rate").value);
    if (!sid) { msg.textContent = "Pick a student."; msg.className = "msg err"; return; }
    if (!start || !end) { msg.textContent = "Set a start and end time."; msg.className = "msg err"; return; }
    if (end <= start) { msg.textContent = "End time must be after start."; msg.className = "msg err"; return; }
    if (!(rate >= 0)) { msg.textContent = "Enter an hourly rate."; msg.className = "msg err"; return; }

    $("m-save").disabled = true;
    var res = await window.sb.from("recurring_slots").insert({
      tutor_id: userId,
      student_id: sid,
      weekday: parseInt($("m-day").value, 10),
      start_time: start,
      end_time: end,
      subject: $("m-subject").value.trim() || null,
      rate: rate
    });
    $("m-save").disabled = false;
    if (res.error) { msg.textContent = res.error.message; msg.className = "msg err"; return; }
    openModal(false); clearForm(); load();
  }

  function init(user) {
    userId = user.id;
    $("add-btn").addEventListener("click", function () { openModal(true); });
    $("m-cancel").addEventListener("click", function () { openModal(false); });
    $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) openModal(false); });
    $("m-save").addEventListener("click", save);
    load();
  }

  TL.requireAuth("planner", init);
})();