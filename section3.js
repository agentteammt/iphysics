/* ============================================================
   Abschnitt 3 — Vier Phasen. Maximaler ROI.
   Eigenständiges Modul. Rührt Hero / Abschnitt 1 / Abschnitt 2 NICHT an.
   Aufgaben:
   · Stacked-Cards per position:sticky — natives Scrollen, KEIN
     Scroll-Hijacking. Vier Karten stapeln sich; die vorherige skaliert
     beim Überdecken sanft auf ~0,96 zurück und bleibt oben angeschnitten.
   · KPI-Chips zählen beim Aktivwerden hoch (+40 / −50 / −75 / −60 %);
     der Messring-Bogen (data-s3ring) wächst synchron mit.
   · Mobil: Karten einfach untereinander, kein Stacking, keine Skalierung.
   · prefers-reduced-motion / QA-Flag "reduced": Werte statisch, kein Scale.
   ============================================================ */

export function initSection3() {
  const root = document.getElementById("s3");
  if (!root) return;

  const qa = (sessionStorage.getItem("iph_qa_flags") || "").split(",").map(s => s.trim());
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || qa.includes("reduced");

  /* ---------- KPI Count-ups (Vorzeichen + Suffix aus data-*) ---------- */
  const setVal = (el, n) => {
    el.textContent = (el.dataset.prefix || "") + Math.round(n) + (el.dataset.suffix || "");
    const ring = el.closest("[data-s3ring]");
    if (ring) ring.style.background =
      "conic-gradient(from 0deg, #3BAED1 0%, #45B347 " + n + "%, #E7F0F4 " + n + "% 100%)";
  };

  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    const dur = +el.dataset.dur || 1300;
    const t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    (function frame(now) {
      const p = Math.min(1, (now - t0) / dur);
      setVal(el, target * ease(p));
      if (p < 1) requestAnimationFrame(frame);
      else setVal(el, target);
    })(performance.now());
  }

  const counters = [...root.querySelectorAll("[data-count]")];
  if (reduce) {
    counters.forEach(el => setVal(el, parseFloat(el.dataset.count)));
  } else {
    counters.forEach(el => setVal(el, 0));
    const io = new IntersectionObserver((ents) => {
      ents.forEach(e => {
        if (e.isIntersecting && !e.target.dataset.counted) {
          e.target.dataset.counted = "1";
          countUp(e.target);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.7 });
    counters.forEach(el => io.observe(el));
  }

  /* ---------- Stacked-Cards + Responsive ---------- */
  const cards = [...root.querySelectorAll("[data-s3card]")];
  const mq = matchMedia("(min-width: 861px)");
  const LEFT_W = "clamp(180px, 22vw, 300px)";
  const PAD_L = "clamp(28px, 4vw, 68px)";
  const GAP_D = "clamp(32px, 5vw, 76px)";
  const GAP_M = "clamp(24px, 6vw, 34px)";
  let tops = [];

  function layout() {
    const desk = mq.matches;
    cards.forEach(card => {
      card.style.position = (desk && !reduce) ? "sticky" : "static"; /* reduced: kein Pinning */
      if (!desk || reduce) card.style.transform = "none";
      const inner = card.querySelector("[data-s3inner]");
      const left = card.querySelector("[data-s3left]");
      const right = card.querySelector("[data-s3right]");
      if (inner) { inner.style.flexDirection = desk ? "row" : "column"; inner.style.gap = desk ? GAP_D : GAP_M; }
      if (left) left.style.width = desk ? LEFT_W : "100%";
      if (right) {
        right.style.borderLeft = desk ? "1px solid #D6E7EE" : "none";
        right.style.borderTop = desk ? "none" : "1px solid #D6E7EE";
        right.style.paddingLeft = desk ? PAD_L : "0";
        right.style.paddingTop = desk ? "0" : "clamp(24px, 5vw, 34px)";
      }
    });
    // Sticky-Offsets aus dem berechneten Stil lesen — Template ist die Quelle.
    tops = cards.map(c => parseFloat(getComputedStyle(c).top) || 0);
    updateStack();
  }

  function updateStack() {
    if (!mq.matches || reduce) return;
    const span = Math.min(440, innerHeight * 0.5);
    for (let i = 0; i < cards.length; i++) {
      const next = cards[i + 1];
      if (!next) { cards[i].style.transform = "none"; continue; } // vorderste Karte bleibt scharf
      const rest = tops[i + 1];                    // Ruhelage der nachfolgenden Karte
      const nt = next.getBoundingClientRect().top; // top ist skalierungs-invariant (origin: top)
      let p = (rest + span - nt) / span;           // 0 = frei · 1 = überdeckt
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      cards[i].style.transform = "scale(" + (1 - 0.04 * p).toFixed(4) + ")";
    }
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { updateStack(); ticking = false; });
  }

  layout();
  mq.addEventListener("change", layout);
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => { clearTimeout(root._rz); root._rz = setTimeout(layout, 120); });
}
