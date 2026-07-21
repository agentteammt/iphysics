/* ============================================================================
   backend.js — API-Schicht für Terminbuchung + Kontaktformular.
   ----------------------------------------------------------------------------
   Backend: Vercel Functions unter /api (Neon-Datenbank + Lettermint-Versand).
   Es gibt KEINE Schlüssel im Frontend — die Endpoints laufen same-origin.

   Aktivierung über ein Snippet in der Seite (VOR diesem Script):
     <script>window.KIW_BACKEND = { base: "/api" };</script>
     <script defer src="backend.js"></script>
   Ohne window.KIW_BACKEND: Demo-Modus (Widgets simulieren, nichts wird gesendet).

   Stellt window.KIWBooking bereit:
     - configured()                                        -> bool
     - loadAvailability(date)                              -> [{ slot_id, label, remaining, is_available }]
     - bookSlot(date, slotId, name, email, company, note, pageUrl, website) -> 'ok' | 'full' | 'invalid'
     - sendContact(data)                                   -> 'ok' | 'invalid'
   ============================================================================ */
(function () {
  function cfg() { return window.KIW_BACKEND || {}; }
  function base() {
    var b = cfg().base != null ? cfg().base : "/api";
    return String(b).replace(/\/+$/, "");
  }
  function configured() { return !!window.KIW_BACKEND; }
  function headers() { return { "Content-Type": "application/json" }; }

  // Verfügbarkeit für ein Datum lesen (läuft serverseitig über /api/availability).
  async function loadAvailability(date) {
    if (!configured()) return null; // Demo-Modus
    var res = await fetch(base() + "/availability", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ date: date || null }),
    });
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      var msg = (data && (data.message || data.error)) || ("HTTP " + res.status);
      var err = new Error(msg); err.status = res.status; err.data = data; throw err;
    }
    if (!Array.isArray(data)) return [];
    // Normalisieren: { slot_id, label, remaining } -> + is_available
    return data.map(function (r) {
      var label = r.label != null ? r.label : String(r.slot_id || "");
      var remaining = r.remaining != null ? r.remaining : 0;
      var isAvail = r.is_available != null ? r.is_available : (remaining > 0);
      return { slot_id: r.slot_id, label: label, remaining: remaining, is_available: isAvail };
    });
  }

  // Slot an einem Datum buchen. -> 'ok' | 'full' | 'invalid'
  // pageUrl (optional) wandert in die interne Mail; website = Honeypot (bleibt bei Menschen leer).
  async function bookSlot(date, slotId, name, email, company, note, pageUrl, website) {
    if (!configured()) throw new Error("not-configured");
    var res = await fetch(base() + "/book", {
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
  // -> 'ok' | 'invalid'.  data = { topic, email, message, website, pageUrl }
  async function sendContact(data) {
    data = data || {};
    if (!configured()) throw new Error("not-configured");
    var res = await fetch(base() + "/contact", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        topic: data.topic || null, email: data.email || "", message: data.message || "",
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
