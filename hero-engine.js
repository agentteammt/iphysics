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
const GLB_FALLBACK_BYTES = 9.41e6;

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
      if (rr < 1 || lx < -rr || ly < -rr || lx > rc.width + rr || ly > rc.height + rr) rr = 0;
      o.inv.style.clipPath = rr ? `circle(${rr}px at ${lx}px ${ly}px)` : "circle(0px at -200px -200px)";
      const m = rr ? `radial-gradient(circle ${rr}px at ${lx}px ${ly}px, transparent 0 98%, #000 100%)` : "none";
      o.base.style.webkitMaskImage = m; o.base.style.maskImage = m;
    }
  }
  const hint = $("hint"),
        camRead = $("cam"), skipBtn = $("skip");
  const hdr = $("hdr"), hdrNav = $("hdr-nav");
  const specbar = $("specbar");
  const slotIns = [0, 1, 2].map(i => $("sb-in-" + i));
  const intro = $("intro"), seqEl = $("seq"), rmList = $("rm-list");
  const progress = $("progress"), progFill = $("prog-fill"),
        progPct = $("prog-pct"), progLabel = $("prog-label");

  hint.innerHTML = isTouch
    ? '<b style="color:#3BAED1;font-weight:700">TIPPEN</b> — DER SONAR-PING ZEIGT DIE REALE ANLAGE'
    : 'DIE <b style="color:#3BAED1;font-weight:700">LINSE</b> FOLGT DER MAUS — SIE ZEIGT DIE REALE ANLAGE';

  /* Chrome-Layout (v6): Schriftfeld-Höhe, Mobil-Varianten, Logo-Größe, Readout unter dem Logo */
  let barH = 58, hintDismissed = false, tourEls = null;
  function layoutChrome() {
    const mobile = innerWidth < 700;
    barH = mobile ? 46 : 58;
    specbar.style.height = barH + "px";
    slotIns.forEach(el => {
      const val = el.querySelector("[data-sb-val]");
      const lbl = el.querySelector("[data-sb-lbl]");
      if (val) val.style.fontSize = mobile ? "13px" : "15px";
      if (lbl) lbl.style.display = mobile ? "none" : "block";
    });
    if (hdrNav) hdrNav.style.display = innerWidth < 900 ? "none" : "flex";
    hint.style.bottom = (barH + 18) + "px";
    progress.style.bottom = `calc(${barH}px + clamp(38px, 7vh, 84px))`;
    const foot = $("intro-foot");
    if (foot) foot.style.bottom = (barH + 10) + "px";
    camRead.style.top = (mobile ? 74 : 88) + "px"; /* unter dem fixen Header */
    layoutCorners(); /* Passermarken folgen Header/Leiste */

    /* Tour-Layout (Karten + Rail) — Refs werden später gebunden */
    if (tourEls) {
      tourEls.tCards.forEach((el, i) => {
        if (mobile) {
          el.style.top = "auto"; el.style.bottom = "18px";
          el.style.left = "16px"; el.style.right = "16px"; el.style.width = "auto";
        } else {
          el.style.top = "50%"; el.style.bottom = "auto"; el.style.width = "min(400px, 40vw)";
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
    }
  }

  /* Linsen-Optik (JS-gesetzt: Vendor-Masken) */
  const lensMask = "radial-gradient(closest-side,transparent calc(100% - 3px),#000 calc(100% - 2px))";
  lensEl.style.background = GRAD;
  lensEl.style.webkitMaskImage = lensMask; lensEl.style.maskImage = lensMask;
  lensEl.style.filter = "drop-shadow(0 2px 10px rgba(59,174,209,.35))";
  lensScan.style.background = "repeating-linear-gradient(0deg,rgba(59,174,209,.16) 0 1px,transparent 1px 7px)";
  const scanMask = "radial-gradient(circle at 50% 50%,#000 52%,transparent 70%)";
  lensScan.style.webkitMaskImage = scanMask; lensScan.style.maskImage = scanMask;
  lensDot.style.background = GRAD;
  lensDot.style.boxShadow = "0 0 8px rgba(69,179,71,.6)";

  /* ---------- Renderer / Kamera ---------- */
  const DPR = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
  const rReal = new THREE.WebGLRenderer({ canvas: cvR, antialias: true, preserveDrawingBuffer: true });
  const rWire = new THREE.WebGLRenderer({ canvas: cvW, antialias: true });
  rReal.outputColorSpace = THREE.SRGBColorSpace;
  rReal.toneMapping = THREE.ACESFilmicToneMapping;
  rReal.toneMappingExposure = 1.1;
  rWire.outputColorSpace = THREE.SRGBColorSpace;
  rReal.setPixelRatio(DPR); rWire.setPixelRatio(DPR);
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
  function applyViewOffset(mult) {
    const w = innerWidth, h = innerHeight;
    const off = heroShiftPx * mult;
    if (Math.abs(off) > .5) cam.setViewOffset(w, h, -off, 0, w, h);
    else cam.clearViewOffset();
  }

  const scene = new THREE.Scene();
  const fogWire = new THREE.Fog(0xFBFDFE, 9, 40);
  const fogReal = new THREE.Fog(0xF8F8F8, 14, 42); /* Horizont = Real-Hintergrund #F8F8F8 */
  scene.fog = fogWire;

  /* ---------- Wireframe-Materialien (§2) ---------- */
  const wireLine = new THREE.LineBasicMaterial({ color: 0x3BAED1, transparent: true, opacity: .9 });
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

  function setProgress(p) {
    p = clamp(p, 0, 1);
    progFill.style.width = (p * 100) + "%";
    progPct.textContent = Math.round(p * 100) + " %";
    if (p >= 1) progLabel.textContent = "SYSTEM BEREIT";
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
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(cfg.glbUrl, e => {
      const total = (e.lengthComputable && e.total) ? e.total : GLB_FALLBACK_BYTES;
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
    const VERT_CAP = isTouch ? 1200000 : 2400000, EDGE_TIME_BUDGET = 14000;
    const tEdges = performance.now();
    let visElapsed = 0; /* Budget zählt nur sichtbare Zeit — Hintergrund-Loads behalten volle Kanten */
    const CHUNK = () => (document.hidden ? 200 : 12);
    const yieldFrame = () => new Promise(r => {
      const id = requestAnimationFrame(() => { clearTimeout(to); r(); });
      const to = setTimeout(() => { cancelAnimationFrame(id); r(); }, 50); /* rAF-Drossel (Hintergrund-Tab) umgehen */
    });

    /* Phase 1: statische Kanten sammeln (Weltkoordinaten) */
    const chunks = []; let vertTotal = 0, budgetHit = false;
    let i = 0;
    while (i < staticList.length) {
      const t0 = performance.now();
      while (i < staticList.length && performance.now() - t0 < CHUNK()) {
        const m = staticList[i++].mesh;
        try {
          const eg = new THREE.EdgesGeometry(m.geometry, 13); /* 13°: auch glatte Hauben bekommen Konturen */
          eg.applyMatrix4(m.matrixWorld);
          const arr = eg.attributes.position.array;
          vertTotal += arr.length / 3;
          chunks.push(arr);
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
    if (chunks.length) {
      const all = new Float32Array(chunks.reduce((s, a) => s + a.length, 0));
      let off = 0;
      chunks.forEach(a => { all.set(a, off); off += a.length; });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(all, 3));
      const merged = new THREE.LineSegments(g, wireLine);
      merged.matrixAutoUpdate = false;
      merged.frustumCulled = false;
      merged.raycast = () => {};
      scene.add(merged);
      edgeLines.push(merged);
    }

    /* Phase 2: Kanten-Kinder für bewegte Meshes */
    let j = 0;
    while (j < dynList.length && !budgetHit) {
      const t0 = performance.now();
      while (j < dynList.length && performance.now() - t0 < CHUNK()) {
        const m = dynList[j++].mesh;
        try {
          const ls = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 13), wireLine);
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
    console.log(`[hero] Kanten: ${chunks.length}/${staticList.length} statisch (gemergt, ${Math.round(vertTotal / 1000)}k Verts, 1 Draw Call) + ${j}/${dynList.length} dynamisch (folgen Animation).`);

    /* Erster Bake + Startpose — Reihenfolge: erst Offset berechnen und setzen
       (resize → computeHeroShift + applyViewOffset), DANN der Runtime-Bake */
    annBox = box.clone(); /* robuste Cluster-Box → Rechtsbündig-Framing + Bemaßung */
    resize(false);
    bake();
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
    pN = isTouch ? 260 : 600;
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
  const baseRadius = () => Math.min(190, innerWidth * .17);
  function setMask(x, y, r) {
    const s = `radial-gradient(circle ${Math.max(0, r)}px at ${x}px ${y}px,transparent 0 62%,rgba(0,0,0,.45) 80%,#000 96%)`;
    cvW.style.webkitMaskImage = s; cvW.style.maskImage = s;
    ann.style.webkitMaskImage = s; ann.style.maskImage = s; /* Zeichnungs-Overlays weichen der Reality-Lens */
  }
  function ping(x, y) {
    if (reduced) return;
    console.log(`[hero] ping @ ${Math.round(x)},${Math.round(y)}`);
    const d = document.createElement("div");
    Object.assign(d.style, {
      position: "absolute", left: x + "px", top: y + "px", width: "24px", height: "24px",
      border: "1.5px solid #3BAED1", borderRadius: "50%", transform: "translate(-50%,-50%)",
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
     Header (64 px) und Schriftfeld (barH) — berühren Logo/Skip/Leiste nicht. */
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
    const top = (64 + 13) + "px", bot = (barH + 13) + "px";
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
      fontWeight: "600", fontSize: "9.5px", letterSpacing: ".2em", textTransform: "uppercase",
      color: LBL_COL, lineHeight: "1.55", whiteSpace: "nowrap",
      textAlign: anchor === "l" ? "left" : anchor === "r" ? "right" : "center"
    });
    d.innerHTML = lines.map((t, i) => i ? `<div style="font-size:8.5px;opacity:.8">${t}</div>` : `<div>${t}</div>`).join("");
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
    /* Zellenmaße aus der robusten Cluster-Box (echte Werte in mm).
       Nach dem HERO_SHIFT sitzt die Bemaßung auf den OBERKANTEN (rechts der
       Anlage ist kein Platz mehr); Höhe erscheint nur, wenn rechts Raum ist. */
    dim(V(mn.x, mx.y, mx.z), V(mx.x, mx.y, mx.z), V(0, 1, 0), .55, [fmtMM(size.x)], .85);            /* Breite, vordere Oberkante */
    dim(V(mn.x, mx.y, mn.z), V(mn.x, mx.y, mx.z), V(0, 1, 0), .55, [fmtMM(size.z)], 1.0);            /* Tiefe, linke Oberkante */
    dim(V(mx.x, mn.y, mn.z), V(mx.x, mx.y, mn.z), V(1, 0, 0), .3, [fmtMM(size.y), "Z-ACHSE"], 1.15); /* Höhe, hintere rechte Kante */

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
          fontWeight: "600", fontSize: "9.5px", letterSpacing: ".2em", textTransform: "uppercase",
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
  let scrollP = 0, sMat = 0, moved = false, barNoTrans = false;
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
    console.log(`[hero] state → ${s} @ sim ${simTime.toFixed(2)}`);
    if (s === "descent") skipBtn.style.display = "block";
    if (s === "sweep" || s === "live") skipBtn.style.display = "none";
    if (s === "live") {
      showHUD();
      revealAnnotations();
      if (!isTouch) { lensEl.style.opacity = "1"; lensScan.style.opacity = "1"; lensDot.style.opacity = "1"; }
      sessionStorage.setItem("iph_hero_v4_seen", "1");
    }
  }

  /* ---------- Hauptschleife ---------- */
  let last = perf(), rafId = null;
  function startLoop() { if (!rafId) { last = perf(); loop(); } }
  function loop() {
    rafId = requestAnimationFrame(loop);
    const now = perf(), dt = Math.min(.05, now - last); last = now;
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
          mask.x = mask.tx = innerWidth / 2; mask.y = mask.ty = innerHeight * .46;
          mask.r = mask.tr = isTouch ? 0 : baseRadius();
        }
      }
    }
    else if (state === "sweep") {
      /* Einfahrt von links → Stopp Bildschirmmitte (§0) */
      const k = clamp(t / DUR.sweep, 0, 1), e = easeOutC(k);
      const x = lerp(-.12, .5, e) * innerWidth, y = innerHeight * .46;
      mask.x = mask.tx = x; mask.y = mask.ty = y;
      mask.r = mask.tr = baseRadius() * (.6 + .4 * e);
      if (k >= 1) {
        ping(innerWidth * .5, innerHeight * .46);
        setTimeout(() => ping(innerWidth * .5, innerHeight * .46), 170); /* Doppel-Ping, Versatz 170 ms */
        mask.tx = innerWidth * .5; mask.ty = innerHeight * .46; mask.tr = baseRadius();
        setState("live");
      }
    }
    else if (state === "live") {
      showHUD();
      if (isTouch && !tap.active) {
        /* Mobile-Ambient: ruhige Drift um die Mitte + Radius-Breathing (§0) */
        mask.tx = innerWidth * (.5 + Math.sin(now * .25) * .08);
        mask.ty = innerHeight * .44;
        mask.tr = (baseRadius() * .8) + Math.sin(now * 1.2) * 8;
      }
      wireLine.opacity = .82 + .08 * Math.sin(now * 1.7);
      if (pGeo) {
        for (let i = 0; i < pN; i++) { pArr[i * 3 + 1] -= dist * .005 * dt; if (pArr[i * 3 + 1] < pBot) pArr[i * 3 + 1] += (pTop - pBot); }
        pGeo.attributes.position.needsUpdate = true;
      }
    }

    /* Cursor-Lerp 0,12 */
    mask.x = lerp(mask.x, mask.tx, .12); mask.y = lerp(mask.y, mask.ty, .12);
    mask.r = lerp(mask.r, mask.tr, .12);
    let mx = mask.x, my = mask.y, mr = mask.r;
    if (tap.active) { mx = tap.x; my = tap.y; mr = tap.r; }
    mr *= mask.mult;
    setMask(mx, my, mr);
    if (!isTouch) {
      const tf = `translate(${mx}px,${my}px) scale(${(mr * 2) / 380})`;
      lensEl.style.transform = tf; lensScan.style.transform = tf;
      lensDot.style.transform = `translate(${mx}px,${my}px)`;
      updateH1Lens(mx, my, mr);
    }

    /* Materialize (Scroll 0→1, §6) — gedämpft nachgeführt für geschmeidiges Scrollen */
    sMat += (scrollP - sMat) * .10; /* sanfter (02.07.) */
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
    if (!isTouch && state === "live") {
      const lo = (1 - sp * 1.4).toFixed(3);
      lensEl.style.opacity = lo; lensScan.style.opacity = lo; lensDot.style.opacity = lo;
    }

    if (sp < .999 && model) rWire.render(scene, cam); /* nach Materialize on-demand (§5) */
  }

  /* ---------- Pixel-Dissolve-Maskenframes (§3) — groß (26×11) + mini (10×4) ---------- */
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

  /* ---------- Intro v4: KPI-Sequenz (§3) ---------- */
  const KPIS = [["+40 %", "ABSCHLUSSQUOTE IM VERTRIEB"], ["−50 %", "ENGINEERING-KOSTEN"],
                ["−75 %", "INBETRIEBNAHMEZEIT"]];
  const STAG = 44, EASE = "cubic-bezier(.16,.8,.24,1)";

  function buildKpi(val, label) {
    const k = document.createElement("div");
    Object.assign(k.style, {
      position: "absolute", inset: "0", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: "clamp(8px,2.4vh,26px)",
      pointerEvents: "none", padding: "0 4vw", textAlign: "center"
    });
    const num = document.createElement("div");
    Object.assign(num.style, {
      position: "relative", display: "inline-block", fontWeight: "900", lineHeight: ".94",
      letterSpacing: "-.02em", fontSize: "clamp(3.9rem,18vw,14.25rem)", whiteSpace: "nowrap",
      transition: "opacity .35s ease-in,transform .35s ease-in,filter .35s ease-in"
    });
    const outline = document.createElement("span");
    Object.assign(outline.style, { display: "block", whiteSpace: "nowrap" });
    const fill = document.createElement("span");
    Object.assign(fill.style, {
      position: "absolute", inset: "0", display: "block", whiteSpace: "nowrap",
      webkitMaskSize: "100% 100%", maskSize: "100% 100%",
      webkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat"
    });
    fill.style.webkitMaskSize = "100% 100%"; fill.style.webkitMaskRepeat = "no-repeat";
    const chars = [...val], n = chars.length;
    const outSpans = [];
    chars.forEach((c, i) => {
      const s = document.createElement("span");
      s.textContent = c === " " ? "\u00A0" : c;
      Object.assign(s.style, {
        display: "inline-block", color: "rgba(16,38,46,.05)",
        opacity: "0", transform: "translateY(.55em)",
        transition: `opacity .39s ${EASE},transform .39s ${EASE}`,
        transitionDelay: (i * STAG) + "ms"
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
      fill.appendChild(s);
    });
    num.append(outline, fill);
    const lbl = document.createElement("div");
    lbl.textContent = label;
    Object.assign(lbl.style, {
      fontWeight: "600", fontSize: "clamp(.82rem,1.8vw,1.08rem)", letterSpacing: ".34em",
      color: "#6B7E86", opacity: "0", transform: "translateY(18px)",
      transition: `opacity .52s ${EASE} .3s,transform .52s ${EASE} .3s`
    });
    k.append(num, lbl);
    seqEl.appendChild(k);
    const frames = makeDissolveFrames(52, 22, 4, 18, 1.1); /* feineres Raster — viele kleine Pixel (03.07.) */
    setMaskFrame(fill, frames[0]);
    return { k, num, outSpans, fill, lbl, frames };
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
  let seqIdx = -1, seqTimer = null, dissTimer = null, seqDone = false, launched = false, pendingStart = false;
  let dockedFlags = [false, false, false], dockedCount = 0, launchScheduled = false;
  let barShown = false, seqStart = 0;
  const miniFrames = makeDissolveFrames(20, 8, 4, 8, 1.0);

  function kpiIn(o) {
    requestAnimationFrame(() => {
      o.outSpans.forEach(s => { s.style.opacity = "1"; s.style.transform = "translateY(0)"; });
      o.lbl.style.opacity = "1"; o.lbl.style.transform = "translateY(0)";
    });
  }
  function showBar() {
    if (barShown) return; barShown = true;
    specbar.style.opacity = "1"; specbar.style.transform = "translateY(0px)";
  }
  function showHdr() { /* fixer Header: erscheint mit dem Iris-Öffnen, bleibt dauerhaft */
    if (!hdr || hdr.style.opacity === "1") return;
    hdr.style.opacity = "1"; hdr.style.transform = "translateY(0px)"; hdr.style.pointerEvents = "auto";
  }
  function launch() {
    if (launched) return; launched = true;
    clearTimeout(seqTimer); clearInterval(dissTimer); clearTimeout(dissTimer);
    startLoop();
    showHdr();
    const bx = innerWidth / 2, by = innerHeight / 2;
    const R0 = performance.now(), IR = Math.hypot(bx, by) * 2.1;
    const IDUR = reduced ? 120 : 620; /* Auto-Iris 620 ms ab Bildschirmmitte — Schriftfeld (z11) überlebt */
    (function ir() {
      const p = clamp((performance.now() - R0) / IDUR, 0, 1);
      const m = `radial-gradient(circle ${easeInQ(p) * IR}px at ${bx}px ${by}px,transparent 0 99%,#000 100%)`;
      intro.style.webkitMaskImage = m; intro.style.maskImage = m;
      if (p < 1) rafTick(ir); else intro.style.display = "none";
    })();
    setTimeout(() => setState("descent"), reduced ? 0 : 140); /* Descent +140 ms */
  }
  function tryLaunch() {
    if (loadDone) launch();
    else { pendingStart = true; progLabel.textContent = "LADE DIGITALEN ZWILLING"; }
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
    if (dockedCount === KPIS.length && seqDone && !launchScheduled) {
      launchScheduled = true;
      setTimeout(tryLaunch, 322); /* Launch = letzter Flug + Beat 322 ms */
    }
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
      pointerEvents: "none", fontWeight: "900", lineHeight: ".94", letterSpacing: "-.02em",
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
    (function fl() {
      const p = clamp((performance.now() - t0) / D, 0, 1), e = easeInOutC(p);
      f.style.transform = `translate(${tx * e}px,${ty * e}px) scale(${1 + (s - 1) * e})`;
      if (p < 1) rafTick(fl);
      else { f.remove(); arrive(k); }
    })();
  }
  function playIdx(i) {
    seqIdx = i;
    if (!seqStart) seqStart = performance.now();
    const o = kpiEls[i];
    kpiIn(o);
    dissTimer = setTimeout(() => { dissTimer = runFrames(o.fill, o.frames, 37); }, 205);
    seqTimer = setTimeout(() => {
      dock(i, false);
      if (i + 1 < kpiEls.length) { seqTimer = setTimeout(() => playIdx(i + 1), SEQ.nextDelay); } /* nächste Zahl +60 ms, parallel zum Flug */
      else seqDone = true;
    }, SEQ.enter + SEQ.hold);
  }
  function advanceSeq() {
    if (launched || seqIdx < 0 || dockedFlags[seqIdx]) return;
    clearTimeout(seqTimer); clearTimeout(dissTimer); clearInterval(dissTimer);
    const k = seqIdx;
    const o = kpiEls[k];
    setMaskFrame(o.fill, o.frames[o.frames.length - 1]);
    dock(k, true); /* Schnellflug 280 ms */
    if (k + 1 < kpiEls.length) { seqTimer = setTimeout(() => playIdx(k + 1), SEQ.nextDelay); }
    else seqDone = true;
  }
  function skipIntro() {
    if (launched) return;
    seqDone = true;
    clearTimeout(seqTimer); clearTimeout(dissTimer); clearInterval(dissTimer);
    kpiEls.forEach(o => { o.k.style.transition = "opacity .15s ease"; o.k.style.opacity = "0"; });
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
    mask.x = mask.tx = innerWidth / 2; mask.y = mask.ty = innerHeight * .46;
    mask.r = mask.tr = isTouch ? 0 : baseRadius();
    setState("live");
    startLoop();
  }

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
  const WINDOWS = [[0, 3.55], [3.55, 8.02], [8.02, 10.66], [10.66, 14.22], [14.22, 17.77]];
  const TENTRY = .18; /* Anteil der Tour für Kamera-Überleitung + Rückspul-Beat 17,30 → 0 — Intro-Beat deutlich verlängert (02.07.) */
  const tCards = [0, 1, 2, 3, 4].map(i => $("tcard-" + i));
  const tourIntro = $("tour-intro"), tourQuote = $("tour-quote");
  const rail = $("rail"), railTrack = $("rail-track"), railFill = $("rail-fill");
  const railDots = [0, 1, 2, 3, 4].map(i => $("rd-" + i));
  let handover = false, lastTourKey = "", tourP = 0, quoteP = 0, sTour = 0, sQuote = 0, tourRafId = null;
  let poses = null, quotePose = null, camReadHero = "";
  tourEls = { tCards, rail, railTrack, railFill, railDots };
  layoutChrome();

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
    quotePose = { pos: T1.clone().add(P1.clone().sub(T1).multiplyScalar(2.86)), tgt: T(0, .10 * D, 0) }; /* Zitat: Kamera weiter weg → Anlage kleiner (Kundenwunsch 02.07.) */
    console.log("[tour] Posen-Vorschläge:", poses.map((p, i) => `#${i + 1} pos(${p.pos.toArray().map(v => +v.toFixed(2))}) tgt(${p.tgt.toArray().map(v => +v.toFixed(2))})`).join(" · "));
  }

  function enterLive3D() {
    if (handover || !model) return;
    handover = true;
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
    console.log("[tour] Übergabe: Bake → Live-Rendering");
  }
  function exitLive3D() {
    if (!handover) return;
    handover = false;
    cancelAnimationFrame(tourRafId); tourRafId = null;
    sTour = 0; sQuote = 0; /* frisch einsteigen beim nächsten Handover */
    [tourIntro, tourQuote, rail, ...tCards].forEach(el => { el.style.opacity = "0"; });
    cvR.style.opacity = "1"; /* Zitat-Fade zurücksetzen */
    if (camReadHero) camRead.textContent = camReadHero;
    applyViewOffset(1); /* zurück ins Hero-Framing, dann neu baken */
    bake(); /* stellt Bake-Bild (17,30) + Wireframe-Look wieder her */
    startLoop();
    console.log("[tour] Übergabe zurück: Live → Bake/Wireframe");
  }

  const stationAt = simT => { for (let i = 4; i >= 0; i--) { if (simT >= WINDOWS[i][0]) return i; } return 0; };

  function tourLoop() {
    tourRafId = null;
    if (!handover || document.hidden) return;
    if (reduced) { sTour = tourP; sQuote = quoteP; } /* reduced-motion: Werte direkt, kein Nachlauf */
    else {
      sTour += (tourP - sTour) * .08; /* sanfterer Scroll-Scrub (02.07.) */
      sQuote += (quoteP - sQuote) * .08;
    }
    if (Math.abs(tourP - sTour) < 6e-4) sTour = tourP;
    if (Math.abs(quoteP - sQuote) < 6e-4) sQuote = quoteP;
    renderTour();
    if (sTour !== tourP || sQuote !== quoteP) tourRafId = requestAnimationFrame(tourLoop);
  }
  function kickTour() { if (handover && !tourRafId) tourRafId = requestAnimationFrame(tourLoop); }

  function renderTour() {
    if (!handover || !model || !poses) return;
    const tourP = sTour, quoteP = sQuote; /* gedämpfte Werte für alle Visuals */
    /* Framing-Offset → 0: fährt mit der ersten Kamerafahrt (reines Hero-Framing, Übergang ohne Sprung) */
    applyViewOffset(tourP < TENTRY ? 1 - easeInOutC(tourP / TENTRY) : 0);
    const mobile = innerWidth < 700;
    const key = tourP.toFixed(4) + ":" + quoteP.toFixed(4) + ":" + innerWidth + "x" + innerHeight;
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
    if (quoteP > 0) { /* Zitat-Finale: Kamera zieht auf, Anlage tritt zurück */
      const qe = easeInOutC(quoteP);
      pos = poses[4].pos.clone().lerp(quotePose.pos, qe);
      tgt = poses[4].tgt.clone().lerp(quotePose.tgt, qe);
    }
    cam.position.copy(pos); cam.lookAt(tgt);
    setSim(simT);

    /* Live-Readout für die Framing-Session (Dev-Werkzeug) */
    const f2 = v => v.toFixed(2);
    camRead.textContent = `CAM ${f2(pos.x)} / ${f2(pos.y)} / ${f2(pos.z)} · TARGET ${f2(tgt.x)} / ${f2(tgt.y)} / ${f2(tgt.z)} · SIM ${simT.toFixed(2)} S · STATION ${stationAt(simT) + 1}`;
    camRead.style.opacity = "1";

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
      if (quoteP > 0) op = Math.min(op, 1 - easeInOutC(clamp(quoteP * 2.5, 0, 1)));
      const dy = (1 - op) * 24 * (simT < (WINDOWS[i][0] + WINDOWS[i][1]) / 2 ? 1 : -1);
      el.style.opacity = op.toFixed(3);
      el.style.transform = mobile ? `translateY(${dy}px)` : `translateY(calc(-50% + ${dy}px))`;
    });

    /* Progress-Rail */
    const p = clamp(simT / CLIP, 0, 1);
    if (mobile) railFill.style.width = `calc((100% - 12px) * ${p.toFixed(4)})`;
    else railFill.style.height = `calc((100% - 12px) * ${p.toFixed(4)})`;
    const act = stationAt(simT);
    railDots.forEach((d, i) => {
      if (i < act) { d.style.background = "#45B347"; d.style.borderColor = "#45B347"; d.style.boxShadow = "none"; }
      else if (i === act) { d.style.background = "#3BAED1"; d.style.borderColor = "#3BAED1"; d.style.boxShadow = "0 0 0 4px rgba(59,174,209,.18)"; }
      else { d.style.background = "#FFFFFF"; d.style.borderColor = "#D6E7EE"; d.style.boxShadow = "none"; }
    });
    const railOp = Math.min(clamp((tourP - TENTRY * .95) / .04, 0, 1), 1 - easeInOutC(clamp(quoteP * 2.5, 0, 1)));
    rail.style.opacity = railOp.toFixed(3);

    /* Zitat */
    const qe = easeInOutC(clamp((quoteP - .18) / .55, 0, 1));
    tourQuote.style.opacity = qe.toFixed(3);
    tourQuote.style.transform = `translate(-50%, -50%) translateY(${(1 - qe) * 28}px)`;
    cvR.style.opacity = (1 - qe * .6).toFixed(3); /* Anlage tritt zurück: Deckkraft ↓ für Lesbarkeit des Zitats (Kundenwunsch 02.07.) */

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
    addEventListener("pointerdown", e => {
      const tgt = e.target && e.target.closest ? e.target : null;
      if (state !== "live" || handover || (tgt && tgt.closest("button")) || intro.style.display !== "none") return;
      hintDismissed = true; /* Hinweis nach erstem Tap */
      tap.active = true; tap.x = e.clientX; tap.y = e.clientY; tap.r = 0;
      ping(e.clientX, e.clientY);
      const t0 = performance.now(), RMAX = Math.min(230, innerWidth * .3);
      (function tw() { /* Tap-Ping 450 auf / 700 halten / 450 zu (§0) */
        const el = performance.now() - t0;
        if (el < 450) tap.r = easeOutC(el / 450) * RMAX;
        else if (el < 1150) tap.r = RMAX;
        else if (el < 1600) tap.r = RMAX * (1 - easeInQ((el - 1150) / 450));
        else { tap.active = false; return; }
        rafTick(tw);
      })();
    });
  }

  function finish() { /* Skip im Descent */
    if (state !== "descent") return;
    cam.position.copy(P1); cam.lookAt(T1);
    setSim(17.30);
    roofs.forEach(g => { g.material.opacity = 0; });
    setState("sweep");
  }
  skipBtn.addEventListener("click", finish);
  addEventListener("keydown", e => { if (e.key === "Enter" && state === "descent") finish(); });

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

  function updateScroll() {
    const vh = innerHeight, y = scrollY;
    const matLen = vh * 1.6, tourLen = vh * 5.4, quoteLen = vh * 1.2; /* Tour verlängert: Intro-Beat + Stationen entspannter (02.07.) */
    scrollP = clamp(y / matLen, 0, 1);
    tourP = clamp((y - matLen) / tourLen, 0, 1);
    quoteP = clamp((y - matLen - tourLen) / quoteLen, 0, 1);
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
    rReal.setSize(w, h); rWire.setSize(w, h);
    layoutChrome(); /* Slot-Layout/Logo/Readout — Flugziele bleiben nach Resize pixelgenau */
    projectAnnotations(); /* Anker + Bemaßung neu projizieren (Kamera bleibt P1/T1) */
    if (rebake && model) {
      if (handover) { lastTourKey = ""; updateScroll(); } /* Tour: aktueller Frame neu, kein Bake-Flip */
      else { bake(); if (!rafId) rWire.render(scene, cam); }
    }
  }
  addEventListener("resize", () => { clearTimeout(rsTimer); rsTimer = setTimeout(() => resize(true), 150); });
  resize(false);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(rafId); rafId = null; cancelAnimationFrame(tourRafId); tourRafId = null; }
    else if (handover) kickTour();
    else startLoop(); /* in der Tour wird nur on-demand gerendert */
  });

  /* ---------- Laden anstoßen ---------- */
  load3D().then(() => {
    loadDone = true;
    if (devSkip || pendingJump) { jumpLive(); return; }
    if (pendingStart) launch();
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
    get docked() { return { flags: [...dockedFlags], count: dockedCount, barShown, launchScheduled }; },
    get tour() { return { handover, tourP, quoteP, poses: poses ? poses.map(p => ({ pos: p.pos.toArray(), tgt: p.tgt.toArray() })) : null }; },
    renderTour, enterLive3D, exitLive3D,
    qaTour(tp, qp) { /* QA: Tour-Zustand ohne echtes Scrollen setzen */
      tourP = clamp(tp, 0, 1); quoteP = clamp(qp || 0, 0, 1); scrollP = 1;
      sTour = tourP; sQuote = quoteP; sMat = 1;
      enterLive3D(); lastTourKey = ""; renderTour();
    },
    get barH() { return barH; },
    slotIns, specbar,
    cam, P0, P1, T0, T1, scene, THREE,
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
