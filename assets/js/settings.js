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
      .select("business_name,paynow_type,paynow_id,invoice_prefix,reminder_message,invoice_message").eq("id", userId).single();
    if (res.error) { $("s-msg").textContent = "Couldn't load: " + res.error.message; $("s-msg").className = "msg err"; return; }
    var p = res.data || {};
    $("biz").value = p.business_name || "";
    $("ptype").value = p.paynow_type || "mobile";
    $("pid").value = p.paynow_id || "";
    $("prefix").value = p.invoice_prefix || "INV";
    $("rmsg").value = p.reminder_message || "";
    $("imsg").value = p.invoice_message || "";
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
      invoice_prefix: $("prefix").value.trim() || "INV",
      reminder_message: $("rmsg").value.trim() || null,
      invoice_message: $("imsg").value.trim() || null
    }).eq("id", userId);
    $("save").disabled = false;
    if (res.error) { msg.textContent = res.error.message; msg.className = "msg err"; return; }
    msg.textContent = "Saved ✓"; msg.className = "msg ok";
  }

  // ---- Two-factor (TOTP) ----
  var enrollId = null;
  function mfaShow(which) {
    ["mfa-loading","mfa-off","mfa-enroll","mfa-on"].forEach(function(id){
      var el=$(id); if(el) el.style.display = (id===which?"block":"none");
    });
  }
  async function refreshMfa() {
    mfaShow("mfa-loading");
    try {
      var r = await window.sb.auth.mfa.listFactors();
      if (r.error) throw r.error;
      var verified = (r.data && r.data.totp || []).filter(function(f){return f.status==="verified";});
      mfaShow(verified.length ? "mfa-on" : "mfa-off");
    } catch (e) { mfaShow("mfa-off"); }
  }
  async function mfaEnable() {
    $("mfa-enable").disabled = true;
    try {
      var r = await window.sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator ("+Date.now()+")" });
      if (r.error) throw r.error;
      enrollId = r.data.id;
      $("mfa-qr").src = r.data.totp.qr_code;
      $("mfa-secret").textContent = r.data.totp.secret;
      $("mfa-code").value = "";
      $("mfa-emsg").textContent = ""; $("mfa-emsg").className = "msg";
      mfaShow("mfa-enroll");
    } catch (e) {
      var m=$("s-msg"); m.textContent = "Couldn't start setup: "+(e.message||e); m.className="msg err";
    } finally { $("mfa-enable").disabled = false; }
  }
  async function mfaVerify() {
    var code = ($("mfa-code").value||"").trim(), em = $("mfa-emsg");
    if (!/^\d{6}$/.test(code)) { em.textContent="Enter the 6-digit code from your app."; em.className="msg err"; return; }
    $("mfa-verify").disabled = true;
    try {
      var r = await window.sb.auth.mfa.challengeAndVerify({ factorId: enrollId, code: code });
      if (r.error) throw r.error;
      enrollId = null;
      refreshMfa();
    } catch (e) {
      em.textContent = e.message || "That code didn't match. Try the current one."; em.className="msg err";
    } finally { $("mfa-verify").disabled = false; }
  }
  async function mfaCancel() {
    if (enrollId) { try { await window.sb.auth.mfa.unenroll({ factorId: enrollId }); } catch(e){} enrollId=null; }
    refreshMfa();
  }
  async function mfaDisable() {
    if (!confirm("Turn off two-factor authentication? You'll sign in with just your password.")) return;
    $("mfa-disable").disabled = true;
    try {
      var r = await window.sb.auth.mfa.listFactors();
      var factors = (r.data && r.data.all) || [];
      for (var i=0;i<factors.length;i++){ await window.sb.auth.mfa.unenroll({ factorId: factors[i].id }); }
      refreshMfa();
    } catch (e) {
      var m=$("s-msg"); m.textContent = "Couldn't turn it off: "+(e.message||e); m.className="msg err";
    } finally { $("mfa-disable").disabled = false; }
  }

  function init(user) {
    userId = user.id;
    $("save").addEventListener("click", save);
    ["ptype", "pid"].forEach(function (id) { $(id).addEventListener("input", preview); });
    $("mfa-enable").addEventListener("click", mfaEnable);
    $("mfa-verify").addEventListener("click", mfaVerify);
    $("mfa-cancel").addEventListener("click", mfaCancel);
    $("mfa-disable").addEventListener("click", mfaDisable);
    load();
    refreshMfa();
  }
  TL.requireAuth("settings", init);
})();