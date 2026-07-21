// ============================================================================
// /api/_shared.js — gemeinsame Helfer für die Vercel Functions
// (Neon-Datenbank über DATABASE_URL + E-Mail-Versand über Lettermint).
// Dateien mit "_"-Prefix im api/-Ordner werden von Vercel NICHT als Endpoint
// exponiert — nur als Import verwendbar.
// ============================================================================
import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL);

export const MAIL_FROM     = 'iPhysics machineering <u.zenker@team-mt.de>';
export const MAIL_INTERNAL = 'u.zenker@team-mt.de';
export const EMAIL_RE = /^\S+@\S+\.\S+$/;
export const cap = (s, n) => String(s ?? '').slice(0, n).trim();
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const BTN = "display:inline-block;padding:12px 26px;border-radius:999px;background:linear-gradient(120deg,#3BAED1,#45B347);color:#ffffff;font-weight:700;font-family:'Titillium Web',Arial,sans-serif;text-decoration:none;font-size:15px;";

export function body(req) {
  return (req.body && typeof req.body === 'object') ? req.body : {};
}

// Rate-Limit je IP + Endpoint (Tabelle machineering.request_log).
// true = Limit erreicht. Ein Check-Fehler blockiert nie die echte Anfrage.
export async function rateLimited(req, fn, max = 5, windowSeconds = 600) {
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const key = `${fn}:${ip}`;
    await sql`delete from machineering.request_log where created_at < now() - interval '1 day'`;
    const rows = await sql`select count(*)::int as n from machineering.request_log
      where key = ${key} and created_at > now() - make_interval(secs => ${windowSeconds})`;
    if (rows[0].n >= max) return true;
    await sql`insert into machineering.request_log (key) values (${key})`;
    return false;
  } catch { return false; }
}

// E-Mail über Lettermint (EU-Anbieter). Ohne LETTERMINT_API_KEY: still überspringen.
export async function sendMail(to, subject, html, opts = {}) {
  const key = process.env.LETTERMINT_API_KEY;
  if (!key) return;
  const mail = { from: MAIL_FROM, to: [to], subject, html };
  if (opts.replyTo) mail.reply_to = [opts.replyTo];
  if (opts.ics) mail.attachments = [{
    filename: 'iPhysics-Termin.ics',
    content: Buffer.from(opts.ics, 'utf-8').toString('base64'),
    content_type: 'text/calendar',
  }];
  await fetch('https://api.lettermint.co/v1/send', {
    method: 'POST',
    headers: { 'x-lettermint-token': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(mail),
  });
}
