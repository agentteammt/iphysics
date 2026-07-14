// ============================================================================
// Supabase Edge Function: book  (iPhysics Terminbuchung)
// ----------------------------------------------------------------------------
// Nimmt die Buchung entgegen, prüft/speichert atomar über die SQL-Funktion
// book_slot und verschickt anschließend zwei E-Mails:
//   1) INTERN  an u.zenker@team-mt.de  — Betreff "iPhysics Anfrage – Terminbuchung",
//              Reply-To = Absender, Body mit Seiten-URL + TimeSlot + allen Angaben.
//   2) BESTÄTIGUNG an den Interessenten — Dank + 48-h-Zusage, Hinweis dass der
//              Termin-/Meeting-Link noch folgt, plus Outlook-Kalender (.ics-Anhang
//              + "Zum Kalender hinzufügen"-Button).
// Antwortet mit { status: "booked" | "full" | "invalid_slot" }.
//
// Deploy:  supabase functions deploy book --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automatisch) + RESEND_API_KEY
//
//  >>> E-Mail-Adressen: Konstanten MAIL_FROM / MAIL_INTERNAL unten. <<<
//  >>> WICHTIG: Die Domain team-mt.de muss bei Resend als Absender VERIFIZIERT sein,
//      sonst lehnt Resend den Versand ab. Für einen ersten Test kann alternativ
//      "onboarding@resend.dev" als MAIL_FROM dienen (dann geht die Bestätigung nur
//      an die bei Resend registrierte Test-Adresse). <<<
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- FIXE WERTE (Testlauf) -------------------------------------------------
const MAIL_FROM      = "iPhysics machineering <u.zenker@team-mt.de>"; // verifizierter Absender bei Resend
const MAIL_INTERNAL  = "u.zenker@team-mt.de";                          // interne Empfängeradresse
const SUBJECT_INTERN = "iPhysics Anfrage – Terminbuchung";            // Betreff intern
const EVENT_TITLE    = "iPhysics machineering Erstgespräch";
const EVENT_LOCATION = "Online-Termin (Meeting-Link folgt)";
const EVENT_DESC     = "iPhysics Erstgespräch – der finale Termin- bzw. Meeting-Link wird Ihnen separat zugesendet.";
const EVENT_MINUTES  = 30;
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// UTF-8-sicheres Base64 (für den .ics-Anhang bei Resend).
function b64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

// "HH:MM" + Minuten -> "HH:MM"
function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + mins;
  return String(Math.floor(t / 60) % 24).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}

