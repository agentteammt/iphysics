/* ============================================================================
   supabase.js — API-Schicht für die Terminbuchung.
   ----------------------------------------------------------------------------
   1:1 wiederverwendbar. NICHTS hier drin muss geändert werden — die
   Zugangsdaten kommen aus window.KIW_SUPABASE (siehe index.html-Snippet).

   Stellt window.KIWBooking bereit:
     - configured()                                  -> bool
     - loadAvailability(date)                         -> [{ slot_id, label, remaining, is_available }]
     - bookSlot(date, slotId, name, email, company, note) -> 'ok' | 'full' | 'invalid'

   Zwei Backend-Aufrufe:
     - LESEN   : POST /rest/v1/rpc/get_availability   Body { p_date }
     - SCHREIBEN: POST /functions/v1/book             Body { date, slot_id, name, email, company, note }
   ============================================================================ */
(function () {
  function cfg() { return window.KIW_SUPABASE || {}; }
  function base() { return String(cfg().url || "").replace(/\/+$/, ""); }
  function configured() { var c = cfg(); return !!(c.url && c.anonKey); }
  function headers() {
    var c = cfg();
    return {
      "apikey": c.anonKey,
      "Authorization": "Bearer " + c.anonKey,
      "Content-Type": "application/json",
    };
  }

  // Verfügbarkeit für ein Datum lesen.
  async function loadAvailability(date) {
    if (!configured()) return null; // Demo-Modus
    var res = await fetch(base() + "/rest/v1/rpc/get_availability", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ p_date: date || null }),
    });
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      var msg = (data && (data.message || data.error || data.hint)) || ("HTTP " + res.status);
      var err = new Error(msg); err.status = res.status; err.data = data; throw err;
    }
    if (!Array.isArray(data)) return [];
    // Normalisieren: RPC darf { slot_id, label, remaining } ODER roh { start_time, capacity, booked } liefern.
    return data.map(function (r) {
      var label = r.label != null ? r.label : (r.start_time != null ? String(r.start_time).slice(0, 5) : "");
      var remaining = r.remaining != null
        ? r.remaining
        : ((r.capacity != null ? r.capacity : 1) - (r.booked != null ? r.booked : 0));
      var isAvail = r.is_available != null ? r.is_available : (remaining > 0);
      return { slot_id: r.slot_id, label: label, remaining: remaining, is_available: isAvail };
    });
  }

  // Slot an einem Datum buchen. -> 'ok' | 'full' | 'invalid'
  // pageUrl (optional) wandert in die interne Mail (Seite, von der gebucht wurde).
  // website = Honeypot-Feld (bleibt bei Menschen leer).
  async function bookSlot(date, slotId, name, email, company, note, pageUrl, website) {
    if (!configured()) throw new Error("not-configured");
    var res = await fetch(base() + "/functions/v1/book", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        date: date, slot_id: slotId, name: name, email: email,
        company: company || null, note: note || null,
        website: website || null,
        page_url: pageUrl || (typeof location !== "undefined" ? location.href : null),
      }),
    });
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    var status = data && (data.status || data.result);
    if (status === "booked") return "ok";
    if (status === "already_booked" || status === "full") return "full";
    if (status === "invalid_slot") return "invalid";
    if (!res.ok) {
      var msg = (data && (data.message || data.error)) || ("HTTP " + res.status);
      var err = new Error(msg); err.status = res.status; err.data = data; throw err;
    }
    return "invalid";
  }

  // Kontaktformular („Anfrage-Blatt") — reine Nachricht, keine Buchung.
  // -> 'ok' | 'invalid'.  data = { topic, name, company, email, phone, message, pageUrl }
  async function sendContact(data) {
    data = data || {};
    if (!configured()) throw new Error("not-configured");
    var res = await fetch(base() + "/functions/v1/contact", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        topic: data.topic || null, name: data.name || "", company: data.company || null,
        email: data.email || "", phone: data.phone || null, message: data.message || "",
        website: data.website || null,
        page_url: data.pageUrl || (typeof location !== "undefined" ? location.href : null),
      }),
    });
    var out = null;
    try { out = await res.json(); } catch (e) { out = null; }
    var status = out && (out.status || out.result);
    if (status === "ok") return "ok";
    if (!res.ok) {
      var msg = (out && (out.message || out.error)) || ("HTTP " + res.status);
      var err = new Error(msg); err.status = res.status; err.data = out; throw err;
    }
    return "invalid";
  }

  window.KIWBooking = { configured: configured, loadAvailability: loadAvailability, bookSlot: bookSlot, sendContact: sendContact };
})();
