// ============================================================================
// Supabase Edge Function: roi  (VIBN Potenzial-Check — Auswertungsversand)
// ----------------------------------------------------------------------------
// Wird vom Rechner (roi-check.html) aufgerufen, sobald der Interessent seine
// Kontaktdaten hinterlässt und die Auswertung anfordert. Verschickt:
//   1) INTERN  an u.zenker@team-mt.de — Betreff "iPhysics Anfrage – VIBN Potenzial-Check",
//              Reply-To = Absender; Body mit Kontaktdaten, Score, Potenzial-
//              feldern und ALLEN 12 Antworten + Seiten-URL.
//   2) AUSWERTUNG an den Interessenten — Score, Einstufung, Potenzialfelder,
//              Empfehlung + 48-h-Zusage.
// Antwortet mit { status: "ok" | "invalid" }.
//
// Deploy:  supabase functions deploy roi --no-verify-jwt
// Secret:  RESEND_API_KEY  (SUPABASE_URL / SERVICE_ROLE_KEY automatisch)
//
//  >>> Die Domain team-mt.de muss bei Resend als Absender VERIFIZIERT sein. <<<
// ============================================================================

const MAIL_FROM      = "iPhysics machineering <u.zenker@team-mt.de>";
const MAIL_INTERNAL  = "u.zenker@team-mt.de";
const SUBJECT_INTERN = "iPhysics Anfrage – VIBN Potenzial-Check";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// ---- Spam-Schutz: Honeypot + Rate-Limit (SQL-Funktion check_rate_limit) ----
const cap = (s: unknown, n: number) => String(s ?? "").slice(0, n).trim();
const EMAIL_RE = /^\S+@\S+\.\S+$/;
async function rateLimited(req: Request, fn: string, max = 3): Promise<boolean> {
  try {
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/check_rate_limit", {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: `${fn}:${ip}`, p_max: max, p_window_seconds: 600 }),
    });
    return (await res.json()) === false;   // false = Limit erreicht
  } catch { return false; }                // Check-Fehler blockiert nie die echte Anfrage
}

const BTN = "display:inline-block;padding:12px 26px;border-radius:999px;background:linear-gradient(120deg,#3BAED1,#45B347);color:#ffffff;font-weight:700;font-family:'Titillium Web',Arial,sans-serif;text-decoration:none;font-size:15px;";

