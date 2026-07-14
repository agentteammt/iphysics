/* ============================================================
   Nachricht-Formular (07.07.) — „Anfrage-Blatt" vor dem FAQ.
   · Thema-Chips (Einfachauswahl) → verstecktes Feld #cf-topic
   · Validierung nativ (required / type=email) + reportValidity()
   · Übermittlungs-Beat: weißer Sweep im Senden-Button, danach
     Bestätigungs-Overlay (#cf-done, aria-live, Fokus auf Reset)
   · reduced motion / QA-Flag „reduced": sofortiger Zustandswechsel
   · [Offen 17] Versand-Backend — es wird KEIN Request gesendet
   ============================================================ */

export function initContactForm() {
  const form = document.getElementById("cf");
  if (!form) return;

  const qa = (sessionStorage.getItem("iph_qa_flags") || "").split(",").map(s => s.trim());
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || qa.includes("reduced");
  const GRAD = "linear-gradient(120deg, #3BAED1, #45B347)";

  /* Schriftfeld: Datum live */
  const date = document.getElementById("cf-date");
  if (date) date.textContent = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  /* ---------- Thema-Chips (Einfachauswahl) ---------- */
  const chips = [...form.querySelectorAll("[data-cf-chip]")];
  const topic = document.getElementById("cf-topic");
  function paintChips() {
    chips.forEach(c => {
      const on = c.getAttribute("aria-pressed") === "true";
      c.style.border = "1px solid " + (on ? "transparent" : "#D6E7EE");
      c.style.background = on
        ? "linear-gradient(#FFFFFF, #FFFFFF) padding-box, " + GRAD + " border-box"
        : "#F6FBFD";
      c.style.color = on ? "#10262E" : "#6B7E86";
      c.style.fontWeight = on ? "700" : "600";
    });
  }
  chips.forEach(c => {
    c.addEventListener("click", () => {
      chips.forEach(x => x.setAttribute("aria-pressed", x === c ? "true" : "false"));
      if (topic) topic.value = c.dataset.cfChip || "";
      paintChips();
    });
  });
  paintChips();

  /* ---------- Übermittlungs-Beat + Bestätigung ---------- */
  const send = document.getElementById("cf-send");
  const fillEl = document.getElementById("cf-send-fill");
  const labelEl = document.getElementById("cf-send-label");
  const arrowEl = document.getElementById("cf-send-arrow");
  const overlay = document.getElementById("cf-done");
  const thanks = document.getElementById("cf-thanks-name");
  let busy = false;

  /* Versand-Anbindung (Supabase Edge Function „contact") — sonst Demo-Beat. */
  const liveMail = () => !!(window.KIWBooking && window.KIWBooking.configured && window.KIWBooking.configured() && window.KIWBooking.sendContact);
  const val = id => { const el = document.getElementById(id); return el ? (el.value || "") : ""; };
  function gather() {
    return {
      topic: topic ? topic.value : "",
      email: val("cf-mail"), message: val("cf-msg"),
      pageUrl: (typeof location !== "undefined" ? location.href : ""),
    };
  }
  function showError(msg) {
    let box = document.getElementById("cf-error");
    if (!box) {
      box = document.createElement("div");
      box.id = "cf-error";
      box.setAttribute("role", "alert");
      box.style.cssText = "color:#C0392B;font-weight:600;font-size:13px;line-height:1.5;";
      if (send && send.parentNode) send.parentNode.insertBefore(box, send.nextSibling);
      else form.appendChild(box);
    }
    box.textContent = msg;
  }
  function clearError() { const box = document.getElementById("cf-error"); if (box) box.textContent = ""; }

  function showDone() {
    if (thanks) thanks.textContent = "";
    overlay.style.visibility = "visible";
    overlay.style.opacity = "1";
    overlay.setAttribute("aria-hidden", "false");
    const back = overlay.querySelector("button");
    if (back) back.focus({ preventScroll: true });
  }

  function restoreSendBtn() {
    setTimeout(() => { /* erst nach dem Overlay-Fade zurücksetzen */
      if (labelEl) labelEl.textContent = "Nachricht senden";
      if (arrowEl) arrowEl.style.opacity = "1";
      if (fillEl) {
        fillEl.style.transition = "none";
        fillEl.style.width = "0%";
        requestAnimationFrame(() => { fillEl.style.transition = "width 1s ease"; });
      }
    }, 520);
  }

  form.addEventListener("submit", ev => {
    ev.preventDefault();
    if (busy) return;
    if (!form.reportValidity()) return;
    busy = true;
    clearError();
    if (send) send.setAttribute("aria-busy", "true");

    const finish = ok => {
      busy = false;
      if (send) send.removeAttribute("aria-busy");
      if (ok) { showDone(); restoreSendBtn(); }
      else {
        if (labelEl) labelEl.textContent = "Nachricht senden";
        if (arrowEl) arrowEl.style.opacity = "1";
        if (fillEl) { fillEl.style.transition = "none"; fillEl.style.width = "0%"; requestAnimationFrame(() => { fillEl.style.transition = "width 1s ease"; }); }
        showError("Nachricht konnte nicht gesendet werden. Bitte sp\u00e4ter erneut versuchen oder direkt an u.zenker@team-mt.de schreiben.");
      }
    };

    const send_ = () => {
      if (liveMail()) {
        window.KIWBooking.sendContact(gather())
          .then(r => finish(r === "ok"))
          .catch(() => finish(false));
      } else {
        finish(true); // Demo: kein Backend konfiguriert
      }
    };

    if (reduced) { send_(); return; }
    if (labelEl) labelEl.textContent = "Wird \u00fcbermittelt \u2026";
    if (arrowEl) arrowEl.style.opacity = "0";
    if (fillEl) fillEl.style.width = "100%";
    setTimeout(send_, 1000);
  });

  /* „Weitere Nachricht" — Overlay schließen, Blatt leeren */
  const again = document.getElementById("cf-again");
  if (again) again.addEventListener("click", () => {
    form.reset();
    chips.forEach((x, i) => x.setAttribute("aria-pressed", i === 0 ? "true" : "false"));
    if (topic && chips[0]) topic.value = chips[0].dataset.cfChip || "";
    paintChips();
    overlay.style.opacity = "0";
    overlay.setAttribute("aria-hidden", "true");
    setTimeout(() => { overlay.style.visibility = "hidden"; }, 480);
    const first = document.getElementById("cf-mail");
    if (first) first.focus({ preventScroll: true });
  });
}
