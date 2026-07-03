/* ============================================================
   Abschnitt 2 — Trust / Weber Case
   Eigenständiges Modul. Rührt Hero/Abschnitt 1 (hero-engine.js) NICHT an.
   Aufgaben: Count-ups beim Einscrollen · Desktop-Sticky-Zitat ·
   responsive Trust-Zeile · Video-Varianten (A: MP4 / B: Embed-Consent).
   ============================================================ */

export function initSection2() {
  const qa = (sessionStorage.getItem("iph_qa_flags") || "").split(",").map(s => s.trim());
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || qa.includes("reduced");

  /* ---------- Count-ups ---------- */
  const fmt = (n, sep) => sep ? Math.round(n).toLocaleString("de-DE") : String(Math.round(n));
  const setVal = (el, n) => { el.textContent = fmt(n, el.dataset.sep === "1") + (el.dataset.suffix || ""); };

  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    const dur = +el.dataset.dur || 1500;
    const t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    (function frame(now) {
      const p = Math.min(1, (now - t0) / dur);
      setVal(el, target * ease(p));
      if (p < 1) requestAnimationFrame(frame);
      else setVal(el, target);
    })(performance.now());
  }

  const counters = [...document.querySelectorAll("#s2 [data-count]")];
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
    }, { threshold: 0.6 });
    counters.forEach(el => io.observe(el));
  }

  /* ---------- Responsive: Sticky-Zitat + Trust-Zeile ---------- */
  const grid = document.getElementById("s2-grid");
  const quote = document.getElementById("s2-quote");
  const trust = document.getElementById("s2-trust");
  const cells = trust ? [...trust.children] : [];
  const mq = matchMedia("(min-width: 861px)");

  function layout() {
    const desk = mq.matches;
    if (grid) grid.style.gridTemplateColumns = desk ? "1.02fr 0.98fr" : "1fr";
    if (quote) quote.style.position = desk ? "sticky" : "static";
    if (trust) trust.style.gridTemplateColumns = desk ? "1fr 1fr 1fr" : "1fr";
    cells.forEach((c, i) => {
      const last = i === cells.length - 1;
      c.style.borderRight = desk && !last ? "1px solid #D6E7EE" : "none";
      c.style.borderBottom = !desk && !last ? "1px solid #D6E7EE" : "none";
      c.style.paddingLeft = desk && i > 0 ? "clamp(24px, 3vw, 44px)" : "0";
      c.style.paddingTop = !desk && i > 0 ? "clamp(22px, 4vw, 30px)" : (desk ? "0" : "0");
      c.style.paddingRight = desk && !last ? "clamp(24px, 3vw, 44px)" : "0";
      c.style.paddingBottom = !desk && !last ? "clamp(22px, 4vw, 30px)" : "0";
    });
  }
  layout();
  mq.addEventListener("change", layout);

  /* ---------- Video-Varianten ---------- */
  wireVideo();
}

/* Ein Klick-Handler, drei Pfade — gesteuert über data-variant am Container.
   placeholder (aktuell) · mp4 (Variante A) · embed (Variante B, Zwei-Klick). */
function wireVideo() {
  const box = document.getElementById("s2-video");
  if (!box) return;

  /* Tastatur: role="button" braucht Enter/Space (A11y) */
  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); box.click(); }
  });
  box.addEventListener("click", (e) => {
    if (box.dataset.active === "1") return;
    const v = box.dataset.variant;
    if (v === "mp4" && box.dataset.src) {
      box.dataset.active = "1";
      box.innerHTML = "";
      const video = document.createElement("video");
      video.src = box.dataset.src;
      if (box.dataset.poster) video.poster = box.dataset.poster;
      video.controls = true; video.autoplay = true; video.playsInline = true;
      video.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;display:block;";
      box.appendChild(video);
    } else if (v === "embed" && box.dataset.embedSrc) {
      showConsent(box);
    } else {
      hint(box); /* Platzhalter: kein Quell-URL gesetzt */
    }
  });
}

/* Variante B — Zwei-Klick-Consent: erst Datenschutz-Karte, dann Iframe. */
function showConsent(box) {
  if (box.querySelector("[data-consent]")) return;
  const card = document.createElement("div");
  card.setAttribute("data-consent", "1");
  card.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:8% 12%;background:rgba(241,244,245,.96);";
  card.innerHTML =
    '<div style="font-family:\'Titillium Web\',sans-serif;font-weight:600;font-size:11px;letter-spacing:0.26em;color:#6B7E86;text-transform:uppercase;">Externes Video</div>' +
    '<p style="margin:0;max-width:520px;font-family:\'Titillium Web\',sans-serif;font-weight:400;font-size:14px;line-height:1.65;color:#6B7E86;">Beim Laden werden Daten an den Video-Anbieter übertragen. Erst mit Ihrer Einwilligung wird der Inhalt geladen.</p>' +
    '<button type="button" data-load style="font-family:\'Titillium Web\',sans-serif;font-weight:700;font-size:14px;letter-spacing:0.01em;color:#fff;background:linear-gradient(120deg,#3BAED1,#45B347);border:0;padding:13px 26px;border-radius:999px;cursor:pointer;">Video laden &amp; abspielen</button>';
  box.appendChild(card);
  card.querySelector("[data-load]").addEventListener("click", (ev) => {
    ev.stopPropagation();
    box.dataset.active = "1";
    box.innerHTML = "";
    const ifr = document.createElement("iframe");
    ifr.src = box.dataset.embedSrc + (box.dataset.embedSrc.includes("?") ? "&" : "?") + "autoplay=1";
    ifr.allow = "autoplay; fullscreen; picture-in-picture";
    ifr.setAttribute("allowfullscreen", "");
    ifr.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;display:block;";
    box.appendChild(ifr);
  });
}

/* Platzhalter-Feedback, solange keine Quelle hinterlegt ist. */
function hint(box) {
  let t = box.querySelector("[data-hint]");
  if (t) return;
  t = document.createElement("div");
  t.setAttribute("data-hint", "1");
  t.textContent = "Videoquelle folgt — Asset B";
  t.style.cssText = "position:absolute;left:50%;bottom:18px;transform:translateX(-50%);font-family:'Titillium Web',sans-serif;font-weight:600;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#fff;background:rgba(16,38,46,.82);padding:9px 16px;border-radius:999px;opacity:0;transition:opacity .3s ease;pointer-events:none;white-space:nowrap;";
  box.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = "1"; });
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 320); }, 1800);
}
