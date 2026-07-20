// ============================================================================
// Supabase Edge Function: contact  (iPhysics Kontaktformular / "Anfrage-Blatt")
// ----------------------------------------------------------------------------
// Reines Nachrichtenformular (KEINE Terminbuchung, kein Slot). Verschickt:
//   1) INTERN  an u.zenker@team-mt.de — Betreff "iPhysics Anfrage – Kontaktformular",
//              Reply-To = Absender, Body mit Seiten-URL + allen Angaben (Thema,
//              Name, Unternehmen, E-Mail, Telefon, Nachricht).
//   2) BESTÄTIGUNG an den Interessenten — Dank + 48-h-Zusage.
// (Kein Kalender-Anhang, da hier kein Termin/Slot vorliegt.)
//
// Deploy:  supabase functions deploy contact --no-verify-jwt
// Secret:  RESEND_API_KEY
//
//  >>> Die Domain team-mt.de muss bei Resend als Absender VERIFIZIERT sein. <<<
// ============================================================================

const MAIL_FROM      = "iPhysics machineering <u.zenker@team-mt.de>";
const MAIL_INTERNAL  = "u.zenker@team-mt.de";
const SUBJECT_INTERN = "iPhysics Anfrage – Kontaktformular";

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
async function rateLimited(req: Request, fn: string, max = 5): Promise<boolean> {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ status: "invalid" }, 405);

  let payload: any = {};
  try { payload = await req.json(); } catch { return json({ status: "invalid" }, 400); }

  // Honeypot: Feld "website" füllen nur Bots -> vorgetäuschter Erfolg, kein Versand.
  if (payload.website) return json({ status: "ok" });
  if (await rateLimited(req, "contact")) return json({ status: "invalid", error: "rate_limit" }, 429);

  const topic = cap(payload.topic, 120);
  const email = cap(payload.email, 200), message = cap(payload.message, 4000);
  const page_url = cap(payload.page_url, 400);
  if (!EMAIL_RE.test(email) || !message) return json({ status: "invalid" }, 400);

  const url = page_url ? String(page_url) : "—";

  // 1) Interne Benachrichtigung (Reply-To = Absender)
  const internHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<h2 style="margin:0 0 12px;">Neue Anfrage über das iPhysics-Kontaktformular</h2>` +
    `<table style="border-collapse:collapse;font-size:15px;">` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Thema</td><td style="padding:4px 0;"><strong>${esc(topic) || "—"}</strong></td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">E-Mail</td><td style="padding:4px 0;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;vertical-align:top;">Nachricht</td><td style="padding:4px 0;white-space:pre-wrap;">${esc(message)}</td></tr>` +
    `<tr><td style="padding:4px 16px 4px 0;color:#6B7E86;">Seite</td><td style="padding:4px 0;"><a href="${esc(url)}">${esc(url)}</a></td></tr>` +
    `</table>` +
    `<p style="color:#6B7E86;font-size:13px;margin-top:22px;">Antworten Sie direkt auf diese E-Mail, um dem Interessenten zu schreiben (Reply-To ist gesetzt).</p></div>`;
  await sendMail(MAIL_INTERNAL, SUBJECT_INTERN, internHtml, email);

  // 2) Bestätigung an den Interessenten
  const guestHtml =
    `<div style="font-family:'Titillium Web',Arial,sans-serif;color:#10262E;font-size:15px;line-height:1.6;">` +
    `<p>Guten Tag,</p>` +
    `<p>vielen Dank für Ihre Anfrage. Wir prüfen Ihr Anliegen und melden uns innerhalb der nächsten 48 Stunden bei Ihnen zurück.</p>` +
    `<p style="color:#6B7E86;font-size:13px;margin-top:24px;">iPhysics by machineering</p></div>`;
  await sendMail(email, "Ihre iPhysics Anfrage – Eingang bestätigt", guestHtml, MAIL_INTERNAL);

  return json({ status: "ok" });
});
