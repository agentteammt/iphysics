/* ============================================================
   iPhysics Landingpage — Event-Layer für Google Tag Manager
   Container: GTM-PN2MZRT · GA4: G-T8BSKMECE7 · Ads: AW-1002073438
   Stand: 17.08.2026

   Aufgabe: semantische Events in den dataLayer pushen. Dieses Modul
   entscheidet NICHT, was gesendet wird — das macht GTM + Consent Mode.
   Deshalb darf es immer laufen, auch ohne Einwilligung.

   Namensschema (ohne Klammern, mit Suffix):
     scroll_30 · scroll_50 · scroll_75 · scroll_90
     engaged_60s · engaged_120s
     cta_click_hero_roi · cta_click_overview_roi · cta_click_roi_teaser
     cta_click_live_erleben · cta_click_demo
     nav_click_kontakt · video_start · roi_open
     form_start_booking · generate_lead_booking
     form_start_contact · generate_lead_contact
     outbound_module_details

   Jedes Event trägt: page_language, page_path, page_hostname.
   Alle hier gefeuerten Events sind auf EINMAL PRO SITZUNG begrenzt
   (sessionStorage "iph_trk"), damit Ads-Conversions nicht inflationieren.

   Debug: ?trackdebug=1 an die URL → jedes Event in der Konsole.
   ============================================================ */
