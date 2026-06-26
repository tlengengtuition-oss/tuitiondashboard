// Students screen — load roster, add, remove. Reads/writes the `students` table.
(function () {
  var userId = null;
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function openModal(open) {
    $("modal").classList.toggle("on", open);
    $("m-msg").textContent = "";
    $("m-msg").className = "msg";
    if (open) { $("m-name").focus(); }
  }

  function clearForm() {
    ["m-name", "m-level", "m-contact", "m-notes"].forEach(function (id) { $(id).value = ""; });
    $("m-kind").value = "individual";
  }

  async function load() {
    var res = await window.sb.from("students")
      .select("id,name,kind,level,contact")
      .order("name", { ascending: true });

    if (res.error) {
      $("s-count").textContent = "Couldn't load students: " + res.error.message;
      return;
    }
    var rows = res.data || [];
    $("s-count").textContent = rows.length
      ? rows.length + (rows.length === 1 ? " student" : " students")
      : "";

    var table = $("s-table"), empty = $("s-empty"), body = $("s-body");
    if (!rows.length) { table.style.display = "none"; empty.style.display = "block"; return; }
    empty.style.display = "none"; table.style.display = "table";

    body.innerHTML = rows.map(function (r) {
      return '<tr data-id="' + r.id + '">' +
        '<td class="name">' + esc(r.name) + "</td>" +
        '<td><span class="kind-tag">' + esc(r.kind) + "</span></td>" +
        "<td>" + (r.level ? esc(r.level) : '<span class="muted">—</span>') + "</td>" +
        "<td>" + (r.contact ? esc(r.contact) : '<span class="muted">—</span>') + "</td>" +
        '<td style="text-align:right"><button class="row-act" data-del="' + r.id +
          '" data-name="' + esc(r.name) + '">Remove</button></td>' +
      "</tr>";
    }).join("");

    body.querySelectorAll("[data-del]").forEach(function (btn) {
      btn.addEventListener("click", function () { remove(btn.dataset.del, btn.dataset.name); });
    });
  }

  async function remove(id, name) {
    if (!confirm("Remove " + name + "? Their lessons stay in the ledger.")) return;
    var res = await window.sb.from("students").delete().eq("id", id);
    if (res.error) { alert("Couldn't remove: " + res.error.message); return; }
    load();
  }

  async function save() {
    var name = $("m-name").value.trim();
    var msg = $("m-msg");
    if (!name) { msg.textContent = "Give the student a name."; msg.className = "msg err"; return; }

    $("m-save").disabled = true;
    var res = await window.sb.from("students").insert({
      tutor_id: userId,
      name: name,
      kind: $("m-kind").value,
      level: $("m-level").value.trim() || null,
      contact: $("m-contact").value.trim() || null,
      notes: $("m-notes").value.trim() || null
    });
    $("m-save").disabled = false;

    if (res.error) { msg.textContent = res.error.message; msg.className = "msg err"; return; }
    openModal(false); clearForm(); load();
  }

  function init(user) {
    userId = user.id;
    $("add-btn").addEventListener("click", function () { openModal(true); });
    $("m-cancel").addEventListener("click", function () { openModal(false); });
    $("modal").addEventListener("click", function (e) {
      if (e.target === $("modal")) openModal(false);
    });
    $("m-save").addEventListener("click", save);
    $("m-name").addEventListener("keydown", function (e) { if (e.key === "Enter") save(); });
    load();
  }

  TL.requireAuth("students", init);
})();