/* ============================================================
   roi-embed.js — VIBN Potenzial Rechner auf FREMDEN Websites einbetten (08.09.).

   1) INLINE — Rechner fließt an einer Stelle der Seite (Höhe passt sich an):
        <div data-iph-roi data-lang="de"></div>
        <script async src="https://virtuelle-inbetriebnahme.machineering.com/roi-embed.js"></script>

   2) POPUP — eigener Button der Host-Seite öffnet das Fenster wie auf der
      Startseite (Vorschau am Button → Vollbild → Bubble unten rechts):
        <button type="button" data-iph-roi-open data-lang="de">Potenzial berechnen</button>
        <script async src="https://virtuelle-inbetriebnahme.machineering.com/roi-embed.js"></script>

   3) BUBBLE — ohne eigenen Button: schwebender Start-Button unten rechts ab Seitenaufruf:
        <script async src="https://virtuelle-inbetriebnahme.machineering.com/roi-embed.js" data-bubble data-lang="de"></script>

   data-lang        de | en | it — Standard: <html lang> der Host-Seite, sonst de
   data-min-height  (inline) Starthöhe in px bis zur ersten Höhenmeldung (Standard 640)
   data-base        nur für lokale Tests: anderer Pfad/Origin statt der Live-Domain

   Der Rechner läuft immer als iframe auf UNSERER Domain: Formular, Mail-Versand,
   Speicherung, Rate-Limit und Honeypot laufen unverändert über /api (same-origin im
   iframe — kein CORS, kein Backend/Schlüssel auf der Host-Seite). roi-check.html
   blendet im Embed Footer/Sprachumschalter aus und lädt im Drittkontext weder GTM
   noch Cookie-Banner. Die Host-URL wandert als ?ref= in die interne Lead-Mail.
   ============================================================ */
