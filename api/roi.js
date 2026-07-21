// ============================================================================
// Vercel Function: POST /api/roi  (VIBN Potenzial-Check — Auswertungsversand)
// Wird vom Rechner (roi-check.html) aufgerufen, sobald der Interessent seine
// Kontaktdaten hinterlässt. Speichert die Auswertung in Neon
// (machineering.roi_results) und verschickt über Lettermint:
//   1) AUSWERTUNG an den Interessenten — Score, Einstufung, Potenzialfelder,
//      Empfehlung + 48-h-Zusage.
//   2) INTERN an u.zenker@team-mt.de — Kontaktdaten, Ergebnis, ALLE Antworten,
//      Reply-To = Absender.
// Antwort: { status: "ok" | "invalid" }
// Env: DATABASE_URL (Neon-Integration), LETTERMINT_API_KEY
// ============================================================================
import { sql, sendMail, rateLimited, body, cap, esc, EMAIL_RE, MAIL_INTERNAL, BTN } from './_shared.js';

const SUBJECT_INTERN = 'iPhysics Anfrage – VIBN Potenzial-Check';

// Balken-Tabelle der Potenzialfelder (E-Mail-tauglich, nur Inline-Styles).
function barsHtml(categories) {
  return `<table style="border-collapse:collapse;font-size:14px;width:100%;max-width:420px;">` +
    categories.map((c) => {
      const p = Math.max(0, Math.min(100, Math.round(Number(c.percent) || 0)));
      return `<tr>` +
        `<td style="padding:5px 12px 5px 0;color:#33505B;font-weight:700;white-space:nowrap;">${esc(cap(c.name, 40))}</td>` +
        `<td style="padding:5px 0;width:100%;"><div style="background:#E7F0F4;border-radius:999px;height:10px;"><div style="height:10px;border-radius:999px;width:${p}%;background:linear-gradient(120deg,#3BAED1,#45B347);"></div></div></td>` +
        `<td style="padding:5px 0 5px 12px;font-weight:900;color:#10262E;">${p}%</td></tr>`;
    }).join('') + `</table>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ status: 'invalid' });
  const payload = body(req);

  // Honeypot: Feld "website" füllen nur Bots -> vorgetäuschter Erfolg, kein Versand.
  if (payload.website) return res.status(200).json({ status: 'ok' });
  if (await rateLimited(req, 'roi', 3)) return res.status(429).json({ status: 'invalid', error: 'rate_limit' });

  const name    = cap(payload.name, 160);
  const company = cap(payload.company, 200);
  const email   = cap(payload.email, 200);
  const title   = cap(payload.title, 120);
  const priority = cap(payload.priority, 200);
  const top     = cap(payload.top_potential, 160);
  const recommendation = cap(payload.recommendation, 600);
  const page_url = cap(payload.page_url, 400);
  const score   = Math.max(0, Math.min(100, Math.round(Number(payload.score) || 0)));
  const categories = (Array.isArray(payload.categories) ? payload.categories.slice(0, 8) : [])
    .map((c) => ({ name: cap(c?.name, 60), percent: Math.max(0, Math.min(100, Math.round(Number(c?.percent) || 0))) }));
  const answers = (Array.isArray(payload.answers) ? payload.answers.slice(0, 20) : [])
    .map((r) => ({ q: cap(r?.q, 300), a: cap(r?.a, 300) }))
    .filter((r) => r.q && r.a);

  if (!EMAIL_RE.test(email) || !answers.length) return res.status(400).json({ status: 'invalid' });

  // In die Kunden-Tabelle schreiben — best effort, blockiert den Versand nicht.
  try {
    await sql`insert into machineering.roi_results
      (email, name, company, score, title, top_potential, priority, recommendation, categories, answers, page_url)
      values (${email}, ${name || null}, ${company || null}, ${score}, ${title || null}, ${top || null},
        ${priority || null}, ${recommendation || null},
        ${JSON.stringify(categories)}::jsonb, ${JSON.stringify(answers)}::jsonb, ${page_url || null})`;
  } catch { /* siehe oben */ }

  const bars = barsHtml(categories);
  const url = page_url || '—';

  // 1) Auswertung an den Interessenten
  const guestHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<p>${name ? 'Hallo ' + esc(name) : 'Guten Tag'},</p>` +
    `<p>vielen Dank für Ihren VIBN Potenzial-Check. Hier ist Ihre persönliche Auswertung:</p>` +
    `<div style="margin:22px 0;padding:24px 26px;border-radius:18px;background:linear-gradient(120deg,#3BAED1,#45B347);color:#ffffff;">` +
    `<div style="font-size:46px;font-weight:900;line-height:1;">${score}<span style="font-size:16px;font-weight:700;opacity:.85;"> / 100 Punkten</span></div>` +
    `<div style="font-size:19px;font-weight:700;margin-top:10px;">${esc(title)}</div></div>` +
    `<p style="font-weight:700;margin:22px 0 8px;">Ihre größten Potenzialfelder</p>` + bars +
    (top ? `<p style="margin:18px 0 0;"><strong>Stärkster Hebel:</strong> ${esc(top)}</p>` : '') +
    (priority ? `<p style="margin:6px 0 0;"><strong>Priorität:</strong> ${esc(priority)}</p>` : '') +
    (recommendation ? `<p style="margin:18px 0 0;"><strong>Unsere Empfehlung:</strong> ${esc(recommendation)}</p>` : '') +
    `<p style="margin:22px 0 0;">Ein VIBN-Experte meldet sich innerhalb der nächsten 48 Stunden bei Ihnen, um das Ergebnis zu besprechen.</p>` +
    `<p style="color:#6B7E86;font-size:13px;margin-top:24px;">iPhysics by machineering</p></div>`;
  await sendMail(email, 'Ihr VIBN Potenzial-Check – Ihre Auswertung', guestHtml, { replyTo: MAIL_INTERNAL });

  // 2) Interne Benachrichtigung (Reply-To = Absender)
  const row = (l, v) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;vertical-align:top;">${l}</td><td style="padding:4px 0;">${v}</td></tr>`;
  const internHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<h2 style="margin:0 0 12px;">Neue Auswertung über den VIBN Potenzial-Check</h2>` +
    `<table style="border-collapse:collapse;font-size:15px;">` +
    row('Ergebnis', `<strong>${score} / 100 — ${esc(title)}</strong>`) +
    row('Name', esc(name) || '—') +
    row('Unternehmen', esc(company) || '—') +
    row('E-Mail', `<a href="mailto:${esc(email)}">${esc(email)}</a>`) +
    (top ? row('Stärkster Hebel', esc(top)) : '') +
    (priority ? row('Priorität', esc(priority)) : '') +
    row('Seite', `<a href="${esc(url)}">${esc(url)}</a>`) +
    `</table>` +
    `<p style="font-weight:700;margin:20px 0 8px;">Potenzialfelder</p>` + bars +
    `<p style="font-weight:700;margin:20px 0 8px;">Alle Antworten</p>` +
    `<table style="border-collapse:collapse;font-size:14px;">` +
    answers.map((r, i) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#6B7E86;vertical-align:top;white-space:nowrap;">${i + 1}.</td>` +
      `<td style="padding:4px 16px 4px 0;color:#33505B;vertical-align:top;">${esc(r.q)}</td>` +
      `<td style="padding:4px 0;font-weight:700;vertical-align:top;">${esc(r.a)}</td></tr>`).join('') +
    `</table>` +
    `<p style="margin:22px 0;"><a href="mailto:${esc(email)}" style="${BTN}">Interessenten antworten</a></p>` +
    `<p style="color:#6B7E86;font-size:13px;">Antworten Sie direkt auf diese E-Mail, um dem Interessenten zu schreiben (Reply-To ist gesetzt).</p></div>`;
  await sendMail(MAIL_INTERNAL, SUBJECT_INTERN, internHtml, { replyTo: email });

  return res.status(200).json({ status: 'ok' });
}
