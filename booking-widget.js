/* ============================================================================
   booking-widget.js — iPhysics Terminbuchung (Custom Element <iph-booking>)
   ----------------------------------------------------------------------------
   Portiert aus dem Kunden-Paket (uploads/): dieselbe 3-Schicht-Architektur.
     - LESEN   : window.KIWBooking.loadAvailability(date)  (Supabase RPC)
     - SCHREIBEN: window.KIWBooking.bookSlot(date, id, …)   (Edge Function + Mail)
   Ohne window.KIW_SUPABASE-Config → DEMO-MODUS (funktioniert visuell,
   Buchungen nur im Speicher; Slot verschwindet an dem Tag zur Demonstration).

   iPhysics-Anpassungen ggü. der Vorlage:
     · 30-Min-Slots, Mo–Fr gleiche Zeiten (= Slot-IDs in machineering.slots).
     · Kapazität 1 → gebuchter Slot ist an genau dem Tag weg.
     · iPhysics-CD (Titillium, Blau/Grün-Verlauf, Hairlines, Pills).
     · Attribut variant="v1|v2|v3|v4" schaltet die Optik um.

   >>> ZEITRÄUME: Konstante WEEKDAY_TIMES unten. <<<
   >>> Slot-Kapazität: SLOT_CAPACITY. <<<
   ============================================================================ */