(function () {
  "use strict";
  if (window.iphRoiEmbed) return;
  var ORIGIN = "https://virtuelle-inbetriebnahme.machineering.com";
  var T = {
    de: { title: "VIBN Potenzial Rechner", max: "Fenster vergrößern", restore: "Zurück zur Vorschau", min: "Fenster minimieren", open: "VIBN Potenzial Rechner öffnen", loading: "Potenzial Rechner lädt" },
    en: { title: "Potential Calculator", max: "Enlarge window", restore: "Back to preview", min: "Minimise window", open: "Open the Potential Calculator", loading: "Loading the Potential Calculator" },
    it: { title: "Calcolatore del risparmio potenziale", max: "Ingrandisci la finestra", restore: "Torna all’anteprima", min: "Riduci la finestra", open: "Apri il Calcolatore del risparmio potenziale", loading: "Caricamento del Calcolatore del risparmio potenziale" }
  };
  var script = document.currentScript || null;
  var frames = [];

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function el(tag, css, html) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function langOf(node) {
    var l = ((node && node.getAttribute("data-lang")) || document.documentElement.lang || "de").slice(0, 2).toLowerCase();
    return l === "en" || l === "it" ? l : "de";
  }
  function calcUrl(node, lang, mode) {
    var base = ((node && node.getAttribute("data-base")) || ORIGIN).replace(/\/+$/, "");
    return base + (lang === "de" ? "" : "/" + lang) + "/roi-check.html?embed=" + mode + "&ref=" + encodeURIComponent(location.href.slice(0, 400));
  }
  function originOf(url) { try { return new URL(url, location.href).origin; } catch (e) { return ORIGIN; } }

  /* ---------------- 1) Inline ---------------- */
  function mountInline(host) {
    if (host.__iphRoi) return;
    host.__iphRoi = true;
    var lang = langOf(host), url = calcUrl(host, lang, "1");
    var f = document.createElement("iframe");
    f.src = url;
    f.title = T[lang].title;
    f.setAttribute("scrolling", "no");
    f.setAttribute("loading", "lazy");
    f.style.cssText = "display:block;width:100%;border:0;overflow:hidden;background:transparent;height:" +
      (parseInt(host.getAttribute("data-min-height"), 10) || 640) + "px;transition:height .25s ease;";
    host.appendChild(f);
    frames.push({ el: f, origin: originOf(url) });
  }

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.type !== "iph-roi") return;
    for (var i = 0; i < frames.length; i++) {
      var fr = frames[i];
      if (e.source !== fr.el.contentWindow || e.origin !== fr.origin) continue;
      if (typeof d.height === "number" && d.height > 0) fr.el.style.height = Math.ceil(d.height) + "px";
      if (typeof d.scroll === "number") {
        var top = Math.max(0, fr.el.getBoundingClientRect().top + (window.pageYOffset || 0) + d.scroll - 24);
        try { window.scrollTo({ top: top, behavior: "smooth" }); } catch (err) { window.scrollTo(0, top); }
      }
    }
  });

  /* ---------------- 2)/3) Popup-Fenster (Choreografie wie roi-widget.js auf der Startseite) ---------------- */
  var ICON_MAX = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  var ICON_RESTORE = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>';
  var ICON_MIN = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>';
  var ICON_CHAT = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var ICON_BTN = "width:36px;height:36px;display:grid;place-items:center;background:transparent;border:1px solid #D6E7EE;border-radius:10px;color:#10262E;cursor:pointer;transition:border-color .15s,color .15s;padding:0;font:inherit;";
  var FOCUS = "outline:3px solid rgba(59,174,209,.55);outline-offset:2px;";
  var TRANS = "left .42s cubic-bezier(.4,0,.15,1), top .42s cubic-bezier(.4,0,.15,1), width .42s cubic-bezier(.4,0,.15,1), height .42s cubic-bezier(.4,0,.15,1), border-radius .42s ease, opacity .3s ease, transform .42s cubic-bezier(.4,0,.15,1), box-shadow .42s ease";
  var popup = null;

  function buildPopup(lang, url) {
    var S = T[lang], PW = 460, PH = 660;
    var mode = "closed", loaded = false, raf = null, anchor = null;

    var backdrop = el("div", "position:fixed;inset:0;background:rgba(16,38,46,.55);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);opacity:0;pointer-events:none;transition:opacity .32s ease;z-index:2147483000;");
    var shell = el("div", "font-family:'Titillium Web',system-ui,sans-serif;position:fixed;left:-9999px;top:0;width:360px;height:480px;opacity:0;background:#FFFFFF;border:1px solid #D6E7EE;border-radius:18px;overflow:hidden;box-shadow:0 24px 64px -18px rgba(16,38,46,.32);z-index:2147483001;will-change:left,top,width,height;box-sizing:border-box;");
    shell.setAttribute("role", "dialog");
    shell.setAttribute("aria-label", S.title);

    var wrap = el("div", "position:absolute;inset:0;display:flex;flex-direction:column;transition:opacity .2s ease;");
    var bar = el("div", "flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px 13px 18px;border-bottom:1px solid #D6E7EE;background:#FFFFFF;box-sizing:border-box;");
    var titleWrap = el("div", "display:flex;flex-direction:column;gap:3px;min-width:0;",
      '<div style="font-weight:600;font-size:9px;letter-spacing:.3em;text-transform:uppercase;background:linear-gradient(120deg,#3BAED1,#45B347);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#3BAED1;">iPhysics</div>' +
      '<div style="font-weight:700;font-size:15px;line-height:1;color:#10262E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + S.title + '</div>');
    var btnBox = el("div", "display:flex;align-items:center;gap:8px;flex-shrink:0;");
    var maxBtn = el("button", ICON_BTN, ICON_MAX);
    maxBtn.type = "button"; maxBtn.title = S.max; maxBtn.setAttribute("aria-label", S.max);
    var restoreBtn = el("button", ICON_BTN.replace("display:grid", "display:none"), ICON_RESTORE);
    restoreBtn.type = "button"; restoreBtn.title = S.restore; restoreBtn.setAttribute("aria-label", S.restore);
    var minBtn = el("button", ICON_BTN, ICON_MIN);
    minBtn.type = "button"; minBtn.title = S.min; minBtn.setAttribute("aria-label", S.min);
    btnBox.appendChild(maxBtn); btnBox.appendChild(restoreBtn); btnBox.appendChild(minBtn);
    bar.appendChild(titleWrap); bar.appendChild(btnBox);

    var area = el("div", "position:relative;flex:1;min-height:0;background:#FFFFFF;");
    var loader = el("div", "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px;text-align:center;",
      '<div style="font-weight:600;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#6B7E86;">' + S.loading + '</div>' +
      '<div style="width:160px;height:3px;background:#E7F0F4;border-radius:2px;overflow:hidden;position:relative;"><div style="position:absolute;inset:0;width:55%;background:linear-gradient(120deg,#3BAED1,#45B347);border-radius:2px;animation:iphRoiLoad 1.3s ease-in-out infinite;"></div></div>');
    var frame = el("iframe", "position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;opacity:0;transition:opacity .25s ease;");
    frame.title = S.title;
    /* Ladebalken nur bis zum Laden des Rechners — danach ausblenden, sonst scheint er durch den iframe durch */
    frame.addEventListener("load", function () {
      if (!frame.getAttribute("src")) return;
      loader.style.display = "none";
      frame.style.background = "#FFFFFF";
      frame.style.opacity = "1";
    });
    area.appendChild(loader); area.appendChild(frame);
    wrap.appendChild(bar); wrap.appendChild(area);

    var bubble = el("button", "position:absolute;inset:0;display:grid;place-items:center;background:linear-gradient(120deg,#3BAED1,#45B347);border:none;border-radius:inherit;color:#FFFFFF;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .2s ease;animation:iphRoiFloat 3.2s ease-in-out infinite;padding:0;", ICON_CHAT);
    bubble.type = "button"; bubble.title = S.open; bubble.setAttribute("aria-label", S.open);
    shell.appendChild(wrap); shell.appendChild(bubble);

    if (!document.getElementById("iph-roi-kf")) {
      var st = el("style", null,
        "@keyframes iphRoiLoad{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}" +
        "@keyframes iphRoiFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}");
      st.id = "iph-roi-kf";
      document.head.appendChild(st);
    }
    document.body.appendChild(backdrop);
    document.body.appendChild(shell);

    [maxBtn, restoreBtn, minBtn, bubble].forEach(function (b) {
      b.addEventListener("focus", function () { b.style.cssText += FOCUS; });
      b.addEventListener("blur", function () { b.style.outline = "none"; });
    });
    [maxBtn, restoreBtn, minBtn].forEach(function (b) {
      b.addEventListener("mouseenter", function () { b.style.borderColor = "#3BAED1"; b.style.color = "#3BAED1"; });
      b.addEventListener("mouseleave", function () { b.style.borderColor = "#D6E7EE"; b.style.color = "#10262E"; });
    });

    function previewGeo() {
      var vw = window.innerWidth, vh = window.innerHeight;
      if (vw < 768) {
        var W = Math.min(vw - 20, 440), H = Math.min(vh * 0.78, 620);
        return { l: (vw - W) / 2, t: vh - H - 14, w: W, h: H, r: 20 };
      }
      var w = Math.min(PW, vw - 32), h = Math.min(PH, vh - 32), l, t;
      if (anchor && document.contains(anchor)) {
        var a = anchor.getBoundingClientRect();
        l = clamp(a.left + a.width / 2 - w / 2, 16, vw - w - 16);
        if (a.bottom + 12 + h <= vh - 8) t = a.bottom + 12;
        else if (a.top - 12 - h >= 8) t = a.top - 12 - h;
        else t = clamp((vh - h) / 2, 16, vh - h - 16);
      } else { /* ohne Button (Bubble): unten rechts über der Bubble */
        l = vw - w - 24; t = clamp(vh - h - 24, 16, vh - h - 16);
      }
      return { l: l, t: t, w: w, h: h, r: 18 };
    }
    function maxGeo() {
      var vw = window.innerWidth, vh = window.innerHeight;
      if (vw < 768) return { l: 0, t: 0, w: vw, h: vh, r: 0 };
      var w = Math.min(1120, vw * 0.94), h = Math.min(880, vh * 0.9);
      return { l: (vw - w) / 2, t: (vh - h) / 2, w: w, h: h, r: 22 };
    }
    function bubbleGeo() { return { l: window.innerWidth - 64 - 24, t: window.innerHeight - 64 - 24, w: 64, h: 64, r: 999 }; }

    function apply() {
      var g, opacity = 1, scale = 1, pointer = "auto", wrapOp = 1, bubOp = 0, bubPtr = "none", bdOp = 0, bdPtr = "none";
      var shadow = "0 24px 64px -18px rgba(16,38,46,.32)";
      if (mode === "closed") { g = previewGeo(); opacity = 0; scale = 0.96; pointer = "none"; wrapOp = 0; }
      else if (mode === "preview") { g = previewGeo(); }
      else if (mode === "maximized") { g = maxGeo(); bdOp = 1; bdPtr = "auto"; shadow = "0 40px 120px -30px rgba(16,38,46,.5)"; }
      else { g = bubbleGeo(); wrapOp = 0; bubOp = 1; bubPtr = "auto"; shadow = "0 16px 36px -10px rgba(59,174,209,.5)"; }
      shell.style.left = g.l + "px"; shell.style.top = g.t + "px";
      shell.style.width = g.w + "px"; shell.style.height = g.h + "px";
      shell.style.borderRadius = g.r + "px";
      shell.style.opacity = opacity; shell.style.transform = "scale(" + scale + ")";
      shell.style.pointerEvents = pointer; shell.style.boxShadow = shadow;
      shell.style.border = mode === "bubble" ? "none" : "1px solid #D6E7EE";
      wrap.style.opacity = wrapOp; wrap.style.pointerEvents = wrapOp ? "auto" : "none";
      bubble.style.opacity = bubOp; bubble.style.pointerEvents = bubPtr;
      backdrop.style.opacity = bdOp; backdrop.style.pointerEvents = bdPtr;
      maxBtn.style.display = mode === "maximized" ? "none" : "grid";
      restoreBtn.style.display = mode === "maximized" ? "grid" : "none";
    }
    function set(m) { mode = m; apply(); }
    function ensureLoaded() { if (!loaded) { frame.src = url; loaded = true; } }
    function openPreview(fromEl) { if (fromEl && fromEl.getBoundingClientRect) anchor = fromEl; ensureLoaded(); set("preview"); }
    function reposition() { if (raf) return; raf = requestAnimationFrame(function () { raf = null; apply(); }); }

    maxBtn.addEventListener("click", function () { set("maximized"); });
    restoreBtn.addEventListener("click", function () { set("preview"); });
    minBtn.addEventListener("click", function () { set("bubble"); });
    bubble.addEventListener("click", function () { openPreview(); });
    backdrop.addEventListener("click", function () { set("preview"); });
    window.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (mode === "maximized") set("preview");
      else if (mode === "preview") set("bubble");
    });
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    shell.style.transition = "none";
    apply();
    requestAnimationFrame(function () { shell.style.transition = TRANS; });
    return { open: openPreview, bubble: function () { ensureLoaded(); set("bubble"); }, close: function () { set("closed"); } };
  }
  function getPopup(node) {
    if (!popup) { var lang = langOf(node); popup = buildPopup(lang, calcUrl(node, lang, "popup")); }
    return popup;
  }
  function bindTrigger(btn) {
    if (btn.__iphRoi) return;
    btn.__iphRoi = true;
    btn.addEventListener("click", function (e) {
      if (btn.tagName === "A") e.preventDefault();
      getPopup(btn).open(btn);
    });
  }

  /* ---------------- Verdrahtung ---------------- */
  var pending = null;
  function scan() {
    if (pending) { clearTimeout(pending); pending = null; }
    var i, n;
    n = document.querySelectorAll("[data-iph-roi]"); for (i = 0; i < n.length; i++) mountInline(n[i]);
    n = document.querySelectorAll("[data-iph-roi-open]"); for (i = 0; i < n.length; i++) bindTrigger(n[i]);
  }
  /* setTimeout statt requestAnimationFrame: rAF feuert in versteckten Tabs nicht und würde das Nachladen blockieren. */
  function scanSoon() { if (!pending) pending = setTimeout(scan, 0); }
  var bubbleStarted = false;
  function start() {
    scan();
    if (!bubbleStarted && script && script.hasAttribute("data-bubble") && document.body) { bubbleStarted = true; getPopup(script).bubble(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  window.addEventListener("load", start);
  window.addEventListener("pageshow", start);
  document.addEventListener("visibilitychange", scan);
  /* Host-Seiten rendern oft nach (CMS/Page-Builder, Consent-Gates): später eingefügte Container/Buttons mitnehmen. */
  if ("MutationObserver" in window) new MutationObserver(scanSoon).observe(document.documentElement, { childList: true, subtree: true });

  window.iphRoiEmbed = { mount: mountInline, scan: scan, open: function (fromEl) { getPopup(fromEl || script).open(fromEl); } };
})();
