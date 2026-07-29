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
import { sql, sendMail, rateLimited, body, cap, esc, EMAIL_RE, MAIL_INTERNAL, MAIL_CC, BTN, pickLang, LANG_NAME } from './_shared.js';

const SUBJECT_INTERN = 'iPhysics Anfrage – Terminbuchung';
// Kalender-Ereignistexte je Sprache (Gast-Mail + .ics + Outlook-Link); intern bleibt Deutsch.
const EVENT = {
  de: { title: 'iPhysics machineering Erstgespräch', location: 'Online-Termin (Meeting-Link folgt)',
        desc: 'iPhysics Erstgespräch – der finale Termin- bzw. Meeting-Link wird Ihnen separat zugesendet.' },
  en: { title: 'iPhysics machineering intro call', location: 'Online meeting (link to follow)',
        desc: 'iPhysics intro call – the final appointment or meeting link will be sent to you separately.' },
  it: { title: 'Colloquio iniziale iPhysics machineering', location: 'Appuntamento online (il link seguirà)',
        desc: 'Colloquio iniziale iPhysics – il link definitivo all\'appuntamento vi sarà inviato separatamente.' },
};

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + mins;
  return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

// .ics mit lokaler (floating) Zeit — deutsche Clients interpretieren als Europe/Berlin.
function buildIcs(date, start, end, ev) {
  const d = date.replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = crypto.randomUUID() + '@machineering.com';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//machineering//iPhysics//DE',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + stamp,
    'DTSTART:' + d + 'T' + start.replace(':', '') + '00',
    'DTEND:' + d + 'T' + end.replace(':', '') + '00',
    'SUMMARY:' + ev.title, 'LOCATION:' + ev.location, 'DESCRIPTION:' + ev.desc,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

function outlookLink(date, start, end, ev) {
  const p = new URLSearchParams({
    path: '/calendar/action/compose', rru: 'addevent',
    subject: ev.title, location: ev.location, body: ev.desc,
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
  const lang = pickLang(payload);
  const ev = EVENT[lang];
  const niceDate = (locale, suffix) => {
    try {
      return new Date(`${date}T${start}:00`).toLocaleDateString(locale,
        { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) + suffix;
    } catch { return `${date} ${start}`; }
  };
  const whenIntern = niceDate('de-DE', ` um ${start} Uhr`); // interne Mail bleibt Deutsch
  const whenNice = lang === 'en' ? niceDate('en-GB', ` at ${start}`)
    : lang === 'it' ? niceDate('it-IT', ` alle ore ${start}`) : whenIntern;

  const ics = buildIcs(date, start, end, ev);
  const ol = outlookLink(date, start, end, ev);
  const url = page_url || '—';

  // 1) Bestätigung an den Interessenten — in der Sprache der Seite (de/en/it).
  const G = {
    de: { subject: 'Ihre iPhysics Terminanfrage – Eingang bestätigt', hello: `Hallo ${esc(name)},`,
          p1: `vielen Dank für Ihre Anfrage. Wir prüfen Ihren Wunschtermin am <strong>${esc(whenNice)}</strong> und melden uns innerhalb der nächsten 48 Stunden bei Ihnen zurück.`,
          p2: 'Den finalen Termin- bzw. Meeting-Link erhalten Sie separat, sobald wir Ihre Anfrage bestätigt haben.',
          btn: 'Zum Outlook-Kalender hinzufügen',
          icsNote: 'Der Termin liegt dieser E-Mail zusätzlich als Kalenderdatei (.ics) bei — ein Klick genügt in Outlook, Apple Kalender und Co.' },
    en: { subject: 'Your iPhysics appointment request – receipt confirmed', hello: `Hello ${esc(name)},`,
          p1: `thank you for your request. We are reviewing your requested appointment on <strong>${esc(whenNice)}</strong> and will get back to you within the next 48 hours.`,
          p2: 'You will receive the final appointment or meeting link separately once we have confirmed your request.',
          btn: 'Add to Outlook calendar',
          icsNote: 'The appointment is also attached to this email as a calendar file (.ics) — one click adds it in Outlook, Apple Calendar and more.' },
    it: { subject: 'La vostra richiesta di appuntamento iPhysics – ricezione confermata', hello: `Buongiorno ${esc(name)},`,
          p1: `grazie per la vostra richiesta. Verificheremo l'appuntamento richiesto per <strong>${esc(whenNice)}</strong> e vi ricontatteremo entro le prossime 48 ore.`,
          p2: 'Riceverete il link definitivo all\'appuntamento separatamente, non appena avremo confermato la vostra richiesta.',
          btn: 'Aggiungi al calendario Outlook',
          icsNote: 'L\'appuntamento è allegato a questa e-mail anche come file calendario (.ics) — basta un clic in Outlook, Apple Calendar e simili.' },
  }[lang];
  const guestHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<p>${G.hello}</p>` +
    `<p>${G.p1}</p>` +
    `<p>${G.p2}</p>` +
    `<p style="margin:22px 0;"><a href="${esc(ol)}" style="${BTN}">${G.btn}</a></p>` +
    `<p style="color:#6B7E86;font-size:13px;">${G.icsNote}</p>` +
    `<p style="color:#6B7E86;font-size:13px;margin-top:24px;">iPhysics by machineering</p></div>`;
  await sendMail(email, G.subject, guestHtml, { replyTo: MAIL_INTERNAL, ics });

  // 2) Interne Benachrichtigung (Reply-To = Absender)
  const internHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<h2 style="margin:0 0 12px;">Neue Terminanfrage über iPhysics</h2>` +
    `<table style="border-collapse:collapse;font-size:15px;">` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Termin</td><td style="padding:4px 0;"><strong>${esc(whenIntern)}</strong></td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Name</td><td style="padding:4px 0;">${esc(name)}</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Unternehmen</td><td style="padding:4px 0;">${esc(company) || '—'}</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">E-Mail</td><td style="padding:4px 0;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;vertical-align:top;">Nachricht</td><td style="padding:4px 0;">${esc(note) || '—'}</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Seite</td><td style="padding:4px 0;"><a href="${esc(url)}">${esc(url)}</a></td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Sprache</td><td style="padding:4px 0;">${LANG_NAME[lang]}</td></tr>` +
    `</table>` +
    `<p style="margin:22px 0;"><a href="${esc(ol)}" style="${BTN}">Termin in Outlook eintragen</a></p>` +
    `<p style="color:#6B7E86;font-size:13px;">Antworten Sie direkt auf diese E-Mail, um dem Interessenten zu schreiben (Reply-To ist gesetzt).</p></div>`;
  await sendMail(MAIL_INTERNAL, SUBJECT_INTERN, internHtml, { replyTo: email, ics, cc: MAIL_CC });

  return res.status(200).json({ status: 'booked' });
}
