/* ============================================================
   VIBN Potenzial Rechner Widget (14.07.) — eingebettetes Overlay-Fenster.
   VIBN Potenzial-Check (roi-check.html) als Overlay auf der Seite;
   kein Verlassen der Seite, kein Reload beim Vergrößern (iframe
   bleibt montiert).

   Zustände: closed → preview (klein, am Button verankert)
             ⇄ maximized (mittiges Overlay, abgedunkelt)
             ⇄ bubble (kleiner Start-Button unten rechts)

   Trigger: Button mit id="roi-open" (im ROI-Störer).
   Barrierefrei: ESC schließt schrittweise, sichtbare Fokus-Ringe.
   ============================================================ */
(function () {
  "use strict";
  var CALC_URL = "./roi-check.html";
  var TRANS = "left .42s cubic-bezier(.4,0,.15,1), top .42s cubic-bezier(.4,0,.15,1), width .42s cubic-bezier(.4,0,.15,1), height .42s cubic-bezier(.4,0,.15,1), border-radius .42s ease, opacity .3s ease, transform .42s cubic-bezier(.4,0,.15,1), box-shadow .42s ease";

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function el(tag, css, html) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }

  var ICON_MAX = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  var ICON_RESTORE = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>';
  var ICON_MIN = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>';
  var ICON_CHAT = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  var ICON_BTN = "width:36px;height:36px;display:grid;place-items:center;background:transparent;border:1px solid #D6E7EE;border-radius:10px;color:#10262E;cursor:pointer;transition:border-color .15s,color .15s;padding:0;font:inherit;";
  var FOCUS = "outline:3px solid rgba(59,174,209,.55);outline-offset:2px;";

  function build(anchor) {
    var PW = 460, PH = 660;
    var mode = "closed", loaded = false, raf = null;

    // --- Hintergrund ---
    var backdrop = el("div", "position:fixed;inset:0;background:rgba(16,38,46,.55);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);opacity:0;pointer-events:none;transition:opacity .32s ease;z-index:2147483000;");

    // --- Rahmen ---
    var shell = el("div", "font-family:'Titillium Web',system-ui,sans-serif;position:fixed;left:-9999px;top:0;width:360px;height:480px;opacity:0;background:#FFFFFF;border:1px solid #D6E7EE;border-radius:18px;overflow:hidden;box-shadow:0 24px 64px -18px rgba(16,38,46,.32);z-index:2147483001;will-change:left,top,width,height;");
    shell.setAttribute("role", "dialog");
    shell.setAttribute("aria-label", "VIBN Potenzial Rechner");

    // Chat-Wrapper (bleibt dauerhaft montiert)
    var wrap = el("div", "position:absolute;inset:0;display:flex;flex-direction:column;transition:opacity .2s ease;");

    // Titelleiste
    var bar = el("div", "flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px 13px 18px;border-bottom:1px solid #D6E7EE;background:#FFFFFF;");
    var titleWrap = el("div", "display:flex;flex-direction:column;gap:3px;min-width:0;",
      '<div style="font-weight:600;font-size:9px;letter-spacing:.3em;text-transform:uppercase;background:linear-gradient(120deg,#3BAED1,#45B347);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#3BAED1;">iPhysics</div>' +
      '<div style="font-weight:700;font-size:15px;line-height:1;color:#10262E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">VIBN Potenzial Rechner</div>');
    var btnBox = el("div", "display:flex;align-items:center;gap:8px;flex-shrink:0;");

    var maxBtn = el("button", ICON_BTN, ICON_MAX);
    maxBtn.type = "button"; maxBtn.title = "Fenster vergrößern"; maxBtn.setAttribute("aria-label", "Fenster vergrößern");
    var restoreBtn = el("button", ICON_BTN.replace("display:grid", "display:none"), ICON_RESTORE);
    restoreBtn.type = "button"; restoreBtn.title = "Zurück zur Vorschau"; restoreBtn.setAttribute("aria-label", "Zurück zur Vorschau");
    var minBtn = el("button", ICON_BTN, ICON_MIN);
    minBtn.type = "button"; minBtn.title = "Fenster minimieren"; minBtn.setAttribute("aria-label", "Fenster minimieren");
    btnBox.appendChild(maxBtn); btnBox.appendChild(restoreBtn); btnBox.appendChild(minBtn);
    bar.appendChild(titleWrap); bar.appendChild(btnBox);

    // Chat-Fläche + Lade-Platzhalter + iframe
    var area = el("div", "position:relative;flex:1;min-height:0;background:#FFFFFF;");
    var loader = el("div", "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px;text-align:center;",
      '<div style="font-weight:600;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#6B7E86;">Potenzial Rechner lädt</div>' +
      '<div style="width:160px;height:3px;background:#E7F0F4;border-radius:2px;overflow:hidden;position:relative;"><div style="position:absolute;inset:0;width:55%;background:linear-gradient(120deg,#3BAED1,#45B347);border-radius:2px;animation:iphRoiLoad 1.3s ease-in-out infinite;"></div></div>');
    var frame = el("iframe", "position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;");
    frame.title = "VIBN Potenzial Rechner";
    frame.setAttribute("allow", "microphone; camera; autoplay; encrypted-media; fullscreen");
    area.appendChild(loader); area.appendChild(frame);

    wrap.appendChild(bar); wrap.appendChild(area);

    // Bubble-Launcher
    var bubble = el("button", "position:absolute;inset:0;display:grid;place-items:center;background:linear-gradient(120deg,#3BAED1,#45B347);border:none;border-radius:inherit;color:#FFFFFF;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .2s ease;animation:iphRoiFloat 3.2s ease-in-out infinite;padding:0;", ICON_CHAT);
    bubble.type = "button"; bubble.title = "VIBN Potenzial Rechner öffnen"; bubble.setAttribute("aria-label", "VIBN Potenzial Rechner öffnen");

    shell.appendChild(wrap); shell.appendChild(bubble);

    // Keyframes einmalig
    if (!document.getElementById("iph-roi-kf")) {
      var st = el("style", null,
        "@keyframes iphRoiLoad{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}" +
        "@keyframes iphRoiFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}");
      st.id = "iph-roi-kf";
      document.head.appendChild(st);
    }

    document.body.appendChild(backdrop);
    document.body.appendChild(shell);

    // Fokus-Ringe (kein CSS-Zugriff auf Pseudo → per Event)
    [maxBtn, restoreBtn, minBtn, bubble].forEach(function (b) {
      b.addEventListener("focus", function () { b.style.cssText += FOCUS; });
      b.addEventListener("blur", function () { b.style.outline = "none"; });
    });
    [maxBtn, restoreBtn, minBtn].forEach(function (b) {
      b.addEventListener("mouseenter", function () { b.style.borderColor = "#3BAED1"; b.style.color = "#3BAED1"; });
      b.addEventListener("mouseleave", function () { b.style.borderColor = "#D6E7EE"; b.style.color = "#10262E"; });
    });

    // --- Geometrie ---
    function previewGeo() {
      var vw = window.innerWidth, vh = window.innerHeight;
      if (vw < 768) {
        var W = Math.min(vw - 20, 440), H = Math.min(vh * 0.78, 620);
        return { l: (vw - W) / 2, t: vh - H - 14, w: W, h: H, r: 20 };
      }
      var w = Math.min(PW, vw - 32), h = Math.min(PH, vh - 32);
      var a = anchor.getBoundingClientRect(), l, t;
      l = clamp(a.left + a.width / 2 - w / 2, 16, vw - w - 16);
      if (a.bottom + 12 + h <= vh - 8) t = a.bottom + 12;
      else if (a.top - 12 - h >= 8) t = a.top - 12 - h;
      else t = clamp((vh - h) / 2, 16, vh - h - 16);
      return { l: l, t: t, w: w, h: h, r: 18 };
    }
    function maxGeo() {
      var vw = window.innerWidth, vh = window.innerHeight;
      if (vw < 768) return { l: 0, t: 0, w: vw, h: vh, r: 0 };
      var w = Math.min(1120, vw * 0.94), h = Math.min(880, vh * 0.9);
      return { l: (vw - w) / 2, t: (vh - h) / 2, w: w, h: h, r: 22 };
    }
    function bubbleGeo() {
      var vw = window.innerWidth, vh = window.innerHeight;
      return { l: vw - 64 - 24, t: vh - 64 - 24, w: 64, h: 64, r: 999 };
    }

    function apply() {
      var g, opacity = 1, scale = 1, pointer = "auto";
      var wrapOp = 1, bubOp = 0, bubPtr = "none", bdOp = 0, bdPtr = "none";
      var shadow = "0 24px 64px -18px rgba(16,38,46,.32)";
      if (mode === "closed") { g = previewGeo(); opacity = 0; scale = 0.96; pointer = "none"; wrapOp = 0; }
      else if (mode === "preview") { g = previewGeo(); }
      else if (mode === "maximized") { g = maxGeo(); bdOp = 1; bdPtr = "auto"; shadow = "0 40px 120px -30px rgba(16,38,46,.5)"; }
      else { g = bubbleGeo(); wrapOp = 0; bubOp = 1; bubPtr = "auto"; shadow = "0 16px 36px -10px rgba(59,174,209,.5)"; }

      shell.style.left = g.l + "px";
      shell.style.top = g.t + "px";
      shell.style.width = g.w + "px";
      shell.style.height = g.h + "px";
      shell.style.borderRadius = g.r + "px";
      shell.style.opacity = opacity;
      shell.style.transform = "scale(" + scale + ")";
      shell.style.pointerEvents = pointer;
      shell.style.boxShadow = shadow;
      shell.style.border = mode === "bubble" ? "none" : "1px solid #D6E7EE";

      wrap.style.opacity = wrapOp;
      wrap.style.pointerEvents = wrapOp ? "auto" : "none";
      bubble.style.opacity = bubOp;
      bubble.style.pointerEvents = bubPtr;
      backdrop.style.opacity = bdOp;
      backdrop.style.pointerEvents = bdPtr;

      maxBtn.style.display = mode === "maximized" ? "none" : "grid";
      restoreBtn.style.display = mode === "maximized" ? "grid" : "none";
    }

    function ensureLoaded() {
      if (!loaded) { frame.src = CALC_URL; loaded = true; }
    }
    function set(m) { mode = m; apply(); }

    function openPreview() { ensureLoaded(); set("preview"); }
    function reposition() {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = null; apply(); });
    }

    maxBtn.addEventListener("click", function () { set("maximized"); });
    restoreBtn.addEventListener("click", function () { set("preview"); });
    minBtn.addEventListener("click", function () { set("bubble"); });
    bubble.addEventListener("click", openPreview);
    backdrop.addEventListener("click", function () { set("preview"); });
    anchor.addEventListener("click", openPreview);

    window.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (mode === "maximized") set("preview");
      else if (mode === "preview") set("bubble");
    });
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    // Erststand ohne Fly-in animieren
    shell.style.transition = "none";
    apply();
    requestAnimationFrame(function () { shell.style.transition = TRANS; });

    return { open: openPreview };
  }

  function init() {
    var anchor = document.getElementById("roi-open");
    if (!anchor) { requestAnimationFrame(init); return; }
    if (anchor.__roiBound) return;
    anchor.__roiBound = true;
    build(anchor);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
