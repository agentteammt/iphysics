/* ============================================================
   DSGVO-Cookie-Consent — zweilagig, strikt: KEIN Statistik-/Marketing-
   Skript lädt vor der Einwilligung. Eigenständig, kein Framework.
   Sprache automatisch via <html lang> (de/en/it).

   Konfiguration am eigenen <script>-Tag:
     data-ga4="G-XXXXXXXXXX"    GA4 Measurement-ID   (leer = lädt nie)
     data-linkedin="XXXXXXX"    LinkedIn Partner-ID  (leer = lädt nie)
     data-privacy-href="datenschutz.html"
     data-lang="de"             optionaler Override

   Speicher: localStorage "iph_consent_v1" {v,ts,stat,mkt} · 12 Monate.
   Widerruf: jeder Klick auf [data-cookie-settings] öffnet die Kategorien;
   bei Herabstufung werden bekannte Tracking-Cookies bestmöglich gelöscht
   (endgültig wirksam ab dem nächsten Seitenaufruf).
   API: window.iphConsent = { get(), open(), reset() } · Event "iph-consent".
   Ohne JS lädt grundsätzlich kein Tracking → konform per Default.
   ============================================================ */
(function () {
  "use strict";
  if (window.iphConsent) return;
  var KEY = "iph_consent_v1", MAX_AGE = 365 * 864e5;
  var sc = document.currentScript || {};
  var ds = sc.dataset || {};
  var cfg = {
    ga4: (ds.ga4 || "").trim(),
    li: (ds.linkedin || "").trim(),
    privacy: ds.privacyHref || "datenschutz.html",
    demo: ds.demo != null, /* Design-Vorschau: immer zeigen, nichts speichern/laden */
    lang: (ds.lang || "").trim()
  };
  var lang = (cfg.lang || document.documentElement.lang || "de").slice(0, 2).toLowerCase();
  if (lang !== "en" && lang !== "it") lang = "de";

  var T = {
    de: {
      k: "Cookies",
      txt: "Wir möchten Cookies für Statistik (Google Analytics) und Marketing (LinkedIn) einsetzen — erst nach Ihrer Einwilligung. Mehr in der <a href=\"{p}\">Datenschutzerklärung</a>.",
      all: "Alle akzeptieren", none: "Ablehnen", set: "Einstellungen",
      save: "Auswahl speichern", back: "Zurück", fix: "Immer aktiv",
      nec: ["Notwendig", "Speichert nur Ihre Cookie-Auswahl."],
      stat: ["Statistik", "Google Analytics 4 — anonymisierte Nutzungsstatistik."],
      mkt: ["Marketing", "LinkedIn Insight Tag — Kampagnenmessung und Werbung."],
      note: "Widerruf jederzeit über „Cookie-Einstellungen“ im Footer.",
      aria: "Cookie-Einstellungen",
      swStat: "Statistik-Cookies erlauben", swMkt: "Marketing-Cookies erlauben"
    },
    en: {
      k: "Cookies",
      txt: "We would like to use cookies for statistics (Google Analytics) and marketing (LinkedIn) — only with your consent. More in our <a href=\"{p}\">privacy policy</a>.",
      all: "Accept all", none: "Decline", set: "Settings",
      save: "Save selection", back: "Back", fix: "Always active",
      nec: ["Necessary", "Only stores your cookie choice."],
      stat: ["Statistics", "Google Analytics 4 — anonymised usage statistics."],
      mkt: ["Marketing", "LinkedIn Insight Tag — campaign measurement and advertising."],
      note: "Withdraw anytime via “Cookie settings” in the footer.",
      aria: "Cookie settings",
      swStat: "Allow statistics cookies", swMkt: "Allow marketing cookies"
    },
    it: {
      k: "Cookie",
      txt: "Vorremmo utilizzare cookie per statistiche (Google Analytics) e marketing (LinkedIn) — solo con il Suo consenso. Maggiori informazioni nell'<a href=\"{p}\">informativa sulla privacy</a>.",
      all: "Accetta tutti", none: "Rifiuta", set: "Impostazioni",
      save: "Salva selezione", back: "Indietro", fix: "Sempre attivi",
      nec: ["Necessari", "Memorizza solo la Sua selezione dei cookie."],
      stat: ["Statistiche", "Google Analytics 4 — statistiche d'uso in forma anonima."],
      mkt: ["Marketing", "LinkedIn Insight Tag — misurazione delle campagne e pubblicità."],
      note: "Revoca in qualsiasi momento tramite «Impostazioni cookie» nel footer.",
      aria: "Impostazioni cookie",
      swStat: "Consenti cookie statistici", swMkt: "Consenti cookie di marketing"
    }
  }[lang];

  /* ---------- Speicher ---------- */
  function stored() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || "null");
      if (d && d.v === 1 && typeof d.ts === "number" && Date.now() - d.ts < MAX_AGE) return d;
    } catch (e) {}
    return null;
  }
  function persist(stat, mkt) {
    if (cfg.demo) return { v: 1, ts: Date.now(), stat: !!stat, mkt: !!mkt };
    var prev = stored();
    var d = { v: 1, ts: Date.now(), stat: !!stat, mkt: !!mkt };
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
    if (prev && ((prev.stat && !d.stat) || (prev.mkt && !d.mkt))) cleanCookies();
    apply(d);
    return d;
  }

  /* ---------- Dienste (laden erst NACH Einwilligung) ---------- */
  function loadGA(id) {
    if (!id || window.__iphGA) return;
    window.__iphGA = 1;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id, { anonymize_ip: true });
    var s = document.createElement("script");
    s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(s);
  }
  function loadLI(pid) {
    if (!pid || window.__iphLI) return;
    window.__iphLI = 1;
    window._linkedin_partner_id = pid;
    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push(pid);
    var s = document.createElement("script");
    s.async = true; s.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
    document.head.appendChild(s);
  }
  function apply(d) {
    /* Consent Mode v2 (17.08.2026): Freigabe an Google weitergeben.
       Statistik → analytics_storage · Marketing → ad_storage/ad_user_data/ad_personalization.
       GA4 und Google Ads laufen jetzt über GTM-PN2MZRT, nicht mehr über loadGA(). */
    var a = d.stat ? "granted" : "denied", m = d.mkt ? "granted" : "denied";
    try {
      window.dataLayer = window.dataLayer || [];
      if (typeof window.gtag === "function") {
        window.gtag("consent", "update", {
          analytics_storage: a, ad_storage: m, ad_user_data: m, ad_personalization: m
        });
      }
      window.dataLayer.push({
        event: "iph_consent_update",
        consent_analytics: d.stat ? 1 : 0,
        consent_marketing: d.mkt ? 1 : 0
      });
    } catch (e) {}
    if (d.stat) loadGA(cfg.ga4);
    if (d.mkt) loadLI(cfg.li);
    try { window.dispatchEvent(new CustomEvent("iph-consent", { detail: { stat: !!d.stat, mkt: !!d.mkt, ts: d.ts } })); } catch (e) {}
  }
  /* Bestmögliche Löschung bekannter Tracking-Cookies (Widerruf). */
  function cleanCookies() {
    var host = location.hostname, past = "; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    document.cookie.split(";").forEach(function (c) {
      var n = c.split("=")[0].trim();
      if (/^(_ga|_gid|_gat|_gcl_|li_|ln_or|lms_)/.test(n)) {
        document.cookie = n + "=" + past;
        document.cookie = n + "=" + past + "; domain=" + host;
        document.cookie = n + "=" + past + "; domain=." + host;
      }
    });
  }

  /* ---------- UI ---------- */
  var card = null, opener = null, decidedAtOpen = false;
  var css = "" +
    ".iphcc{position:fixed;left:16px;bottom:16px;z-index:2147000000;width:min(360px,calc(100vw - 32px));box-sizing:border-box;background:#FFFFFF;border:1px solid #D6E7EE;border-radius:18px;box-shadow:0 18px 44px rgba(16,38,46,.14);padding:14px 18px 16px;font-family:'Titillium Web',system-ui,sans-serif;color:#10262E;opacity:0;transform:translateY(10px);transition:opacity .45s ease,transform .45s ease}" +
    ".iphcc.iphcc-in{opacity:1;transform:none}" +
    ".iphcc a{color:#3BAED1;font-weight:600;text-decoration:underline}" +
    ".iphcc a:hover{color:#45B347}" +
    ".iphcc-k{margin:0 0 6px;font-weight:600;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#6B7E86}" +
    ".iphcc-t{margin:0;font-weight:400;font-size:13px;line-height:1.6;color:#33505B;text-wrap:pretty}" +
    ".iphcc-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}" +
    ".iphcc-btn{font:700 13px/1 'Titillium Web',system-ui,sans-serif;border-radius:999px;padding:9px 16px;cursor:pointer;transition:filter .2s ease,border-color .2s ease,color .2s ease}" +
    ".iphcc-pri{border:0;background:linear-gradient(120deg,#3BAED1,#45B347);color:#FFFFFF}" +
    ".iphcc-pri:hover{filter:brightness(1.06)}" +
    ".iphcc-gho{border:1px solid #D6E7EE;background:#FFFFFF;color:#10262E}" +
    ".iphcc-gho:hover{border-color:#3BAED1;color:#3BAED1}" +
    ".iphcc-lnk{border:0;background:none;padding:4px 2px;font:600 12.5px 'Titillium Web',system-ui,sans-serif;color:#6B7E86;text-decoration:underline;cursor:pointer;margin-left:auto}" +
    ".iphcc-lnk:hover{color:#3BAED1}" +
    ".iphcc-cats{margin-top:10px}" +
    ".iphcc-cat{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:9px 0;border-top:1px solid #E2F1F6}" +
    ".iphcc-cn{margin:0;font-weight:700;font-size:13px;line-height:1.35}" +
    ".iphcc-cd{margin:1px 0 0;font-weight:400;font-size:11.5px;line-height:1.5;color:#6B7E86}" +
    ".iphcc-fix{flex:0 0 auto;margin-top:3px;font-weight:600;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:#45B347}" +
    ".iphcc-sw{flex:0 0 auto;width:38px;height:21px;margin-top:2px;border:0;border-radius:999px;background:#E7F0F4;position:relative;cursor:pointer;transition:background .25s ease;padding:0}" +
    ".iphcc-sw::after{content:'';position:absolute;top:2.5px;left:3px;width:16px;height:16px;border-radius:50%;background:#FFFFFF;box-shadow:0 1px 3px rgba(16,38,46,.28);transition:transform .25s ease}" +
    ".iphcc-sw[aria-checked=true]{background:linear-gradient(120deg,#3BAED1,#45B347)}" +
    ".iphcc-sw[aria-checked=true]::after{transform:translateX(16px)}" +
    ".iphcc-note{margin:10px 0 0;font-weight:400;font-size:11px;line-height:1.5;color:#6B7E86;text-wrap:pretty}" +
    ".iphcc :focus-visible{outline:3px solid rgba(59,174,209,.55);outline-offset:3px}" +
    "@media (max-width:480px){.iphcc{left:10px;bottom:10px;width:calc(100vw - 20px)}}" +
    "@media (prefers-reduced-motion:reduce){.iphcc{transition:none;transform:none}.iphcc-sw,.iphcc-sw::after{transition:none}}";

  function esc(s) { return s; } /* nur eigene, statische Strings */
  function build() {
    if (card) return card;
    var st = document.createElement("style");
    st.id = "iphcc-style"; st.textContent = css;
    document.head.appendChild(st);
    card = document.createElement("div");
    card.className = "iphcc";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "false");
    card.setAttribute("aria-label", T.aria);
    card.innerHTML =
      "<p class='iphcc-k'>" + esc(T.k) + "</p>" +
      "<div data-v1>" +
        "<p class='iphcc-t'>" + T.txt.replace("{p}", cfg.privacy) + "</p>" +
        "<div class='iphcc-row'>" +
          "<button type='button' class='iphcc-btn iphcc-pri' data-all>" + esc(T.all) + "</button>" +
          "<button type='button' class='iphcc-btn iphcc-gho' data-none>" + esc(T.none) + "</button>" +
          "<button type='button' class='iphcc-lnk' data-open2>" + esc(T.set) + "</button>" +
        "</div>" +
      "</div>" +
      "<div data-v2 hidden>" +
        "<div class='iphcc-cats'>" +
          "<div class='iphcc-cat' style='border-top:0;padding-top:2px'><div><p class='iphcc-cn'>" + esc(T.nec[0]) + "</p><p class='iphcc-cd'>" + esc(T.nec[1]) + "</p></div><span class='iphcc-fix'>" + esc(T.fix) + "</span></div>" +
          "<div class='iphcc-cat'><div><p class='iphcc-cn'>" + esc(T.stat[0]) + "</p><p class='iphcc-cd'>" + esc(T.stat[1]) + "</p></div><button type='button' class='iphcc-sw' role='switch' aria-checked='false' data-sw='stat' aria-label='" + esc(T.swStat) + "'></button></div>" +
          "<div class='iphcc-cat'><div><p class='iphcc-cn'>" + esc(T.mkt[0]) + "</p><p class='iphcc-cd'>" + esc(T.mkt[1]) + "</p></div><button type='button' class='iphcc-sw' role='switch' aria-checked='false' data-sw='mkt' aria-label='" + esc(T.swMkt) + "'></button></div>" +
        "</div>" +
        "<div class='iphcc-row'>" +
          "<button type='button' class='iphcc-btn iphcc-pri' data-all2>" + esc(T.all) + "</button>" +
          "<button type='button' class='iphcc-btn iphcc-gho' data-save>" + esc(T.save) + "</button>" +
          "<button type='button' class='iphcc-lnk' data-back>" + esc(T.back) + "</button>" +
        "</div>" +
        "<p class='iphcc-note'>" + esc(T.note) + "</p>" +
      "</div>";
    document.body.appendChild(card);

    var q = function (s) { return card.querySelector(s); };
    q("[data-all]").addEventListener("click", function () { persist(true, true); hide(); });
    q("[data-none]").addEventListener("click", function () { persist(false, false); hide(); });
    q("[data-open2]").addEventListener("click", function () { view(2); q("[data-sw='stat']").focus(); });
    q("[data-back]").addEventListener("click", function () { view(1); q("[data-all]").focus(); });
    q("[data-all2]").addEventListener("click", function () { persist(true, true); hide(); });
    q("[data-save]").addEventListener("click", function () {
      persist(sw("stat"), sw("mkt")); hide();
    });
    card.querySelectorAll("[data-sw]").forEach(function (b) {
      b.addEventListener("click", function () {
        b.setAttribute("aria-checked", b.getAttribute("aria-checked") === "true" ? "false" : "true");
      });
    });
    card.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var v2open = !q("[data-v2]").hidden;
      if (v2open && !decidedAtOpen) { view(1); q("[data-all]").focus(); }
      else hide();
    });
    return card;
  }
  function sw(name) { return card.querySelector("[data-sw='" + name + "']").getAttribute("aria-checked") === "true"; }
  function setSw(name, on) { card.querySelector("[data-sw='" + name + "']").setAttribute("aria-checked", on ? "true" : "false"); }
  function view(n) {
    card.querySelector("[data-v1]").hidden = n !== 1;
    card.querySelector("[data-v2]").hidden = n !== 2;
  }
  function show(startView) {
    build();
    view(startView || 1);
    card.hidden = false;
    void card.offsetHeight; /* Reflow, damit die Transition greift (rAF ist in manchen Embeds gedrosselt) */
    card.classList.add("iphcc-in");
    setTimeout(function () { card.classList.add("iphcc-in"); }, 50); /* Sicherheitsnetz */
  }
  function hide() {
    if (!card) return;
    card.classList.remove("iphcc-in");
    setTimeout(function () { if (card) card.hidden = true; }, 460);
    if (opener && document.contains(opener)) { try { opener.focus(); } catch (e) {} }
    opener = null;
  }
  /* Öffnen aus dem Footer („Cookie-Einstellungen“) — direkt Ebene 2 mit gespeichertem Stand. */
  function openSettings(src) {
    build();
    var d = stored();
    decidedAtOpen = !!d;
    setSw("stat", !!(d && d.stat));
    setSw("mkt", !!(d && d.mkt));
    opener = src || document.activeElement;
    show(2);
    card.querySelector("[data-sw='stat']").focus();
  }

  /* ---------- Verdrahtung ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest && e.target.closest("[data-cookie-settings]");
    if (t) { e.preventDefault(); openSettings(t); }
  });

  window.iphConsent = {
    get: stored,
    open: openSettings,
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} openSettings(); }
  };

  function init() {
    if (cfg.demo) { setTimeout(function () { show(1); }, 1600); return; }
    var d = stored();
    if (d) { apply(d); return; }
    decidedAtOpen = false;
    setTimeout(function () { if (!stored()) show(1); }, 1600);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
