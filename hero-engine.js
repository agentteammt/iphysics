/* =============================================================
   iPhysics Hero v4 — Engine
   Verhalten/Timings verbindlich nach hero-blueprint_v4.md §0–§6,
   portiert aus hero-prototyp_v4.html (abgenommene Referenz).
   3D: montagezelle_web_v1.glb — EXT_meshopt_compression →
   MeshoptDecoder Pflicht. Clip „Simulation" 17,77 s, Steuerung
   ausschließlich über mixer.setTime().
   HINWEIS PRODUKTION: three.js hier via CDN (jsdelivr) — vor
   Go-Live selbst hosten (DSGVO, wie Fonts).
   ============================================================= */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm";
import { MeshoptDecoder } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/meshopt_decoder.module.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutC = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutC = t => 1 - Math.pow(1 - t, 3);
const easeInQ = t => t * t;
const GRAD = "linear-gradient(120deg,#3BAED1 10%,#45B347 90%)";
/* Hero-Framing (03.07. III): Anlage RECHTSBÜNDIG am Layout-Raster — die rechte
   Anlagenkante schließt mit der rechten Content-Kante ab (Linie des Header-CTAs).
   Reines Framing via camera.setViewOffset(); Kamera-Pose, Modell und gelockte
   Choreografie (§0) bleiben unangetastet. Der Versatz wird BERECHNET statt fest
   gesetzt (ersetzt die HERO_SHIFT-Prozente): robuste Cluster-Box mit der
   Settle-Kamera (P1/T1, OHNE Offset) projizieren → maxScreenX, dann
   shiftPx = (vw − PAD_RIGHT) − maxScreenX + HERO_TRIM (positiv = Bild nach rechts).
   Unter 600 px kein Offset (mobil zentriert). Ist die Anlage breiter als der Raum
   rechts der Textzone, ragt sie links in die Headline-Zone (kein Verkleinern). */
let HERO_TRIM = 0; /* px — manuelle Feinjustage in der Framing-Session */
const PAD_RIGHT = w => clamp(w * .06, 20, 96); /* rechte Rasterlinie = linkes Hero-Padding clamp(20px,6vw,96px) */
let heroShiftPx = 0; /* berechnet in computeHeroShift() — nach Settle-Framing und bei jedem Resize */
const GLB_FALLBACK_BYTES = { desktop: 5.3e6, mobile: 3.38e6 }; /* B6 (09.07.): v2-Dateigrößen für den Fortschritts-Fallback */

