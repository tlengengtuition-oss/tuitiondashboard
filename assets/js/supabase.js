// Creates the shared Supabase client used by every page.
// Loaded after the CDN script (window.supabase) and config.js.
(function () {
  var cfg = window.TLENG_CONFIG || {};
  window.TL_CONFIGURED =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_URL.indexOf("YOUR-PROJECT") === -1 &&
    cfg.SUPABASE_ANON_KEY &&
    cfg.SUPABASE_ANON_KEY.indexOf("YOUR-ANON") === -1;

  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase library failed to load.");
    return;
  }
  // Use placeholders if unconfigured so pages still render (with a banner).
  window.sb = window.supabase.createClient(
    cfg.SUPABASE_URL || "https://rnjvswkejbrhbaytutai.supabase.co",
    cfg.SUPABASE_ANON_KEY || "sb_publishable_IKUtlGhnwJT0Hld5A8cglw_0iF6Y5J9"
  );
})();
