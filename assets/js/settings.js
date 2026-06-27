// Settings — load and save the tutor's business + PayNow details on their profile.
(function () {
  var userId = null;
  var $ = function (id) { return document.getElementById(id); };

  function preview() {
    var type = $("ptype").value, id = $("pid").value.trim();
    if (!id) { $("preview").textContent = ""; return; }
    $("preview").textContent = "Pays to: " + PayNow.normalize(type, id);
  }

  async function load() {
    var res = await window.sb.from("profiles")
      .select("business_name,paynow_type,paynow_id,invoice_prefix").eq("id", userId).single();
    if (res.error) { $("s-msg").textContent = "Couldn't load: " + res.error.message; $("s-msg").className = "msg err"; return; }
    var p = res.data || {};
    $("biz").value = p.business_name || "";
    $("ptype").value = p.paynow_type || "mobile";
    $("pid").value = p.paynow_id || "";
    $("prefix").value = p.invoice_prefix || "INV";
    preview();
  }

  async function save() {
    var msg = $("s-msg");
    var biz = $("biz").value.trim(), pid = $("pid").value.trim();
    if (!biz) { msg.textContent = "Enter a business name."; msg.className = "msg err"; return; }
    if (!pid) { msg.textContent = "Enter your PayNow ID."; msg.className = "msg err"; return; }
    $("save").disabled = true;
    var res = await window.sb.from("profiles").update({
      business_name: biz,
      paynow_type: $("ptype").value,
      paynow_id: pid,
      invoice_prefix: $("prefix").value.trim() || "INV"
    }).eq("id", userId);
    $("save").disabled = false;
    if (res.error) { msg.textContent = res.error.message; msg.className = "msg err"; return; }
    msg.textContent = "Saved ✓"; msg.className = "msg ok";
  }

  function init(user) {
    userId = user.id;
    $("save").addEventListener("click", save);
    ["ptype", "pid"].forEach(function (id) { $(id).addEventListener("input", preview); });
    load();
  }
  TL.requireAuth("settings", init);
})();