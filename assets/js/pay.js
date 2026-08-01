// Public invoice page — no login. Loads one invoice by its share token and lets
// the recipient save it (with the PayNow QR) to their photos, then pay in their bank app.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function qs(k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } }

  // Lazily load html2canvas (self-hosted copy first, then CDNs).
  function loadH2C() {
    if (window.html2canvas) return Promise.resolve();
    var urls = ["assets/js/html2canvas.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
      "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"];
    return new Promise(function (resolve, reject) {
      (function tryNext(i) {
        if (i >= urls.length) { reject(new Error("could not load the image library")); return; }
        var s = document.createElement("script"); s.src = urls[i];
        s.onload = function () { window.html2canvas ? resolve() : tryNext(i + 1); };
        s.onerror = function () { tryNext(i + 1); };
        document.head.appendChild(s);
      })(0);
    });
  }

  async function saveImage(title) {
    var btn = $("pay-save"), old = btn.textContent;
    btn.disabled = true; btn.textContent = "Preparing…";
    try {
      await loadH2C();
      var node = $("pay-inv").firstElementChild || $("pay-inv");
      var canvas = await window.html2canvas(node, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
      canvas.toBlob(async function (blob) {
        btn.disabled = false; btn.textContent = old;
        if (!blob) { alert("Couldn't create the image."); return; }
        var file = new File([blob], (title || "invoice") + ".png", { type: "image/png" });
        // Mobile: share sheet offers "Save Image" → Photos. Desktop: download.
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file] }); return; }
          catch (e) { if (e && e.name === "AbortError") return; }
        }
        var url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      }, "image/png");
    } catch (e) {
      btn.disabled = false; btn.textContent = old;
      alert("Couldn't create the image: " + (e.message || e));
    }
  }

  function todayISO() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  function showPaid(dateISO) {
    $("pay-ivepaid").style.display = "none";
    $("pay-form").style.display = "none";
    $("pay-hint").style.display = "none";
    var when = dateISO ? (" on " + new Date(dateISO + "T00:00:00").toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" })) : "";
    $("pay-done").textContent = "Payment recorded" + when + " — thank you! ✓";
    $("pay-done").style.display = "";
  }

  // Parent taps "I've paid": upload the screenshot (if given) under shared/<token>/, then
  // call the secure RPC that marks the invoice + its lessons paid on the chosen date.
  async function reportPaid(t) {
    var msg = $("pay-msg"), sub = $("pay-submit");
    var date = $("pay-date").value || todayISO();
    var file = $("pay-shot").files[0] || null;
    msg.className = "pay-msg"; msg.textContent = "";
    sub.disabled = true; sub.textContent = "Saving…";
    var proofPath = null;
    try {
      if (file) {
        var safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
        var path = "shared/" + t + "/" + Date.now() + "_" + safe;
        var up = await window.sb.storage.from("receipts").upload(path, file, { upsert: false });
        if (up.error) { msg.className = "pay-msg err"; msg.textContent = "Couldn't upload the screenshot: " + up.error.message; sub.disabled = false; sub.textContent = "Confirm payment"; return; }
        proofPath = path;
      }
      var r = await window.sb.rpc("mark_invoice_paid_by_token", { t: t, p_date: date, p_proof: proofPath });
      if (r.error) { msg.className = "pay-msg err"; msg.textContent = "Couldn't record it: " + r.error.message; sub.disabled = false; sub.textContent = "Confirm payment"; return; }
      showPaid(date);
    } catch (e) {
      msg.className = "pay-msg err"; msg.textContent = "Something went wrong — please try again.";
      sub.disabled = false; sub.textContent = "Confirm payment";
    }
  }

  async function load() {
    var t = qs("t");
    if (!t) { $("pay-status").textContent = "This link is missing its invoice code."; return; }
    if (!window.sb) { $("pay-status").textContent = "Couldn't connect. Please try again."; return; }
    var res;
    try { res = await window.sb.rpc("invoice_by_token", { t: t }); }
    catch (e) { $("pay-status").textContent = "Couldn't load this invoice."; return; }
    if (res.error) { $("pay-status").textContent = "Couldn't load this invoice: " + res.error.message; return; }
    var row = (res.data && res.data[0]) || null;
    if (!row || !row.html) { $("pay-status").textContent = "Invoice not found — the link may be wrong or removed."; return; }

    $("pay-inv").innerHTML = row.html;
    document.title = (row.title || "Invoice");
    $("pay-status").style.display = "none";
    $("pay-card").style.display = "";
    $("pay-save").addEventListener("click", function () { saveImage(row.title); });

    if (row.status === "paid") {
      showPaid(null);
      $("pay-done").textContent = "This invoice is already marked paid — thank you! ✓";
    } else {
      $("pay-ivepaid").style.display = "";
      $("pay-ivepaid").addEventListener("click", function () {
        $("pay-ivepaid").style.display = "none";
        $("pay-date").value = todayISO();
        $("pay-form").style.display = "";
      });
      $("pay-cancel").addEventListener("click", function () {
        $("pay-form").style.display = "none";
        $("pay-ivepaid").style.display = "";
      });
      $("pay-submit").addEventListener("click", function () { reportPaid(t); });
    }
  }

  load();
})();
