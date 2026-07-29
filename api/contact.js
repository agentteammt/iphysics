// ============================================================================
// Vercel Function: POST /api/contact  (iPhysics Kontaktformular / "Anfrage-Blatt")
// Speichert die Anfrage in Neon (machineering.inquiries) und verschickt über
// Lettermint: interne Mail (Reply-To = Absender) + Bestätigung an den Absender.
// Antwort: { status: "ok" | "invalid" }
// Env: DATABASE_URL (Neon-Integration), LETTERMINT_API_KEY
// ============================================================================
import { sql, sendMail, rateLimited, body, cap, esc, EMAIL_RE, MAIL_INTERNAL, MAIL_CC, pickLang, LANG_NAME } from './_shared.js';

const SUBJECT_INTERN = 'iPhysics Anfrage – Kontaktformular';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ status: 'invalid' });
  const payload = body(req);

  // Honeypot: Feld "website" füllen nur Bots -> vorgetäuschter Erfolg, kein Versand.
  if (payload.website) return res.status(200).json({ status: 'ok' });
  if (await rateLimited(req, 'contact')) return res.status(429).json({ status: 'invalid', error: 'rate_limit' });

  const topic = cap(payload.topic, 120);
  const email = cap(payload.email, 200), message = cap(payload.message, 4000);
  const page_url = cap(payload.page_url, 400);
  const lang = pickLang(payload);
  if (!EMAIL_RE.test(email) || !message) return res.status(400).json({ status: 'invalid' });

  // In die Kunden-Tabelle schreiben — best effort, blockiert den Versand nicht.
  try {
    await sql`insert into machineering.inquiries (email, topic, message, page_url)
      values (${email}, ${topic || null}, ${message}, ${page_url || null})`;
  } catch { /* siehe oben */ }

  const url = page_url || '—';

  // 1) Interne Benachrichtigung (Reply-To = Absender)
  const internHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<h2 style="margin:0 0 12px;">Neue Anfrage über das iPhysics-Kontaktformular</h2>` +
    `<table style="border-collapse:collapse;font-size:15px;">` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Thema</td><td style="padding:4px 0;"><strong>${esc(topic) || '—'}</strong></td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">E-Mail</td><td style="padding:4px 0;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;vertical-align:top;">Nachricht</td><td style="padding:4px 0;white-space:pre-wrap;">${esc(message)}</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Seite</td><td style="padding:4px 0;"><a href="${esc(url)}">${esc(url)}</a></td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Sprache</td><td style="padding:4px 0;">${LANG_NAME[lang]}</td></tr>` +
    `</table>` +
    `<p style="color:#6B7E86;font-size:13px;margin-top:22px;">Antworten Sie direkt auf diese E-Mail, um dem Interessenten zu schreiben (Reply-To ist gesetzt).</p></div>`;
  await sendMail(MAIL_INTERNAL, SUBJECT_INTERN, internHtml, { replyTo: email, cc: MAIL_CC });

  // 2) Bestätigung an den Interessenten — in der Sprache der Seite (de/en/it).
  const G = {
    de: { subject: 'Ihre iPhysics Anfrage – Eingang bestätigt', hello: 'Guten Tag,',
          text: 'vielen Dank für Ihre Anfrage. Wir prüfen Ihr Anliegen und melden uns innerhalb der nächsten 48 Stunden bei Ihnen zurück.' },
    en: { subject: 'Your iPhysics enquiry – receipt confirmed', hello: 'Hello,',
          text: 'thank you for your enquiry. We are reviewing your request and will get back to you within the next 48 hours.' },
    it: { subject: 'La vostra richiesta iPhysics – ricezione confermata', hello: 'Buongiorno,',
          text: 'grazie per la vostra richiesta. La esamineremo e vi ricontatteremo entro le prossime 48 ore.' },
  }[lang];
  const guestHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<p>${G.hello}</p>` +
    `<p>${G.text}</p>` +
    `<p style="color:#6B7E86;font-size:13px;margin-top:24px;">iPhysics by machineering</p></div>`;
  await sendMail(email, G.subject, guestHtml, { replyTo: MAIL_INTERNAL });

  return res.status(200).json({ status: 'ok' });
}