export async function initHero(cfg = {}) {
  if (window.__hero) { console.warn("[hero] bereits initialisiert"); return window.__hero; }
  const $ = id => document.getElementById(id);

  /* ---------- Flags (QA-Overrides via sessionStorage 'iph_qa_flags') ---------- */
  const qa = (sessionStorage.getItem("iph_qa_flags") || "").split(",");
  const isTouch = !!cfg.forceTouch || qa.includes("touch") ||
    matchMedia("(pointer:coarse)").matches || "ontouchstart" in window;
  const reduced = !!cfg.forceReduced || qa.includes("reduced") ||
    matchMedia("(prefers-reduced-motion:reduce)").matches;
  const devSkip = !!cfg.devSkipIntro || qa.includes("skip");
  const revisit = !!sessionStorage.getItem("iph_hero_v4_seen");

  /* Perf-Profil (07.07.): schwache Geräte — statische Heuristik (Kerne/RAM) + Frame-Watchdog
     im Kantenbau (s. load3D). Steuert Kanten-Deckel und Iris-Taktung; Choreografie-Timings
     bleiben unangetastet. */
  let weakFx = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  if (weakFx) console.log("[hero] Perf-Profil reduziert (Kerne/RAM-Heuristik)");

  /* GPU-Probe (08.07.): Kerne/RAM sehen die Grafikkarte nicht — ein Wegwerf-Kontext liest den
     Renderer-String. Software-Rasterizer (SwiftShader/llvmpipe) und typische iGPUs (Intel HD/UHD/
     Iris, AMD-APUs) starten direkt im reduzierten Profil und auf einer niedrigeren DPR-Stufe.
     Zusätzlich misst der Render-Governor (s. Hauptschleife) echte Frame-Zeiten und schaltet zur
     Laufzeit weiter runter — Choreografie-Timings bleiben unangetastet, nur Auflösung/Ambient. */
  let gpuStr = "", gpuSoft = false;
  try {
    const pcv = document.createElement("canvas");
    const pgl = pcv.getContext("webgl2") || pcv.getContext("webgl");
    if (pgl) {
      const dbg = pgl.getExtension("WEBGL_debug_renderer_info");
      gpuStr = String(pgl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : pgl.RENDERER) || "");
      gpuSoft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpuStr);
      const weakGpu = gpuSoft || /u?hd graphics|iris|vega \d|radeon\(tm\) graphics|mali|adreno|powervr/i.test(gpuStr);
      if (weakGpu && !weakFx) { weakFx = true; console.log("[hero] Perf-Profil reduziert (GPU: " + gpuStr + ")"); }
      const lose = pgl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
    }
  } catch (e) {}
  if (qa.includes("weak") && !weakFx) { weakFx = true; console.log("[hero] Perf-Profil reduziert (QA-Flag)"); }

  /* Save-Data-/Netz-Weiche (09.07., Perf-Audit A5): Datensparmodus oder 2G → kein Intro-Video
     (spart ~3 MB) und direkt ins Sparprofil. Choreografie-Timings (§0) bleiben unangetastet. */
  const conn = navigator.connection || {};
  const slowNet = !!conn.saveData || /(^|-)2g/.test(String(conn.effectiveType || ""));
  if (slowNet && !weakFx) { weakFx = true; console.log("[hero] Perf-Profil reduziert (Save-Data/2G)"); }

  /* Video-Einstieg „Fog-Cut" (Blueprint v8 §C, geändert 06.07.: auch Wiederkehrer): jeder Besuch bei Desktop + voller Motion.
     touch/reduced/devSkip laden das Video weiterhin gar nicht erst. */
  const VIDEO_SRC = "assets/intro-flight.mp4", VIDEO_DESCENT = 1.2; /* Kurz-Descent aus dem Video-Weiß */
  const VIDEO_TRIM = 0.5; /* 07.07.: die ersten 0,5 s des Flugs überspringen — Einstieg direkt in die Bewegung */
  let videoActive = !isTouch && !reduced && !devSkip && !slowNet;

  /* ---------- DOM ---------- */
  const stage = $("stage"), cvR = $("cv-real"), cvW = $("cv-wire");
  const rings = $("rings"), lensEl = $("lens"), lensScan = $("lens-scan"), lensDot = $("lens-dot");
  const heroUI = $("hero-ui"), kickerEl = $("hero-kicker"),
        h1l1 = $("h1-l1"), h1l2 = $("h1-l2"), subIn = $("sub-inner");
  /* Headline-Linse: invertierte Kopie (Kontur↔Füllung) + Masken-Loch im Basistext — wie die Modell-Linse (03.07.) */
  const h1Lens = [h1l1, h1l2].map(line => line ? { line, base: line.querySelector("[data-h1-base]"), inv: line.querySelector("[data-h1-inv]") } : null).filter(o => o && o.base && o.inv);
  function updateH1Lens(mx, my, r) {
    for (const o of h1Lens) {
      const rc = o.line.getBoundingClientRect();
      const lx = mx - rc.left, ly = my - rc.top;
      let rr = r;
      if (rr < 1 || lx < -rr * 1.2 || ly < -rr * 1.6 || lx > rc.width + rr * 1.2 || ly > rc.height + rr * 1.6) rr = 0; /* 08.07.: vertikal 1.6 — Cluster reicht jetzt bis 1.53 r */
      if (CLIP_EVENODD) { /* 08.07. (1c): Bildmarken-Cluster statt Kreis */
        let holes = "";
        if (rr) for (const q of lensRectsPx(lx, ly, rr)) holes += rectPath(q);
        o.inv.style.clipPath = rr ? `path("${holes}")` : "circle(0px at -200px -200px)";
        o.base.style.clipPath = rr ? `path(evenodd, "M-60 -60H${(rc.width + 60).toFixed(1)}V${(rc.height + 60).toFixed(1)}H-60Z${holes}")` : "none";
      } else { /* Fallback ohne evenodd-Support: Kreis wie bisher */
        o.inv.style.clipPath = rr ? `circle(${rr}px at ${lx}px ${ly}px)` : "circle(0px at -200px -200px)";
        const m = rr ? `radial-gradient(circle ${rr}px at ${lx}px ${ly}px, transparent 0 98%, #000 100%)` : "none";
        o.base.style.webkitMaskImage = m; o.base.style.maskImage = m;
      }
    }
  }
  const hint = $("hint"),
        camRead = $("cam"), camSub = $("cam-sub"), skipBtn = $("skip");
  const hdr = $("hdr"), hdrNav = $("hdr-nav");
  const specbar = $("specbar");
  const slotIns = [0, 1, 2].map(i => $("sb-in-" + i));
  const intro = $("intro"), seqEl = $("seq"), rmList = $("rm-list");
  const progress = $("progress"), progFill = $("prog-fill"),
        progPct = $("prog-pct"), progLabel = $("prog-label");
  let vid = $("introFlight");     /* Video-Layer (v8 §C) — nach Gebrauch aus dem DOM entfernt */
  const vWhite = $("introWhite"); /* weißes Übergabe-Overlay (z8) */

  hint.innerHTML = isTouch
    ? '<b style="color:#3BAED1;font-weight:700">WISCHEN</b> — DIE LINSE ZEIGT DIE REALE ANLAGE'
    : 'DIE <b style="color:#3BAED1;font-weight:700">LINSE</b> FOLGT DER MAUS — SIE ZEIGT DIE REALE ANLAGE';

  /* Chrome-Layout (v6): Schriftfeld-Höhe, Mobil-Varianten, Logo-Größe, Readout unter dem Logo */
  let barH = 58, hintDismissed = false, tourEls = null;
  function layoutChrome() {
    const mobile = innerWidth < 700;
    barH = mobile ? 54 : 58;
    specbar.style.height = barH + "px";
    specbar.style.padding = mobile ? "0 10px" : "0 clamp(20px, 6vw, 96px)";
    slotIns.forEach(el => {
      const val = el.querySelector("[data-sb-val]");
      const lbl = el.querySelector("[data-sb-lbl]");
      const col = el.parentElement;
      if (val) val.style.fontSize = mobile ? "13px" : "clamp(15px, 0.95vw, 19px)";
      if (lbl) { /* Mobile-Pass (06.07.): Labels bleiben sichtbar — kompakt, umbruchfähig */
        lbl.style.display = "block";
        lbl.style.fontSize = mobile ? "7.5px" : "clamp(9px, 0.58vw, 11px)";
        lbl.style.letterSpacing = mobile ? "0.14em" : "0.22em";
        lbl.style.whiteSpace = mobile ? "normal" : "nowrap";
        lbl.style.lineHeight = mobile ? "1.3" : "normal";
        lbl.style.marginTop = mobile ? "2px" : "3px";
      }
      if (col) col.style.flex = mobile ? "1 1 0" : "0 1 clamp(200px, 27vw, 330px)";
    });
    if (hdrNav) hdrNav.style.display = innerWidth < 900 ? "none" : "flex";
    hint.style.bottom = (barH + 18) + "px";
    progress.style.bottom = `calc(${barH}px + clamp(120px, 20vh, 240px))`; /* Ladebalken deutlich höher (06.07.) */
    const foot = $("intro-foot");
    if (foot) foot.style.bottom = (barH + 10) + "px";
    camRead.style.top = (mobile ? 74 : 88) + "px"; /* unter dem fixen Header */
    camRead.style.display = mobile ? "none" : "block"; /* mobil: Platz für die Headline oben */
    if (camSub) { /* „iPhysics — die Plattform" direkt unter dem CAM-Readout (07.07.) */
      camSub.style.top = ((mobile ? 74 : 88) + 17) + "px";
      camSub.style.display = mobile ? "none" : "block";
    }

    /* Mobile-Pass (06.07.): Headline-Block oben unter dem Header statt vertikal mittig —
       das zentrierte Modell (< 600 px kein Rechts-Offset) läuft sonst durch den Text.
       Scrim (Template #hero-scrim) sichert die Lesbarkeit. Desktop unverändert; §0 unberührt —
       der Materialize-Effekt schreibt weiter auf #hero-ui (inneres Element). */
    const uiCenter = $("hero-ui-center"), scrim = $("hero-scrim");
    if (uiCenter) {
      const h1 = uiCenter.querySelector("h1");
      if (mobile) {
        uiCenter.style.top = "calc(78px + 4vh)";
        uiCenter.style.transform = "none";
        uiCenter.style.left = "20px";
        uiCenter.style.right = "20px";
        uiCenter.style.maxWidth = "none";
        if (h1) h1.style.fontSize = "clamp(1.35rem, 6.6vw, 1.7rem)"; /* einzeilig je Wrapper, kein Glyph-Überlapp bei line-height .8 */
      } else {
        uiCenter.style.top = "calc(50% + 4vh)";
        uiCenter.style.transform = "translateY(-50%)";
        uiCenter.style.left = "clamp(20px, 6vw, 96px)";
        uiCenter.style.right = "auto";
        uiCenter.style.maxWidth = "min(920px, 86vw)";
        if (h1) h1.style.fontSize = "clamp(1.7rem, 4.6vw, 4.5rem)";
      }
    }
    if (scrim) scrim.style.opacity = mobile ? "1" : "0";
    layoutCorners(); /* Passermarken folgen Header/Leiste */

    /* Tour-Layout (Karten + Rail) — Refs werden später gebunden */
    if (tourEls) {
      tourEls.tCards.forEach((el, i) => {
        if (mobile) {
          el.style.top = "auto"; el.style.bottom = "18px";
          el.style.left = "16px"; el.style.right = "16px"; el.style.width = "auto";
        } else {
          el.style.top = "50%"; el.style.bottom = "auto"; el.style.width = "min(clamp(400px, 30vw, 560px), 40vw)";
          if (i % 2 === 0) { el.style.left = "clamp(20px, 6vw, 96px)"; el.style.right = "auto"; }
          else { el.style.right = "clamp(20px, 6vw, 96px)"; el.style.left = "auto"; }
        }
      });
      const { rail, railTrack, railFill, railDots } = tourEls;
      if (mobile) {
        rail.style.left = "16px"; rail.style.right = "16px"; rail.style.top = "14px"; rail.style.bottom = "auto";
        rail.style.transform = "none"; rail.style.height = "12px"; rail.style.width = "auto";
        railTrack.style.left = "6px"; railTrack.style.right = "6px"; railTrack.style.top = "5px"; railTrack.style.bottom = "auto";
        railTrack.style.width = "auto"; railTrack.style.height = "2px";
        railFill.style.left = "6px"; railFill.style.top = "5px"; railFill.style.bottom = "auto"; railFill.style.height = "2px";
        railDots.forEach((d, i) => { d.style.top = "0px"; d.style.left = `calc(${i * 25}% - ${i * 3}px)`; });
      } else {
        rail.style.left = "auto"; rail.style.right = "clamp(18px, 4vw, 60px)"; rail.style.top = "50%"; rail.style.bottom = "auto";
        rail.style.transform = "translateY(-50%)"; rail.style.height = "300px"; rail.style.width = "12px";
        railTrack.style.left = "5px"; railTrack.style.right = "auto"; railTrack.style.top = "6px"; railTrack.style.bottom = "6px";
        railTrack.style.width = "2px"; railTrack.style.height = "auto";
        railFill.style.left = "5px"; railFill.style.top = "6px"; railFill.style.bottom = "auto"; railFill.style.width = "2px";
        railDots.forEach((d, i) => { d.style.left = "0px"; d.style.top = `calc(${i * 25}% - ${i * 3}px)`; });
      }
      const ov = tourEls.ovWrap, ovLbl = tourEls.railLabel;
      if (ov) { /* Überblick-Chips: Desktop links mittig, mobil unten (06.07.) */
        if (mobile) {
          ov.style.top = "auto"; ov.style.bottom = "18px"; ov.style.transform = "none"; ov.style.justifyContent = "";
          ov.style.left = "16px"; ov.style.right = "16px"; ov.style.width = "auto";
        } else {
          /* 07.07.: Band statt Viewport-Zentrierung — die Oberkante bleibt klar unter der
             Plattform-Zeile („iPhysics — die Plattform"), der Inhalt zentriert sich im Feld darunter */
          ov.style.top = "clamp(150px, 18vh, 210px)"; ov.style.bottom = "44px"; ov.style.transform = "none";
          ov.style.justifyContent = "flex-start";
          ov.style.justifyContent = "safe center"; /* overflow-sicher: zentriert bei Platz, pinnt sonst an der Band-Oberkante; ungültig → Fallback flex-start */
          ov.style.left = "clamp(20px, 6vw, 96px)"; ov.style.right = "auto"; ov.style.width = "min(clamp(500px, 34vw, 640px), 46vw)";
        }
      }
      if (ovLbl) {
        if (mobile) { ovLbl.style.top = "calc(100% + 10px)"; ovLbl.style.right = "0px"; }
        else { ovLbl.style.top = "calc(100% + 14px)"; ovLbl.style.right = "-2px"; }
      }
    }
  }

  /* ---------- Bildmarken-Linse (08.07., Variante 1c) ----------
     Formgeometrie in Einheiten des Linsenradius r — exakt aus assets/machineering.svg
     uebernommen: VIER GLEICH GROSSE Quadrate (SVG 31.43) auf striktem Raster
     (Pitch 38.83 => Fuge 23.5 % der Kantenlaenge; 08.07. auf Kundenwunsch halbiert
     => Fuge 11.8 %, Pitch .984). Blau-Paar mittig, Grau oben
     buendig ueber dem rechten, Grau unten buendig unter dem linken Quadrat.
     Gilt fuer Reveal-Maske, Chrome, Headline-Linse und Ping. */
  const LENS_RECTS = [
    { cx: -.492, cy: 0, s: .88, main: 1 },
    { cx: .492, cy: 0, s: .88, main: 1 },
    { cx: .492, cy: -.984, s: .88 },
    { cx: -.492, cy: .984, s: .88 }
  ];
  const lensRectsPx = (x, y, r) => LENS_RECTS.map(q => {
    const s = q.s * r;
    return { x: x + q.cx * r - s / 2, y: y + q.cy * r - s / 2, w: s, h: s };
  });
  const rectPath = q => `M${q.x.toFixed(1)} ${q.y.toFixed(1)}h${q.w.toFixed(1)}v${q.h.toFixed(1)}h${(-q.w).toFixed(1)}Z`;
  const CLIP_EVENODD = typeof CSS !== "undefined" && CSS.supports && CSS.supports("clip-path", 'path(evenodd, "M0 0H4V4H0Z")');
  if (!CLIP_EVENODD) console.warn("[hero] clip-path path(evenodd) nicht verfuegbar - Linsen-Fallback: Kreis");

  /* Linsen-Chrome: Rahmen als Kinder von #lens (Basis r=190; der Loop skaliert weiter via scale(mr/190)) */
  lensEl.style.width = "0"; lensEl.style.height = "0"; lensEl.style.margin = "0";
  lensEl.style.filter = "drop-shadow(0 2px 10px rgba(59,174,209,.35))";
  lensScan.style.display = "none"; /* Scan-Textur liegt jetzt IN den blauen Fenstern */
  {
    const R = 190, BW = 2.5;
    const mkDiv = (parent, st) => { const d = document.createElement("div"); d.style.position = "absolute"; d.style.pointerEvents = "none"; Object.assign(d.style, st); parent.appendChild(d); return d; };
    const GRADS = [["#3BAED1", "#3FB18F"], ["#3FB18F", "#45B347"]];
    lensRectsPx(0, 0, R).forEach((q, i) => {
      const box = mkDiv(lensEl, { left: q.x + "px", top: q.y + "px", width: q.w + "px", height: q.h + "px", boxSizing: "border-box" });
      if (LENS_RECTS[i].main) {
        const a = GRADS[i][0], b = GRADS[i][1];
        mkDiv(box, { left: "0", top: "0", right: "0", height: BW + "px", background: `linear-gradient(90deg,${a},${b})` });
        mkDiv(box, { left: "0", bottom: "0", right: "0", height: BW + "px", background: `linear-gradient(90deg,${a},${b})` });
        mkDiv(box, { left: "0", top: "0", bottom: "0", width: BW + "px", background: a });
        mkDiv(box, { right: "0", top: "0", bottom: "0", width: BW + "px", background: b });
        mkDiv(box, { left: BW + "px", top: BW + "px", right: BW + "px", bottom: BW + "px", background: "repeating-linear-gradient(0deg,rgba(59,174,209,.16) 0 1px,transparent 1px 7px)" });
      } else {
        box.style.border = "2px solid #BDBCBC";
      }
    });
  }
  lensDot.style.background = GRAD;
  lensDot.style.borderRadius = "0"; /* quadratischer Zentrier-Punkt */
  lensDot.style.boxShadow = "0 0 8px rgba(69,179,71,.6)";

  /* ---------- Renderer / Kamera ---------- */
  /* DPR-Leiter (08.07.): Startstufe nach Geräteklasse, der Render-Governor schaltet bei gemessenem
     Ruckeln stufenweise runter — Auflösung ist der größte Einzelhebel (Fill-Rate sinkt quadratisch:
     2.0 → 1.5 spart ~44 % Pixel, → 1.2 ~64 %). powerPreference zwingt Dual-GPU-Laptops auf die
     schnelle Karte statt auf die Strom-Spar-iGPU. */
  const DPR_STEPS = isTouch ? [1.5, 1.25, 1] : [2, 1.5, 1.2, 1];
  let dprIx = gpuSoft ? DPR_STEPS.length - 1 : (weakFx ? 1 : 0);
  const effDPR = () => Math.min(window.devicePixelRatio || 1, DPR_STEPS[dprIx]);
  const AA = !gpuSoft; /* MSAA auf Software-Rasterizern ist unbezahlbar — dort aus */
  const rReal = new THREE.WebGLRenderer({ canvas: cvR, antialias: AA, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  const rWire = new THREE.WebGLRenderer({ canvas: cvW, antialias: AA, powerPreference: "high-performance" });
  rReal.outputColorSpace = THREE.SRGBColorSpace;
  rReal.toneMapping = THREE.ACESFilmicToneMapping;
  rReal.toneMappingExposure = 1.1;
  rWire.outputColorSpace = THREE.SRGBColorSpace;
  rReal.setPixelRatio(effDPR()); rWire.setPixelRatio(effDPR());
  rReal.setClearColor(0xF8F8F8, 1); rWire.setClearColor(0xFBFDFE, 1); /* Real-Hintergrund #F8F8F8 (Kundenwunsch 02.07.) */

  const cam = new THREE.PerspectiveCamera(42, 1, .1, 500);
  const P0 = new THREE.Vector3(), T0 = new THREE.Vector3();
  const P1 = new THREE.Vector3(), T1 = new THREE.Vector3();
  const camT = new THREE.Vector3();

  /* Rechtsbündig-Framing (03.07. IV — SICHTKANTE): Die Cluster-Box wird von
     dünnen/hellen Außenteilen aufgespannt — optisch endet die Anlage früher.
     Deshalb misst ein Pixel-Scan die rechte SICHTKANTE: ein Frame NUR Anlage
     (Umgebung/Raster/Fog aus, schwarzer Grund) mit der Settle-Kamera (P1/T1,
     OHNE Offset, T = 17,30) in ein halb aufgelöstes RenderTarget → maxScreenX;
     Ziel: maxScreenX = vw − PAD_RIGHT. Fallback bei Fehler: Box-Ecken.
     Reihenfolge verbindlich: computeHeroShift() → applyViewOffset() → bake(). */
  let edgeRT = null;
  function measureVisualRightEdge(w, h) {
    try {
      const SC = .5;
      const tw = Math.max(64, Math.round(w * SC)), th = Math.max(64, Math.round(h * SC));
      if (!edgeRT || edgeRT.width !== tw || edgeRT.height !== th) {
        if (edgeRT) edgeRT.dispose();
        edgeRT = new THREE.WebGLRenderTarget(tw, th);
      }
      const pc = new THREE.PerspectiveCamera(cam.fov, w / h, cam.near, cam.far);
      pc.position.copy(P1); pc.lookAt(T1); pc.updateMatrixWorld(true);
      const prevSim = simTime, vWire = envWire.visible, vReal = envReal.visible, prevFog = scene.fog;
      const prevClear = rReal.getClearColor(new THREE.Color()), prevAlpha = rReal.getClearAlpha();
      setSim(17.30);
      envWire.visible = false; envReal.visible = false; scene.fog = null;
      rReal.setRenderTarget(edgeRT);
      rReal.setClearColor(0x000000, 1);
      rReal.render(scene, pc);
      const buf = new Uint8Array(tw * th * 4);
      rReal.readRenderTargetPixels(edgeRT, 0, 0, tw, th, buf);
      rReal.setRenderTarget(null);
      rReal.setClearColor(prevClear, prevAlpha);
      envWire.visible = vWire; envReal.visible = vReal; scene.fog = prevFog;
      setSim(prevSim);
      let edge = -1;
      for (let x = tw - 1; x >= 0 && edge < 0; x--) {
        for (let y = 0; y < th; y++) {
          const i = (y * tw + x) * 4;
          if (buf[i] + buf[i + 1] + buf[i + 2] > 36) { edge = x; break; }
        }
      }
      return edge < 0 ? null : (edge + 1) / SC;
    } catch (e) {
      console.warn("[hero] Sichtkanten-Messung fehlgeschlagen — Fallback Box-Ecken:", e);
      return null;
    }
  }

  const framingLog = []; /* QA: jede Berechnung protokollieren (Framing-Session) */
  function computeHeroShift() {
    heroShiftPx = 0;
    const w = innerWidth, h = innerHeight;
    if (w < 600 || !annBox || !model) { /* mobil zentriert wie bisher */
      framingLog.push(`${(performance.now() / 1000).toFixed(2)}s skip @${w}×${h}${annBox ? "" : " · annBox null"}${model ? "" : " · model null"}`);
      return heroShiftPx;
    }
    const visX = measureVisualRightEdge(w, h);
    let maxX;
    if (visX != null) { maxX = visX; }
    else {
      const pc = new THREE.PerspectiveCamera(cam.fov, w / h, cam.near, cam.far);
      pc.position.copy(P1); pc.lookAt(T1); pc.updateMatrixWorld(true);
      maxX = -Infinity;
      const v = new THREE.Vector3();
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? annBox.max.x : annBox.min.x,
              i & 2 ? annBox.max.y : annBox.min.y,
              i & 4 ? annBox.max.z : annBox.min.z).project(pc);
        const sx = (v.x * .5 + .5) * w;
        if (sx > maxX) maxX = sx;
      }
    }
    /* Rasterlinie: clientWidth (ohne klassische Scrollbar) − PAD_RIGHT.
       PAD_RIGHT bewusst aus innerWidth: CSS-6vw schließt die Scrollbar ein —
       so trifft die Kante exakt die rechte Header-CTA-Linie. */
    const contentRight = document.documentElement.clientWidth - PAD_RIGHT(w);
    heroShiftPx = Math.round(contentRight - maxX + HERO_TRIM);
    framingLog.push(`${(performance.now() / 1000).toFixed(2)}s ${visX != null ? "Sichtkante" : "Box"} maxX ${maxX.toFixed(1)} → Ziel ${Math.round(contentRight)} · shift ${heroShiftPx}px @${w}×${h}`);
    console.log(`[hero] Framing rechtsbündig (${visX != null ? "Sichtkante" : "Box-Fallback"}): maxScreenX ${maxX.toFixed(1)} px → Ziel ${Math.round(contentRight)} px · shift ${heroShiftPx} px (clientWidth ${document.documentElement.clientWidth}, PAD_RIGHT ${Math.round(PAD_RIGHT(w))} px, TRIM ${HERO_TRIM} px @ ${w}×${h})`);
    return heroShiftPx;
  }

  /* EINE Kamera für alle Layer (Wireframe, Real, Bake) → Lens-Registrierung
     bleibt pixelgenau. mult 1 = Hero-Framing, 0 = zentriert; die Prozess-Tour
     fährt den Offset in der ersten Kamerafahrt auf 0 (renderTour). */
  function applyViewOffset(mult, extraX = 0, extraY = 0) {
    const w = innerWidth, h = innerHeight;
    const off = heroShiftPx * mult + extraX;
    if (Math.abs(off) > .5 || Math.abs(extraY) > .5) cam.setViewOffset(w, h, -off, extraY, w, h);
    else cam.clearViewOffset();
  }

  const scene = new THREE.Scene();
  const fogWire = new THREE.Fog(0xFBFDFE, 9, 40);
  const fogReal = new THREE.Fog(0xF8F8F8, 14, 42); /* Horizont = Real-Hintergrund #F8F8F8 */
  scene.fog = fogWire;

  /* ---------- Wireframe-Materialien (§2) ---------- */
  /* Kanten-Verlauf (06.07., v3.5): Die Anlagen-Kanten tragen das CD-Gefälle als VERTEX-FARBEN
     (LineBasicMaterial kann nur eine Farbe). Farbe pro Vertex aus der Weltposition in der
     Freeze-Pose (T = 17,30 — beim Kantenbau ohnehin aktiv, s. load3D). Die Achse ist so
     gewählt, dass der Verlauf aus der Hero-Kamera (P1) wie das CD-Gefälle (120°) wirkt:
     links/oben cyanlastig, rechts/unten grünlastig. Nur Anlagen-Kanten — Raster, Partikel,
     Bemaßung und alle UI-Verläufe bleiben unverändert. */
  const EDGE_GRAD_AXIS = new THREE.Vector3(0.79, -0.46, -0.41).normalize(); /* justierbar: Richtung des Gefälles (Welt) */
  const EDGE_GRAD_BIAS = 0;          /* justierbar: verschiebt die Verlaufs-Mitte entlang der Achse (−0.5 … +0.5) */
  const EDGE_GRAD_GREEN = 0x45B347;  /* Kontrast-Justage erlaubt: bis ~8 % dunkler (#3EA342) — NUR Linien, keine UI */
  const wireLine = new THREE.LineBasicMaterial({ color: 0xFFFFFF, vertexColors: true, transparent: true, opacity: .9 });
  const wireFill = new THREE.MeshBasicMaterial({
    color: 0xF6FBFD, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2
  });

  /* ---------- Umgebungen (nach Framing skaliert gebaut) ---------- */
  const envWire = new THREE.Group(), envReal = new THREE.Group();
  scene.add(envWire, envReal);
  envReal.visible = false;
  let roofs = [], pGeo = null, pMat = null, pArr = null, pN = 0, pTop = 0, pBot = 0;

  /* ---------- 3D-Zustand ---------- */
  let model = null, mixer = null, clipDur = 17.77, simTime = 15.5;
  const origMat = new Map(), edgeLines = [];
  let dist = 12, minY = 0, sideAmp = 1.35;

  function setSim(t) {
    simTime = t;
    if (mixer) mixer.setTime(t); /* timeScale bleibt 1 — Steuerung NUR über setTime */
  }

  function setWireLook() {
    origMat.forEach((_, mesh) => { mesh.material = wireFill; });
    edgeLines.forEach(l => { l.visible = true; });
    envWire.visible = true; envReal.visible = false; scene.fog = fogWire;
  }
  function setRealLook() {
    origMat.forEach((mat, mesh) => { mesh.material = mat; });
    edgeLines.forEach(l => { l.visible = false; });
    envWire.visible = false; envReal.visible = true; scene.fog = fogReal;
  }

  /* Runtime-Bake (§4): ein Frame bei T=17,30 mit Original-Materialien
     + Studiolicht in den Real-Canvas (preserveDrawingBuffer hält ihn). */
  function bake() {
    if (!model) return;
    const prev = simTime;
    const prevPos = cam.position.clone(), prevQuat = cam.quaternion.clone();
    setSim(17.30);
    cam.position.copy(P1); cam.lookAt(T1); /* Bake IMMER aus der Settle-Pose — Registrierung per Konstruktion */
    setRealLook();
    rReal.render(scene, cam);
    setWireLook();
    setSim(prev);
    cam.position.copy(prevPos); cam.quaternion.copy(prevQuat);
  }

  /* ---------- GLB laden (echter LoadingManager-Fortschritt) ---------- */
  let loadDone = false, loadError = null;

  /* Änd. 3 (06.07.): „SYSTEM BEREIT"-Puls — einmaliger Glanz-Sweep (~400 ms) durch die
     Balkenfüllung + ein Atem-Zug des Balkens (scale 1→1.04→1, ~350 ms, origin center)
     mit kurzem dezentem Verlaufs-Glow. Kein Loop. Im pendingStart-Fall feuert der Puls
     NICHT hier, sondern als gemeinsamer Beat mit dem Abflug-Herzschlag (s. pendingLaunch). */
  let readyPulsed = false;
  function systemReadyPulse() {
    if (readyPulsed || reduced) return; readyPulsed = true;
    const track = progFill.parentElement;
    if (!track || !track.animate) return;
    track.style.position = "relative";
    const gloss = document.createElement("span");
    Object.assign(gloss.style, {
      position: "absolute", top: "0", bottom: "0", left: "0", width: "36%",
      background: "linear-gradient(90deg,transparent,rgba(255,255,255,.95),transparent)",
      transform: "translateX(-120%)", pointerEvents: "none"
    });
    track.appendChild(gloss);
    gloss.animate([{ transform: "translateX(-120%)" }, { transform: "translateX(300%)" }],
      { duration: 400, easing: "ease-in-out" }).onfinish = () => gloss.remove();
    track.animate([
      { transform: "scale(1)", boxShadow: "0 0 0 rgba(59,174,209,0)" },
      { transform: "scale(1.04)", boxShadow: "0 0 10px rgba(59,174,209,.4), 0 0 10px rgba(69,179,71,.28)", offset: .45 },
      { transform: "scale(1)", boxShadow: "0 0 0 rgba(59,174,209,0)" }
    ], { duration: 350, easing: "ease-in-out" });
    console.log("[hero] SYSTEM-BEREIT-Puls");
  }

  function setProgress(p) {
    p = clamp(p, 0, 1);
    progFill.style.width = (p * 100) + "%";
    progPct.textContent = Math.round(p * 100) + " %";
    if (p >= 1) {
      progLabel.textContent = "SYSTEM BEREIT"; /* Label-Wechsel auch bei reduced-motion; Fehler-Label unberührt */
      if (!launched && !pendingStart && !devSkip) systemReadyPulse(); /* Änd. 3 — Normalfall: Puls direkt bei 100 % */
    }
  }

  /* Robuste Szenen-Box: Sprung-Guard-Tracks parken Teile weit außerhalb
     (z. B. −220 m) — die dürfen das Framing nicht sprengen. Cluster um den
     Median der Mesh-Zentren, Ausreißer ausgeschlossen. */
  function robustBox(root) {
    const boxes = [], centers = [], refs = [];
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (o.isMesh && o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        if (isFinite(b.min.x) && isFinite(b.max.x) && !b.isEmpty()) {
          boxes.push(b); centers.push(b.getCenter(new THREE.Vector3())); refs.push(o);
        }
      }
    });
    if (!boxes.length) return { box: new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)), keep: null };
    const med = v => { const a = [...v].sort((x, y) => x - y); return a[(a.length / 2) | 0]; };
    const m = new THREE.Vector3(med(centers.map(c => c.x)), med(centers.map(c => c.y)), med(centers.map(c => c.z)));
    const dists = centers.map(c => c.distanceTo(m)).sort((a, b) => a - b);
    const medD = dists[(dists.length / 2) | 0] || .5;
    const p85 = dists[Math.min(dists.length - 1, (dists.length * .85) | 0)] || medD;
    const lim = Math.max(medD * 6, p85 * 2);
    const box = new THREE.Box3();
    const keep = new Set();
    let kept = 0;
    centers.forEach((c, i) => { if (c.distanceTo(m) <= lim) { box.union(boxes[i]); keep.add(refs[i]); kept++; } });
    console.log(`[hero] robustBox: ${kept}/${boxes.length} Meshes im Cluster (lim ${lim.toFixed(2)} m)`);
    if (box.isEmpty()) return { box: new THREE.Box3().setFromObject(root), keep: null };
    return { box, keep };
  }

  async function load3D() {
    if (qa.includes("slowload")) { /* QA: pendingStart-Fall erzwingen — Ladebeginn +6 s */
      console.warn("[hero] QA slowload aktiv: GLB-Ladestart +6 s verzögert (pendingStart-Test)");
      await new Promise(r => setTimeout(r, 6000));
    }
    const loader = new GLTFLoader();
    /* 07.07.: Meshopt-Dekodierung in Worker — decodeGltfBufferAsync läuft dann off-main-thread,
       die KPI-Choreografie behält den Hauptthread. Ohne Worker-Support: synchron wie bisher. */
    try {
      if (MeshoptDecoder.useWorkers) MeshoptDecoder.useWorkers(Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 4) - 2)));
    } catch (e) { console.warn("[hero] Meshopt-Worker nicht verfügbar — Dekodierung im Hauptthread:", e); }
    loader.setMeshoptDecoder(MeshoptDecoder);
    /* B6 (09.07.): Lade-Weiche — touch lädt die _mobile-Variante (−64 %), sonst Desktop (−44 %).
       Decoder, Cluster-Box, Kantenbau (13°, Welt-Größen-Sortierung, 800+80), Bemaßung und
       Framing-Scan bleiben unangetastet. */
    const glbUrl = (isTouch && cfg.glbUrlMobile) ? cfg.glbUrlMobile : cfg.glbUrl;
    const glbFallback = (isTouch && cfg.glbUrlMobile) ? GLB_FALLBACK_BYTES.mobile : GLB_FALLBACK_BYTES.desktop;
    const gltf = await loader.loadAsync(glbUrl, e => {
      const total = (e.lengthComputable && e.total) ? e.total : glbFallback;
      setProgress(clamp(e.loaded / total, 0, 1) * .8);
    });
    model = gltf.scene;
    model.scale.setScalar(0.001); /* mm → m */
    scene.add(model);

    /* Einheiten-Heuristik: Blueprint sagt mm→m (×0.001). Falls das Asset
       bereits in Metern exportiert wurde, wäre die Anlage nach der Skalierung
       millimeterklein — dann Skalierung zurücknehmen und loggen. */
    model.updateMatrixWorld(true);
    {
      const b = new THREE.Box3().setFromObject(model);
      const diag = b.getSize(new THREE.Vector3()).length();
      if (diag < 0.2) {
        model.scale.setScalar(1);
        console.warn("[hero] Einheiten-Heuristik: GLB offenbar bereits in Metern — Skalierung 0.001 zurückgenommen (Diagonale wäre " + diag.toFixed(4) + " m gewesen).");
      } else if (diag > 2000) {
        console.warn("[hero] Einheiten-Heuristik: Szene sehr groß (" + diag.toFixed(0) + " m) — bitte Einheiten prüfen.");
      }
    }

    /* Mixer: ein Clip „Simulation", STEP-Tracks unangetastet */
    mixer = new THREE.AnimationMixer(model);
    const clip = gltf.animations[0];
    clipDur = clip.duration;
    const action = mixer.clipAction(clip);
    action.play();

    /* Kamera-Framing aus realer Geometrie bei T=17,30 (robuste Box) */
    setSim(17.30);
    model.updateMatrixWorld(true);
    const rb = robustBox(model);
    const box = rb.box, clusterKeep = rb.keep;
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const D = Math.max(.5, s.length() / 2);
    minY = box.min.y;
    dist = (D / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) * 1.12;
    sideAmp = dist * .11;
    T1.set(c.x, c.y - s.y * .06, c.z);
    P1.copy(T1).add(new THREE.Vector3(.58, .34, .74).normalize().multiplyScalar(dist * .75)); /* Hero-Pose näher — Modell ~33 % größer (03.07.) */
    T0.set(c.x, minY + s.y * .25, c.z);
    P0.set(c.x + dist * .05, minY + dist * 2.05, c.z + dist * .3);
    cam.near = Math.max(dist / 100, .005); cam.far = dist * 30;
    cam.updateProjectionMatrix();
    console.log("[hero] Framing: bbox", s.toArray().map(v => +v.toFixed(3)), "center", c.toArray().map(v => +v.toFixed(3)), "D", +D.toFixed(3), "dist", +dist.toFixed(3));
    fogWire.near = dist * .7; fogWire.far = dist * 3.2;
    fogReal.near = dist * 1.1; fogReal.far = dist * 3.4;

    const f = v => v.toFixed(2);
    camReadHero =
      `CAM ${f(P1.x)} / ${f(P1.y)} / ${f(P1.z)} · TARGET ${f(T1.x)} / ${f(T1.y)} / ${f(T1.z)}` +
      ` · FOV 42 · T = 17,30 S  ·  [R] = REAL-PROTOTYPE`;
    camRead.textContent = camReadHero;

    buildEnv(c, D);

    /* Meshes einsammeln, Originalmaterialien merken */
    const meshes = [];
    const tmpB = new THREE.Box3(), tmpV = new THREE.Vector3();
    model.traverse(o => {
      if (o.isMesh && o.geometry) {
        origMat.set(o, o.material);
        const g = o.geometry;
        const tris = g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
        if (!g.boundingBox) g.computeBoundingBox();
        tmpB.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
        const diag = tmpB.isEmpty() ? 0 : tmpB.getSize(tmpV).length();
        meshes.push({ mesh: o, tris, diag });
      }
    });

    /* matrixAutoUpdate=false für Nodes ohne Track-Ziel (§2) */
    const animated = new Set();
    clip.tracks.forEach(tr => {
      try { animated.add(THREE.PropertyBinding.parseTrackName(tr.name).nodeName); } catch (e) {}
    });
    model.updateMatrixWorld(true);
    model.traverse(o => { if (!animated.has(o.name)) o.matrixAutoUpdate = false; });

    /* Kantenbau (§2, präzisiert): Hidden-Line über die GESAMTE Anlage.
       – Statische Meshes: EdgesGeometry in Weltkoordinaten → zu EINER
         Line-Geometrie gemergt = 1 Draw Call. So sind ~800 Meshes bezahlbar
         statt 240 — Konturen reißen nicht mehr mitten in Baugruppen ab.
       – Meshes an animierten Nodes (Roboter, Greifer, Produkte): eigene
         Kanten-Kinder, damit sie der Bewegung im Sim-Fenster folgen.
       – Weiterhin nie global; Zeit-/Vertex-Budget hält den Loader flüssig. */
    const isDynamic = o => { let n = o; while (n && n !== model) { if (animated.has(n.name)) return true; n = n.parent; } return false; };
    const eligible = (clusterKeep ? meshes.filter(m => clusterKeep.has(m.mesh)) : meshes)
      .filter(m => m.tris <= 500000 && !m.mesh.isSkinnedMesh);
    eligible.sort((a, b) => b.diag - a.diag);
    const statics = [], dynamics = [];
    eligible.forEach(m => { (isDynamic(m.mesh) ? dynamics : statics).push(m); });
    const staticList = statics.slice(0, qa.includes("lowedges") ? 60 : (isTouch ? 400 : 800)), dynList = dynamics.slice(0, qa.includes("lowedges") ? 10 : (isTouch ? 40 : 80));
    const totalN = staticList.length + dynList.length;
    let VERT_CAP = isTouch ? 1200000 : 2400000, EDGE_TIME_BUDGET = 14000;
    /* Perf-Profil (07.07.): Kanten-Deckel für schwache Geräte. Die Liste ist nach diag
       absteigend sortiert — die großen, prägenden Konturen entstehen zuerst, gekappt
       werden nur Kleinteile. */
    let capStatic = staticList.length, capDyn = dynList.length, buildWeak = false; /* buildWeak: nur Build-Budgets, NICHT das Runtime-Profil */
    const applyWeakCaps = () => {
      if (isTouch || qa.includes("lowedges")) return;
      capStatic = Math.min(capStatic, 420); capDyn = Math.min(capDyn, 48);
      VERT_CAP = Math.min(VERT_CAP, 1100000); EDGE_TIME_BUDGET = Math.min(EDGE_TIME_BUDGET, 7000);
      /* Software-GL: jedes Linien-Vertex läuft über die CPU — nur die prägenden Großkonturen */
      if (gpuSoft) { capStatic = Math.min(capStatic, 200); capDyn = Math.min(capDyn, 24); VERT_CAP = Math.min(VERT_CAP, 500000); }
    };
    if (weakFx) { buildWeak = true; applyWeakCaps(); }
    const tEdges = performance.now();
    let visElapsed = 0; /* Budget zählt nur sichtbare Zeit — Hintergrund-Loads behalten volle Kanten */
    /* Chunk-Budget (07.07.): solange die KPI-Choreografie läuft, max. ~6 ms Kanten-Arbeit pro
       Frame — das Intro behält den Hauptthread. Im Wartefall (pendingStart: nur der Balken
       ist zu sehen) sowie bei devSkip 16 ms, damit es zügig fertig wird. */
    const CHUNK = () => (document.hidden ? 200 : ((pendingStart || introSkipped || devSkip) ? 16 : 6));
    let longFrames = 0, frameSamples = 0;
    /* 08.07.: Yield ohne Timer-Drossel. In verdeckten/versteckten Frames feuert rAF nicht
       und setTimeout wird bis auf 1/min geklemmt — der Kantenbau stand damit praktisch still.
       MessageChannel-Hops sind ungedrosselt: sie takten eine ~45-ms-Uhr als Fallback; im
       sichtbaren Tab gewinnt weiterhin rAF (Frame-Pacing + Watchdog unverändert). */
    const yChan = new MessageChannel();
    let yCb = null;
    yChan.port1.onmessage = () => { const cb = yCb; if (cb && cb()) yChan.port2.postMessage(0); };
    const yieldFrame = () => new Promise(r => {
      let done = false;
      const t0 = performance.now();
      const fin = () => { if (done) return; done = true; clearTimeout(to); cancelAnimationFrame(id); r(); };
      const id = requestAnimationFrame(() => {
        if (!document.hidden) { /* Frame-Watchdog: ruckelt es trotz Chunking, Kanten-Budget senken */
          frameSamples++;
          if (performance.now() - t0 > 34) longFrames++;
          if (!buildWeak && frameSamples >= 10 && longFrames / frameSamples > .4) {
            buildWeak = true; applyWeakCaps(); /* misst Lade-Congestion (Video-Decode + GLB-Parse), nicht GL-Render-Speed — darf das Runtime-Sparprofil (weakFx) NICHT schalten (08.07., entkoppelt) */
            console.log("[hero] Kanten-Budget reduziert (Frame-Watchdog im Kantenbau — Runtime-Profil unangetastet)");
          }
        }
        fin();
      });
      const to = setTimeout(fin, 50); /* normaler Fallback, solange Timer nicht geklemmt sind */
      yCb = () => { if (done) return false; if (performance.now() - t0 >= 45) { fin(); return false; } return true; };
      yChan.port2.postMessage(0);
    });

    /* Verlaufs-Skala über die Cluster-Box (Achse/Bias: EDGE_GRAD_* oben). Farben als
       Uint8-BufferAttribute (normalized) — bei ~2 Mio Kanten-Vertices ¼ des Float32-Speichers. */
    const gC0 = new THREE.Color(0x3BAED1), gC1 = new THREE.Color(EDGE_GRAD_GREEN);
    let gMin = Infinity, gMax = -Infinity;
    for (let bi = 0; bi < 8; bi++) {
      const d = (bi & 1 ? box.max.x : box.min.x) * EDGE_GRAD_AXIS.x +
                (bi & 2 ? box.max.y : box.min.y) * EDGE_GRAD_AXIS.y +
                (bi & 4 ? box.max.z : box.min.z) * EDGE_GRAD_AXIS.z;
      if (d < gMin) gMin = d;
      if (d > gMax) gMax = d;
    }
    const gSpan = Math.max(1e-6, gMax - gMin);
    const edgeColors = (posArr, mat) => { /* mat = Matrix4 (lokale Koordinaten) oder null (posArr bereits Welt) */
      const n = posArr.length, out = new Uint8Array(n), e = mat && mat.elements;
      for (let k = 0; k < n; k += 3) {
        let x = posArr[k], y = posArr[k + 1], z = posArr[k + 2];
        if (e) {
          const lx = x, ly = y, lz = z;
          x = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
          y = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
          z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
        }
        let t = ((x * EDGE_GRAD_AXIS.x + y * EDGE_GRAD_AXIS.y + z * EDGE_GRAD_AXIS.z) - gMin) / gSpan + EDGE_GRAD_BIAS;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        out[k] = (gC0.r + (gC1.r - gC0.r) * t) * 255;
        out[k + 1] = (gC0.g + (gC1.g - gC0.g) * t) * 255;
        out[k + 2] = (gC0.b + (gC1.b - gC0.b) * t) * 255;
      }
      return out;
    };
    const cChunks = [];

    /* Phase 1: statische Kanten sammeln (Weltkoordinaten) */
    const chunks = []; let vertTotal = 0, budgetHit = false;
    let i = 0;
    while (i < Math.min(staticList.length, capStatic)) {
      const t0 = performance.now();
      while (i < Math.min(staticList.length, capStatic) && performance.now() - t0 < CHUNK()) {
        const m = staticList[i++].mesh;
        try {
          const eg = new THREE.EdgesGeometry(m.geometry, 13); /* 13°: auch glatte Hauben bekommen Konturen */
          eg.applyMatrix4(m.matrixWorld);
          const arr = eg.attributes.position.array;
          vertTotal += arr.length / 3;
          chunks.push(arr);
          cChunks.push(edgeColors(arr, null)); /* Weltkoordinaten → Verlauf direkt baken */
          eg.dispose();
        } catch (e) {}
        if (vertTotal > VERT_CAP) break;
      }
      if (!document.hidden) visElapsed += performance.now() - t0;
      setProgress(.8 + .16 * (i / totalN));
      if (vertTotal > VERT_CAP || visElapsed > EDGE_TIME_BUDGET) {
        budgetHit = true;
        console.warn(`[hero] Kanten-Budget in Phase 1 erreicht — ${i}/${staticList.length} statische Meshes, ${Math.round(vertTotal / 1000)}k Verts.`);
        break;
      }
      await yieldFrame();
    }
    await yieldFrame(); /* Merge (≈2 Mio Verts kopieren + GPU-Upload) bekommt einen eigenen Frame (07.07.) */
    if (chunks.length) {
      const all = new Float32Array(chunks.reduce((s, a) => s + a.length, 0));
      let off = 0;
      chunks.forEach(a => { all.set(a, off); off += a.length; });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(all, 3));
      const allC = new Uint8Array(all.length);
      let cOff = 0;
      cChunks.forEach(a => { allC.set(a, cOff); cOff += a.length; });
      g.setAttribute("color", new THREE.BufferAttribute(allC, 3, true)); /* normalized Uint8 */
      const merged = new THREE.LineSegments(g, wireLine);
      merged.matrixAutoUpdate = false;
      merged.frustumCulled = false;
      merged.raycast = () => {};
      scene.add(merged);
      edgeLines.push(merged);
    }

    /* Phase 2: Kanten-Kinder für bewegte Meshes */
    let j = 0;
    while (j < Math.min(dynList.length, capDyn) && !budgetHit) {
      const t0 = performance.now();
      while (j < Math.min(dynList.length, capDyn) && performance.now() - t0 < CHUNK()) {
        const m = dynList[j++].mesh;
        try {
          const eg2 = new THREE.EdgesGeometry(m.geometry, 13);
          /* Farben aus der Freeze-Weltposition (T = 17,30 ist beim Bau aktiv) — bewegte Teile
             behalten ihre gebakte Farbe (gewollt, kein raumfester Verlauf) */
          eg2.setAttribute("color", new THREE.BufferAttribute(edgeColors(eg2.attributes.position.array, m.matrixWorld), 3, true));
          const ls = new THREE.LineSegments(eg2, wireLine);
          ls.matrixAutoUpdate = false;
          ls.raycast = () => {};
          m.add(ls);
          edgeLines.push(ls);
        } catch (e) {}
      }
      if (!document.hidden) visElapsed += performance.now() - t0;
      setProgress(.8 + .16 * ((i + j) / totalN));
      if (visElapsed > EDGE_TIME_BUDGET) {
        console.warn(`[hero] Kanten-Budget in Phase 2 erreicht — ${j}/${dynList.length} dynamische Meshes.`);
        break;
      }
      await yieldFrame();
    }
    console.log(`[hero] Kanten: ${chunks.length}/${staticList.length} statisch (gemergt, ${Math.round(vertTotal / 1000)}k Verts, 1 Draw Call) + ${j}/${dynList.length} dynamisch (folgen Animation) · CD-Verlauf als Vertex-Farben gebaked (Uint8).`);

    /* Shader-Warm-up (07.07.): beide GL-Kontexte VOR dem ersten sichtbaren Frame kompilieren
       (compileAsync nutzt KHR_parallel_shader_compile) — sonst friert die erste Messung/der
       erste Bake auf schwachen iGPUs genau den „SYSTEM BEREIT"-Moment ein. */
    setProgress(.97);
    try {
      if (rReal.compileAsync) await rReal.compileAsync(scene, cam); /* Original-Materialien sind montiert */
      setWireLook();
      if (rWire.compileAsync) await rWire.compileAsync(scene, cam);
      setRealLook();
    } catch (e) { console.warn("[hero] Shader-Warm-up übersprungen:", e); }
    await yieldFrame();

    /* Erster Bake + Startpose — Reihenfolge: erst Offset berechnen und setzen
       (resize → computeHeroShift + applyViewOffset), DANN der Runtime-Bake.
       07.07.: Messung (GPU-Readback), Bake und erster Wire-Frame durch yieldFrame()
       getrennt — sie teilen sich nicht mehr EINEN Frame. */
    annBox = box.clone(); /* robuste Cluster-Box → Rechtsbündig-Framing + Bemaßung */
    resize(false);
    setProgress(.98);
    await yieldFrame();
    bake();
    setProgress(.99);
    await yieldFrame();
    setWireLook();
    setSim(15.5);
    cam.position.copy(P0); camT.copy(T0); cam.lookAt(T0);
    rWire.render(scene, cam);
    setProgress(1);
    buildPoses();
    projectAnnotations(); /* Bemaßung/Daten-Knoten aus der robusten Cluster-Box */
  }

  function buildEnv(c, D) {
    /* Digitale Welt: Bodenraster, Deckenraster, Datenpartikel */
    const gr = new THREE.GridHelper(dist * 3.4, 96, 0xCBE7F0, 0xE2F1F6);
    gr.position.y = minY; gr.material.transparent = true; gr.material.opacity = .9;
    envWire.add(gr);
    roofs = [1.6, 1.13, .69].map(k => {
      const g = new THREE.GridHelper(dist * 4.3, 27, 0xBFE3F0, 0xDDF0F6);
      g.position.y = minY + dist * k;
      g.material.transparent = true; g.material.opacity = 0;
      envWire.add(g); return g;
    });
    pN = gpuSoft ? 140 : (isTouch ? 260 : (weakFx ? 340 : 600));
    pArr = new Float32Array(pN * 3);
    pTop = minY + dist * 2.2; pBot = minY + dist * .12;
    for (let i = 0; i < pN; i++) {
      pArr[i * 3] = c.x + (Math.random() - .5) * dist * 2.7;
      pArr[i * 3 + 1] = pBot + Math.random() * (pTop - pBot);
      pArr[i * 3 + 2] = c.z + (Math.random() - .5) * dist * 2.7;
    }
    pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pArr, 3));
    pMat = new THREE.PointsMaterial({ color: 0x3BAED1, size: dist * .0036, transparent: true, opacity: .22, depthWrite: false });
    envWire.add(new THREE.Points(pGeo, pMat));

    /* Reale Welt: Studio-Boden + feines Raster + Licht (§4) */
    /* Bodenfüllung: unbeleuchtet + ohne Tonemapping → trifft #F8F8F8 exakt (Kundenwunsch 02.07.);
       MeshStandard wurde durch Licht + ACES dunkler gerendert */
    const fl = new THREE.Mesh(
      new THREE.PlaneGeometry(dist * 5, dist * 5),
      new THREE.MeshBasicMaterial({ color: 0xF8F8F8, toneMapped: false }));
    fl.rotation.x = -Math.PI / 2; fl.position.y = minY - .001;
    envReal.add(fl);
    /* Kontaktschatten: sehr dezente radiale Verlaufs-Plane unter der Anlage (kein Shadow-Mapping) */
    const shC = document.createElement("canvas"); shC.width = shC.height = 256;
    const shX = shC.getContext("2d");
    const shG = shX.createRadialGradient(128, 128, 0, 128, 128, 128);
    shG.addColorStop(0, "rgba(16,38,46,.12)"); shG.addColorStop(.55, "rgba(16,38,46,.045)"); shG.addColorStop(1, "rgba(16,38,46,0)"); /* Blueprint-Wert ~.12 (Abnahme 03.07.) */
    shX.fillStyle = shG; shX.fillRect(0, 0, 256, 256);
    const shTex = new THREE.CanvasTexture(shC); shTex.colorSpace = THREE.SRGBColorSpace;
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(D * 2.3, D * 2.3),
      new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, toneMapped: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(c.x, minY + .005, c.z);
    envReal.add(sh);
    const gr2 = new THREE.GridHelper(dist * 3.4, 42, 0xA9D8E7, 0xD6EDF5); /* blasses machineering-Blau, Zeichnungs-Anmutung (Kundenwunsch 02.07.) */
    gr2.position.y = minY + .01; /* Raster über Boden + Kontaktschatten (Linienfarben unverändert) */
    gr2.material.transparent = true; gr2.material.opacity = .9;
    envReal.add(gr2);
    envReal.add(new THREE.HemisphereLight(0xFFFFFF, 0xE8EEF1, 1.05));
    const key = new THREE.DirectionalLight(0xFFFFFF, .95); key.position.set(6, 10, 4);
    envReal.add(key);
    const fill = new THREE.DirectionalLight(0xCFE9F4, .35); fill.position.set(-6, 4, -6);
    envReal.add(fill);
  }

  /* ---------- Maskensteuerung ---------- */
  const mask = { x: innerWidth / 2, y: innerHeight / 2, r: 0, tx: innerWidth / 2, ty: innerHeight / 2, tr: 0, mult: 1 };
  const tap = { active: false, x: 0, y: 0, r: 0 };
  const baseRadius = () => Math.min(143, innerWidth * .128); /* 08.07.: Linse ~25 % kleiner (vorher 190 / .17) */
  function setMask(x, y, r) {
    if (CLIP_EVENODD) { /* 08.07. (1c): Loch-Cluster in Bildmarken-Form, kantenscharf */
      let d = `M0 0H${innerWidth}V${innerHeight}H0Z`;
      if (r > 0) for (const q of lensRectsPx(x, y, r)) d += rectPath(q);
      const cp = `path(evenodd, "${d}")`;
      cvW.style.clipPath = cp;
      ann.style.clipPath = cp; /* Zeichnungs-Overlays weichen der Reality-Lens */
    } else { /* Fallback: Kreis, Radius deckt den Cluster ab */
      const s = `radial-gradient(circle ${Math.max(0, r * 1.12)}px at ${x}px ${y}px,transparent 0 62%,rgba(0,0,0,.45) 80%,#000 96%)`;
      cvW.style.webkitMaskImage = s; cvW.style.maskImage = s;
      ann.style.webkitMaskImage = s; ann.style.maskImage = s;
    }
  }
  function ping(x, y) {
    if (reduced) return;
    console.log(`[hero] ping @ ${Math.round(x)},${Math.round(y)}`);
    const d = document.createElement("div");
    Object.assign(d.style, {
      position: "absolute", left: x + "px", top: y + "px", width: "24px", height: "24px",
      border: "1.5px solid #3BAED1", borderRadius: "0", transform: "translate(-50%,-50%)", /* 08.07.: Ping quadratisch (Bildmarke) */
      opacity: ".85", animation: "iphPing 1.4s cubic-bezier(.2,.6,.3,1) forwards", pointerEvents: "none"
    });
    rings.appendChild(d);
    setTimeout(() => d.remove(), 1500);
  }

  /* ================= Zeichnungsblatt-Detailgrad (03.07.) =================
     Element 1 Bemaßungs-Annotationen · Element 2 Passermarken · Element 3
     Daten-Knoten. Digitale Ebene über dem Wireframe-Canvas (z2):
     pointer-events none, erhält in setMask() dieselbe Linsen-Maske wie cvW
     (in der Linse zählt die Realität) und blendet beim Materialize mit
     Opacity × (1−p) aus. Kamera nach Settle statisch → Anker werden EINMAL
     projiziert; bei Resize projiziert projectAnnotations() neu. */
  const DIM_STROKE = "rgba(59,174,209,.55)", LBL_COL = "#6B7E86";
  const SVGNS = "http://www.w3.org/2000/svg";
  const ann = document.createElement("div");
  Object.assign(ann.style, { position: "absolute", inset: "0", zIndex: "2", pointerEvents: "none", overflow: "hidden" });
  stage.insertBefore(ann, rings);
  const annSvg = document.createElementNS(SVGNS, "svg");
  Object.assign(annSvg.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
  ann.appendChild(annSvg);
  const annDom = document.createElement("div");
  Object.assign(annDom.style, { position: "absolute", inset: "0" });
  ann.appendChild(annDom);

  /* Element 2 — Passermarken: Rahmen-Ecken der Zeichnungsfläche zwischen
     Header (78 px) und Schriftfeld (barH) — berühren Logo/Skip/Leiste nicht. */
  const cornerEls = [0, 1, 2, 3].map(i => {
    const d = document.createElement("div");
    Object.assign(d.style, {
      position: "absolute", width: "18px", height: "18px", boxSizing: "border-box",
      opacity: "0", transition: reduced ? "none" : "opacity .7s ease .25s"
    });
    const b = "1px solid #D6E7EE";
    if (i < 2) d.style.borderTop = b; else d.style.borderBottom = b;
    if (i % 2 === 0) d.style.borderLeft = b; else d.style.borderRight = b;
    ann.appendChild(d);
    return d;
  });
  function layoutCorners() {
    const side = Math.round(clamp(innerWidth * .04, 16, 32)) + "px";
    const top = (78 + 13) + "px", bot = (barH + 13) + "px";
    cornerEls[0].style.top = top; cornerEls[0].style.left = side;
    cornerEls[1].style.top = top; cornerEls[1].style.right = side;
    cornerEls[2].style.bottom = bot; cornerEls[2].style.left = side;
    cornerEls[3].style.bottom = bot; cornerEls[3].style.right = side;
  }

  let annBox = null, annRevealed = false, annFades = [], annDashes = [];
  const fmtMM = m => (Math.round(m * 100) * 10).toLocaleString("de-DE"); /* 4,83 m → „4.830" */
  const svgEl = (n, at) => { const el = document.createElementNS(SVGNS, n); for (const k in at) el.setAttribute(k, at[k]); return el; };
  function annFade(el, delay) {
    if (reduced || annRevealed) { el.style.opacity = "1"; return; }
    el.style.opacity = "0";
    el.style.transition = `opacity .5s ease ${delay}s`;
    annFades.push(el);
  }
  function annDash(line, len, delay) {
    if (reduced || annRevealed) return;
    line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
    line.style.transition = `stroke-dashoffset .6s cubic-bezier(.3,0,.2,1) ${delay}s`;
    annDashes.push(line);
  }
  function annLabel(x, y, lines, anchor) { /* anchor: "c" mittig · "l" linksbündig · "r" rechtsbündig */
    const d = document.createElement("div");
    Object.assign(d.style, {
      position: "absolute", left: x + "px", top: y + "px",
      transform: anchor === "l" ? "translate(0,-50%)" : anchor === "r" ? "translate(-100%,-50%)" : "translate(-50%,-50%)",
      fontWeight: "600", fontSize: "clamp(9.5px, 0.62vw, 13px)", letterSpacing: ".2em", textTransform: "uppercase",
      color: LBL_COL, lineHeight: "1.55", whiteSpace: "nowrap",
      textAlign: anchor === "l" ? "left" : anchor === "r" ? "right" : "center"
    });
    d.innerHTML = lines.map((t, i) => i ? `<div style="font-size:clamp(8.5px, 0.55vw, 11.5px);opacity:.8">${t}</div>` : `<div>${t}</div>`).join("");
    annDom.appendChild(d);
    return d;
  }
  function projectAnnotations() {
    if (!annBox) return;
    const w = innerWidth, h = innerHeight;
    annSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    while (annSvg.firstChild) annSvg.removeChild(annSvg.firstChild);
    annDom.innerHTML = "";
    annFades = []; annDashes = [];
    layoutCorners();
    const pc = cam.clone();
    pc.aspect = w / h; pc.updateProjectionMatrix();
    /* Anker mit dem Hero-Framing projizieren (mult 1, berechneter Offset) —
       unabhängig vom aktuellen Kamera-Zustand (z. B. Resize während der Tour) */
    if (Math.abs(heroShiftPx) > .5) pc.setViewOffset(w, h, -heroShiftPx, 0, w, h); else pc.clearViewOffset();
    pc.position.copy(P1); pc.lookAt(T1); pc.updateMatrixWorld(true);
    const pr = v => { const p = v.clone().project(pc); return { x: (p.x * .5 + .5) * w, y: (1 - (p.y * .5 + .5)) * h }; };
    /* Schutzzonen: linkes Drittel frei · Header/Leiste frei · Headline-Block
       glyphgenau ausgespart (x aus Range-Rects, y aus dem stabilen Block-Rect) */
    let uiRect = null;
    try {
      const xs = [kickerEl, h1l1, h1l2, subIn].filter(Boolean).map(el => {
        const r = document.createRange(); r.selectNodeContents(el);
        return r.getBoundingClientRect();
      }).filter(r => r.width > 0);
      const hu = heroUI.getBoundingClientRect();
      if (xs.length && hu.height) uiRect = {
        l: Math.min.apply(null, xs.map(r => r.left)) - 14, r: Math.max.apply(null, xs.map(r => r.right)) + 14,
        t: hu.top - 10, b: hu.bottom + 10
      };
    } catch (e) {}
    const inUi = p => uiRect && p.x >= uiRect.l && p.x <= uiRect.r && p.y >= uiRect.t && p.y <= uiRect.b;
    const inZone = (p, m, mb) => p.x >= w * .34 && p.x <= w - (m || 10) && p.y >= 76 && p.y <= h - barH - (mb === undefined ? 26 : mb) && !inUi(p);
    const bx = annBox, mn = bx.min, mx = bx.max;
    const size = bx.getSize(new THREE.Vector3());
    const cc = bx.getCenter(new THREE.Vector3());
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    /* Element 1 — Maßlinien (DIN-Anmutung: Hilfslinien mit Absatz, Pfeilspitzen) */
    const extLine = (g, from, to) => {
      const dx = to.x - from.x, dy = to.y - from.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      g.appendChild(svgEl("line", { x1: from.x + ux * 3, y1: from.y + uy * 3, x2: to.x + ux * 5, y2: to.y + uy * 5, stroke: DIM_STROKE, "stroke-width": "1" }));
    };
    const arrowHead = (g, tip, toward) => {
      let dx = toward.x - tip.x, dy = toward.y - tip.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      [[dy, -dx], [-dy, dx]].forEach(([nx, ny]) => {
        g.appendChild(svgEl("line", { x1: tip.x, y1: tip.y, x2: tip.x + (dx + nx * .3) * 7, y2: tip.y + (dy + ny * .3) * 7, stroke: DIM_STROKE, "stroke-width": "1" }));
      });
    };
    const dim = (Aw, Bw, O, off, labelLines, delay) => {
      const a = pr(Aw), b = pr(Bw), a2 = pr(Aw.clone().addScaledVector(O, off)), b2 = pr(Bw.clone().addScaledVector(O, off));
      /* Label senkrecht zur Maßlinie versetzt — weg vom Anlagen-Zentrum */
      const c0 = pr(cc);
      const mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
      let px = -(b2.y - a2.y), py = b2.x - a2.x; const pl = Math.hypot(px, py) || 1; px /= pl; py /= pl;
      if ((mid.x - c0.x) * px + (mid.y - c0.y) * py < 0) { px = -px; py = -py; }
      const lp = { x: mid.x + px * 16, y: mid.y + py * 16 };
      /* Nach dem HERO_SHIFT liegen die freien Zonen über/links der Anlage:
         LINIEN dürfen (außerhalb der Glyphen) ins linke Drittel ragen —
         LESBARES (Labels) bleibt strikt rechts der Text-Schutzzone. */
      const okLine = p => p.x >= Math.max(24, w * .06) && p.x <= w - 24 && p.y >= 76 && p.y <= h - barH - 2 && !inUi(p);
      if (![a, b, a2, b2].every(okLine) || !inZone(lp, 52, 30)) {
        console.log(`[ann] Maßlinie ${labelLines[0]} unterdrückt (Schutzzone) — Linie ${[a, b, a2, b2].map(p => Math.round(p.x) + "," + Math.round(p.y)).join(" ")} · Label ${Math.round(lp.x)},${Math.round(lp.y)}`);
        return;
      }
      console.log(`[ann] Maßlinie ${labelLines[0]} @ ${Math.round(mid.x)},${Math.round(mid.y)}`);
      const g = svgEl("g", {});
      annFade(g, delay);
      annSvg.appendChild(g);
      extLine(g, a, a2); extLine(g, b, b2);
      const line = svgEl("line", { x1: a2.x, y1: a2.y, x2: b2.x, y2: b2.y, stroke: DIM_STROKE, "stroke-width": "1" });
      annDash(line, Math.hypot(b2.x - a2.x, b2.y - a2.y), delay + .06);
      g.appendChild(line);
      arrowHead(g, a2, b2); arrowHead(g, b2, a2);
      annFade(annLabel(lp.x, lp.y, labelLines, "c"), delay + .38);
    };
    /* Zellenmaße: Maßlinien/Anker aus der robusten Cluster-Box — die MASSZAHLEN sind seit B6
       (09.07.) auf die abgenommenen v1-Werte gepinnt: das v2-Repack (Simplify) verschiebt die
       Cluster-Box um wenige mm (5.494 → Label wäre „5.490“), die Typenschild-Maße der Anlage
       ändern sich dadurch natürlich nicht. Drift-Wächter warnt ab 25 mm (falsches Asset).
       Nach dem HERO_SHIFT sitzt die Bemaßung auf den OBERKANTEN (rechts der
       Anlage ist kein Platz mehr); Höhe erscheint nur, wenn rechts Raum ist. */
    const DIM_LOCK = { x: "4.830", y: "1.930", z: "5.500" };
    {
      const drift = Math.max(Math.abs(size.x - 4.83), Math.abs(size.y - 1.93), Math.abs(size.z - 5.5));
      if (drift > .025) console.warn("[ann] Bemaßungs-Drift " + (drift * 1000).toFixed(0) + " mm gegen Typenschild — Asset prüfen (Box " + [size.x, size.y, size.z].map(v => v.toFixed(3)).join(" × ") + " m; gemessen wäre " + [fmtMM(size.x), fmtMM(size.y), fmtMM(size.z)].join(" × ") + ")");
    }
    dim(V(mn.x, mx.y, mx.z), V(mx.x, mx.y, mx.z), V(0, 1, 0), .55, [DIM_LOCK.x], .85);            /* Breite, vordere Oberkante */
    dim(V(mn.x, mx.y, mn.z), V(mn.x, mx.y, mx.z), V(0, 1, 0), .55, [DIM_LOCK.z], 1.0);            /* Tiefe, linke Oberkante */
    dim(V(mx.x, mn.y, mn.z), V(mx.x, mx.y, mn.z), V(1, 0, 0), .3, [DIM_LOCK.y, "Z-ACHSE"], 1.15); /* Höhe, hintere rechte Kante */

    /* Callout „ZELLE 01" mit Fahnenlinie — nach oben links, weg vom Tiefen-Maß */
    (() => {
      const p0 = pr(V(cc.x - size.x * .10, mx.y - size.y * .05, cc.z + size.z * .30));
      const e = { x: p0.x - 30, y: p0.y - 26 }, e2 = { x: e.x - 16, y: e.y };
      if (!inZone(p0, 10) || !inZone({ x: e2.x - 84, y: e2.y }, 10)) { console.log("[ann] Callout ZELLE 01 unterdrückt"); return; }
      const g = svgEl("g", {});
      annFade(g, 1.3);
      annSvg.appendChild(g);
      g.appendChild(svgEl("circle", { cx: p0.x, cy: p0.y, r: 2, fill: "#3BAED1" }));
      const l1 = svgEl("line", { x1: p0.x, y1: p0.y, x2: e.x, y2: e.y, stroke: DIM_STROKE, "stroke-width": "1" });
      const l2 = svgEl("line", { x1: e.x, y1: e.y, x2: e2.x, y2: e2.y, stroke: DIM_STROKE, "stroke-width": "1" });
      annDash(l1, Math.hypot(e.x - p0.x, e.y - p0.y), 1.36); annDash(l2, 16, 1.5);
      g.append(l1, l2);
      annFade(annLabel(e2.x - 7, e2.y, ["ZELLE 01"], "r"), 1.62);
    })();

    /* Element 3 — Daten-Knoten: Anker als Box-Fraktionen (fx/fz relativ zum
       Zentrum, fy ab Boden). pointer-events bleibt none — Lens ungestört. */
    const NODES = [
      { f: [-.16, .80, -.12], lbl: "ACHSE 3" }, /* Robotergelenk */
      { f: [.10, 1.0, .00], lbl: null },        /* Sensor-/Kamerakopf am Mast */
      { f: [.50, .20, .36], lbl: "OPC UA" },    /* Steuerung */
      { f: [.52, .14, .20], lbl: null },        /* Förderband vorn rechts */
      { f: [.24, .60, -.30], lbl: null }        /* Portal hinten */
    ];
    let nodeCount = 0;
    NODES.forEach((n, i) => {
      const p = pr(V(cc.x + size.x * n.f[0], mn.y + size.y * n.f[1], cc.z + size.z * n.f[2]));
      if (!inZone(p, n.lbl ? 96 : 12)) { console.log(`[ann] Knoten ${i + 1}${n.lbl ? " (" + n.lbl + ")" : ""} unterdrückt @ ${Math.round(p.x)},${Math.round(p.y)}`); return; }
      nodeCount++;
      const o = document.createElement("div");
      Object.assign(o.style, { position: "absolute", left: p.x + "px", top: p.y + "px", width: "7px", height: "7px", transform: "translate(-50%,-50%)" });
      const dot = document.createElement("div");
      Object.assign(dot.style, {
        position: "absolute", inset: "0", borderRadius: "50%", background: GRAD,
        boxShadow: "0 0 0 2px rgba(251,253,254,.85), 0 0 10px rgba(59,174,209,.45)"
      });
      if (!reduced) dot.style.animation = `iphNodePulse 2.2s ease-in-out ${(i * .37).toFixed(2)}s infinite`;
      o.appendChild(dot);
      if (n.lbl) {
        const l = document.createElement("div");
        Object.assign(l.style, {
          position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)",
          fontWeight: "600", fontSize: "clamp(9.5px, 0.62vw, 13px)", letterSpacing: ".2em", textTransform: "uppercase",
          color: LBL_COL, whiteSpace: "nowrap"
        });
        l.textContent = n.lbl;
        o.appendChild(l);
      }
      annFade(o, 1.05 + i * .09);
      annDom.appendChild(o);
    });
    console.log(`[ann] projiziert: ${annSvg.childNodes.length} Linien-Gruppen · ${nodeCount} Daten-Knoten · Box ${fmtMM(size.x)} × ${fmtMM(size.y)} × ${fmtMM(size.z)} mm @ ${w}×${h}`);
  }
  function revealAnnotations() { /* mit der Text-Choreografie im Live-Zustand */
    if (annRevealed) return; annRevealed = true;
    cornerEls.forEach(d => { d.style.opacity = "1"; });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      annFades.forEach(el => { el.style.opacity = "1"; });
      annDashes.forEach(l => { l.style.strokeDashoffset = "0"; });
      annFades = []; annDashes = [];
    }));
  }

  /* ---------- Zustandsmaschine ---------- */
  let state = "boot", tState = 0;
  const DUR = { descent: reduced ? .35 : (revisit ? 1.0 : 2.6), settle: .35, sweep: reduced ? .05 : .9 };
  let scrollP = 0, sMat = 0, moved = false, barNoTrans = false, userTookOver = false;
  const perf = () => performance.now() / 1000;

  function showHUD() { /* idempotent — wird im Loop je Frame angewandt, da ein React-Re-Render Inline-Styles zurücksetzen kann */
    if (kickerEl.style.opacity !== "1") { kickerEl.style.opacity = "1"; }
    if (kickerEl.style.transform !== "translateY(0px)") { kickerEl.style.transform = "translateY(0px)"; }
    [h1l1, h1l2, subIn].forEach(el => { if (el.style.transform !== "translateY(0px)") el.style.transform = "translateY(0px)"; });
    if (camRead.style.opacity !== "1") camRead.style.opacity = "1";
    if (hintDismissed) { if (hint.style.opacity !== "0") hint.style.opacity = "0"; }
    else if (hint.style.opacity !== "1") hint.style.opacity = "1";
  }
  function setState(s) {
    state = s; tState = perf();
    govGraceUntil = performance.now() + 1800; /* Governor: Einschwingphase nach jedem State-Wechsel nicht werten */
    console.log(`[hero] state → ${s} @ sim ${simTime.toFixed(2)}`);
    if (s === "descent" || s === "video") skipBtn.style.display = "block"; /* Skip gilt auch während des Videos (v8 §C) */
    if (s === "sweep" || s === "live") skipBtn.style.display = "none";
    if (s === "live") {
      if (needRealBake) { rReal.setPixelRatio(effDPR()); bake(); needRealBake = false; } /* Governor-Step aus dem Flug: Real-Canvas vor der Linsen-Einblendung neu baken */
      liveDirty = 10; /* ein paar Frames zeichnen, danach ist Live im reduzierten Profil GL-statisch */
      showHUD();
      revealAnnotations();
      lensEl.style.opacity = "1"; lensScan.style.opacity = "1"; lensDot.style.opacity = "1"; /* 13.07.: Linse auch auf Touch sichtbar (Finger-Steuerung) */
      sessionStorage.setItem("iph_hero_v4_seen", "1");
      if (vid) { videoActive = false; videoOff(); } /* Sicherheitsnetz: Video-Element darf Live nie überleben */
      if (vWhite && vWhite.isConnected) vWhite.remove(); /* Übergabe-Overlay aufräumen (Skip-/Nicht-Video-Pfad) */
    }
  }

  /* ---------- Render-Governor (08.07.) ----------
     Misst ECHTE Frame-Abstände (nur Frames, in denen WebGL wirklich gezeichnet hat) und senkt
     bei anhaltendem Ruckeln die Renderauflösung stufenweise (DPR_STEPS). Greift überall dort,
     wo Heuristik + GPU-Probe versagen — der eine Rechner, auf dem es trotzdem holpert. */
  let liveDirty = 0, needRealBake = false, tourLow = false;
  let govN = 0, govSlow = 0, govCool = 0, govBad = 0, govStepN = 0, govGraceUntil = 0;
  function setTourLow(low) { /* Tour-Scrub mit 1x rendern (Coasting) — in Bewegung unsichtbar */
    if (tourLow === low || (low && effDPR() <= 1.01)) return;
    tourLow = low;
    rReal.setPixelRatio(low ? 1 : effDPR());
    lastTourKey = ""; /* nächster renderTour-Frame malt sicher neu */
  }
  function stepDownDPR(src) {
    if (dprIx >= DPR_STEPS.length - 1) return false;
    dprIx++; govStepN++;
    rWire.setPixelRatio(effDPR());
    /* Stufe 1 senkt NUR die Auflösung; erst eine ZWEITE Governor-Stufe schaltet das Sparprofil
       (Ambient-Freeze, Live-statisch, Tour-Coasting) — einmalige Congestion degradiert so nie
       dauerhaft die Effekte (08.07., Verifier-Befund). */
    if (govStepN >= 2 && !weakFx) { weakFx = true; console.log("[hero] Perf-Profil reduziert (Governor, 2. Stufe)"); }
    if (handover) { if (!tourLow) { rReal.setPixelRatio(effDPR()); lastTourKey = ""; renderTour(); } }
    else if (state === "live") { rReal.setPixelRatio(effDPR()); bake(); }
    else needRealBake = true; /* im Flug: Real-Canvas erst vor der Linsen-Einblendung neu baken */
    liveDirty = Math.max(liveDirty, 3);
    console.log("[hero] Render-Governor: Ruckeln gemessen (" + src + ") → Renderauflösung " + effDPR().toFixed(2) + "x");
    return true;
  }
  function govSample(raw, src) {
    if (document.hidden) return;
    if (performance.now() < govGraceUntil) { govN = 0; govSlow = 0; return; } /* Gnadenfrist nach State-Wechsel/Tab-Rückkehr: Post-Intro-Settling (Annotations, Pings, Hydration) nicht werten */
    if (govCool > 0) { govCool--; return; }
    if (raw > .25) return; /* Tab-Rückkehr/GC-Ausreißer nicht werten */
    govN++; if (raw > .034) govSlow++; /* unter ~29 fps gilt als ruckelig */
    if (govN >= 40) {
      if (govSlow / govN > .5) {
        govBad++; /* erst ZWEI schlechte Fenster in Folge steppen — ein gutes Fenster resettet */
        if (govBad >= 2 && stepDownDPR(src)) { govBad = 0; govCool = 30; }
      } else govBad = 0;
      govN = 0; govSlow = 0;
    }
  }

  /* ---------- Hauptschleife ---------- */
  let last = perf(), rafId = null;
  function startLoop() { if (!rafId) { last = perf(); loop(); } }
  function loop() {
    rafId = requestAnimationFrame(loop);
    const now = perf(), rawDt = now - last, dt = Math.min(.05, rawDt); last = now;
    const t = now - tState;

    if (state === "descent") {
      const k = clamp(t / DUR.descent, 0, 1), e = easeInOutC(k);
      cam.position.lerpVectors(P0, P1, e);
      cam.position.x += Math.sin(e * Math.PI) * sideAmp;
      camT.lerpVectors(T0, T1, easeOutC(k));
      cam.lookAt(camT);
      roofs.forEach(g => { g.material.opacity = clamp((cam.position.y - (g.position.y + dist * .05)) / (dist * .24), 0, .4); });
      for (let i = 0; i < pN; i++) { pArr[i * 3 + 1] -= dist * .04 * dt; if (pArr[i * 3 + 1] < pBot) pArr[i * 3 + 1] += (pTop - pBot); }
      pGeo.attributes.position.needsUpdate = true;
      setSim(15.5 + e * 1.8);                    /* Sim-Fenster 15,5 → 17,30 */
      if (k >= 1) setState("settle");
    }
    else if (state === "settle") {
      const k = easeOutC(clamp(t / DUR.settle, 0, 1));
      cam.position.copy(P1); cam.lookAt(T1);     /* Kamera ab hier statisch */
      setSim(17.30);                             /* Freeze exakt T = 17,30 */
      if (k >= 1) {
        roofs.forEach(g => { g.material.opacity = 0; });
        setState(reduced ? "live" : "sweep");
        if (reduced) {
          mask.x = mask.tx = innerWidth * .75; mask.y = mask.ty = innerHeight * .46;
          mask.r = mask.tr = isTouch ? 0 : baseRadius();
        }
      }
    }
    else if (state === "sweep") {
      /* Einfahrt von links → Stopp Bildschirmmitte (§0) */
      const k = clamp(t / DUR.sweep, 0, 1), e = easeOutC(k);
      const x = lerp(1.12, .75, e) * innerWidth, y = innerHeight * .46; /* 08.07.: Sweep von rechts, Ruheposition rechts der Mitte (75 %) */
      mask.x = mask.tx = x; mask.y = mask.ty = y;
      mask.r = mask.tr = baseRadius() * (.6 + .4 * e);
      if (k >= 1) {
        ping(innerWidth * .75, innerHeight * .46);
        setTimeout(() => ping(innerWidth * .75, innerHeight * .46), 170); /* Doppel-Ping, Versatz 170 ms */
        mask.tx = innerWidth * .75; mask.ty = innerHeight * .46; mask.tr = baseRadius();
        setState("live");
      }
    }
    else if (state === "live") {
      showHUD();
      if (isTouch && !tap.active && !userTookOver) {
        /* Mobile-Onboarding (§0): ruhige Auto-Drift + Radius-Breathing als Hinweis „bewegbar".
           Stoppt dauerhaft, sobald der Nutzer die Linse erstmals selbst zieht (userTookOver). */
        mask.tx = innerWidth * (.75 + Math.sin(now * .25) * .05);
        mask.ty = innerHeight * .44;
        mask.tr = (baseRadius() * .8) + Math.sin(now * 1.2) * 8;
      }
      if (weakFx) { wireLine.opacity = .86; } /* reduziertes Profil: Ambient eingefroren → Live-Zustand GL-statisch (s. Render-Entscheid unten) */
      else {
        wireLine.opacity = .82 + .08 * Math.sin(now * 1.7);
        if (pGeo) {
          for (let i = 0; i < pN; i++) { pArr[i * 3 + 1] -= dist * .005 * dt; if (pArr[i * 3 + 1] < pBot) pArr[i * 3 + 1] += (pTop - pBot); }
          pGeo.attributes.position.needsUpdate = true;
        }
      }
    }

    /* Cursor-Lerp 0,12 */
    mask.x = lerp(mask.x, mask.tx, .12); mask.y = lerp(mask.y, mask.ty, .12);
    mask.r = lerp(mask.r, mask.tr, .12);
    let mx = mask.x, my = mask.y, mr = mask.r;
    if (tap.active) { mx = tap.x; my = tap.y; mr = tap.r; }
    mr *= mask.mult;
    setMask(mx, my, mr);
    const tf = `translate(${mx}px,${my}px) scale(${(mr * 2) / 380})`;
    lensEl.style.transform = tf; lensScan.style.transform = tf;
    lensDot.style.transform = `translate(${mx}px,${my}px)`;
    if (!isTouch) updateH1Lens(mx, my, mr); /* Headline-Linse bleibt Desktop-only */

    /* Materialize (Scroll 0→1, §6) — gedämpft nachgeführt für geschmeidiges Scrollen;
       Zeitkonstante statt Fix-Faktor (06.07.): ≈ .085/Frame @ 60 Hz (vorher .10), auf
       120-Hz-Displays identisches Nachlauf-Gefühl — weicher trotz 30 % kürzerer Strecke */
    sMat += (scrollP - sMat) * (1 - Math.exp(-dt * 5.3));
    if (Math.abs(scrollP - sMat) < .0006) sMat = scrollP;
    const sp = easeInOutC(sMat);
    cvW.style.opacity = (1 - sp).toFixed(3);
    ann.style.opacity = (1 - sp).toFixed(3); /* Bemaßung/Passermarken/Knoten gehen mit dem Wireframe */
    mask.mult = 1 - sp;
    heroUI.style.opacity = (1 - sp * 1.2).toFixed(3);
    heroUI.style.transform = `translateY(${-sp * 44}px)`;
    if (pMat) pMat.opacity = .22 * (1 - sp);
    if (sp > 0 && !barNoTrans) { specbar.style.transition = "none"; barNoTrans = true; }
    if (barNoTrans) {
      specbar.style.opacity = Math.max(0, 1 - sp * 1.1).toFixed(3);
      specbar.style.transform = `translateY(${sp * 18}px)`;
    }
    if (state === "live") {
      const lo = (1 - sp * 1.4).toFixed(3);
      lensEl.style.opacity = lo; lensScan.style.opacity = lo; lensDot.style.opacity = lo;
    }

    /* Render-Entscheid (08.07.): Im reduzierten Profil ist der Live-Zustand GL-statisch — Kamera
       steht, Sim eingefroren, Ambient aus. Linse/Maske/Typo laufen als reines CSS mit vollen fps
       weiter; WebGL zeichnet nur bei Änderung (Materialize-Scroll, Resize, Zustandswechsel).
       Auf starken Geräten unverändert jeder Frame. */
    const liveStatic = weakFx && state === "live" && sMat === scrollP && liveDirty <= 0;
    if (liveDirty > 0) liveDirty--;
    if (sp < .999 && model && !liveStatic) {
      rWire.render(scene, cam); /* nach Materialize on-demand (§5) */
      govSample(rawDt, "Hero"); /* nur Frames mit echtem GL-Render füttern den Governor */
    }
  }

  /* ---------- Pixel-Dissolve-Maskenframes (§3) — nur noch Mini-Dissolve beim Andocken (Änd. 1: die große Zahl nutzt jetzt den Blueprint-Stack) ---------- */
  function makeDissolveFrames(cols, rows, cell, steps, pw) {
    const cv = document.createElement("canvas");
    cv.width = cols * cell; cv.height = rows * cell;
    const ctx = cv.getContext("2d");
    const order = [...Array(cols * rows).keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    const frames = [];
    for (let s = 0; s <= steps; s++) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = "#fff";
      const count = Math.round(Math.pow(s / steps, pw) * order.length);
      for (let k = 0; k < count; k++) {
        const idx = order[k];
        ctx.fillRect((idx % cols) * cell, ((idx / cols) | 0) * cell, cell, cell);
      }
      frames.push("url(" + cv.toDataURL() + ")");
    }
    return frames;
  }
  function setMaskFrame(el, url) { el.style.webkitMaskImage = url; el.style.maskImage = url; }
  function runFrames(el, frames, interval) {
    let i = 0;
    const iv = setInterval(() => {
      i++;
      if (i >= frames.length) {
        clearInterval(iv);
        el.style.webkitMaskImage = ""; el.style.maskImage = ""; /* Maske am Ende lösen */
        return;
      }
      setMaskFrame(el, frames[i]);
    }, interval);
    return iv;
  }

  /* ---------- Intro v4.1: KPI-Sequenz (§3) — „Blueprint-Stack" (Änd. 1+2, 06.07.) ----------
     Große Zahlen entstehen wie eine technische Zeichnung, Zeiten relativ zum KPI-Start:
       Stufe 1 (0–180 ms)   Konstruktionslinien (1 px Stroke rgba(59,174,209,.28), keine Füllung)
       Stufe 2 (ab 140 ms)  Kontur zieht auf (2 px rgba(59,174,209,.5)), Zeichen-Stagger 44 ms
       Stufe 3 (320–800 ms) Verlaufsfüllung per gerichtetem Scan links→rechts (Scanlinie mit Glow);
                            synchron zählt der Betrag 0 → Ziel (easeOutCubic, +6 % Überschwinger,
                            Rückfeder ~120 ms, Mikro-Punch beim Einrasten). tabular-nums: keine
                            Breiten-Sprünge; Ziffern nullgepolstert, Vorzeichen und „%" stehen fest.
     Dock-Flug, Mini-Dissolve im Schriftfeld und alle Sequenz-Timings bleiben unverändert. */
  const KPIS = [["+40 %", "ABSCHLUSSQUOTE IM VERTRIEB"], ["−50 %", "ENGINEERING-KOSTEN"],
                ["−75 %", "INBETRIEBNAHMEZEIT"]];
  const STAG = 36, EASE = "cubic-bezier(.22,.9,.3,1)"; /* Änd. 2 (06.07.): Stagger 44→36 (mehr Überlappung), weichere Kurve */
  const KFX = { s2: 140, s3: 320, scan: 480, spring: 180, punch: 140, over: 1.04 }; /* Änd. 2: Überschwinger +4 %, Rückfeder 180 ms */
  const NUM_TRANS = "opacity .35s ease-in,transform .35s ease-in,filter .35s ease-in";

  function buildKpi(val, label) {
    const k = document.createElement("div");
    Object.assign(k.style, {
      position: "absolute", inset: "0", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: "clamp(8px,2.4vh,26px)",
      pointerEvents: "none", padding: "0 4vw", textAlign: "center",
      transform: "translateY(-5vh)" /* KPI-Zahlen ~5 % höher (06.07.) — Dock-Flug misst live, bleibt exakt */
    });
    const num = document.createElement("div");
    Object.assign(num.style, {
      position: "relative", display: "inline-block", fontWeight: "700", lineHeight: ".94", /* eine Stufe unter Black — weniger fett (06.07.) */
      letterSpacing: "-.02em", fontSize: "clamp(2.925rem,13.5vw,10.6875rem)", whiteSpace: "nowrap", /* −25 % (06.07.) */
      fontVariantNumeric: "tabular-nums", /* Änd. 2: keine Breiten-Sprünge beim Zählen */
      transition: NUM_TRANS, willChange: "transform, opacity" /* Änd. 2: eigene Ebene — wird nach Sequenzende entfernt */
    });
    /* Stufe-1-Ebene (Änd. 1): Konstruktionslinien — hauchdünn, Fade 0–180 ms */
    const draft = document.createElement("span");
    Object.assign(draft.style, {
      position: "absolute", inset: "0", display: "block", whiteSpace: "nowrap",
      opacity: "0", transition: "opacity .18s ease-out", willChange: "opacity"
    });
    const outline = document.createElement("span");
    Object.assign(outline.style, { display: "block", whiteSpace: "nowrap" });
    /* Änd. 2 (06.07.): Reveal rein per transform — Clip-Fenster + Gegen-Shift, beides kompositiert;
       keine per-Frame-Masken mehr (kein Re-Rastern, keine Repaints der ganzen Zahl). Die harte
       Reveal-Kante liegt exakt unter der Scanlinie. */
    const fillClip = document.createElement("span");
    Object.assign(fillClip.style, {
      position: "absolute", inset: "0", display: "block", overflow: "hidden", willChange: "transform"
    });
    const fill = document.createElement("span");
    Object.assign(fill.style, {
      position: "absolute", inset: "0", display: "block", whiteSpace: "nowrap", willChange: "transform"
    });
    const chars = [...val], n = chars.length;
    const digitIdx = []; chars.forEach((c, i) => { if (c >= "0" && c <= "9") digitIdx.push(i); });
    const target = parseInt(chars.filter(c => c >= "0" && c <= "9").join(""), 10) || 0;
    const draftSpans = [], outSpans = [], fillSpans = [];
    chars.forEach(c => {
      const s = document.createElement("span");
      s.textContent = c === " " ? "\u00A0" : c;
      Object.assign(s.style, { display: "inline-block", color: "transparent" });
      s.style.webkitTextStroke = "1px rgba(59,174,209,.28)";
      draft.appendChild(s); draftSpans.push(s);
    });
    chars.forEach((c, i) => {
      const s = document.createElement("span");
      s.textContent = c === " " ? "\u00A0" : c;
      Object.assign(s.style, {
        display: "inline-block", color: "rgba(16,38,46,.05)",
        opacity: "0", transform: "translateY(.3em)", willChange: "transform, opacity", /* Änd. 2: kürzere Distanz, weicher */
        transition: `opacity .48s ${EASE},transform .48s ${EASE}`,
        transitionDelay: (KFX.s2 + i * STAG) + "ms" /* Stufe 2: ab 140 ms, Stagger 36 ms */
      });
      s.style.webkitTextStroke = "2px rgba(59,174,209,.5)";
      outline.appendChild(s); outSpans.push(s);
    });
    chars.forEach((c, i) => {
      const s = document.createElement("span");
      s.textContent = c === " " ? "\u00A0" : c;
      Object.assign(s.style, { display: "inline-block", color: "transparent" });
      s.style.backgroundImage = GRAD;
      s.style.backgroundSize = (n * 100) + "% 100%";
      s.style.backgroundPosition = (n > 1 ? (i / (n - 1) * 100) : 0) + "% 0";
      s.style.webkitBackgroundClip = "text"; s.style.backgroundClip = "text";
      fill.appendChild(s); fillSpans.push(s);
    });
    /* Scanlinie (Änd. 1, Stufe 3): feine vertikale Cyan-Linie mit leichtem Glow */
    const scan = document.createElement("span");
    Object.assign(scan.style, {
      position: "absolute", top: "-.03em", bottom: "-.03em", left: "0", width: "2px",
      background: "linear-gradient(180deg,transparent,rgba(59,174,209,.95) 18%,rgba(59,174,209,.95) 82%,transparent)",
      boxShadow: "0 0 6px rgba(59,174,209,.55), 0 0 16px rgba(59,174,209,.3)",
      opacity: "0", pointerEvents: "none", willChange: "transform, opacity"
    });
    fillClip.appendChild(fill);
    num.append(draft, outline, fillClip, scan);
    const lbl = document.createElement("div");
    lbl.textContent = label;
    Object.assign(lbl.style, {
      fontWeight: "600", fontSize: "clamp(1.025rem,2.25vw,1.6rem)", letterSpacing: "min(.34em, .82vw)", /* +25 %; Tracking schmilzt nur unter ~700 px, damit die Zeile mobil nicht umbricht (06.07.) */
      whiteSpace: "nowrap",
      color: "#6B7E86", opacity: "0", transform: "translateY(18px)",
      transition: `opacity .52s ${EASE} .3s,transform .52s ${EASE} .3s`
    });
    k.style.contain = "layout paint"; /* 08.07.: Zaehl-Repaints bleiben im KPI-Feld */
    k.append(num, lbl);
    seqEl.appendChild(k);
    const o = { k, num, draft, outSpans, draftSpans, fillSpans, fillClip, fill, scan, lbl,
                digitIdx, digits: digitIdx.length, target, shown: "", fx: null };
    setScanQ(o, 0);  /* Füllung startet komplett verdeckt — der Scan deckt sie links→rechts auf */
    setAmount(o, 0);    /* Änd. 2: Ziffern starten bei 0 (nullgepolstert, tabular) */
    return o;
  }

  function setScanQ(o, q) { /* q 0→1: Reveal-Kante links→rechts — nur transform (kompositiert) */
    const h = ((1 - q) * 100).toFixed(3);
    o.fillClip.style.transform = `translate3d(-${h}%,0,0)`;
    o.fill.style.transform = `translate3d(${h}%,0,0)`;
  }
  function setAmount(o, v) { /* aktualisiert die Ziffern in allen drei Ebenen (Vorzeichen/% fix) */
    const str = String(Math.max(0, Math.round(v))).padStart(o.digits, "0");
    if (str === o.shown) return;
    o.shown = str;
    for (let j = 0; j < o.digits; j++) {
      const ch = str[j] || "0", idx = o.digitIdx[j];
      o.draftSpans[idx].textContent = ch;
      o.outSpans[idx].textContent = ch;
      o.fillSpans[idx].textContent = ch;
    }
  }
  function startScanFx(o) { /* Stufe 3 (320–800 ms): gerichteter Scan + synchroner Count (Änd. 1+2) — strikt rAF, nur transform/opacity */
    const t0 = performance.now(), A = KFX.scan - KFX.spring, over = Math.round(o.target * KFX.over);
    const W = o.num.clientWidth; /* einmalige Messung — im rAF nur noch Writes */
    let lastAmtT = -1e3; /* 07.07.: Ziffern-Update ~30 Hz — jeder Ziffernwechsel rastert die große
       Zahl neu (3 Ebenen, text-stroke + background-clip); halbe Rate = halbe Paint-Last,
       das „Hochzählen" wirkt unverändert schnell. Scan/Reveal bleiben 60 fps (nur transform). */
    o.scan.style.opacity = "1";
    const step = () => {
      if (!o.fx) return;
      const t = performance.now() - t0, p = clamp(t / KFX.scan, 0, 1);
      setScanQ(o, p);
      o.scan.style.transform = `translate3d(${(p * W).toFixed(1)}px,0,0)`;
      if (p > .88) o.scan.style.opacity = Math.max(0, (1 - p) / .12).toFixed(3);
      let v; /* easeOutCubic auf den Überschwinger (+4 %), Rückfeder in den letzten 180 ms */
      if (t <= A) v = over * easeOutC(clamp(t / A, 0, 1));
      else v = lerp(over, o.target, easeOutC(clamp((t - A) / KFX.spring, 0, 1)));
      if (t - lastAmtT >= (weakFx ? 66 : 30)) { setAmount(o, v); lastAmtT = t; } /* 08.07.: schwache Geraete ~15 Hz - halbe Paint-Last, gleicher Eindruck */
      if (p < 1) o.fx.raf = requestAnimationFrame(step);
      else { endScan(o); startPunch(o); }
    };
    o.fx.raf = requestAnimationFrame(step);
  }
  function endScan(o) { /* Endzustand Stufe 3 — Füllung frei, keine Rest-Verschiebung */
    setScanQ(o, 1);
    o.scan.style.opacity = "0";
    setAmount(o, o.target);
  }
  function startPunch(o) { /* Änd. 2: Mikro-Punch beim Einrasten — scale 1→1.02→1, 140 ms, ease-out */
    if (!o.fx) return;
    const t0 = performance.now();
    o.num.style.transition = "opacity .35s ease-in,filter .35s ease-in"; /* transform kurz ohne Transition */
    const step = () => {
      if (!o.fx) return;
      const p = clamp((performance.now() - t0) / KFX.punch, 0, 1);
      if (p >= 1) { o.num.style.transform = ""; o.num.style.transition = NUM_TRANS; clearWill(o); o.fx = null; return; }
      o.num.style.transform = `scale(${(1 + .02 * Math.sin(Math.PI * easeOutC(p))).toFixed(4)})`;
      o.fx.raf = requestAnimationFrame(step);
    };
    o.fx.raf = requestAnimationFrame(step);
  }
  function clearWill(o) { /* Änd. 2: will-change nach Sequenzende wieder freigeben */
    [o.num, o.draft, o.fillClip, o.fill, o.scan].concat(o.outSpans).forEach(el => { el.style.willChange = ""; });
  }
  function finishKpiFx(o) { /* Schnell-Advance/Esc/Launch: Stufen, Scan und Count sofort auf Endzustand */
    if (!o) return;
    if (o.fx) { o.fx.t.forEach(clearTimeout); cancelAnimationFrame(o.fx.raf); o.fx = null; }
    o.draft.style.transition = "none"; o.draft.style.opacity = "1";
    o.outSpans.forEach(s => { s.style.transition = "none"; s.style.transitionDelay = "0ms"; s.style.opacity = "1"; s.style.transform = "translateY(0)"; });
    endScan(o);
    o.num.style.transform = "";
    o.num.style.transition = NUM_TRANS;
    clearWill(o);
  }

  const kpiEls = reduced ? [] : KPIS.map(([v, l]) => buildKpi(v, l));
  if (reduced) {
    rmList.innerHTML = KPIS.map(([v, l]) => `${v} · ${l}`).join("<br>");
    rmList.style.display = "flex";
    seqEl.style.display = "none";
  }

  /* rAF mit Timeout-Fallback: Flüge/Iris laufen auch in gedrosselten Hintergrund-Tabs zu Ende */
  const rafTick = cb => {
    const id = requestAnimationFrame(() => { clearTimeout(to); cb(); });
    const to = setTimeout(() => { cancelAnimationFrame(id); cb(); }, 60);
  };

  /* ---------- v6: Dock-Flüge ins Schriftfeld ---------- */
  const SEQ = { enter: 540, hold: 736, nextDelay: 69, fly: 518, flyFast: 322 }; /* +15 % langsamer (03.07.) */
  let seqIdx = -1, seqTimer = null, seqDone = false, launched = false, pendingStart = false;
  let dockedFlags = [false, false, false], dockedCount = 0, launchScheduled = false;
  let barShown = false, seqStart = 0;
  let beatStarted = false, introSkipped = false, readyShownAt = 0, readyDelay = 0; /* Änd. 1 (06.07.): Abflug-Beat mit großem „SYSTEM BEREIT" */
  const READY_BEAT = 60; /* 07.07.: „SYSTEM BEREIT" folgt DIREKT auf das Verschwinden der letzten Zahl (Ankunft im Schriftfeld) */
  const LAUNCH_OVERLAP = 140; /* 09.07.: Iris/Video-Zoom startet ~140 ms vor der Landung der letzten Zahl (minimale Überschneidung) */
  let lastArriveT = 0, pendingQueued = false;
  const miniFrames = makeDissolveFrames(20, 8, 4, 8, 1.0);

  /* Abflug-Herzschlag — alle drei Slot-Werte pulsieren einmal SYNCHRON (scale ~1.08,
     brightness ~1.15, ~450 ms, ease-in-out), der Balken echot dezent mit. Labels pulsieren
     nicht. Feuert seit Änd. 1 (06.07.) im Abflug-Beat ZEITGLEICH mit dem großen
     „SYSTEM BEREIT" und läuft in dessen Build/Hold hinein. */
  let heartbeatFired = false;
  function heartbeat() {
    if (heartbeatFired || reduced) return; heartbeatFired = true;
    const kf = [
      { transform: "scale(1)", filter: "brightness(1)" },
      { transform: "scale(1.08)", filter: "brightness(1.15)", offset: .5 },
      { transform: "scale(1)", filter: "brightness(1)" }
    ];
    slotIns.forEach(el => {
      const v = el.querySelector("[data-sb-val]");
      if (v && v.animate) v.animate(kf, { duration: 450, easing: "ease-in-out" });
    });
    const track = progFill.parentElement; /* Balken-Echo */
    if (track && track.animate) track.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.02)", offset: .5 }, { transform: "scale(1)" }],
      { duration: 450, easing: "ease-in-out" });
    console.log(`[hero] Abflug-Herzschlag @ ${seqStart ? Math.round(performance.now() - seqStart) : 0} ms`);
  }
  function pendingLaunch() { /* 09.07.: Wartefall — GLB/Video beim Finale-Trigger noch nicht bereit.
       Der Abflug-Herzschlag steht bereits (showBeat kam mit dem Trigger); sobald das Gate offen
       ist, öffnet die Iris direkt und die Video-Zoomfahrt startet. Kein „System bereit"-Wort mehr. */
    if (launched || pendingQueued) return;
    beatAndLaunch();
  }

  function kpiIn(o) {
    o.fx = { t: [], raf: 0 };
    requestAnimationFrame(() => {
      o.draft.style.opacity = "1"; /* Stufe 1 sofort (0–180 ms) */
      o.outSpans.forEach(s => { s.style.opacity = "1"; s.style.transform = "translateY(0)"; }); /* Stufe 2 ab 140 ms via transitionDelay */
      o.lbl.style.opacity = "1"; o.lbl.style.transform = "translateY(0)";
    });
    o.fx.t.push(setTimeout(() => { if (o.fx) startScanFx(o); }, KFX.s3)); /* Stufe 3 ab 320 ms */
  }
  function showBar() {
    if (barShown) return; barShown = true;
    specbar.style.opacity = "1"; specbar.style.transform = "translateY(0px)";
  }
  function showHdr() { /* fixer Header: erscheint mit dem Iris-Öffnen, bleibt dauerhaft */
    if (!hdr || hdr.style.opacity === "1") return;
    hdr.style.opacity = "1"; hdr.style.transform = "translateY(0px)"; hdr.style.pointerEvents = "auto";
  }
  /* ---------- Video-Einstieg „Fog-Cut" (Blueprint v8 §C) ---------- */
  let videoReady = false, videoFbTimer = null;
  function gateOpen() { /* Auto-Start: GLB bereit UND (Video 'canplaythrough' ODER Video-Fallback aktiv) */
    return loadDone && (!videoActive || videoReady);
  }
  function videoOff() { /* stoppen + nach Gebrauch (bzw. im Nicht-Video-Pfad) aus dem DOM entfernen */
    clearTimeout(videoFbTimer);
    if (!vid) return;
    try { vid.pause(); } catch (e) { /* egal */ }
    vid.removeAttribute("src");
    vid.remove();
    vid = null;
  }
  function videoFallback(reason) { /* 'error' / kein canplaythrough / Autoplay verweigert → normaler Ablauf ohne Video */
    if (!videoActive) return;
    videoActive = false; videoReady = false;
    console.warn(`[hero] Video-Fallback aktiv (${reason}) — normaler Ablauf ohne Video`);
    videoOff();
    if (launched) { if (state === "video") setState("descent"); } /* nach Launch: direkt in den normalen Descent */
    else if (pendingStart && gateOpen()) pendingLaunch();         /* im Boot: kein Hänger — Gate ist jetzt offen */
  }
  function startVideoFlight() { /* video.play() zeitgleich mit Iris-Start; der Descent folgt erst auf 'ended' */
    setState("video");
    vid.style.display = "block";
    vid.addEventListener("ended", videoEnded, { once: true });
    const pr = vid.play();
    if (pr && pr.catch) pr.catch(err => { console.warn("[hero] Video-Autoplay verweigert:", err && err.name); videoFallback("autoplay"); });
  }
  function videoEnded() {
    if (state !== "video") return; /* bereits geskippt */
    /* Übergabe im konturlosen Weiß: Overlay sofort deckend → Video weg → Kurz-Descent → Overlay 350 ms ausfaden */
    vWhite.style.transition = "none";
    vWhite.style.display = "block";
    vWhite.style.opacity = "1";
    vWhite.getBoundingClientRect(); /* Style-Flush: erst deckend, dann Video entfernen */
    videoOff();
    DUR.descent = VIDEO_DESCENT; /* 1,2 s — gleiche Kurve, gleicher Seitbogen, Sim-Fenster 15,5 → 17,30 unverändert */
    setState("descent");
    vWhite.style.transition = "opacity .35s ease-out";
    vWhite.style.opacity = "0";
    setTimeout(() => vWhite.remove(), 420);
  }
  if (videoActive && vid && vid.canPlayType && vid.canPlayType("video/mp4")) {
    /* Pfad-Weiche VOR dem Laden: src nur hier setzen — andere Pfade erzeugen keinerlei Netzwerk-Traffic */
    vid.muted = true; vid.playsInline = true; vid.setAttribute("playsinline", "");
    vid.preload = "auto";
    vid.src = VIDEO_SRC;
    vid.load();
    vid.addEventListener("canplaythrough", () => {
      videoReady = true; clearTimeout(videoFbTimer);
      try { if (VIDEO_TRIM > 0 && vid.currentTime < VIDEO_TRIM) vid.currentTime = VIDEO_TRIM; } catch (e) { /* Seek optional — ohne Trim läuft das Video voll */ }
      console.log("[hero] Video bereit (canplaythrough)");
      if (pendingStart && gateOpen()) pendingLaunch();
    }, { once: true });
    vid.addEventListener("error", () => videoFallback("error"), { once: true });
  } else {
    if (videoActive) console.warn("[hero] Video-Pfad gewollt, aber <video>/MP4 nicht verfügbar");
    videoActive = false;
    videoOff(); /* Element raus — touch/reduced laden das Video nachweislich nicht */
  }
  function launch() {
    if (launched) return; launched = true;
    console.log(`[hero] IRIS-START @ ${seqStart ? Math.round(performance.now() - seqStart) : 0} ms (seit KPI-Start)`);
    clearTimeout(seqTimer); kpiEls.forEach(finishKpiFx);
    startLoop();
    showHdr();
    const bx = innerWidth / 2, by = innerHeight / 2;
    const R0 = performance.now(), IR = Math.hypot(bx, by) * 2.1;
    const IDUR = reduced ? 120 : 620; /* Auto-Iris 620 ms ab Bildschirmmitte — Schriftfeld (z11) überlebt */
    let irSkip = true;
    (function ir() {
      const p = clamp((performance.now() - R0) / IDUR, 0, 1);
      /* 07.07.: schwache Geräte zeichnen die Vollbild-Maske nur jeden 2. Frame neu (Ende immer) */
      if (weakFx && (irSkip = !irSkip) && p < .9) { rafTick(ir); return; }
      const m = `radial-gradient(circle ${easeInQ(p) * IR}px at ${bx}px ${by}px,transparent 0 99%,#000 100%)`;
      intro.style.webkitMaskImage = m; intro.style.maskImage = m;
      if (p < 1) rafTick(ir); else intro.style.display = "none";
    })();
    if (videoActive && videoReady) startVideoFlight(); /* v8 §C: Iris öffnet aufs laufende Video — der Descent-Start (+140 ms) entfällt */
    else setTimeout(() => setState("descent"), reduced ? 0 : 140); /* Descent +140 ms */
  }
  /* Änd. 1 (06.07., v3.3): großes „SYSTEM BEREIT" als Abflug-Beat — mittig auf dem freien
     Intro-Feld, Kurz-Echo des Blueprint-Stacks: Kontur zieht auf (~120 ms), dann Scan-Füllung
     links→rechts (~220 ms, transform-basiert wie bei den Zahlen), Hold ~450 ms → Iris.
     Der Schriftzug bleibt stehen und wird von der öffnenden Iris überdeckt (kein eigener Fade).
     Rückgabe = Verzögerung bis zum Iris-Start:
       "full" 80+220+450 = 750 ms · "skip" (Esc) 40+110+200 = 350 ms · "reduced" statisch 400 ms */
  function showReadyWord(mode) {
    const T = mode === "skip" ? { out: 60, scanDelay: 40, scan: 110, hold: 200 }
                              : { out: 120, scanDelay: 80, scan: 220, hold: 450 };
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      position: "absolute", inset: "0", display: "flex", alignItems: "center",
      justifyContent: "center", pointerEvents: "none", zIndex: "3"
    });
    const word = document.createElement("div");
    Object.assign(word.style, {
      position: "relative", fontWeight: "700", textTransform: "uppercase",
      letterSpacing: ".3em", marginRight: "-.3em", /* Tracking-Ausgleich → optisch exakt mittig */
      fontSize: "clamp(1.6rem,5vw,4.2rem)", lineHeight: "1.1", whiteSpace: "nowrap"
    });
    const txt = "System bereit";
    const out = document.createElement("span");
    out.textContent = txt;
    Object.assign(out.style, { display: "block", color: "transparent", opacity: "0",
      transition: `opacity ${T.out}ms ease-out`, willChange: "opacity" });
    out.style.webkitTextStroke = "1.5px rgba(59,174,209,.5)";
    const clip = document.createElement("span"); /* Clip-Fenster + Gegen-Shift wie bei den Zahlen */
    Object.assign(clip.style, { position: "absolute", inset: "0", display: "block",
      overflow: "hidden", transform: "translate3d(-100%,0,0)", willChange: "transform" });
    const fillEl = document.createElement("span");
    fillEl.textContent = txt;
    Object.assign(fillEl.style, { position: "absolute", inset: "0", display: "block",
      whiteSpace: "nowrap", color: "transparent", transform: "translate3d(100%,0,0)", willChange: "transform" });
    fillEl.style.backgroundImage = GRAD;
    fillEl.style.webkitBackgroundClip = "text"; fillEl.style.backgroundClip = "text";
    const ln = document.createElement("span"); /* Scanlinie */
    Object.assign(ln.style, {
      position: "absolute", top: "-.1em", bottom: "-.1em", left: "0", width: "2px",
      background: "linear-gradient(180deg,transparent,rgba(59,174,209,.95) 18%,rgba(59,174,209,.95) 82%,transparent)",
      boxShadow: "0 0 6px rgba(59,174,209,.55), 0 0 16px rgba(59,174,209,.3)",
      opacity: "0", pointerEvents: "none", willChange: "transform, opacity"
    });
    clip.appendChild(fillEl);
    word.append(out, clip, ln);
    wrap.appendChild(word);
    intro.appendChild(wrap);
    console.log(`[hero] Abflug-Beat „SYSTEM BEREIT" (${mode}) @ ${seqStart ? Math.round(performance.now() - seqStart) : 0} ms`);
    if (mode === "reduced") { /* statisch: beide Ebenen sofort voll, keine Scans/Pulse */
      out.style.transition = "none"; out.style.opacity = "1";
      clip.style.transform = "none"; fillEl.style.transform = "none";
      return 400;
    }
    requestAnimationFrame(() => { out.style.opacity = "1"; });
    setTimeout(() => {
      const W = word.clientWidth; /* einmalige Messung — im rAF nur Writes */
      ln.style.opacity = "1";
      const t0 = performance.now();
      const step = () => {
        const p = clamp((performance.now() - t0) / T.scan, 0, 1), h = ((1 - p) * 100).toFixed(3);
        clip.style.transform = `translate3d(-${h}%,0,0)`;
        fillEl.style.transform = `translate3d(${h}%,0,0)`;
        ln.style.transform = `translate3d(${(p * W).toFixed(1)}px,0,0)`;
        if (p > .7) ln.style.opacity = Math.max(0, (1 - p) / .3).toFixed(3);
        if (p < 1) rafTick(step);
      };
      rafTick(step);
    }, T.scanDelay);
    return T.scanDelay + T.scan + T.hold;
  }
  function beatAndLaunch() { /* Änd. 1: Herzschlag + großes Wort ZEITGLEICH; Iris nach Build+Hold (~750 ms, Esc-Skip ~350 ms) */
    if (launched) return;
    showBeat();
    launch(); /* 09.07.: kein Wort-Hold mehr — Iris/Video-Zoom starten direkt mit dem Herzschlag */
  }
  function showBeat() { /* 09.07.: nur noch der Abflug-Herzschlag — das große „System bereit"-Wort entfällt */
    if (launched || beatStarted) return; beatStarted = true;
    heartbeat();
    readyDelay = 0; readyShownAt = performance.now();
  }
  function tryLaunch() {
    if (gateOpen()) { beatAndLaunch(); return; }
    /* 08.07.: nicht mehr aufs Laden warten - das Wort kommt direkt nach der letzten Zahl;
       nur die Iris (braucht GLB/ggf. Video) wartet aufs Gate (siehe pendingLaunch). */
    pendingStart = true;
    showBeat();
    if (!loadDone) progLabel.textContent = "LADE DIGITALEN ZWILLING";
  }
  function beginFinale() { /* 09.07.: Finale = Abflug-Herzschlag + Iris/Video-Zoom. Wird bereits kurz
       VOR der Landung der letzten Zahl gefeuert (LAUNCH_OVERLAP, minimale Überschneidung); der
       Aufruf aus arrive() ist nur noch Fallback (instant/reduced/kein Flug). */
    if (launchScheduled) return;
    launchScheduled = true;
    lastArriveT = performance.now();
    tryLaunch();
  }
  function arrive(k) {
    const el = slotIns[k];
    el.style.opacity = "1";
    if (!reduced) {
      el.style.webkitMaskSize = "100% 100%"; el.style.maskSize = "100% 100%";
      el.style.webkitMaskRepeat = "no-repeat"; el.style.maskRepeat = "no-repeat";
      setMaskFrame(el, miniFrames[0]);
      runFrames(el, miniFrames, 30); /* Mini-Dissolve 20×8, 8 Frames à 30 ms */
    }
    dockedCount++;
    console.log(`[hero] dock #${k + 1} angekommen @ ${seqStart ? Math.round(performance.now() - seqStart) : 0} ms`);
    if (dockedCount === KPIS.length && seqDone && !launchScheduled) beginFinale();
  }
  function dock(k, mode) { /* mode: false=normal, true=schnell, "instant"=sofort */
    if (dockedFlags[k]) return; dockedFlags[k] = true;
    const o = kpiEls[k];
    showBar();
    if (reduced || mode === "instant" || !o) { arrive(k); return; }
    const A = o.num.getBoundingClientRect();
    /* großes Label fadet nach oben weg (220 ms), große Zahl blendet in 90 ms aus */
    o.lbl.style.transition = "opacity .22s ease-in,transform .22s ease-in";
    o.lbl.style.opacity = "0"; o.lbl.style.transform = "translateY(-14px)";
    o.num.style.transition = "opacity .09s linear";
    o.num.style.opacity = "0";
    if (A.width === 0) { arrive(k); return; }
    /* FLIP-Klon fliegt in den Slot */
    const target = slotIns[k].querySelector("[data-sb-val]");
    const B = target.getBoundingClientRect();
    const f = document.createElement("div");
    Object.assign(f.style, {
      position: "fixed", left: A.left + "px", top: A.top + "px", zIndex: "12",
      pointerEvents: "none", fontWeight: "700", lineHeight: ".94", letterSpacing: "-.02em", /* Flug-Klon: gleiches Gewicht wie Draft + Leiste (06.07.) */
      whiteSpace: "nowrap", color: "transparent", transformOrigin: "top left",
      willChange: "transform", fontFamily: "'Titillium Web', system-ui, sans-serif"
    });
    f.style.backgroundImage = GRAD;
    f.style.webkitBackgroundClip = "text"; f.style.backgroundClip = "text";
    f.style.fontSize = getComputedStyle(o.num).fontSize;
    f.textContent = KPIS[k][0];
    document.body.appendChild(f);
    const s = B.height / A.height;
    const tx = (B.left + B.width / 2) - (A.left + A.width * s / 2);
    const ty = (B.top + B.height / 2) - (A.top + A.height * s / 2);
    const D = mode === true ? SEQ.flyFast : SEQ.fly, t0 = performance.now();
    const isFinal = k === KPIS.length - 1; /* 09.07.: letzte Zahl — Zoom startet während sie noch fliegt */
    (function fl() {
      const p = clamp((performance.now() - t0) / D, 0, 1), e = easeInOutC(p);
      f.style.transform = `translate(${tx * e}px,${ty * e}px) scale(${1 + (s - 1) * e})`;
      if (isFinal && seqDone && !launchScheduled && D * (1 - p) <= LAUNCH_OVERLAP) beginFinale();
      if (p < 1) rafTick(fl);
      else { f.remove(); arrive(k); }
    })();
  }
  function playIdx(i) {
    seqIdx = i;
    if (!seqStart) seqStart = performance.now();
    const o = kpiEls[i];
    kpiIn(o); /* startet Stufen 1–3 (Blueprint-Stack) */
    seqTimer = setTimeout(() => {
      dock(i, false);
      if (i + 1 < kpiEls.length) { seqTimer = setTimeout(() => playIdx(i + 1), SEQ.nextDelay); } /* nächste Zahl +60 ms, parallel zum Flug */
      else seqDone = true;
    }, SEQ.enter + SEQ.hold);
  }
  function advanceSeq() {
    if (launched || seqIdx < 0 || dockedFlags[seqIdx]) return;
    clearTimeout(seqTimer);
    const k = seqIdx;
    const o = kpiEls[k];
    finishKpiFx(o); /* Änd. 2: Count, Scan und Stufen sofort auf Endzustand */
    dock(k, true); /* Schnellflug 280 ms */
    if (k + 1 < kpiEls.length) { seqTimer = setTimeout(() => playIdx(k + 1), SEQ.nextDelay); }
    else seqDone = true;
  }
  function skipIntro() {
    if (launched) return;
    introSkipped = true; /* Änd. 1: Abflug-Beat erscheint verkürzt (~350 ms), dann Iris */
    seqDone = true;
    clearTimeout(seqTimer);
    kpiEls.forEach(o => { finishKpiFx(o); o.k.style.transition = "opacity .15s ease"; o.k.style.opacity = "0"; });
    for (let k = 0; k < KPIS.length; k++) { if (!dockedFlags[k]) dock(k, "instant"); }
  }

  intro.addEventListener("pointerdown", () => advanceSeq());
  addEventListener("keydown", e => {
    if (launched) return;
    if (e.key === " " || e.key === "ArrowRight") { e.preventDefault(); advanceSeq(); }
    if (e.key === "Escape" || e.key === "Enter") skipIntro();
  });

  let pendingJump = false;
  function jumpLive() { /* Dev-Skip: direkt in den Live-Zustand */
    if (!model) { pendingJump = true; return; }
    intro.style.display = "none";
    launched = true; seqDone = true;
    dockedFlags = [true, true, true]; dockedCount = KPIS.length;
    slotIns.forEach(el => { el.style.opacity = "1"; });
    showBar();
    showHdr();
    cam.position.copy(P1); cam.lookAt(T1);
    setSim(17.30);
    roofs.forEach(g => { g.material.opacity = 0; });
    mask.x = mask.tx = innerWidth * .75; mask.y = mask.ty = innerHeight * .46;
    mask.r = mask.tr = isTouch ? 0 : baseRadius();
    setState("live");
    startLoop();
  }

  if (!devSkip && !reduced) skipBtn.style.display = "block"; /* 07.07.: Skip-Button schon während der Boot-Sequenz sichtbar (z12, über dem Intro) */
  if (devSkip) { pendingStart = false; console.warn("[hero] devSkip aktiv — Intro & KPI-Zahlen übersprungen (Prop devSkipIntro oder QA-Flag 'skip' in sessionStorage iph_qa_flags)"); }
  else if (reduced) {
    /* Reduced Motion: Schriftfeld sofort voll befüllt, kein Flug */
    seqDone = true; pendingStart = true;
    dockedFlags = [true, true, true]; dockedCount = KPIS.length;
    slotIns.forEach(el => { el.style.opacity = "1"; });
    showBar();
  }
  else setTimeout(() => playIdx(0), 400);
  progress.style.opacity = "1";
  layoutChrome();

  /* ================= Abschnitt 1: Prozess-Tour (§7) =================
     Gleiche Szene, gleicher Mixer. Übergabe am Materialize-Ende:
     Wireframe-Override → Real-Materialien + Studiolicht (= Bake-Setup),
     erster Live-Frame deckungsgleich mit dem Bake → Ablösung unsichtbar.
     Danach wird NUR bei Scroll-/Resize-Änderung gerendert. */
  const CLIP = 17.77;
  const OV_SHIFT = .5; /* Überblick-Fenster: Anteil des Hero-Framing-Offsets → Anlage leicht rechts der Mitte (06.07.) */
  const WINDOWS = [[0, 3.55], [3.55, 8.02], [8.02, 10.66], [10.66, 14.22], [14.22, 17.77]];
  const TENTRY = .18; /* Anteil der Tour für Kamera-Überleitung + Rückspul-Beat 17,30 → 0 — Intro-Beat deutlich verlängert (02.07.) */
  const tCards = [0, 1, 2, 3, 4].map(i => $("tcard-" + i));
  const tourIntro = $("tour-intro"), tourQuote = $("tour-quote");
  const rail = $("rail"), railTrack = $("rail-track"), railFill = $("rail-fill");
  const railDots = [0, 1, 2, 3, 4].map(i => $("rd-" + i));
  const ovWrap = $("tour-overview"), railLabel = $("rail-label");
  const ovChips = ovWrap ? [...ovWrap.querySelectorAll("[data-ovchip]")] : [];
  const ovHead = ovWrap ? ovWrap.querySelector("[data-ovhead]") : null; /* Überblick-Headline (06.07.) */
  let handover = false, lastTourKey = "", tourP = 0, ovP = 0, quoteP = 0, sTour = 0, sOv = 0, sQuote = 0, tourRafId = null;
  let poses = null, ovPose = null, quotePose = null, camReadHero = "";
  tourEls = { tCards, rail, railTrack, railFill, railDots, ovWrap, railLabel };
  layoutChrome();

  /* ===== Real-Standbild (08.07., Stufe 1): „Der Zwilling wird real" =====
     Nach Station 5 wischt ein fotorealistisches Standbild über die Anlage —
     Hero-Grammatik (Zeichnung → Modell → Realität), ohne Cursor: Wipe mit
     Verlaufs-Sweep, scroll-gesteuert, reversibel. Das Bild ist per Cluster-Box-
     Projektion an die Kamera gekoppelt und folgt Dolly (Überblick/Zitat) und
     Framing-Offset auf jedem Viewport. Stufe 1 = Platzhalter: eigener Render-
     Frame (freigestellt, transparent) mit leichter Foto-Anmutung per CSS-Filter.
     Finales Foto = Drop-in: REAL_STILL.src + .ref setzen (Stufe 2).
     QA-Flag 'nostill' deaktiviert den Beat für A/B-Vergleich. */
  const STILL_WIN = .42;  /* Wipe fertig bei ovP = 0,42 — Vorteile erscheinen „am realen Produkt" */
  const STILL_PAD = .07;  /* Sweep-Anlauf über die Box hinaus (Anteil Boxbreite) */
  /* 3+1-Choreografie (08.07. III): Licht-Angleichung → Scan → Shutter-Blitz → Cut */
  const FL_LIGHT = .16;   /* Licht-Angleichung fertig bei ovP = 0,16 */
  const FL_A = .14, FL_MID = .21, FL_B = .30; /* Blitz: Fenster + Peak (Cut-Punkt) */
  /* Stufe 4 (08.07. VI): Realfoto vom Kunden in Photoshop passgenau auf das exportierte
     Quellframe montiert — gleiche Leinwand 2587×1512, Foto-Raum == Quell-Raum.
     ref.box = projizierte Cluster-Box des Quellframes (QB0 {320.6, 364.28, 1801.8, 1174.32}),
     korrigiert um die gemessene PS-Rest-Abweichung (Dunkel-Bounds beider Bilder,
     Beleg screenshots/qa-ps-align.png): kx 1,0204 · ky 1,0045 · Offset −33/−37 px.
     Damit landet der Foto-Inhalt exakt auf der Render-Anlage — Cut ohne Sprung.
     Kantenmaske löst die Hallen-Ränder in den Szenen-Hintergrund auf (Kundenwunsch). */
  const REAL_STILL = {
    src: "assets/montagezelle-real.webp",
    ref: { w: 2587, h: 1512, box: { x: 276, y: 326.8, w: 1838.6, h: 1179.6 } },
    content: { cx: 1305, right: 1790 }, /* Maschinen-Masse im Foto (px) — Anker für die Panel-Position (08.07. VII) */
    blend: "fade",
    mask: "radial-gradient(ellipse 1060px 740px at 1305px 855px, #000 56%, rgba(0,0,0,.85) 78%, transparent 99.5%)"
  };
  const noStill = qa.includes("nostill");
  let stillState = null; /* { w0, h0, box0 } — Bildraum-Kalibrierung; bei Resize invalidiert */
  const stillWrap = document.createElement("div");
  Object.assign(stillWrap.style, { position: "absolute", left: "0", top: "0", transformOrigin: "0 0", opacity: "0", pointerEvents: "none", willChange: "transform, opacity" });
  stillWrap.setAttribute("aria-hidden", "true");
  const stillImg = document.createElement("img");
  stillImg.id = "still-img"; /* QA-Handle */
  stillImg.alt = ""; stillImg.decoding = "sync"; stillImg.loading = "eager";
  Object.assign(stillImg.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", display: "block" });
  const stillBar = document.createElement("div");
  Object.assign(stillBar.style, { position: "absolute", width: "2.5px", background: "linear-gradient(180deg,#3BAED1,#45B347)", boxShadow: "0 0 14px rgba(59,174,209,.5)", opacity: "0" });
  stillWrap.append(stillImg, stillBar);
  stage.insertBefore(stillWrap, cvW.nextSibling); /* über den Canvases, unter Tour-UI/Ann/Rings (DOM-Ordnung, kein z-index) */
  /* Shutter-Blitz: weicher Luminanz-Bloom über der Szene, unter dem Tour-UI (08.07. III) */
  const stillFlash = document.createElement("div");
  stillFlash.id = "still-flash"; /* QA-Handle */
  Object.assign(stillFlash.style, { position: "absolute", inset: "0", background: "radial-gradient(circle at 60% 50%, #FFFFFF 0%, rgba(255,255,255,.96) 46%, rgba(248,252,253,.9) 100%)", opacity: "0", pointerEvents: "none" });
  stage.insertBefore(stillFlash, stillWrap.nextSibling);

  /* Licht-Angleichung: Studio → Hallenstimmung des Fotos (heller, wärmer, Raster aus,
     Kontaktschatten weicher). Lazy eingesammelt, Basiswerte gemerkt, g=0 stellt exakt zurück —
     Hero-Look bleibt unangetastet (exitLive3D setzt zurück). */
  let stillFx = null;
  const collectStillFx = () => {
    if (stillFx) return;
    const lights = [];
    let grid = null, shadow = null;
    [envReal, envWire].forEach(env => env.traverse(o => {
      if (o.isLight) lights.push({ l: o, i0: o.intensity, c0: o.color.clone() });
      else if (o.type === "GridHelper" && !grid) grid = { g: o, o0: o.material.opacity };
      else if (o.isMesh && o.material && o.material.transparent && o.material.map && !shadow) shadow = { m: o, o0: o.material.opacity };
    }));
    stillFx = { lights, grid, shadow, warm: new THREE.Color(0xFFF3E2), g: -1 };
  };
  function applyStillFx(g) {
    if (!stillFx) { if (g <= 0) return; collectStillFx(); }
    if (Math.abs(stillFx.g - g) < .001) return;
    stillFx.g = g;
    stillFx.lights.forEach(e => { e.l.intensity = e.i0 * (1 + .3 * g); e.l.color.copy(e.c0).lerp(stillFx.warm, .3 * g); });
    if (stillFx.grid) stillFx.grid.g.material.opacity = stillFx.grid.o0 * (1 - g);
    if (stillFx.shadow) stillFx.shadow.m.material.opacity = stillFx.shadow.o0 * (1 - .35 * g);
  }

  function projectClusterRect(c, w, h) { /* Cluster-Box → Screen-Rechteck (CSS-px) */
    const v = new THREE.Vector3();
    let x0 = 1 / 0, y0 = 1 / 0, x1 = -1 / 0, y1 = -1 / 0;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? annBox.max.x : annBox.min.x,
            i & 2 ? annBox.max.y : annBox.min.y,
            i & 4 ? annBox.max.z : annBox.min.z).project(c);
      const sx = (v.x * .5 + .5) * w, sy = (1 - (v.y * .5 + .5)) * h;
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
      if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    }
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }

  function bakeStill(vMultRestore) { /* Kalibrier-Frame in Schluss-Pose (Pose 5, ohne Offset, Sim-Ende) */
    if (!model || !annBox || !poses) return;
    setTourLow(false); /* Standbild-Bake immer in voller Stufe — Coasting greift danach wieder */
    if (REAL_STILL.src && REAL_STILL.ref) { /* Stufe 3: finales Foto mit gebakten Konstanten */
      stillState = { w0: REAL_STILL.ref.w, h0: REAL_STILL.ref.h, box0: { ...REAL_STILL.ref.box } };
      stillImg.src = REAL_STILL.src;
      stillImg.style.filter = "none";
      if (REAL_STILL.mask) { stillImg.style.webkitMaskImage = REAL_STILL.mask; stillImg.style.maskImage = REAL_STILL.mask; }
    } else { /* Stufe 1: Platzhalter = eigener Render, freigestellt (Env-Optik aus, Studiolicht AN, Alpha-Grund, Fog bleibt = deckungsgleich) */
      const w = innerWidth, h = innerHeight;
      const prevPos = cam.position.clone(), prevQ = cam.quaternion.clone(), prevSim = simTime;
      const prevVis = model.visible; model.visible = true; /* Bake braucht die Anlage — auch nach Resize im Voll-Real-Zustand */
      const prevClear = rReal.getClearColor(new THREE.Color()), prevAlpha = rReal.getClearAlpha();
      /* Umgebung ausblenden, LICHTER anlassen: das Studiolicht hängt in den env-Gruppen —
         Gruppen-visible=false würde unbeleuchtet-schwarz baken (Verifier-Befund 08.07.).
         Deshalb nur Nicht-Licht-Kinder verstecken (rekursiv, falls Lichter in Untergruppen). */
      const envHidden = [];
      const hideNonLights = g => g.children.forEach(o => {
        if (o.isLight) return;
        let hasLight = false;
        o.traverse(n => { if (n.isLight) hasLight = true; });
        if (hasLight) { hideNonLights(o); return; }
        envHidden.push([o, o.visible]); o.visible = false;
      });
      hideNonLights(envWire); hideNonLights(envReal);
      cam.clearViewOffset();
      cam.position.copy(poses[4].pos); cam.lookAt(poses[4].tgt); cam.updateMatrixWorld(true);
      setSim(CLIP - .001);
      rReal.setClearColor(0x000000, 0);
      rReal.render(scene, cam);
      const src = cvR.toDataURL("image/png");
      const box0 = projectClusterRect(cam, w, h);
      rReal.setClearColor(prevClear, prevAlpha);
      envHidden.forEach(([o, v]) => { o.visible = v; });
      model.visible = prevVis;
      applyViewOffset(vMultRestore);
      cam.position.copy(prevPos); cam.quaternion.copy(prevQ); cam.updateMatrixWorld(true);
      setSim(prevSim);
      if (![box0.x, box0.y, box0.w, box0.h].every(isFinite) || box0.w < 3 || box0.h < 3) {
        console.warn("[still] Bake verworfen — ungültige Box (Viewport/Aspect noch nicht bereit):", box0);
        return; /* stillState bleibt null → nächster Frame versucht es erneut */
      }
      stillState = { w0: w, h0: h, box0 };
      stillImg.src = src;
      stillImg.style.webkitMaskImage = stillImg.style.maskImage = "none"; /* Platzhalter ist freigestellt — keine Maske */
      stillImg.style.filter = "contrast(1.07) saturate(1.16) sepia(.05)"; /* Platzhalter-„Foto"-Anmutung — entfällt mit echtem Asset */
      console.log(`[still] Platzhalter gebakt @${w}×${h} · Box ${box0.x.toFixed(0)}/${box0.y.toFixed(0)} ${box0.w.toFixed(0)}×${box0.h.toFixed(0)}`);
    }
    stillWrap.style.width = stillState.w0 + "px"; stillWrap.style.height = stillState.h0 + "px";
    lastTourKey = ""; /* Canvas zeigt Bake-Frame — nächster renderTour-Frame malt sicher neu */
  }

  function updateStill(ovP, quoteP, qe) { /* pro Frame: Tracking + Wipe + Sweep (gedämpfte Werte) */
    const active = !noStill && (ovP > 0 || quoteP > 0) && stillState;
    if (!active) {
      if (stillWrap.style.opacity !== "0") { stillWrap.style.opacity = "0"; stillBar.style.opacity = "0"; stillFlash.style.opacity = "0"; }
      applyStillFx(0);
      if (model && !model.visible) model.visible = true; /* Rückweg: Anlage wieder rendern */
      return;
    }
    cam.updateMatrixWorld(true);
    const vw = innerWidth, vh = innerHeight;
    const b = projectClusterRect(cam, vw, vh), b0 = stillState.box0;
    const fadeMode = REAL_STILL.blend === "fade" && REAL_STILL.src;
    /* Tracking (08.07. VI): Foto-Raum == Quell-Raum (PS-Montage), Korrektur in box0 gebakt.
       Strikt uniform — Originalproportionen in jeder Phase (Kundenwunsch 08.07. V).
       Höhe + Bodenlinie führen, horizontal auf die Render-Anlage zentriert. */
    let trk;
    if (fadeMode) {
      const su = b.h / b0.h;
      trk = { sx: su, sy: su, tx: (b.x + b.w / 2) - (b0.x + b0.w / 2) * su, ty: b.y - b0.y * su };
    } else { /* deckungsgleiches Asset (Platzhalter/Wipe): Box → Box */
      const tsx = b.w / b0.w, tsy = b.h / b0.h;
      trk = { sx: tsx, sy: tsy, tx: b.x - b0.x * tsx, ty: b.y - b0.y * tsy };
    }
    let plc = trk;
    if (fadeMode) {
      /* Panel-Choreografie (08.07. II, Kundenwunsch): Der Fade startet höhengleich auf dem
         Kamera-Tracking, wächst mit dem Einblenden zum Vollhöhen-Panel an der rechten
         Bildschirmkante — im Überblick KEINE Verkleinerung. Der Zoom-out kommt erst im
         Zitat-Fenster: Panel → zurück aufs Tracking (Anlage tritt hinter das Zitat zurück). */
      const S = vh / stillState.h0; /* uniform: Bildhöhe = Viewporthöhe */
      /* Panel-Anker (08.07. VII, Kundenwunsch): Die Maschine wandert nach rechts und deckt
         den großen Freiraum — Drift um 75 % des Spielraums zwischen „zentriert" und
         „rechtsbündig", nie links der Mitte (schützt schmale Viewports). */
      const ct = REAL_STILL.content || { cx: stillState.w0 / 2, right: stillState.w0 };
      const txC = vw * .5 - ct.cx * S;
      const txR = vw * .98 - ct.right * S;
      const pan = { sx: S, sy: S, tx: txC + .75 * Math.max(0, txR - txC), ty: 0 };
      const aIn = reduced ? easeInOutC(clamp(ovP / STILL_WIN, 0, 1)) : easeInOutC(clamp((ovP - .30) / .32, 0, 1)); /* Cut bei .21 auf Tracking, HALTEN bis .30, dann Wachstum zum Panel (08.07. IV) */
      const aOut = easeInOutC(clamp(quoteP / .55, 0, 1));
      const mix = (A, B, e) => ({ sx: lerp(A.sx, B.sx, e), sy: lerp(A.sy, B.sy, e), tx: lerp(A.tx, B.tx, e), ty: lerp(A.ty, B.ty, e) });
      plc = mix(mix(trk, pan, aIn), trk, aOut);
    }
    stillWrap.style.transform = `translate(${plc.tx.toFixed(2)}px, ${plc.ty.toFixed(2)}px) scale(${plc.sx.toFixed(4)}, ${plc.sy.toFixed(4)})`;
    const r = easeInOutC(clamp(ovP / STILL_WIN, 0, 1));
    /* Blend fertig → Render-Anlage ganz aus: kein Doppelbild/Halo unter dem Foto.
       Boden, Raster + Kontaktschatten liegen in envReal und bleiben stehen (08.07.).
       3+1-Modus: Cut exakt am Blitz-Peak. */
    model.visible = (fadeMode && !reduced) ? ovP < FL_MID : r < .999;
    const dim = 1; /* 13.07.: Anlage im Zitat nicht mehr abdunkeln (Kundenwunsch) */
    if (reduced || fadeMode) {
      stillImg.style.clipPath = "none";
      if (reduced) { /* reduced-motion: ruhiger Crossfade, kein Blitz */
        stillWrap.style.opacity = dim.toFixed(3);
        stillImg.style.opacity = r.toFixed(3);
        stillBar.style.opacity = "0";
        stillFlash.style.opacity = "0";
        applyStillFx(r);
      } else { /* 3+1: Licht-Angleichung → Scan bis zum Blitz → Shutter-Cut aufs Foto */
        applyStillFx(easeInOutC(clamp(ovP / FL_LIGHT, 0, 1)));
        stillWrap.style.opacity = dim.toFixed(3); /* Wrapper sichtbar — trägt Balken schon VOR dem Cut (08.07. IV) */
        stillImg.style.opacity = clamp((ovP - FL_MID) / .02, 0, 1).toFixed(3);
        const bb = b0; /* Scan-Balken über der Anlagen-Box (Wrapper-Raum = Foto-px) */
        const rb = clamp(ovP / FL_MID, 0, 1);
        const m = bb.w * STILL_PAD, rx = (bb.x - m) + rb * (bb.w + 2 * m);
        stillBar.style.left = (rx - 1.25).toFixed(2) + "px";
        stillBar.style.top = (bb.y + bb.h * .06).toFixed(2) + "px";
        stillBar.style.height = (bb.h * .88).toFixed(2) + "px";
        stillBar.style.opacity = (Math.sin(Math.PI * rb) * .9).toFixed(3);
        const f = clamp((ovP - FL_A) / (FL_B - FL_A), 0, 1);
        stillFlash.style.opacity = (Math.pow(Math.sin(Math.PI * f), 1.4) * .95).toFixed(3);
      }
    } else {
      const m = b0.w * STILL_PAD, rx = (b0.x - m) + r * (b0.w + 2 * m);
      stillImg.style.clipPath = `inset(0 ${Math.max(0, stillState.w0 - rx).toFixed(2)}px 0 0)`;
      stillImg.style.opacity = "1";
      stillWrap.style.opacity = dim.toFixed(3);
      stillBar.style.left = (rx - 1.25).toFixed(2) + "px";
      stillBar.style.top = (b0.y - b0.h * .06).toFixed(2) + "px";
      stillBar.style.height = (b0.h * 1.12).toFixed(2) + "px";
      stillBar.style.opacity = (Math.sin(Math.PI * r) * .95).toFixed(3); /* Sweep: auf mitte Wipe, aus an den Enden */
    }
  }

  function buildPoses() { /* 5 Vorschlags-Posen — Feintuning folgt gemeinsam */
    const sph = (azDeg, elDeg, d) => {
      const a = azDeg * Math.PI / 180, e = elDeg * Math.PI / 180;
      return new THREE.Vector3(Math.sin(a) * Math.cos(e) * d, Math.sin(e) * d, Math.cos(a) * Math.cos(e) * d);
    };
    const T = (dx, dy, dz) => T1.clone().add(new THREE.Vector3(dx, dy, dz));
    const D = dist;
    poses = [
      { pos: T1.clone().add(sph(-38, 15, D * .82)), tgt: T(0, -.03 * D, 0) },  /* 1 Vertrieb — Schau-Dreiviertel von links */
      { pos: T1.clone().add(sph(34, 37, D * .58)), tgt: T(0, -.02 * D, 0) },   /* 2 Engineering — erhöhte Arbeitsansicht */
      { pos: T1.clone().add(sph(108, 11, D * .42)), tgt: T(0, -.05 * D, 0) },  /* 3 IBN — nah, Bedienhöhe */
      { pos: T1.clone().add(sph(196, 9, D * .60)), tgt: T(0, -.02 * D, 0) },   /* 4 Schulung — Gegenseite, Augenhöhe */
      { pos: P1.clone(), tgt: T1.clone() }                                      /* 5 Twin as a Product — Hero-Pose (Klimax) */
    ];
    quotePose = { pos: T1.clone().add(P1.clone().sub(T1).multiplyScalar(1.9)), tgt: T(0, .10 * D, 0) }; /* Zitat (13.07.): näher → Anlage größer, Hallenränder ragen leicht ins Zitat */
    ovPose = { pos: T1.clone().add(P1.clone().sub(T1).multiplyScalar(1.55)), tgt: T1.clone() }; /* Überblick-Fenster: sanft aufgezogen, Anlage vollständig im Bild (06.07.) */
    console.log("[tour] Posen-Vorschläge:", poses.map((p, i) => `#${i + 1} pos(${p.pos.toArray().map(v => +v.toFixed(2))}) tgt(${p.tgt.toArray().map(v => +v.toFixed(2))})`).join(" · "));
  }

  function enterLive3D() {
    if (handover || !model) return;
    handover = true;
    govGraceUntil = performance.now() + 1800; /* Tour-Einstieg: Settling nicht werten */
    cancelAnimationFrame(rafId); rafId = null; /* Hero-Loop aus — ab jetzt on-demand */
    /* Materialize-Endzustand erzwingen (Schutz bei Scroll-Sprüngen: Loop könnte mitten im Fade gecancelt werden) */
    heroUI.style.opacity = "0"; heroUI.style.transform = "translateY(-44px)";
    specbar.style.transition = "none"; specbar.style.opacity = "0"; specbar.style.transform = "translateY(18px)";
    hint.style.opacity = "0";
    lensEl.style.opacity = "0"; lensScan.style.opacity = "0"; lensDot.style.opacity = "0";
    mask.mult = 0;
    setRealLook();
    applyViewOffset(1); /* Einstieg bei tourP≈0 — erster Live-Frame deckungsgleich mit dem Bake */
    cam.position.copy(P1); cam.lookAt(T1);
    setSim(17.30);
    rReal.render(scene, cam); /* identisch zum Bake → Ablösung unsichtbar */
    cvW.style.opacity = "0";
    ann.style.opacity = "0";
    sMat = 1;
    lastTourKey = "";
    if (REAL_STILL.src && !stillImg.getAttribute("src")) stillImg.src = REAL_STILL.src; /* Foto früh laden — der Blend kommt erst Sekunden später */
    console.log("[tour] Übergabe: Bake → Live-Rendering");
  }
  function exitLive3D() {
    if (!handover) return;
    handover = false;
    cancelAnimationFrame(tourRafId); tourRafId = null;
    sTour = 0; sOv = 0; sQuote = 0; /* frisch einsteigen beim nächsten Handover */
    [tourIntro, tourQuote, rail, ...tCards, ...ovChips, ...(ovHead ? [ovHead] : [])].forEach(el => { el.style.opacity = "0"; });
    stillWrap.style.opacity = "0"; stillBar.style.opacity = "0"; stillFlash.style.opacity = "0"; /* Real-Standbild gehört zur Tour */
    applyStillFx(0); /* Studio-Licht exakt zurück — vor bake() */
    if (model && !model.visible) model.visible = true; /* Anlage zurück für Hero-Bake */
    if (railLabel) railLabel.style.opacity = "0";
    cvR.style.opacity = "1"; /* Zitat-Fade zurücksetzen */
    if (camReadHero) camRead.textContent = camReadHero;
    if (camSub) camSub.style.opacity = "0"; /* Plattform-Zeile gehört zur Tour — im Hero ausgeblendet */
    applyViewOffset(1); /* zurück ins Hero-Framing, dann neu baken */
    setTourLow(false); /* volle Auflösung für Bake + Hero */
    bake(); /* stellt Bake-Bild (17,30) + Wireframe-Look wieder her */
    cam.position.copy(P1); cam.lookAt(T1); setSim(17.30); /* 13.07.-Fix: bake() stellt am Ende die Tour-Pose wieder her — Live-Kamera + Sim hier zwingend auf die Bake-Pose (P1/T1, 17,30) zurück, sonst liegt der Wireframe beim Hochscrollen versetzt zur Real-Linse */
    liveDirty = 6;
    govGraceUntil = performance.now() + 1800; /* Rückstieg in den Hero: Settling nicht werten */
    startLoop();
    console.log("[tour] Übergabe zurück: Live → Bake/Wireframe");
  }

  const stationAt = simT => { for (let i = 4; i >= 0; i--) { if (simT >= WINDOWS[i][0]) return i; } return 0; };

  let tourPrevT = 0; /* dt-Basis für framerate-unabhängige Dämpfung (06.07.) */
  function tourLoop() {
    tourRafId = null;
    if (!handover || document.hidden) { tourPrevT = 0; return; }
    const nowT = performance.now();
    const dtT = tourPrevT ? Math.min(.05, (nowT - tourPrevT) / 1000) : .0167;
    tourPrevT = nowT;
    if (reduced) { sTour = tourP; sOv = ovP; sQuote = quoteP; } /* reduced-motion: Werte direkt, kein Nachlauf */
    else {
      /* weicherer, framerate-unabhängiger Scroll-Scrub (06.07.): ≈ .065/Frame @ 60 Hz (vorher fix .08) */
      const k = 1 - Math.exp(-dtT * 4.0);
      sTour += (tourP - sTour) * k;
      sOv += (ovP - sOv) * k;
      sQuote += (quoteP - sQuote) * k;
    }
    if (Math.abs(tourP - sTour) < 6e-4) sTour = tourP;
    if (Math.abs(ovP - sOv) < 6e-4) sOv = ovP;
    if (Math.abs(quoteP - sQuote) < 6e-4) sQuote = quoteP;
    /* Coasting (08.07., reduziertes Profil): während des Scrubs mit 1x rendern — in Bewegung
       unsichtbar, spart >50 % Fill-Rate. Beim Konvergieren ein letzter Frame in voller Stufe. */
    if (weakFx && (Math.abs(tourP - sTour) > .012 || Math.abs(ovP - sOv) > .04 || Math.abs(quoteP - sQuote) > .04)) setTourLow(true);
    renderTour();
    govSample(dtT, "Tour");
    if (sTour !== tourP || sOv !== ovP || sQuote !== quoteP) tourRafId = requestAnimationFrame(tourLoop);
    else { tourPrevT = 0; if (tourLow) { setTourLow(false); renderTour(); } } /* konvergiert — letzter Frame scharf */
  }
  function kickTour() { if (handover && !tourRafId) tourRafId = requestAnimationFrame(tourLoop); }

  function renderTour() {
    if (!handover || !model || !poses) return;
    const tourP = sTour, ovP = sOv, quoteP = sQuote; /* gedämpfte Werte für alle Visuals */
    const ovE = easeInOutC(ovP);
    /* Framing-Offset: Tour-Einstieg 1→0 · Überblick 0→OV_SHIFT (Anlage leicht rechts der Mitte) · Zitat zurück →0 (06.07.) */
    let vMult = tourP < TENTRY ? 1 - easeInOutC(tourP / TENTRY) : 0;
    if (ovP > 0) vMult = OV_SHIFT * ovE;
    if (quoteP > 0) vMult = OV_SHIFT * (1 - easeInOutC(quoteP));
    const mobile = innerWidth < 700;
    /* Zitat-Finale (13.07., Kundenwunsch): Anlage aus der Bildmitte schieben, damit sie NEBEN
       dem Zitat steht statt dahinter — Desktop nach rechts, Mobil nach oben. */
    /* 13.07.: Anlage FRÜH an die Seite docken (bis quoteP≈.16 fertig) statt langsam mitzuscrollen. */
    const qShift = quoteP > 0 ? easeInOutC(clamp(quoteP / .16, 0, 1)) : 0;
    applyViewOffset(vMult, mobile ? 0 : qShift * innerWidth * .28, mobile ? qShift * innerHeight * .22 : 0);
    const key = tourP.toFixed(4) + ":" + ovP.toFixed(4) + ":" + quoteP.toFixed(4) + ":" + innerWidth + "x" + innerHeight;
    if (key === lastTourKey) return;
    lastTourKey = key;

    /* Sim-Zeit: kurzer Rückspul-Beat 17,30 → 0, dann Scrub 0 → 17,77 */
    let simT;
    if (tourP < TENTRY) simT = lerp(17.30, 0, easeInOutC(tourP / TENTRY));
    else simT = clamp(((tourP - TENTRY) / (1 - TENTRY)) * CLIP, 0, CLIP - .001);

    /* Kamera: Pose je Station, Blend ±0,9 s Sim um die Fenstergrenzen (geglättet 02.07.) */
    let pos, tgt;
    if (tourP < TENTRY) {
      const e = easeInOutC(tourP / TENTRY);
      pos = P1.clone().lerp(poses[0].pos, e);
      tgt = T1.clone().lerp(poses[0].tgt, e);
    } else {
      const s = stationAt(simT);
      let pa = s, pb = s, e = 0;
      const B = .9;
      if (s < 4 && WINDOWS[s][1] - simT <= B) { pa = s; pb = s + 1; e = (simT - (WINDOWS[s][1] - B)) / (2 * B); }
      else if (s > 0 && simT - WINDOWS[s][0] < B) { pa = s - 1; pb = s; e = (simT - (WINDOWS[s][0] - B)) / (2 * B); }
      e = easeInOutC(clamp(e, 0, 1));
      pos = poses[pa].pos.clone().lerp(poses[pb].pos, e);
      tgt = poses[pa].tgt.clone().lerp(poses[pb].tgt, e);
    }
    if (ovP > 0 && ovPose) { /* Überblick-Fenster: Kamera zieht sanft auf die Gesamtansicht (06.07.) */
      pos = poses[4].pos.clone().lerp(ovPose.pos, ovE);
      tgt = poses[4].tgt.clone().lerp(ovPose.tgt, ovE);
    }
    if (quoteP > 0) { /* Zitat-Finale: Kamera zieht weiter auf, Anlage tritt zurück */
      const qe = easeInOutC(quoteP);
      const base = ovPose || poses[4];
      pos = base.pos.clone().lerp(quotePose.pos, qe);
      tgt = base.tgt.clone().lerp(quotePose.tgt, qe);
    }
    cam.position.copy(pos); cam.lookAt(tgt);
    setSim(simT);

    /* Live-Readout für die Framing-Session (Dev-Werkzeug) */
    const f2 = v => v.toFixed(2);
    camRead.textContent = `CAM ${f2(pos.x)} / ${f2(pos.y)} / ${f2(pos.z)} · TARGET ${f2(tgt.x)} / ${f2(tgt.y)} / ${f2(tgt.z)} · SIM ${simT.toFixed(2)} S · ${ovP > 0 ? "ÜBERBLICK" : "STATION " + (stationAt(simT) + 1)}${!noStill && (ovP > 0 || quoteP > 0) ? " · FOTO " + Math.round(easeInOutC(clamp(ovP / STILL_WIN, 0, 1)) * 100) + " %" : ""}`;
    camRead.style.opacity = "1";
    /* Plattform-Zeile: erscheint erst mit dem „iPhysics by machineering"-Block (Tour-Einstieg) und bleibt dann stehen (07.07.) */
    if (camSub) { const sOp = tourP > .006 ? "1" : "0"; if (camSub.style.opacity !== sOp) camSub.style.opacity = sOp; }

    /* Intro-Block (H2 + Pitch) im Einstiegs-Beat */
    const ioIn = clamp(tourP / .012, 0, 1);
    const ioOut = 1 - clamp((tourP - TENTRY * .72) / (TENTRY * .26), 0, 1); /* hält deutlich länger (02.07.) */
    const io = Math.min(ioIn, ioOut) * (quoteP > 0 ? 0 : 1);
    tourIntro.style.opacity = io.toFixed(3);
    tourIntro.style.transform = `translateY(calc(-50% + ${(1 - io) * 24}px))`;

    /* Stations-Karten: Fenstergrenzen mit Fade + 24 px Versatz */
    const F = .4;
    tCards.forEach((el, i) => {
      const a = i === 0 ? .12 : WINDOWS[i][0], b = WINDOWS[i][1];
      let op = Math.min((simT - a) / F, (b - simT) / F + (i === 4 ? 1 : 0), 1);
      if (i === 4) op = Math.min((simT - a) / F, 1);
      op = clamp(op, 0, 1);
      if (tourP < TENTRY) op = 0;
      if (ovP > 0) op = Math.min(op, 1 - easeInOutC(clamp(ovP * 2.5, 0, 1))); /* Station 5 weicht dem Überblick (06.07.) */
      if (quoteP > 0) op = Math.min(op, 1 - easeInOutC(clamp(quoteP * 2.5, 0, 1)));
      const dy = (1 - op) * 24 * (simT < (WINDOWS[i][0] + WINDOWS[i][1]) / 2 ? 1 : -1);
      el.style.opacity = op.toFixed(3);
      el.style.transform = mobile ? `translateY(${dy}px)` : `translateY(calc(-50% + ${dy}px))`;
    });

    /* Progress-Rail — im Überblick-Fenster: komplett gefüllt, alle 5 Punkte „erledigt“ (06.07.) */
    const p = ovP > 0 ? 1 : clamp(simT / CLIP, 0, 1);
    if (mobile) railFill.style.width = `calc((100% - 12px) * ${p.toFixed(4)})`;
    else railFill.style.height = `calc((100% - 12px) * ${p.toFixed(4)})`;
    const act = ovP > 0 ? 5 : stationAt(simT);
    railDots.forEach((d, i) => {
      if (i < act) { d.style.background = "#45B347"; d.style.borderColor = "#45B347"; d.style.boxShadow = "none"; }
      else if (i === act) { d.style.background = "#3BAED1"; d.style.borderColor = "#3BAED1"; d.style.boxShadow = "0 0 0 4px rgba(59,174,209,.18)"; }
      else { d.style.background = "#FFFFFF"; d.style.borderColor = "#D6E7EE"; d.style.boxShadow = "none"; }
    });
    const railOp = Math.min(clamp((tourP - TENTRY * .95) / .04, 0, 1), 1 - easeInOutC(clamp(quoteP * 2.5, 0, 1)));
    rail.style.opacity = railOp.toFixed(3);
    if (railLabel) railLabel.style.opacity = (reduced ? (ovP > 0 ? 1 : 0) : ovE).toFixed(3);

    /* Überblick: fünf Mehrwert-Chips, gestaffelt einblendend — reduced-motion ohne Stagger (06.07.) */
    const ovOutQ = 1 - easeInOutC(clamp(quoteP * 2.5, 0, 1));
    ovChips.forEach((el, i) => {
      let co;
      if (reduced) co = ovP > 0 ? 1 : 0;
      else { const S = .13; co = clamp((ovE - i * S) / (1 - 4 * S), 0, 1); }
      co = Math.min(co, ovOutQ);
      el.style.opacity = co.toFixed(3);
      el.style.transform = reduced ? "none" : `translateY(${((1 - co) * 16).toFixed(1)}px)`;
    });

    /* Überblick-Headline: erscheint knapp vor den Chips, geht mit ihnen wieder raus (06.07.) */
    if (ovHead) {
      let hc = reduced ? (ovP > 0 ? 1 : 0) : clamp(ovE / .5, 0, 1);
      hc = Math.min(hc, ovOutQ);
      ovHead.style.opacity = hc.toFixed(3);
      ovHead.style.transform = reduced ? "none" : `translateY(${((1 - hc) * 16).toFixed(1)}px)`;
    }

    /* Zitat */
    const qe = easeInOutC(clamp((quoteP - .18) / .55, 0, 1));
    tourQuote.style.opacity = qe.toFixed(3);
    /* 13.07.: Zitat in eigene Spalte — Desktop linksbündig (~52 %), Mobil unten zentriert;
       die Anlage sitzt via View-Offset rechts daneben bzw. darüber. */
    const qPortrait = tourQuote.firstElementChild;
    if (mobile) {
      tourQuote.style.left = "50%"; tourQuote.style.top = "auto"; tourQuote.style.bottom = "6vh";
      tourQuote.style.width = "min(560px, 90vw)"; tourQuote.style.textAlign = "center";
      tourQuote.style.transform = `translate(-50%, 0) translateY(${(1 - qe) * 28}px)`;
      if (qPortrait) qPortrait.style.justifyContent = "center";
    } else {
      tourQuote.style.left = "clamp(20px, 6vw, 96px)"; tourQuote.style.top = "50%"; tourQuote.style.bottom = "auto";
      tourQuote.style.width = "min(1180px, 80vw)"; tourQuote.style.textAlign = "left";
      tourQuote.style.transform = `translate(0, -50%) translateY(${(1 - qe) * 28}px)`;
      if (qPortrait) qPortrait.style.justifyContent = "flex-start";
    }
    cvR.style.opacity = "1"; /* 13.07.: Anlage im Zitat NICHT mehr abgedunkelt (Kundenwunsch) */

    /* Real-Standbild: Bake bei Bedarf, dann Tracking + Wipe (08.07.) */
    if (!noStill && (ovP > 0 || quoteP > 0) && !stillState) bakeStill(vMult);
    updateStill(ovP, quoteP, qe);

    rReal.render(scene, cam); /* on-demand: genau ein Frame pro Änderung */
  }

  /* ---------- Interaktion (§5) ---------- */
  if (!isTouch) {
    addEventListener("pointermove", e => {
      if (state !== "live") return;
      if (!moved) { moved = true; setTimeout(() => { hintDismissed = true; }, 900); } /* Hinweis nach erster Mausbewegung + 900 ms */
      mask.tx = e.clientX; mask.ty = e.clientY; mask.tr = baseRadius();
    });
    addEventListener("pointerdown", e => {
      const tgt = e.target && e.target.closest ? e.target : null;
      if (state === "live" && !handover && !(tgt && tgt.closest("button")) && intro.style.display === "none") ping(e.clientX, e.clientY);
    });
    stage.addEventListener("pointerleave", () => { if (state === "live") mask.tr = 0; });
    stage.addEventListener("pointerenter", () => { if (state === "live" && moved) mask.tr = baseRadius(); });
  } else {
    /* Touch (13.07., Kundenwunsch): Der Sweep-Doppel-Ping + die ruhige Auto-Drift laufen als
       Onboarding-Hinweis; danach FOLGT DIE RÖNTGEN-LINSE DEM FINGER — wie die Maus am Desktop,
       nur per Wischen. Kein freies Modell-Drehen. Desktop bleibt unverändert.
       stage trägt touch-action:pan-y → vertikale Wische scrollen die Seite ganz normal (genug
       Platz zum Scrollen); erst eine horizontale Wischbewegung greift die Linse. */
    const canLens = e => {
      if (state !== "live" || handover || intro.style.display !== "none") return false;
      const t = (e.touches && e.touches[0]) || e;
      const tg = t.target && t.target.closest ? t.target : null;
      return !(tg && tg.closest("button, a, input, textarea, select, details, summary"));
    };
    let sX = 0, sY = 0, axis = 0; /* axis: 0 unbestimmt · 1 Linse (horizontal) · -1 Scroll (vertikal) */
    const moveLens = (x, y) => { mask.tx = x; mask.ty = y; mask.tr = baseRadius(); };
    addEventListener("touchstart", e => {
      if (e.touches.length !== 1 || !canLens(e)) { axis = -1; return; } /* Multi-Touch/UI: Seite normal */
      const t = e.touches[0]; sX = t.clientX; sY = t.clientY; axis = 0;
    }, { passive: true });
    addEventListener("touchmove", e => {
      if (axis === -1 || e.touches.length !== 1 || state !== "live") return;
      const t = e.touches[0], dx = t.clientX - sX, dy = t.clientY - sY;
      if (axis === 0) {
        if (Math.hypot(dx, dy) < 9) return;                       /* Richtung noch unklar */
        if (Math.abs(dy) >= Math.abs(dx)) { axis = -1; return; }   /* vertikal → Seite scrollt (pan-y) */
        axis = 1; userTookOver = true; hintDismissed = true; tap.active = false; /* Onboarding aus */
      }
      if (axis === 1) moveLens(t.clientX, t.clientY);              /* horizontal → Linse folgt dem Finger */
    }, { passive: true });
    const endTouch = e => { if (!e.touches || e.touches.length === 0) axis = 0; };
    addEventListener("touchend", endTouch, { passive: true });
    addEventListener("touchcancel", endTouch, { passive: true });
  }

  function finish() { /* Skip im Descent — gilt auch im Video (v8 §C: Video stoppen/entfernen, Kurz-Descent 1,0 s) */
    if (state === "video") {
      videoOff();
      DUR.descent = 1.0;
      setState("descent");
      return;
    }
    if (state !== "descent") return;
    cam.position.copy(P1); cam.lookAt(T1);
    setSim(17.30);
    roofs.forEach(g => { g.material.opacity = 0; });
    setState("sweep");
  }
  skipBtn.addEventListener("click", () => {
    if (!launched) { skipIntro(); return; } /* 07.07.: Button überspringt auch die KPI-Boot-Sequenz (wie Esc/Enter) */
    if (state === "descent" || state === "video") finish();
  });
  addEventListener("keydown", e => { if (e.key === "Enter" && (state === "descent" || state === "video")) finish(); });

  /* Taste R: Real-Layer als hochauflösendes PNG (§4) */
  addEventListener("keydown", e => {
    if ((e.key === "r" || e.key === "R") && state === "live") {
      const pr = rReal.getPixelRatio();
      rReal.setPixelRatio(Math.min(3, pr * 2));
      if (handover) { rReal.render(scene, cam); } /* aktueller Tour-Frame */
      else bake();
      const url = cvR.toDataURL("image/png");
      rReal.setPixelRatio(pr);
      if (handover) { rReal.render(scene, cam); }
      else bake();
      const a = document.createElement("a");
      a.href = url; a.download = handover ? "tour-frame.png" : "real-layer_T17-30.png"; a.click();
    }
  });

  /* Taste F: Quellframe für die Foto-Generierung (Stufe 2) — Pose 5, Sim-Ende, hi-res.
     Lädt PNG + Kalibrier-JSON herunter und stellt die Ansicht danach zurück. */
  addEventListener("keydown", e => {
    if ((e.key === "f" || e.key === "F") && model && poses) {
      const ref = api.qaStillFrame();
      const pr = rReal.getPixelRatio();
      rReal.setPixelRatio(Math.min(3, pr * 2));
      lastTourKey = ""; renderTour(); /* gleicher Zustand, höhere Auflösung */
      const url = cvR.toDataURL("image/png");
      rReal.setPixelRatio(pr);
      const a = document.createElement("a");
      a.href = url; a.download = "real-still-quellframe.png"; a.click();
      const blob = new Blob([JSON.stringify({ hinweis: "Kalibrier-Konstanten für REAL_STILL.ref — CSS-px des Aufnahme-Viewports. Zusammen mit dem generierten Foto zurückgeben.", ref }, null, 2)], { type: "application/json" });
      const j = document.createElement("a");
      j.href = URL.createObjectURL(blob); j.download = "real-still-ref.json"; j.click();
      api.qaStillFrame(true);
      dispatchEvent(new Event("scroll")); /* zurück auf echten Scroll-Zustand */
      console.log("[still] Quellframe exportiert:", JSON.stringify(ref));
    }
  });

  function updateScroll() {
    const vh = innerHeight, y = scrollY;
    const matLen = vh * 1.12, tourLen = vh * 4.6, ovLen = vh * .49, quoteLen = vh * .59; /* 13.07.: Tour-Strecke 3,78 → 4,6 vh — Drehung beim Scrollen unempfindlicher/langsamer, Richtungen unverändert; Spacer (780vh) in Hero.dc.html mitgezogen */
    scrollP = clamp(y / matLen, 0, 1);
    tourP = clamp((y - matLen) / tourLen, 0, 1);
    ovP = clamp((y - matLen - tourLen) / ovLen, 0, 1);
    quoteP = clamp((y - matLen - tourLen - ovLen) / quoteLen, 0, 1);
    if (scrollP >= 1 && model && poses) {
      enterLive3D();
      kickTour();
    } else if (handover) {
      exitLive3D();
    }
  }
  addEventListener("scroll", updateScroll, { passive: true });

  /* Resize: Renderer + Re-Bake (§4 — löst Responsive vollständig) */
  let rsTimer = null;
  function resize(rebake = true) {
    const w = innerWidth, h = innerHeight;
    cam.aspect = w / h; cam.updateProjectionMatrix();
    computeHeroShift(); /* Resize: neu projizieren → neu berechnen → unten neu baken */
    if (!handover) applyViewOffset(1); /* Tour setzt den Offset pro Frame (renderTour) */
    rReal.setPixelRatio(tourLow ? Math.min(effDPR(), 1) : effDPR()); rWire.setPixelRatio(effDPR()); /* Browser-Zoom ändert devicePixelRatio — aktuelle Stufe neu anwenden */
    rReal.setSize(w, h); rWire.setSize(w, h);
    layoutChrome(); /* Slot-Layout/Logo/Readout — Flugziele bleiben nach Resize pixelgenau */
    stillState = null; /* Real-Standbild: Kalibrierung viewport-gebunden → beim nächsten Bedarf neu baken */
    projectAnnotations(); /* Anker + Bemaßung neu projizieren (Kamera bleibt P1/T1) */
    if (rebake && model) {
      if (handover) { lastTourKey = ""; updateScroll(); } /* Tour: aktueller Frame neu, kein Bake-Flip */
      else { bake(); liveDirty = 6; if (!rafId) rWire.render(scene, cam); }
    }
  }
  addEventListener("resize", () => { clearTimeout(rsTimer); rsTimer = setTimeout(() => resize(true), 150); });
  resize(false);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(rafId); rafId = null; cancelAnimationFrame(tourRafId); tourRafId = null; }
    else { govGraceUntil = performance.now() + 1800; if (handover) kickTour(); else startLoop(); } /* Tab-Rückkehr: Gnadenfrist, dann on-demand/Loop */
  });

  /* ---------- Laden anstoßen ---------- */
  load3D().then(() => {
    loadDone = true;
    if (devSkip || pendingJump) { jumpLive(); return; }
    if (videoActive && !videoReady) { /* v8 §C: max. 4 s auf 'canplaythrough' warten, sonst Fallback ohne Video */
      clearTimeout(videoFbTimer);
      videoFbTimer = setTimeout(() => { if (videoActive && !videoReady) videoFallback("kein canplaythrough in 4 s"); }, 4000);
    }
    if (pendingStart && gateOpen()) pendingLaunch(); /* Änd. 4: gemeinsamer Beat, Iris ~300 ms später */
  }).catch(err => {
    loadError = err;
    console.error("[hero] GLB-Load fehlgeschlagen:", err);
    progLabel.textContent = "FEHLER BEIM LADEN DES ZWILLINGS";
  });

  /* ---------- QA-Hooks ---------- */
  const api = {
    get state() { return state; },
    get simTime() { return simTime; },
    get loadDone() { return loadDone; },
    get loadError() { return loadError; },
    get edgeCount() { return edgeLines.length; },
    get meshCount() { return origMat.size; },
    get mask() { return { ...mask, tap: { ...tap } }; },
    get flags() { return { isTouch, reduced, devSkip, revisit }; },
    get perf() { return { weakFx, gpu: gpuStr, soft: gpuSoft, dpr: effDPR(), dprIx, steps: DPR_STEPS, tourLow, aa: AA }; },
    set dprStep(i) { dprIx = clamp(i, 0, DPR_STEPS.length - 1); rReal.setPixelRatio(effDPR()); rWire.setPixelRatio(effDPR());
      if (model) { if (handover) { lastTourKey = ""; renderTour(); } else { bake(); liveDirty = 4; if (!rafId) rWire.render(scene, cam); } } },
    get video() { return { active: videoActive, ready: videoReady, el: !!vid }; },
    get docked() { return { flags: [...dockedFlags], count: dockedCount, barShown, launchScheduled }; },
    get tour() { return { handover, tourP, ovP, quoteP, poses: poses ? poses.map(p => ({ pos: p.pos.toArray(), tgt: p.tgt.toArray() })) : null }; },
    renderTour, enterLive3D, exitLive3D,
    get still() { return { ready: !!stillState, noStill, cfg: REAL_STILL, state: stillState ? { w0: stillState.w0, h0: stillState.h0, box0: { ...stillState.box0 } } : null }; },
    rebakeStill() { stillState = null; lastTourKey = ""; renderTour(); },
    qaStillFrame(restore) { /* Asset-Werkzeug (Stufe 2): Quellframe-Zustand für die Foto-Generierung.
       Pose 5 ohne Offset, Sim-Ende, volle Szene, Chrome aus → Screenshot = img2img-Vorlage.
       Rückgabe: Kalibrier-Konstanten (CSS-px) für REAL_STILL.ref · restore=true stellt das Chrome wieder her. */
      const chrome = [camRead, camSub, skipBtn, hdr, progress, specbar, hint, rail, railLabel, ovWrap, tourIntro, tourQuote, ...tCards, stillWrap, rings, ann].filter(Boolean);
      if (restore) { chrome.forEach(el => { el.style.visibility = ""; }); this.qaTour(1, 0, .0001); return null; }
      this.qaTour(1, 0, .0001); /* Pose 5, vMult ≈ 0, Sim-Ende — Bake läuft, Box-Konstanten entstehen */
      chrome.forEach(el => { el.style.visibility = "hidden"; });
      const ref = stillState ? { w: stillState.w0, h: stillState.h0, box: { x: +stillState.box0.x.toFixed(1), y: +stillState.box0.y.toFixed(1), w: +stillState.box0.w.toFixed(1), h: +stillState.box0.h.toFixed(1) } } : null;
      console.log("[still] Quellframe-Ref:", JSON.stringify(ref));
      return ref;
    },
    qaTour(tp, qp, op) { /* QA: Tour-Zustand ohne echtes Scrollen setzen — op = Überblick-Fenster (optional; bei qp>0 automatisch 1) */
      tourP = clamp(tp, 0, 1); quoteP = clamp(qp || 0, 0, 1);
      ovP = clamp(op !== undefined ? op : (quoteP > 0 ? 1 : 0), 0, 1); scrollP = 1;
      sTour = tourP; sOv = ovP; sQuote = quoteP; sMat = 1;
      enterLive3D(); lastTourKey = ""; renderTour();
    },
    get barH() { return barH; },
    slotIns, specbar,
    cam, P0, P1, T0, T1, scene, THREE, rReal,
    get model() { return model; },
    skipIntro, advanceSeq, finishDescent: finish, launch, jumpLive, bake,
    projectAnnotations, revealAnnotations, applyViewOffset, computeHeroShift,
    get heroShift() { return heroShiftPx; },
    get framingLog() { return framingLog; },
    get heroTrim() { return HERO_TRIM; },
    set heroTrim(v) { HERO_TRIM = +v || 0; resize(true); }, /* Feinjustage: __hero.heroTrim = -8 */
    get annRevealed() { return annRevealed; },
  };
  window.__hero = api;
  return api;
}
