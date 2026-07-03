/* ============================================================
   Abschnitt 4 — Was machineering ausmacht
   Eigenständiges Modul. Rührt Hero / Abschnitte 1–3 NICHT an.
   Aufgaben:
   · Bento-Grid responsive: 4 Spalten (Desktop) → 2 (Tablet) → 1 (Mobil);
     Kacheln 1 + 4 spannen 2 Spalten, solange ≥ 2 Spalten da sind.
   · Partner-Marquee: bei prefers-reduced-motion / QA-Flag "reduced"
     angehalten (Chips bleiben statisch sichtbar).
   ============================================================ */

export function initSection4() {
  const root = document.getElementById("s4");
  if (!root) return;

  const qa = (sessionStorage.getItem("iph_qa_flags") || "").split(",").map(s => s.trim());
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || qa.includes("reduced");

  /* ---------- Marquee: reduced-motion + Offscreen-Pause (Perf) ---------- */
  const marquees = [...root.querySelectorAll("[data-marquee]")];
  marquees.forEach(m => { if (reduce) m.style.animationPlayState = "paused"; });
  if (!reduce && marquees.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((ents) => {
      ents.forEach(e => {
        e.target.style.animationPlayState = e.isIntersecting ? "running" : "paused";
      });
    }, { threshold: 0 });
    marquees.forEach(m => io.observe(m));
  }

  /* ---------- Bento-Grid: Spalten + Spans ---------- */
  const grid = root.querySelector("[data-s4grid]");
  const tiles = [...root.querySelectorAll("[data-s4tile]")];
  const mqDesk = matchMedia("(min-width: 1080px)");
  const mqTab = matchMedia("(min-width: 660px)");

  function layout() {
    if (!grid) return;
    const cols = mqDesk.matches ? 4 : (mqTab.matches ? 2 : 1);
    grid.style.gridTemplateColumns = "repeat(" + cols + ", minmax(0, 1fr))";
    tiles.forEach(t => {
      const span = Math.min(+t.dataset.span || 1, cols);
      t.style.gridColumn = cols === 1 ? "auto" : "span " + span;
    });
  }

  layout();
  mqDesk.addEventListener("change", layout);
  mqTab.addEventListener("change", layout);
}