(function () {
  /* ---- >>> STELLSCHRAUBEN — ZEITRÄUME <<< -------------------------------
     MUSS mit den Slot-IDs in der Datenbank übereinstimmen
     (db-setup.sql §5, Tabelle machineering.slots) — sonst erscheinen die
     Zeiten im Live-Modus als ausgebucht/durchgestrichen. */
  const TIMES = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"]; // = machineering.slots
  const WEEKDAY_TIMES = {                                       // 0=So … 6=Sa
    1: TIMES, 2: TIMES, 3: TIMES, 4: TIMES, 5: TIMES,           // Mo–Fr gleich
  };
  const BOOK_DAYS = 10;         // wie viele Termintage anbieten
  const SLOT_CAPACITY = 1;      // Plätze je Slot pro Tag (1 → nach Buchung weg)
  const DURATION = "30 Min";    // Anzeige im Kopf
  /* ----------------------------------------------------------------------- */

  const DOW  = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const DOWL = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const MON  = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const GRAD = "linear-gradient(120deg, #3BAED1, #45B347)";

  const allowedDays = () => Object.keys(WEEKDAY_TIMES).map(Number);
  function nextDays(n) {
    const out = [], base = new Date(); base.setHours(0, 0, 0, 0);
    let i = 0;
    while (out.length < n && i < 120) {
      i++; const x = new Date(base); x.setDate(base.getDate() + i);
      if (!allowedDays().includes(x.getDay())) continue;
      const iso = x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
      out.push({ iso, dg: x.getDay(), dow: DOW[x.getDay()], dowl: DOWL[x.getDay()], dom: x.getDate(), mon: MON[x.getMonth()] });
    }
    return out;
  }
  const timesFor = d => (d ? (WEEKDAY_TIMES[d.dg] || []) : []);
  const live = () => !!(window.KIWBooking && window.KIWBooking.configured && window.KIWBooking.configured());
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const BASE_CSS = `
    :host { display:block; font-family:'Titillium Web', system-ui, sans-serif; color:#10262E; }
    * { box-sizing:border-box; }
    button { font-family:inherit; }
    .wrap { position:relative; border-radius:22px; background:#FFFFFF; overflow:hidden;
      box-shadow:0 30px 80px -40px rgba(16,38,46,.28); }
    .grad-border { border-radius:22px; padding:1.5px; background:${GRAD}; }
    .inner { border-radius:20.5px; background:#FFFFFF; }
    .pad { padding:clamp(26px,3.4vw,40px); }
    .kicker { font-weight:600; font-size:11px; letter-spacing:.3em; text-transform:uppercase;
      background:${GRAD}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:#3BAED1; }
    .head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .head b { font-weight:700; font-size:clamp(19px,1.4vw,24px); color:#10262E; }
    .meta { font-weight:600; font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:#6B7E86; }
    .step { font-weight:600; font-size:11px; letter-spacing:.24em; text-transform:uppercase; color:#6B7E86; margin:0 0 12px; }
    .sec { margin-top:26px; }
    .days { display:flex; gap:9px; overflow-x:auto; padding:5px 0 6px; scrollbar-width:thin; }
    .day { flex:none; width:66px; padding:11px 0; border-radius:12px; cursor:pointer; text-align:center;
      background:#F6FBFD; color:#6B7E86; border:1px solid #D6E7EE; transition:transform .18s ease, border-color .2s ease; }
    .day:hover { transform:translateY(-2px); }
    .day .dow { display:block; font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; font-weight:600; opacity:.85; }
    .day .dom { display:block; font-weight:700; font-size:21px; line-height:1.15; color:#10262E; }
    .day .mon { display:block; font-size:10px; opacity:.7; }
    .day.sel { border-color:transparent; color:#FFFFFF; background:${GRAD}; box-shadow:0 14px 26px -14px rgba(59,174,209,.6); }
    .day.sel .dow, .day.sel .mon, .day.sel .dom { color:#FFFFFF; opacity:1; }
    .times { display:grid; grid-template-columns:repeat(3,1fr); gap:9px; }
    .time { padding:13px 6px; border-radius:12px; cursor:pointer; font-weight:700; font-size:14px; letter-spacing:.02em;
      background:#F6FBFD; color:#10262E; border:1px solid #D6E7EE; transition:transform .18s ease, border-color .2s ease; }
    .time:hover:not([disabled]) { transform:translateY(-2px); }
    .time.sel { border-color:transparent; color:#FFFFFF; background:${GRAD}; box-shadow:0 14px 26px -14px rgba(59,174,209,.6); }
    .time[disabled] { opacity:.32; cursor:not-allowed; text-decoration:line-through; }
    .empty { grid-column:1/-1; font-weight:400; font-size:14px; color:#9CB0B8; padding:8px 2px; }
    .fields { display:grid; gap:20px 24px; grid-template-columns:1fr 1fr; }
    .f { display:flex; flex-direction:column; gap:8px; }
    .f.full { grid-column:1/-1; }
    .f span { font-weight:600; font-size:11px; letter-spacing:.24em; text-transform:uppercase; color:#6B7E86; }
    input, textarea { width:100%; margin:0; font-family:inherit; font-weight:600; font-size:16px; line-height:1.4; color:#10262E;
      background:transparent; border:none; border-bottom:1px solid #D6E7EE; border-radius:0; padding:6px 2px 10px; outline:none;
      transition:border-color .2s ease; }
    textarea { min-height:70px; resize:vertical; line-height:1.55; }
    input:focus, textarea:focus { border-bottom-color:#3BAED1; outline:3px solid rgba(59,174,209,.55); outline-offset:3px; }
    input::placeholder, textarea::placeholder { color:#9CB0B8; font-weight:400; }
    .privacy { display:flex; gap:12px; align-items:flex-start; cursor:pointer; margin-top:20px; }
    .privacy input { flex:0 0 auto; width:18px; height:18px; margin:2px 0 0; accent-color:#3BAED1; cursor:pointer; }
    .privacy span { font-weight:400; font-size:13px; line-height:1.6; color:#6B7E86; }
    .privacy a { color:#3BAED1; font-weight:600; text-decoration:none; }
    .err { color:#C0392B; font-weight:600; font-size:13px; margin-top:14px; }
    .row { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:14px 24px; margin-top:24px; }
    .cta { position:relative; overflow:hidden; display:inline-flex; align-items:center; gap:12px; font-weight:700; font-size:15px;
      letter-spacing:.02em; color:#FFFFFF; background:${GRAD}; border:none; padding:14px 30px; border-radius:999px; cursor:pointer;
      box-shadow:0 16px 32px -12px rgba(59,174,209,.5); transition:transform .2s ease, box-shadow .2s ease; }
    .cta:hover:not([disabled]) { transform:translateY(-2px); box-shadow:0 22px 44px -14px rgba(59,174,209,.6); }
    .cta[disabled] { opacity:.45; cursor:not-allowed; box-shadow:none; }
    .cta:focus-visible { outline:3px solid rgba(59,174,209,.55); outline-offset:3px; }
    .foot { font-weight:400; font-size:12px; color:#9CB0B8; }
    .done { text-align:center; padding:clamp(40px,6vw,68px) clamp(24px,4vw,40px); }
    .mark { width:84px; height:84px; margin:0 auto 22px; border-radius:50%; padding:2px; box-sizing:border-box; background:${GRAD};
      filter:drop-shadow(0 10px 22px rgba(59,174,209,.35)); }
    .mark > div { width:100%; height:100%; border-radius:50%; background:#FFFFFF; display:flex; align-items:center; justify-content:center; }
    .done h3 { font-weight:700; font-size:clamp(22px,2vw,28px); margin:0 0 10px; color:#10262E; }
    .done p { font-weight:400; font-size:15px; line-height:1.6; color:#6B7E86; max-width:380px; margin:0 auto; }
    .done .when { font-weight:700; color:#10262E; }
    .ghost { margin-top:26px; background:none; border:1px solid #D6E7EE; color:#10262E; padding:12px 24px; border-radius:999px;
      cursor:pointer; font-weight:700; font-size:14px; transition:border-color .2s ease, transform .18s ease; }
    .ghost:hover { transform:translateY(-2px); border-color:#3BAED1; }
    .tick { position:absolute; width:22px; height:22px; }

    /* ---- v2: Zwei-Spalten ---- */
    .v2 .cols { display:grid; grid-template-columns:minmax(190px,0.62fr) 1fr; }
    .v2 .left { background:#F6FBFD; border-right:1px solid #D6E7EE; padding:clamp(24px,2.6vw,32px); }
    .v2 .right { padding:clamp(24px,2.6vw,32px); }
    .v2 .days { flex-direction:column; overflow:visible; gap:7px; }
    .v2 .day { width:100%; display:flex; align-items:center; gap:12px; text-align:left; padding:11px 14px; }
    .v2 .day .dow { font-size:11px; } .v2 .day .dom { font-size:18px; } .v2 .day .mon { display:inline; font-size:11px; }
    .v2 .summary { margin-top:22px; padding-top:20px; border-top:1px solid #D6E7EE; }
    .v2 .summary .lbl { font-weight:600; font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:#6B7E86; }
    .v2 .summary .val { font-weight:700; font-size:17px; color:#10262E; margin-top:4px; }
    .v2 .fields { grid-template-columns:1fr 1fr; }

    /* ---- v3: Kompakt ---- */
    .v3 .wrap { border-radius:16px; }
    .v3 .grad-border { border-radius:17.5px; }
    .v3 .inner { border-radius:16px; }
    .v3 .pad { padding:clamp(20px,2.4vw,26px); }
    .v3 .day { width:56px; padding:8px 0; border-radius:10px; }
    .v3 .day .dom { font-size:18px; }
    .v3 .times { grid-template-columns:repeat(6,1fr); gap:7px; }
    .v3 .time { padding:10px 4px; font-size:13px; border-radius:9px; }
    .v3 .sec { margin-top:18px; }
    .v3 .fields { grid-template-columns:1fr 1fr; gap:14px 16px; }
    .v3 input, .v3 textarea { font-size:15px; }

    /* ---- v4: Blueprint ---- */
    .v4 .inner { background:#FBFDFE; }
    .v4 .pad { padding:clamp(28px,3.4vw,42px); }
    .v4 .head b { letter-spacing:.01em; }
    .v4 .step { color:#3BAED1; }
    .v4 .day, .v4 .time { border-radius:4px; background:#FFFFFF; border-color:#CBE7F0; }
    .v4 .day.sel, .v4 .time.sel { background:${GRAD}; }
    .v4 .day.sel .dow, .v4 .day.sel .mon { color:#FFFFFF; }
    .v4 .times { gap:7px; }
    .v4 input, .v4 textarea { background:#FFFFFF; border:1px solid #CBE7F0; border-radius:4px; padding:11px 12px; font-weight:600; font-size:15px; }
    .v4 .cta { border-radius:6px; }
    .v4 .divider { height:1px; background:#D6E7EE; margin:24px 0 0; }

    @media (max-width:560px) {
      .fields, .v2 .fields, .v3 .fields { grid-template-columns:1fr; }
      .v2 .cols { grid-template-columns:1fr; }
      .v2 .left { border-right:none; border-bottom:1px solid #D6E7EE; }
      .v2 .days { flex-direction:row; overflow-x:auto; }
      .v2 .day { width:66px; flex:none; flex-direction:column; text-align:center; }
      .times { grid-template-columns:repeat(2,1fr); }
      .v3 .times { grid-template-columns:repeat(3,1fr); }
    }
  `;

  const CHECK = '<svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true"><defs><linearGradient id="bkChk" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse"><stop stop-color="#3BAED1"/><stop offset="1" stop-color="#45B347"/></linearGradient></defs><path d="M7 19.5 15 27.5 29 10" stroke="url(#bkChk)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  class IphBooking extends HTMLElement {
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      this.variant = (this.getAttribute("variant") || "v1").toLowerCase();
      this.demoBooked = new Set();  // Demo: "date|time" belegt
      this.state = {
        dates: nextDays(BOOK_DAYS),
        selDate: null, selTime: null,
        avail: null,                // live: { time: {slot_id,label,remaining,is_available} }
        form: { name: "", company: "", email: "", note: "", hp: "" },
        privacy: false, error: null, submitting: false, done: false,
      };
      this.state.selDate = this.state.dates[0] ? this.state.dates[0].iso : null;
      this.root = this.attachShadow({ mode: "open" });
      const style = document.createElement("style"); style.textContent = BASE_CSS;
      this.mount = document.createElement("div"); this.mount.className = this.variant;
      this.root.append(style, this.mount);
      this.loadAvail();
    }

    curDate() { return this.state.dates.find(x => x.iso === this.state.selDate) || null; }
    selLabel() { const d = this.curDate(); return d ? `${d.dowl}, ${d.dom}. ${d.mon}` : ""; }

    async loadAvail() {
      this.state.avail = null; this.render();
      if (!live()) { this.state.avail = {}; this.render(); return; }
      try {
        const rows = await window.KIWBooking.loadAvailability(this.state.selDate);
        this.state.avail = (rows || []).reduce((m, r) => { m[r.label] = r; return m; }, {});
      } catch (e) { this.state.error = "Verfügbarkeit konnte nicht geladen werden. Bitte Seite neu laden."; }
      this.render();
    }

    remaining(t) {
      if (!live()) return this.demoBooked.has(this.state.selDate + "|" + t) ? 0 : SLOT_CAPACITY;
      if (!this.state.avail) return null;                 // lädt noch
      const r = this.state.avail[t];
      if (!r) return 0;
      if (r.is_available === false) return 0;
      return r.remaining != null ? r.remaining : 0;
    }

    valid() {
      const f = this.state.form;
      return this.state.selDate && this.state.selTime && f.name.trim() && /\S+@\S+\.\S+/.test(f.email) && this.state.privacy;
    }

    async submit() {
      if (!this.valid() || this.state.submitting) return;
      this.state.error = null; this.state.submitting = true; this.render();
      const f = this.state.form, s = this.state;
      try {
        if (live()) {
          const row = s.avail && s.avail[s.selTime];
          if (!row || row.slot_id == null) { s.error = "Dieser Termin ist nicht mehr verfügbar."; s.selTime = null; }
          else {
            const r = await window.KIWBooking.bookSlot(s.selDate, row.slot_id, f.name.trim(), f.email.trim(), f.company.trim(), f.note.trim(), (typeof location !== "undefined" ? location.href : ""), f.hp);
            if (r === "ok") s.done = true;
            else if (r === "full") { s.error = "Dieser Termin ist gerade belegt. Bitte anderen wählen."; s.selTime = null; await this.loadAvail(); }
            else s.error = "Dieser Termin ist nicht mehr verfügbar.";
          }
        } else {
          await new Promise(r => setTimeout(r, 650));        // Demo-Beat
          this.demoBooked.add(s.selDate + "|" + s.selTime);  // Slot an dem Tag „weg"
          s.done = true;
        }
      } catch (e) { s.error = "Buchung fehlgeschlagen. Bitte erneut versuchen."; }
      finally { s.submitting = false; this.render(); }
    }

    reset(keepDate) {
      const s = this.state;
      s.done = false; s.selTime = null; s.error = null; s.privacy = false;
      s.form = { name: "", company: "", email: "", note: "", hp: "" };
      if (!keepDate) s.selDate = s.dates[0] ? s.dates[0].iso : null;
      this.loadAvail();
    }

    /* ---------- Teil-Renderer ---------- */
    daysHTML() {
      return this.state.dates.map(d => `<button class="day ${d.iso === this.state.selDate ? "sel" : ""}" data-date="${d.iso}" type="button" aria-pressed="${d.iso === this.state.selDate}">
        <span class="dow">${d.dow}</span><span class="dom">${d.dom}</span><span class="mon">${d.mon}</span></button>`).join("");
    }
    timesHTML() {
      const times = timesFor(this.curDate());
      if (!times.length) return `<div class="empty">Keine Termine an diesem Tag.</div>`;
      if (live() && this.state.avail === null) return `<div class="empty">Verfügbarkeit wird geladen …</div>`;
      return times.map(t => {
        const rem = this.remaining(t), full = rem != null && rem <= 0;
        return `<button class="time ${t === this.state.selTime ? "sel" : ""}" data-time="${t}" type="button" ${full ? "disabled aria-disabled=true" : ""}>${t}</button>`;
      }).join("");
    }
    fieldsHTML() {
      const f = this.state.form;
      return `<div class="fields">
        <label class="f"><span>Name *</span><input data-k="name" type="text" autocomplete="name" placeholder="Vor- und Nachname" value="${esc(f.name)}"></label>
        <label class="f"><span>Unternehmen</span><input data-k="company" type="text" autocomplete="organization" placeholder="Ihr Unternehmen" value="${esc(f.company)}"></label>
        <label class="f full"><span>E-Mail *</span><input data-k="email" type="email" autocomplete="email" placeholder="name@unternehmen.de" value="${esc(f.email)}"></label>
        <label class="f full"><span>Nachricht (optional)</span><textarea data-k="note" placeholder="Ihre Nachricht">${esc(f.note)}</textarea></label>
        <label class="f full" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;" aria-hidden="true"><span>Website</span><input data-k="hp" name="website" type="text" tabindex="-1" autocomplete="off" value="${esc(f.hp || "")}"></label>
      </div>
      <label class="privacy"><input data-k="privacy" type="checkbox" ${this.state.privacy ? "checked" : ""}>
        <span>Ich bin einverstanden, dass machineering meine Angaben zur Terminvereinbarung verarbeitet. <a href="datenschutz.html">Datenschutzerklärung</a></span></label>`;
    }
    ctaHTML() {
      const ok = this.valid() && !this.state.submitting;
      return `<div class="row">
        <button class="cta" data-go type="button" ${ok ? "" : "disabled"}>${this.state.submitting ? "Wird angefragt …" : "Termin buchen"} <span aria-hidden="true">→</span></button>
        <div class="foot">${live() ? "Echtzeit-Verfügbarkeit · Bestätigung per E-Mail" : "Demo-Modus — keine Speicherung"}</div>
      </div>${this.state.error ? `<div class="err">${esc(this.state.error)}</div>` : ""}`;
    }
    doneHTML() {
      return `<div class="done"><div class="mark"><div>${CHECK}</div></div>
        <h3>Termin gebucht</h3>
        <p><span class="when">${esc(this.selLabel())} · ${esc(this.state.selTime || "")} Uhr</span> — Sie erhalten die Bestätigung per E-Mail.</p>
        <button class="ghost" data-again type="button">Weiteren Termin wählen</button></div>`;
    }
    corners() {
      return ['border-top:2px solid #3BAED1;border-left:2px solid #3BAED1;left:-1px;top:-1px',
              'border-top:2px solid #3FB18F;border-right:2px solid #3FB18F;right:-1px;top:-1px',
              'border-bottom:2px solid #3FB18F;border-left:2px solid #3FB18F;left:-1px;bottom:-1px',
              'border-bottom:2px solid #45B347;border-right:2px solid #45B347;right:-1px;bottom:-1px']
        .map(s => `<span class="tick" aria-hidden="true" style="${s}"></span>`).join("");
    }

    render() {
      const s = this.state;
      let body;
      if (s.done) body = this.doneHTML();
      else if (this.variant === "v2") {
        body = `<div class="cols">
          <div class="left">
            <div class="kicker">Termin</div>
            <p class="step" style="margin-top:14px">Tag wählen</p>
            <div class="days">${this.daysHTML()}</div>
            <div class="summary"><div class="lbl">Ihr Termin</div>
              <div class="val">${s.selTime ? esc(this.selLabel()) + " · " + esc(s.selTime) : esc(this.selLabel())}</div></div>
          </div>
          <div class="right">
            <div class="head"><b>Erstgespräch · ${DURATION}</b><span class="meta">kostenlos · remote</span></div>
            <div class="sec"><p class="step">Uhrzeit wählen</p><div class="times">${this.timesHTML()}</div></div>
            <div class="sec"><p class="step">Kontakt</p>${this.fieldsHTML()}</div>
            ${this.ctaHTML()}
          </div></div>`;
      } else if (this.variant === "v3") {
        body = `<div class="pad">
          <div class="head"><b>Termin buchen · ${DURATION}</b><span class="meta">Erstgespräch · remote</span></div>
          <div class="sec"><p class="step">Tag</p><div class="days">${this.daysHTML()}</div></div>
          <div class="sec"><p class="step">Uhrzeit</p><div class="times">${this.timesHTML()}</div></div>
          <div class="sec"><p class="step">Kontakt</p>${this.fieldsHTML()}</div>
          ${this.ctaHTML()}</div>`;
      } else if (this.variant === "v4") {
        body = `<div class="pad">${this.corners()}
          <div class="head"><div><div class="kicker">Terminbuchung</div><b style="display:block;margin-top:8px">Erstgespräch · ${DURATION}</b></div><span class="meta">kostenlos · remote</span></div>
          <div class="sec"><p class="step">01 · Tag wählen</p><div class="days">${this.daysHTML()}</div></div>
          <div class="sec"><p class="step">02 · Uhrzeit wählen</p><div class="times">${this.timesHTML()}</div></div>
          <div class="divider"></div>
          <div class="sec"><p class="step">03 · Kontakt</p>${this.fieldsHTML()}</div>
          ${this.ctaHTML()}</div>`;
      } else { /* v1 */
        body = `<div class="pad">
          <div class="head"><div><div class="kicker">Terminbuchung</div><b style="display:block;margin-top:8px">Erstgespräch · ${DURATION}</b></div><span class="meta">kostenlos · remote</span></div>
          <div class="sec"><p class="step">1 · Tag wählen</p><div class="days">${this.daysHTML()}</div></div>
          <div class="sec"><p class="step">2 · Uhrzeit wählen</p><div class="times">${this.timesHTML()}</div></div>
          <div class="sec"><p class="step">3 · Kontakt</p>${this.fieldsHTML()}</div>
          ${this.ctaHTML()}</div>`;
      }
      this.mount.innerHTML = `<div class="grad-border"><div class="wrap inner">${body}</div></div>`;
      this.bind();
    }

    bind() {
      const q = sel => this.mount.querySelectorAll(sel), s = this.state;
      q(".day").forEach(b => b.onclick = () => { s.selDate = b.dataset.date; s.selTime = null; s.error = null; this.loadAvail(); });
      q(".time").forEach(b => b.onclick = () => { if (!b.hasAttribute("disabled")) { s.selTime = b.dataset.time; s.error = null; this.render(); } });
      q("[data-k]").forEach(el => {
        const k = el.dataset.k;
        if (k === "privacy") { el.onchange = () => { s.privacy = el.checked; this.refreshCta(); }; return; }
        el.oninput = () => { s.form[k] = el.value; this.refreshCta(); };
      });
      const go = this.mount.querySelector("[data-go]"); if (go) go.onclick = () => this.submit();
      const again = this.mount.querySelector("[data-again]"); if (again) again.onclick = () => this.reset(true);
    }
    refreshCta() { const go = this.mount.querySelector("[data-go]"); if (go) go.disabled = !(this.valid() && !this.state.submitting); }
  }

  if (!customElements.get("iph-booking")) customElements.define("iph-booking", IphBooking);
})();