// .ics mit lokaler (floating) Zeit — deutsche Clients interpretieren als Europe/Berlin.
function buildIcs(date: string, start: string, end: string): string {
  const d = date.replace(/-/g, "");
  const dtStart = `${d}T${start.replace(":", "")}00`;
  const dtEnd = `${d}T${end.replace(":", "")}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const uid = (crypto.randomUUID?.() ?? Date.now() + "-" + Math.random()) + "@team-mt.de";
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//machineering//iPhysics//DE",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + stamp,
    "DTSTART:" + dtStart, "DTEND:" + dtEnd,
    "SUMMARY:" + EVENT_TITLE, "LOCATION:" + EVENT_LOCATION, "DESCRIPTION:" + EVENT_DESC,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

// Outlook-Web-Deeplink ("Zum Kalender hinzufügen").
function outlookLink(date: string, start: string, end: string): string {
  const p = new URLSearchParams({
    path: "/calendar/action/compose", rru: "addevent",
    subject: EVENT_TITLE, location: EVENT_LOCATION, body: EVENT_DESC,
    startdt: `${date}T${start}:00`, enddt: `${date}T${end}:00`,
  });
  return "https://outlook.office.com/calendar/0/deeplink/compose?" + p.toString();
}

const BTN = "display:inline-block;padding:12px 26px;border-radius:999px;background:linear-gradient(120deg,#3BAED1,#45B347);color:#ffffff;font-weight:700;font-family:'Titillium Web',Arial,sans-serif;text-decoration:none;font-size:15px;";

interface MailOpts { replyTo?: string; ics?: string }

async function sendMail(to: string, subject: string, html: string, opts: MailOpts = {}) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return; // ohne Key: Mail überspringen (Buchung bleibt gültig)
  const body: Record<string, unknown> = { from: MAIL_FROM, to, subject, html };
  if (opts.replyTo) body.reply_to = opts.replyTo;
  if (opts.ics) body.attachments = [{ filename: "iPhysics-Termin.ics", content: b64(opts.ics) }];
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ status: "invalid_slot" }, 405);

  let payload: any = {};
  try { payload = await req.json(); } catch { return json({ status: "invalid_slot" }, 400); }

  const { date, slot_id, name, email, company, note, page_url } = payload;
  if (!date || !slot_id || !name || !email) return json({ status: "invalid_slot" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Atomar buchen (Kapazitätsprüfung steckt in der SQL-Funktion).
  const { data, error } = await supabase.rpc("book_slot", {
    p_date: date, p_slot_id: slot_id, p_name: name, p_email: email,
    p_company: company ?? null, p_note: note ?? null,
  });
  if (error) return json({ status: "invalid_slot", error: error.message }, 500);

  const result = typeof data === "string" ? data : (data?.book_slot ?? "invalid_slot");
  if (result === "full")         return json({ status: "full" });
  if (result === "invalid_slot") return json({ status: "invalid_slot" });

  // result === 'ok' -> Buchung gespeichert, jetzt Mails schicken.
  const start = String(slot_id);
  const end = addMinutes(start, EVENT_MINUTES);
  let whenNice = `${date} um ${start} Uhr`;
  try {
    whenNice = new Date(`${date}T${start}:00`).toLocaleDateString("de-DE",
      { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) + ` um ${start} Uhr`;
  } catch { /* Fallback oben */ }

  const ics = buildIcs(date, start, end);
  const ol = outlookLink(date, start, end);
  const url = page_url ? String(page_url) : "—";

  // 1) Bestätigung an den Interessenten
  const guestHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<p>Hallo ${esc(name)},</p>` +
    `<p>vielen Dank für Ihre Anfrage. Wir prüfen Ihren Wunschtermin am ` +
    `<strong>${esc(whenNice)}</strong> und melden uns innerhalb der nächsten 48 Stunden bei Ihnen zurück.</p>` +
    `<p>Den finalen Termin- bzw. Meeting-Link erhalten Sie separat, sobald wir Ihre Anfrage bestätigt haben.</p>` +
    `<p style="margin:22px 0;"><a href="${esc(ol)}" style="${BTN}">Zum Outlook-Kalender hinzufügen</a></p>` +
    `<p style="color:#6B7E86;font-size:13px;">Der Termin liegt dieser E-Mail zusätzlich als Kalenderdatei (.ics) bei — ein Klick genügt in Outlook, Apple Kalender und Co.</p>` +
    `<p style="color:#6B7E86;font-size:13px;margin-top:24px;">iPhysics by machineering</p></div>`;
  await sendMail(email, "Ihre iPhysics Terminanfrage – Eingang bestätigt", guestHtml, { replyTo: MAIL_INTERNAL, ics });

  // 2) Interne Benachrichtigung (Reply-To = Absender)
  const internHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<h2 style="margin:0 0 12px;">Neue Terminanfrage über iPhysics</h2>` +
    `<table style="border-collapse:collapse;font-size:15px;">` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Termin</td><td style="padding:4px 0;"><strong>${esc(whenNice)}</strong></td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Name</td><td style="padding:4px 0;">${esc(name)}</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Unternehmen</td><td style="padding:4px 0;">${esc(company) || "—"}</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">E-Mail</td><td style="padding:4px 0;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;vertical-align:top;">Nachricht</td><td style="padding:4px 0;">${esc(note) || "—"}</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Seite</td><td style="padding:4px 0;"><a href="${esc(url)}">${esc(url)}</a></td></tr>` +
    `</table>` +
    `<p style="margin:22px 0;"><a href="${esc(ol)}" style="${BTN}">Termin in Outlook eintragen</a></p>` +
    `<p style="color:#6B7E86;font-size:13px;">Antworten Sie direkt auf diese E-Mail, um dem Interessenten zu schreiben (Reply-To ist gesetzt).</p></div>`;
  await sendMail(MAIL_INTERNAL, SUBJECT_INTERN, internHtml, { replyTo: email, ics });

  return json({ status: "booked" });
});
