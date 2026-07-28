/* ============================================================
   Feinschliff-Modul — Reveal, Smooth-Scroll, tote Links, Perf-Report
   Eigenständig; rührt die Hero-Choreografie (§0) NICHT an.

   · Reveal: EIN Muster für die ganze Seite — Fade + 24 px, 0,6 s ease.
     Markierung im Template: data-reveal (+ optional data-reveal-delay="ms").
     Nach dem Einblenden werden transition/transform zurückgesetzt,
     damit Hover-Transitions der Elemente wieder greifen.
     prefers-reduced-motion / QA "reduced": Inhalte direkt sichtbar.
   · SmoothWheel: sanftes Rad-Scrollen (Lerp 0.14). Nur Desktop-Pointer;
     aus bei reduced / touch / QA "nosmooth". Bewegt echtes window-
     Scrolling — natives sticky (Abschnitt 3) und der fixed Hero-Scrub
     (Abschnitt 1) bleiben unberührt.
   · Tote Platzhalter-Links (href="#") springen nicht an den Seitenanfang.
   · Perf-Report: "[perf]"-Zeilen in der Konsole — FCP, DOMContentLoaded,
     GLB-Ladekette, Time-to-Hero (Intro beendet).
   ============================================================ */

export function initPolish() {
  const qa = (sessionStorage.getItem("iph_qa_flags") || "").split(",").map(s => s.trim());
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || qa.includes("reduced");
  const isTouch = qa.includes("touch") || matchMedia("(pointer:coarse)").matches || "ontouchstart" in window;

  initReveal(reduced);
  if (!reduced && !isTouch && !qa.includes("nosmooth")) initSmoothWheel();
  initDeadLinks();
  initPerfReport();
}

/* ---------- Reveal — das eine Muster ---------- */
function initReveal(reduced) {
  const els = [...document.querySelectorAll("[data-reveal]")];
  if (!els.length || reduced) return; /* reduced: nichts verstecken */

  const prevTransition = new WeakMap();
  els.forEach(el => {
    prevTransition.set(el, el.style.transition || "");
    el.style.opacity = "0";
    el.style.transform = "translateY(24px)";
    el.style.willChange = "opacity, transform";
  });

  const io = new IntersectionObserver((ents) => {
    ents.forEach(en => {
      if (!en.isIntersecting) return;
      const el = en.target;
      io.unobserve(el);
      const delay = Math.max(0, +el.dataset.revealDelay || 0);
      el.style.transition = "opacity .6s ease " + delay + "ms, transform .6s ease " + delay + "ms";
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0px)";
        setTimeout(() => {
          /* aufräumen: Hover-Transitions wieder aktiv, kein Transform-Kontext */
          el.style.transition = prevTransition.get(el) || "";
          el.style.transform = "";
          el.style.opacity = "";
          el.style.willChange = "";
        }, 700 + delay);
      }));
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

  els.forEach(el => io.observe(el));
}

/* ---------- SmoothWheel — Lerp auf echtes window-Scrolling ---------- */
function initSmoothWheel() {
  let target = scrollY, cur = scrollY, rafId = null;
  const maxY = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);

  addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.shiftKey || e.defaultPrevented) return;      /* Zoom/horizontal nativ lassen */
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const t = e.target;
    if (t && t.closest && t.closest("iframe, video, [data-native-scroll]")) return;
    e.preventDefault();
    if (!rafId) { target = cur = scrollY; }                          /* frisch einsteigen */
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    target = Math.max(0, Math.min(maxY(), target + dy));
    if (!rafId) rafId = requestAnimationFrame(step);
  }, { passive: false });

  function step() {
    rafId = null;
    cur += (target - cur) * 0.14;
    if (Math.abs(target - cur) < 0.5) cur = target;
    scrollTo({ top: Math.round(cur), left: 0, behavior: "instant" }); /* CSS smooth nicht doppeln */
    if (cur !== target) rafId = requestAnimationFrame(step);
  }

  /* Fremd-Scroll (Tastatur, Scrollbar, Anker): Ziel synchronisieren */
  addEventListener("scroll", () => {
    if (!rafId) { target = cur = scrollY; }
  }, { passive: true });
}

/* ---------- Tote Platzhalter-Links (Phase 6) ---------- */
function initDeadLinks() {
  document.addEventListener("click", (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href="#"]') : null;
    if (a) e.preventDefault(); /* kein Sprung an den Seitenanfang */
  });
}

/* ---------- Perf-Report ---------- */
function initPerfReport() {
  const log = (msg) => console.log("[perf] " + msg);

  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.domContentLoadedEventEnd) log("DOMContentLoaded " + Math.round(nav.domContentLoadedEventEnd) + " ms");
  } catch (e) { /* still */ }

  try {
    new PerformanceObserver((l) => {
      l.getEntries().forEach(en => {
        if (en.name === "first-contentful-paint") log("First Contentful Paint " + Math.round(en.startTime) + " ms");
      });
    }).observe({ type: "paint", buffered: true });
  } catch (e) { /* still */ }

  try {
    const seen = new Set();
    const onRes = (entries) => entries.forEach(en => {
      if (seen.has(en.name) || !/montagezelle/i.test(en.name)) return;
      seen.add(en.name);
      const mb = (en.decodedBodySize || en.transferSize || 0) / 1048576;
      log("GLB Start " + Math.round(en.startTime) + " ms · Ende " + Math.round(en.responseEnd) +
          " ms · Transfer " + Math.round(en.responseEnd - en.startTime) + " ms" +
          (mb > 0 ? " · " + mb.toFixed(1) + " MB" : ""));
    });
    onRes(performance.getEntriesByType("resource"));
    new PerformanceObserver((l) => onRes(l.getEntries())).observe({ type: "resource", buffered: true });
  } catch (e) { /* still */ }

  /* Time-to-Hero: Intro beendet → Live-Szene steht */
  const t0 = performance.now();
  (function poll() {
    if (performance.now() - t0 > 90000) return;
    const intro = document.getElementById("intro");
    if (intro && intro.style.display === "none") {
      log("Time-to-Hero (Intro beendet, Live-Szene) " + Math.round(performance.now()) + " ms");
      return;
    }
    setTimeout(poll, 250);
  })();
}