async function sendMail(to: string, subject: string, html: string, replyTo?: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const body: Record<string, unknown> = { from: MAIL_FROM, to, subject, html };
  if (replyTo) body.reply_to = replyTo;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Balken-Tabelle der Potenzialfelder (E-Mail-tauglich, nur Inline-Styles).
function barsHtml(categories: Array<{ name: string; percent: number }>): string {
  return `<table style="border-collapse:collapse;font-size:14px;width:100%;max-width:420px;">` +
    categories.map((c) => {
      const p = Math.max(0, Math.min(100, Math.round(Number(c.percent) || 0)));
      return `<tr>` +
        `<td style="padding:5px 12px 5px 0;color:#33505B;font-weight:700;white-space:nowrap;">${esc(cap(c.name, 40))}</td>` +
        `<td style="padding:5px 0;width:100%;"><div style="background:#E7F0F4;border-radius:999px;height:10px;"><div style="height:10px;border-radius:999px;width:${p}%;background:linear-gradient(120deg,#3BAED1,#45B347);"></div></div></td>` +
        `<td style="padding:5px 0 5px 12px;font-weight:900;color:#10262E;">${p}%</td></tr>`;
    }).join("") + `</table>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ status: "invalid" }, 405);

  let payload: any = {};
  try { payload = await req.json(); } catch { return json({ status: "invalid" }, 400); }

  // Honeypot: Feld "website" füllen nur Bots -> vorgetäuschter Erfolg, kein Versand.
  if (payload.website) return json({ status: "ok" });
  if (await rateLimited(req, "roi")) return json({ status: "invalid", error: "rate_limit" }, 429);

  const name    = cap(payload.name, 160);
  const company = cap(payload.company, 200);
  const email   = cap(payload.email, 200);
  const title   = cap(payload.title, 120);
  const priority = cap(payload.priority, 200);
  const top     = cap(payload.top_potential, 160);
  const recommendation = cap(payload.recommendation, 600);
  const page_url = cap(payload.page_url, 400);
  const score   = Math.max(0, Math.min(100, Math.round(Number(payload.score) || 0)));
  const categories = Array.isArray(payload.categories) ? payload.categories.slice(0, 8) : [];
  const answers = (Array.isArray(payload.answers) ? payload.answers.slice(0, 20) : [])
    .map((r: any) => ({ q: cap(r?.q, 300), a: cap(r?.a, 300) }))
    .filter((r: { q: string; a: string }) => r.q && r.a);

  if (!EMAIL_RE.test(email) || !answers.length) return json({ status: "invalid" }, 400);

  const bars = barsHtml(categories);
  const url = page_url || "—";

  // 1) Auswertung an den Interessenten
  const guestHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<p>${name ? "Hallo " + esc(name) : "Guten Tag"},</p>` +
    `<p>vielen Dank für Ihren VIBN Potenzial-Check. Hier ist Ihre persönliche Auswertung:</p>` +
    `<div style="margin:22px 0;padding:24px 26px;border-radius:18px;background:linear-gradient(120deg,#3BAED1,#45B347);color:#ffffff;">` +
    `<div style="font-size:46px;font-weight:900;line-height:1;">${score}<span style="font-size:16px;font-weight:700;opacity:.85;"> / 100 Punkten</span></div>` +
    `<div style="font-size:19px;font-weight:700;margin-top:10px;">${esc(title)}</div></div>` +
    `<p style="font-weight:700;margin:22px 0 8px;">Ihre größten Potenzialfelder</p>` + bars +
    (top ? `<p style="margin:18px 0 0;"><strong>Stärkster Hebel:</strong> ${esc(top)}</p>` : "") +
    (priority ? `<p style="margin:6px 0 0;"><strong>Priorität:</strong> ${esc(priority)}</p>` : "") +
    (recommendation ? `<p style="margin:18px 0 0;"><strong>Unsere Empfehlung:</strong> ${esc(recommendation)}</p>` : "") +
    `<p style="margin:22px 0 0;">Ein VIBN-Experte meldet sich innerhalb der nächsten 48 Stunden bei Ihnen, um das Ergebnis zu besprechen.</p>` +
    `<p style="color:#6B7E86;font-size:13px;margin-top:24px;">iPhysics by machineering</p></div>`;
  await sendMail(email, "Ihr VIBN Potenzial-Check – Ihre Auswertung", guestHtml, MAIL_INTERNAL);

  // 2) Interne Benachrichtigung (Reply-To = Absender)
  const row = (l: string, v: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;vertical-align:top;">${l}</td><td style="padding:4px 0;">${v}</td></tr>`;
  const internHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<h2 style="margin:0 0 12px;">Neue Auswertung über den VIBN Potenzial-Check</h2>` +
    `<table style="border-collapse:collapse;font-size:15px;">` +
    row("Ergebnis", `<strong>${score} / 100 — ${esc(title)}</strong>`) +
    row("Name", esc(name) || "—") +
    row("Unternehmen", esc(company) || "—") +
    row("E-Mail", `<a href="mailto:${esc(email)}">${esc(email)}</a>`) +
    (top ? row("Stärkster Hebel", esc(top)) : "") +
    (priority ? row("Priorität", esc(priority)) : "") +
    row("Seite", `<a href="${esc(url)}">${esc(url)}</a>`) +
    `</table>` +
    `<p style="font-weight:700;margin:20px 0 8px;">Potenzialfelder</p>` + bars +
    `<p style="font-weight:700;margin:20px 0 8px;">Alle Antworten</p>` +
    `<table style="border-collapse:collapse;font-size:14px;">` +
    answers.map((r: { q: string; a: string }, i: number) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#6B7E86;vertical-align:top;white-space:nowrap;">${i + 1}.</td>` +
      `<td style="padding:4px 16px 4px 0;color:#33505B;vertical-align:top;">${esc(r.q)}</td>` +
      `<td style="padding:4px 0;font-weight:700;vertical-align:top;">${esc(r.a)}</td></tr>`).join("") +
    `</table>` +
    `<p style="margin:22px 0;"><a href="mailto:${esc(email)}" style="${BTN}">Interessenten antworten</a></p>` +
    `<p style="color:#6B7E86;font-size:13px;">Antworten Sie direkt auf diese E-Mail, um dem Interessenten zu schreiben (Reply-To ist gesetzt).</p></div>`;
  await sendMail(MAIL_INTERNAL, SUBJECT_INTERN, internHtml, email);

  return json({ status: "ok" });
});