(function () {
  "use strict";
  if (window.iphTrack) return;

  var DL = (window.dataLayer = window.dataLayer || []);
  var SKEY = "iph_trk";
  var DEBUG = /(?:\?|&)trackdebug=1/.test(location.search);
  var mem = {};

  function seen(key) {
    if (mem[key]) return true;
    mem[key] = 1;
    try {
      var s = JSON.parse(sessionStorage.getItem(SKEY) || "{}");
      if (s[key]) return true;
      s[key] = 1;
      sessionStorage.setItem(SKEY, JSON.stringify(s));
    } catch (e) {}
    return false;
  }

  /* push(name, params, oncePerSession) */
  function push(name, params, once) {
    if (once !== false && seen(name)) return;
    var p = {
      event: name,
      page_language: (document.documentElement.lang || "de").slice(0, 2).toLowerCase(),
      page_path: location.pathname,
      page_hostname: location.hostname
    };
    if (params) for (var k in params) if (params.hasOwnProperty(k)) p[k] = params[k];
    DL.push(p);
    if (DEBUG) console.log("[iph-track]", p.event, p);
  }
  window.iphTrack = push;

  /* ---------- 1. Scroll-Tiefe 30 / 50 / 75 / 90 % ---------- */
  var MARKS = [30, 50, 75, 90], hit = {};
  function scrollCheck() {
    var doc = document.documentElement;
    var h = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0) - window.innerHeight;
    if (h <= 0) return;
    var pct = Math.round((window.pageYOffset || doc.scrollTop || 0) / h * 100);
    for (var i = 0; i < MARKS.length; i++) {
      var m = MARKS[i];
      if (pct >= m && !hit[m]) { hit[m] = 1; push("scroll_" + m, { scroll_percent: m }); }
    }
  }
  var sTick = null;
  window.addEventListener("scroll", function () {
    if (sTick) return;
    sTick = setTimeout(function () { sTick = null; scrollCheck(); }, 220);
  }, { passive: true });
  window.addEventListener("load", scrollCheck);

  /* ---------- 2. Aktive Verweildauer 60 s / 120 s ----------
     Gezählt wird nur sichtbare Zeit — ein Tab im Hintergrund
     ist keine Interaktion. */
  var secs = 0;
  setInterval(function () {
    if (document.visibilityState === "hidden") return;
    secs++;
    if (secs === 60) push("engaged_60s", { engagement_seconds: 60 });
    if (secs === 120) push("engaged_120s", { engagement_seconds: 120 });
  }, 1000);

  /* ---------- 3. Klick-Events (Delegation) ---------- */
  function txt(el) { return (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase(); }

  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;

    /* Hero-Button „Ihr Potenzial berechnen" */
    if (t.closest("#hero-cta-wrap a")) {
      return push("cta_click_hero_roi", { cta_location: "hero", cta_target: "roi-teaser" });
    }
    /* Klicktext im Überblick („Vorteile der Plattform im Überblick") */
    if (t.closest("[data-ovchip] a")) {
      return push("cta_click_overview_roi", { cta_location: "overview_chip", cta_target: "roi-teaser" });
    }
    /* Button im CTA-Element Potenzialrechner */
    if (t.closest("#roi-open")) {
      return push("roi_open", { cta_location: "roi_teaser_card" });
    }
    /* Video Weber — Klick auf die Kachel (öffnet die Consent-Karte, dann das Embed) */
    if (t.closest("#s2-video")) {
      return push("video_start", { video_title: "Erfolgsstory Weber", video_provider: "youtube" });
    }
    /* Header-CTA → Sprungmarke #kontakt */
    if (t.closest("#hdr a[href='#kontakt']")) {
      return push("nav_click_kontakt", { cta_location: "header", cta_target: "kontakt" });
    }
    /* „Demo vereinbaren" (Abschnitt Über machineering) → ebenfalls #kontakt,
       aber eigenes Event, getrennt vom Header-Button. */
    if (t.closest("a[href='#kontakt']")) {
      return push("cta_click_demo_vereinbaren", { cta_location: "about_section", cta_target: "kontakt" });
    }
    /* Sprungmarken zum Terminbuchungs-Widget */
    var demo = t.closest("a[href='#demo']");
    if (demo) {
      var s = txt(demo);
      if (s.indexOf("live erleben") > -1 || s.indexOf("live experience") > -1 || s.indexOf("dal vivo") > -1) {
        return push("cta_click_live_erleben", { cta_location: "s3_outro", cta_target: "demo" });
      }
      return push("cta_click_demo", { cta_location: "cta_card", cta_target: "demo" });
    }
    /* E-Mail- und Telefon-Links zuerst: "mailto:sales@machineering.com" enthält
       die Domain und würde sonst als Outbound gezählt (hostname ist bei mailto leer). */
    var mt = t.closest("a[href]");
    if (mt) {
      var mh = (mt.getAttribute("href") || "").toLowerCase();
      if (mh.indexOf("mailto:") === 0) return push("mail_click", { link_url: mt.href, link_text: txt(mt).slice(0, 60) });
      if (mh.indexOf("tel:") === 0) return push("phone_click", { link_url: mt.href, link_text: txt(mt).slice(0, 60) });
    }

    /* „Alle Module & Details" → Hauptsite */
    var out = t.closest("a[href*='machineering.com']");
    if (out && out.hostname !== location.hostname) {
      if ((out.getAttribute("href") || "").indexOf("/produkte/") > -1) {
        return push("outbound_module_details", { link_url: out.href, link_text: txt(out).slice(0, 60) });
      }
      return push("outbound_click", { link_url: out.href, link_text: txt(out).slice(0, 60) });
    }
  }, true);

  /* ---------- 4. Kontaktformular (unten): erste Interaktion ----------
     Absenden wird in contact-form.js gepusht (erst bei Erfolg). */
  function bindContact() {
    var send = document.getElementById("cf-send");
    var form = send && send.closest ? send.closest("form") : null;
    if (!form || form.__trk) return !!form;
    form.__trk = 1;
    var fire = function () {
      push("form_start_contact", { form_id: "contact", form_name: "Kontaktformular" });
    };
    form.addEventListener("focusin", fire, { once: true });
    form.addEventListener("change", fire, { once: true });
    form.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest("[data-cf-chip]")) fire();
    });
    return true;
  }

  /* Formular und Widgets rendern asynchron → kurz nachfassen. */
  var tries = 0;
  var poll = setInterval(function () {
    tries++;
    if (bindContact() || tries > 40) clearInterval(poll);
  }, 500);
  if (document.readyState !== "loading") bindContact();
  else document.addEventListener("DOMContentLoaded", bindContact);
})();
