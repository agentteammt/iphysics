// ============================================================================
// Vercel Function: POST /api/book  (iPhysics Terminbuchung)
// Speichert die Buchung in Neon (Schema machineering; der Unique-Constraint auf
// slot_start verhindert Doppelbuchungen atomar) und verschickt zwei E-Mails
// über Lettermint:
//   1) BESTÄTIGUNG an den Interessenten — Dank + 48-h-Zusage, Outlook-Button
//      + .ics-Kalenderanhang.
//   2) INTERN an sales@machineering.com — alle Angaben, Reply-To = Absender.
// Antwort: { status: "booked" | "full" | "invalid_slot" }
// Env: DATABASE_URL (Neon-Integration), LETTERMINT_API_KEY
// ============================================================================
import { sql, sendMail, rateLimited, body, cap, esc, EMAIL_RE, MAIL_INTERNAL, MAIL_CC, BTN } from './_shared.js';

const SUBJECT_INTERN = 'iPhysics Anfrage – Terminbuchung';
const EVENT_TITLE    = 'iPhysics machineering Erstgespräch';
const EVENT_LOCATION = 'Online-Termin (Meeting-Link folgt)';
const EVENT_DESC     = 'iPhysics Erstgespräch – der finale Termin- bzw. Meeting-Link wird Ihnen separat zugesendet.';

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + mins;
  return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

// .ics mit lokaler (floating) Zeit — deutsche Clients interpretieren als Europe/Berlin.
function buildIcs(date, start, end) {
  const d = date.replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = crypto.randomUUID() + '@machineering.com';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//machineering//iPhysics//DE',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + stamp,
    'DTSTART:' + d + 'T' + start.replace(':', '') + '00',
    'DTEND:' + d + 'T' + end.replace(':', '') + '00',
    'SUMMARY:' + EVENT_TITLE, 'LOCATION:' + EVENT_LOCATION, 'DESCRIPTION:' + EVENT_DESC,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

function outlookLink(date, start, end) {
  const p = new URLSearchParams({
    path: '/calendar/action/compose', rru: 'addevent',
    subject: EVENT_TITLE, location: EVENT_LOCATION, body: EVENT_DESC,
    startdt: `${date}T${start}:00`, enddt: `${date}T${end}:00`,
  });
  return 'https://outlook.office.com/calendar/0/deeplink/compose?' + p.toString();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ status: 'invalid_slot' });
  const payload = body(req);

  // Honeypot: Feld "website" füllen nur Bots -> vorgetäuschter Erfolg, kein Versand.
  if (payload.website) return res.status(200).json({ status: 'booked' });
  if (await rateLimited(req, 'book')) return res.status(429).json({ status: 'invalid_slot', error: 'rate_limit' });

  const date = cap(payload.date, 20), slot_id = cap(payload.slot_id, 10);
  const name = cap(payload.name, 160), email = cap(payload.email, 200);
  const company = cap(payload.company, 200) || null, note = cap(payload.note, 2000) || null;
  const page_url = cap(payload.page_url, 400) || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(slot_id) || !name || !EMAIL_RE.test(email)) {
    return res.status(400).json({ status: 'invalid_slot' });
  }

  // Atomar speichern: Unique-Constraint auf slot_start -> zweite Buchung = 'full'.
  let minutes = 30;
  try {
    const slot = await sql`select duration_min from machineering.slots where slot_id = ${slot_id}`;
    if (!slot.length) return res.status(400).json({ status: 'invalid_slot' });
    minutes = slot[0].duration_min;
    await sql`
      insert into machineering.bookings (name, email, company, note, slot_start, slot_end)
      values (${name}, ${email}, ${company}, ${note},
        ((${date} || ' ' || ${slot_id})::timestamp at time zone 'Europe/Berlin'),
        ((${date} || ' ' || ${slot_id})::timestamp at time zone 'Europe/Berlin') + make_interval(mins => ${minutes}))`;
  } catch (e) {
    if (e && e.code === '23505') return res.status(200).json({ status: 'full' });
    return res.status(500).json({ status: 'invalid_slot', error: 'db' });
  }

  const start = slot_id, end = addMinutes(start, minutes);
  let whenNice = `${date} um ${start} Uhr`;
  try {
    whenNice = new Date(`${date}T${start}:00`).toLocaleDateString('de-DE',
      { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) + ` um ${start} Uhr`;
  } catch { /* Fallback oben */ }

  const ics = buildIcs(date, start, end);
  const ol = outlookLink(date, start, end);
  const url = page_url || '—';

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
  await sendMail(email, 'Ihre iPhysics Terminanfrage – Eingang bestätigt', guestHtml, { replyTo: MAIL_INTERNAL, ics });

  // 2) Interne Benachrichtigung (Reply-To = Absender)
  const internHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<h2 style="margin:0 0 12px;">Neue Terminanfrage über iPhysics</h2>` +
    `<table style="border-collapse:collapse;font-size:15px;">` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Termin</td><td style="padding:4px 0;"><strong>${esc(whenNice)}</strong></td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Name</td><td style="padding:4px 0;">${esc(name)}</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Unternehmen</td><td style="padding:4px 0;">${esc(company) || '—'}</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">E-Mail</td><td style="padding:4px 0;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;vertical-align:top;">Nachricht</td><td style="padding:4px 0;">${esc(note) || '—'}</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Seite</td><td style="padding:4px 0;"><a href="${esc(url)}">${esc(url)}</a></td></tr>` +
    `</table>` +
    `<p style="margin:22px 0;"><a href="${esc(ol)}" style="${BTN}">Termin in Outlook eintragen</a></p>` +
    `<p style="color:#6B7E86;font-size:13px;">Antworten Sie direkt auf diese E-Mail, um dem Interessenten zu schreiben (Reply-To ist gesetzt).</p></div>`;
  await sendMail(MAIL_INTERNAL, SUBJECT_INTERN, internHtml, { replyTo: email, ics, cc: MAIL_CC });

  return res.status(200).json({ status: 'booked' });
}
