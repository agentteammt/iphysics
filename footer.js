/* ============================================================
   Footer „Zeichnungs-Schriftfeld“ — Eingangs-Draw, Responsive-Raster,
   Status-Hover. Eigenständig; folgt dem polish.js-Muster.
   Progressive Enhancement: ohne JS steht der Footer statisch fertig
   (Rahmenlinien scale 1, Fugen sichtbar, Inhalte sichtbar).

   · Raster-Technik: 1px-Fugen (grid gap) über Trägerfarbe #D6E7EE —
     Trenner sind dadurch an JEDEM Breakpoint lückenlos sauber.
   · Responsive (exakt gefüllte Zeilen, keine Löcher im Fugenraster; 8 Zellen):
     ≥1080  4 Spalten                        (2×4 = 8)
     <1080  3 Spalten, Links-Zelle spannt 2  (3×3 = 9)
     <700   2 Spalten                        (4×2 = 8)
     <480   1 Spalte                         (8×1)
   · Eingang (IntersectionObserver, once): Rahmenlinien zeichnen sich
     (scaleX/Y, .55 s, Stagger 130 ms, oben→rechts→unten→links), Fugen
     faden ein, Zellinhalte +10 px nach (Stagger 40 ms).
   · reduced (prefers-reduced-motion / QA-Flag / forceReduced):
     alles sofort statisch, Dot ohne Puls.
   ============================================================ */

export function initFooter(opts = {}) {
  const qa = (sessionStorage.getItem("iph_qa_flags") || "").split(",").map(s => s.trim());
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
    || qa.includes("reduced") || !!opts.forceReduced;

  const frame = document.getElementById("ftr-frame");
  const grid = document.getElementById("ftr-grid");
  if (!frame || !grid) return;

  const lines = [...frame.querySelectorAll("[data-ftr-line]")];
  const rootFooter = frame.closest("footer") || frame.parentElement;
  const inners = [...rootFooter.querySelectorAll("[data-ftr-in]")]; /* inkl. Status-Zeile über dem Rahmen */
  const linksCell = document.getElementById("ftr-links");
  const status = document.getElementById("ftr-status");
  const dot = document.getElementById("ftr-dot");
  const statusQ = document.getElementById("ftr-status-q");

  /* ---------- Responsive-Raster ---------- */
  const COLS_4 = "minmax(200px, 1.15fr) 1fr 0.9fr 1.05fr";
  let rafId = null;
  function layout() {
    rafId = null;
    const w = innerWidth;
    let cols, links;
    if (w < 480)       { cols = "1fr";               links = "auto"; }
    else if (w < 700)  { cols = "1fr 1fr";           links = "auto"; }
    else if (w < 1080) { cols = "1fr 1fr 1fr";       links = "span 2"; }
    else               { cols = COLS_4;              links = "auto"; }
    grid.style.gridTemplateColumns = cols;
    if (linksCell) linksCell.style.gridColumn = links;
  }
  layout();
  addEventListener("resize", () => { if (!rafId) rafId = requestAnimationFrame(layout); }, { passive: true });

  /* ---------- Status-Zelle: Puls-Tempo + „Sie auch?“ ---------- */
  if (reduced && dot) dot.style.animation = "none";
  const hoverOn = () => {
    if (!reduced && dot) dot.style.animationDuration = "1.4s";
    if (statusQ) statusQ.style.color = "#3BAED1";
  };
  const hoverOff = () => {
    /* Achtung: "" würde die Shorthand-Dauer verwerfen (→ 0s), daher explizit */
    if (dot && !reduced) dot.style.animationDuration = "2.2s";
    if (statusQ) statusQ.style.color = "#6B7E86";
  };
  if (status) {
    status.addEventListener("mouseenter", hoverOn);
    status.addEventListener("mouseleave", hoverOff);
    status.addEventListener("focus", hoverOn);
    status.addEventListener("blur", hoverOff);
  }

  /* ---------- Eingangs-Moment (once) ---------- */
  if (reduced) return; /* Markup ist bereits der fertige, statische Zustand */

  lines.forEach(l => {
    l.style.transform = (l.dataset.ftrLine === "left" || l.dataset.ftrLine === "right") ? "scaleY(0)" : "scaleX(0)";
  });
  grid.style.background = "transparent"; /* Fugen erst mit dem Draw */
  inners.forEach(el => {
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    el.style.willChange = "opacity, transform";
  });

  const ORDER = { top: 0, right: 1, bottom: 2, left: 3 };
  const io = new IntersectionObserver((ents) => {
    if (!ents.some(en => en.isIntersecting)) return;
    io.disconnect();

    /* Rahmen zeichnet sich: oben → rechts → unten → links */
    lines.forEach(l => {
      const i = ORDER[l.dataset.ftrLine] || 0;
      l.style.transition = "transform .55s cubic-bezier(.4, 0, .2, 1) " + (i * 130) + "ms";
      l.style.transform = (l.dataset.ftrLine === "left" || l.dataset.ftrLine === "right") ? "scaleY(1)" : "scaleX(1)";
    });

    /* Fugen faden nach dem ersten Strich ein */
    grid.style.transition = "background-color .5s ease .28s";
    grid.style.background = "#D6E7EE";

    /* Zellinhalte: Fade + 10 px, Stagger 40 ms */
    inners.forEach((el, i) => {
      el.style.transition = "opacity .5s ease " + (240 + i * 40) + "ms, transform .5s ease " + (240 + i * 40) + "ms";
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      inners.forEach(el => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0px)";
      });
    }));

    /* Aufräumen: Transitions weg, damit danach Ruhe ist */
    setTimeout(() => {
      lines.forEach(l => { l.style.transition = ""; l.style.transform = ""; });
      grid.style.transition = "";
      grid.style.background = "#D6E7EE";
      inners.forEach(el => {
        el.style.transition = ""; el.style.transform = "";
        el.style.opacity = ""; el.style.willChange = "";
      });
    }, 1500);
  }, { threshold: 0.18 });

  io.observe(frame);
}
