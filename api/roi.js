// ============================================================================
// Vercel Function: POST /api/roi  (VIBN Potenzial-Check — Auswertungsversand)
// Wird vom Rechner (roi-check.html) aufgerufen, sobald der Interessent seine
// Kontaktdaten hinterlässt. Speichert die Auswertung in Neon
// (machineering.roi_results) und verschickt über Lettermint:
//   1) AUSWERTUNG an den Interessenten — Score, Einstufung, Potenzialfelder,
//      Empfehlung + 48-h-Zusage.
//   2) INTERN an sales@machineering.com (CC beate.freyer@) — Kontaktdaten, Ergebnis, ALLE Antworten,
//      Reply-To = Absender.
// Antwort: { status: "ok" | "invalid" }
// Env: DATABASE_URL (Neon-Integration), LETTERMINT_API_KEY
// ============================================================================
import { sql, sendMail, rateLimited, body, cap, esc, EMAIL_RE, MAIL_INTERNAL, MAIL_CC, BTN, pickLang, LANG_NAME } from './_shared.js';

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
  const lang = pickLang(payload);

  // 1) Auswertung an den Interessenten — in der Sprache der Seite (de/en/it).
  // Titel, Hebel, Priorität, Empfehlung und Kategorien kommen bereits lokalisiert vom Rechner.
  const T = {
    de: { subject: 'Ihr VIBN Potenzial-Check – Ihre Auswertung',
          hello: name ? 'Hallo ' + esc(name) : 'Guten Tag',
          intro1: 'vielen Dank für Ihr Interesse an der virtuellen Inbetriebnahme und für die Teilnahme an unserem Potenzial-Check.',
          intro2: 'Nachfolgend finden Sie eine erste Zusammenfassung Ihrer Ergebnisse sowie eine Empfehlung auf Basis Ihrer Antworten. Sie zeigt, ob sich die virtuelle Inbetriebnahme für Ihr Unternehmen grundsätzlich lohnt und in welchen Bereichen die größten Potenziale liegen.',
          pts: ' / 100 Punkten', fieldsHead: 'Ihre größten Potenzialfelder',
          lever: 'Stärkster Hebel:', prio: 'Priorität:', reco: 'Unsere Empfehlung:',
          detail: 'Darüber hinaus erstellen wir aktuell Ihre persönliche Detail-Auswertung. Dabei betrachten wir Ihre Situation noch einmal genauer und leiten konkrete Handlungsempfehlungen ab. Diese erhalten Sie innerhalb der nächsten 48 Stunden per E-Mail.',
          free: 'Dieser individuelle Service ist für Sie kostenfrei und unverbindlich.',
          closing: 'Wir freuen uns, Ihnen damit eine fundierte Entscheidungsgrundlage für den möglichen Einsatz der virtuellen Inbetriebnahme zu geben.',
          regards: 'Beste Grüße' },
    en: { subject: 'Your Potential Calculator – your results',
          hello: name ? 'Hello ' + esc(name) : 'Hello',
          intro1: 'thank you for your interest in virtual commissioning and for taking part in our Potential Calculator.',
          intro2: 'Below you will find an initial summary of your results and a recommendation based on your answers. It shows whether virtual commissioning is fundamentally worthwhile for your company and in which areas your biggest potential lies.',
          pts: ' / 100 points', fieldsHead: 'Your biggest potential areas',
          lever: 'Strongest lever:', prio: 'Priority:', reco: 'Our recommendation:',
          detail: 'In addition, we are currently preparing your personal detailed evaluation. We will take a closer look at your situation and derive concrete recommendations for action. You will receive it by email within the next 48 hours.',
          free: 'This individual service is free of charge and without obligation.',
          closing: 'We look forward to giving you a sound basis for deciding on the possible use of virtual commissioning.',
          regards: 'Best regards' },
    it: { subject: 'Il vostro Calcolatore del risparmio potenziale – la vostra valutazione',
          hello: name ? 'Buongiorno ' + esc(name) : 'Buongiorno',
          intro1: 'grazie per il vostro interesse per il Virtual Commissioning e per aver utilizzato il nostro Calcolatore del risparmio potenziale.',
          intro2: 'Di seguito trovate un primo riepilogo dei vostri risultati e un consiglio basato sulle vostre risposte. Mostra se il Virtual Commissioning conviene in linea di principio alla vostra azienda e in quali aree si trovano i potenziali maggiori.',
          pts: ' / 100 punti', fieldsHead: 'I vostri maggiori campi di potenziale',
          lever: 'Leva più forte:', prio: 'Priorità:', reco: 'Il nostro consiglio:',
          detail: 'Stiamo inoltre preparando la vostra valutazione dettagliata personale: esamineremo più da vicino la vostra situazione e ne deriveremo raccomandazioni concrete. La riceverete via e-mail entro le prossime 48 ore.',
          free: 'Questo servizio individuale è per voi gratuito e senza impegno.',
          closing: 'Saremo lieti di offrirvi così una solida base decisionale per il possibile impiego del Virtual Commissioning.',
          regards: 'Cordiali saluti' },
  }[lang];
  const guestHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<p>${T.hello},</p>` +
    `<p>${T.intro1}</p>` +
    `<p>${T.intro2}</p>` +
    `<div style="margin:22px 0;padding:24px 26px;border-radius:18px;background:linear-gradient(120deg,#3BAED1,#45B347);color:#ffffff;">` +
    `<div style="font-size:46px;font-weight:900;line-height:1;">${score}<span style="font-size:16px;font-weight:700;opacity:.85;">${T.pts}</span></div>` +
    `<div style="font-size:19px;font-weight:700;margin-top:10px;">${esc(title)}</div></div>` +
    `<p style="font-weight:700;margin:22px 0 8px;">${T.fieldsHead}</p>` + bars +
    (top ? `<p style="margin:18px 0 0;"><strong>${T.lever}</strong> ${esc(top)}</p>` : '') +
    (priority ? `<p style="margin:6px 0 0;"><strong>${T.prio}</strong> ${esc(priority)}</p>` : '') +
    (recommendation ? `<p style="margin:18px 0 0;"><strong>${T.reco}</strong> ${esc(recommendation)}</p>` : '') +
    `<p style="margin:22px 0 0;">${T.detail}</p>` +
    `<p style="margin:14px 0 0;">${T.free}</p>` +
    `<p style="margin:14px 0 0;">${T.closing}</p>` +
    `<p style="margin:22px 0 0;">${T.regards}</p>` +
    `<p style="color:#6B7E86;font-size:13px;margin-top:24px;">iPhysics by machineering</p></div>`;
  await sendMail(email, T.subject, guestHtml, { replyTo: MAIL_INTERNAL });

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
    row('Sprache', LANG_NAME[lang]) +
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
  await sendMail(MAIL_INTERNAL, SUBJECT_INTERN, internHtml, { replyTo: email, cc: MAIL_CC });

  return res.status(200).json({ status: 'ok' });
}
