# Setup-Prompt für Claude (im Browser) — iPhysics Formular-Backend

> Diesen gesamten Text (inkl. der Code-Blöcke unten) an Claude im Browser geben.
> Voraussetzung: Sie sind in den Browser-Tabs bei supabase.com und resend.com eingeloggt
> (oder legen die Konten während der Session an). Für die Resend-Domain-Verifizierung
> brauchen Sie zusätzlich Zugriff auf die DNS-Verwaltung von team-mt.de.

---

Richte mir bitte das Backend für die iPhysics-Landingpage ein (Terminbuchung, Kontaktformular,
VIBN Potenzial-Check — jeweils mit E-Mail-Versand über Resend). Arbeite die Schritte in dieser
Reihenfolge ab und melde dich, wenn du eine Entscheidung oder ein Login von mir brauchst.
Der komplette Code steht unten in diesem Prompt — nichts davon verändern, nur 1:1 einfügen.

## Schritt 1 — Supabase-Projekt
1. Auf supabase.com ein neues Projekt anlegen. Name: "iphysics-landingpage".
   Region: **EU Central (Frankfurt)** — wichtig, DSGVO. Starkes DB-Passwort generieren lassen.
2. Warten bis das Projekt bereit ist.

## Schritt 2 — SQL ausführen
Im Projekt: SQL Editor → New query → den kompletten Block "SQL-SETUP" (unten) einfügen → Run.
Erwartung: "Success". Das legt Slots, Buchungen, get_availability, book_slot und das
Rate-Limit an. Die Buchungszeiten (Abschnitt 6 im SQL) unverändert lassen.

## Schritt 3 — Drei Edge Functions anlegen
Im Projekt: Edge Functions → "Deploy a new function" → "Via Editor" (im Dashboard schreiben).
Für jede der drei Functions:
- Name exakt: `book`, `contact`, `roi`
- Den jeweiligen Code-Block unten 1:1 einfügen (vorhandenen Beispielcode komplett ersetzen)
- **JWT-Verifizierung deaktivieren** ("Verify JWT with legacy secret" / "Enforce JWT verification" AUS —
  die Formulare rufen die Functions mit dem anon key auf)
- Deploy klicken und warten bis der Status "deployed" ist.

## Schritt 4 — Resend einrichten
1. Auf resend.com: Domains → Add Domain → `team-mt.de` (Region Europa/EU wählen, falls angeboten).
2. Die angezeigten DNS-Einträge (SPF + DKIM, ggf. DMARC-Empfehlung) müssen in der
   DNS-Verwaltung von team-mt.de gesetzt werden. Wenn du Zugriff auf die DNS-Konsole hast,
   trage sie ein; sonst liste mir die Einträge exakt auf (Typ, Name, Wert) und pausiere,
   bis ich sie gesetzt habe. Danach in Resend "Verify" klicken bis Status "Verified".
3. API Keys → Create API Key: Name "iphysics-landingpage", Permission "Sending access",
   Domain team-mt.de. Den Key einmal anzeigen lassen und direkt in Schritt 5 verwenden.
4. Unter Settings prüfen, dass das Data Processing Agreement (DPA) akzeptiert ist.

## Schritt 5 — API-Key als Secret hinterlegen
Zurück in Supabase: Edge Functions → Secrets (bzw. Project Settings → Edge Functions):
Neues Secret `RESEND_API_KEY` = der Resend-Key aus Schritt 4.

## Schritt 6 — Zugangsdaten für die Website melden
Gib mir am Ende exakt diese zwei Werte aus (Supabase → Project Settings → API / Data API):
- Project URL (https://….supabase.co)
- Publishable/anon key (der ÖFFENTLICHE Key — niemals den service_role/secret key!)

Diese zwei Werte trage ich selbst in die Landingpage ein (window.KIW_SUPABASE-Snippet).

## Schritt 7 — Funktionstest
1. Test der Buchungs-Function: In Supabase unter Edge Functions → book → "Test" (oder via curl):
   POST-Body: {"date":"2026-08-03","slot_id":"09:00","name":"Test Setup","email":"MEINE-TESTADRESSE","page_url":"setup-test"}
   → Antwort muss {"status":"booked"} sein, und es müssen ZWEI Mails ankommen
   (intern an u.zenker@team-mt.de + Bestätigung mit .ics an die Testadresse).
   Solange die Domain noch nicht verifiziert ist, schlägt nur der Mailversand fehl — dann erst Schritt 4 abschließen.
2. Danach denselben Test für `contact` ({"email":"…","message":"Test","topic":"Setup"} → {"status":"ok"})
   und `roi` ({"email":"…","score":72,"title":"Hohes Potenzial","answers":[{"q":"Testfrage","a":"Testantwort"}]} → {"status":"ok"}).
3. Die Testbuchung wieder löschen: Table Editor → bookings → Zeile "Test Setup" löschen.

## Schritt 8 — Free-Plan-Pausierung verhindern (wichtig!)
Supabase pausiert Free-Projekte nach 7 Tagen ohne DB-Aktivität — dann wäre die Buchung offline.
Frage mich, welche Option ich will, und richte sie ein:
a) Upgrade auf den Pro-Plan (kein Pausieren), oder
b) einen täglichen Keep-alive (z. B. GitHub Action oder cron-Dienst, der einmal täglich
   POST auf …/rest/v1/rpc/get_availability mit dem anon key macht).

---
---

# SQL-SETUP (Schritt 2)

```sql
-- ============================================================================
-- supabase-setup.sql — Backend für die Terminbuchung (wiederkehrende Slots)
-- ----------------------------------------------------------------------------
-- Im Supabase-Dashboard: SQL Editor -> "New query" -> einfügen -> ausführen.
-- Legt an: Tabelle slots (Uhrzeit-Vorlagen), Tabelle bookings (Reservierungen),
-- Funktion get_availability(p_date) und book_slot(...) sowie das Rate-Limit
-- für die Edge Functions (Abschnitt 7). Idempotent.
--
--  >>> HIER ÄNDERST DU DIE ZEITRÄUME: Abschnitt 6 (insert into public.slots) <<<
--
-- E-Mail-Versand passiert NICHT hier, sondern in der Edge Function `book`
-- (siehe functions/book/index.ts). Diese SQL-Funktion book_slot erledigt nur
-- die atomare Kapazitätsprüfung + das Speichern.
-- ============================================================================

-- 1) Tabellen ---------------------------------------------------------------
create table if not exists public.slots (
  slot_id   text primary key,        -- Uhrzeit-Label, z. B. '09:00'
  label     text not null,           -- Anzeige-Label
  capacity  int  not null default 2, -- Plätze je Slot PRO TAG
  sort      int  not null default 0
);

create table if not exists public.bookings (
  id           uuid primary key default gen_random_uuid(),
  booking_date date not null,
  slot_id      text not null references public.slots(slot_id) on delete cascade,
  name         text not null,
  email        text not null,
  company      text,
  note         text,
  created_at   timestamptz not null default now()
);
alter table public.bookings add column if not exists booking_date date;
update public.bookings set booking_date = current_date where booking_date is null;
alter table public.bookings alter column booking_date set not null;
create index if not exists bookings_date_slot_idx on public.bookings(booking_date, slot_id);

-- 2) RLS: Tabellen abriegeln (Zugriff nur über die Funktionen) --------------
alter table public.slots    enable row level security;
alter table public.bookings enable row level security;

-- 3) Verfügbarkeit für EINEN Tag lesen --------------------------------------
create or replace function public.get_availability(p_date date default null)
returns table (slot_id text, label text, remaining int)
language sql security definer set search_path = public as $$
  select s.slot_id, s.label,
         greatest(s.capacity - count(b.id), 0)::int as remaining
  from public.slots s
  left join public.bookings b
    on b.slot_id = s.slot_id
   and b.booking_date = coalesce(p_date, current_date)
  group by s.slot_id, s.label, s.capacity, s.sort
  order by s.sort, s.slot_id;
$$;

-- 4) Slot an einem DATUM buchen (atomar) ------------------------------------
create or replace function public.book_slot(
  p_date date, p_slot_id text, p_name text, p_email text,
  p_company text default null, p_note text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_capacity int; v_taken int;
begin
  if p_date is null then return 'invalid_slot'; end if;
  select capacity into v_capacity from public.slots where slot_id = p_slot_id for update;
  if not found then return 'invalid_slot'; end if;
  select count(*) into v_taken from public.bookings
    where slot_id = p_slot_id and booking_date = p_date;
  if v_taken >= v_capacity then return 'full'; end if;
  insert into public.bookings (booking_date, slot_id, name, email, company, note)
  values (p_date, p_slot_id, p_name, p_email, p_company, p_note);
  return 'ok';
end; $$;

-- 5) Rechte -----------------------------------------------------------------
grant execute on function public.get_availability(date)                        to anon, authenticated;
-- book_slot wird von der Edge Function (service_role) aufgerufen; anon-Grant optional:
grant execute on function public.book_slot(date, text, text, text, text, text) to anon, authenticated, service_role;

-- 6) >>> ZEITRÄUME <<< — Uhrzeiten + Kapazität je Tag anpassen ---------------
insert into public.slots (slot_id, label, capacity, sort) values
  ('09:00', '09:00', 2, 10),
  ('10:00', '10:00', 2, 20),
  ('11:00', '11:00', 2, 30),
  ('14:00', '14:00', 2, 40),
  ('15:00', '15:00', 2, 50),
  ('16:00', '16:00', 2, 60)
on conflict (slot_id) do nothing;

-- 7) Rate-Limit für die Edge Functions (book/contact/roi) --------------------
-- Max. N Anfragen je IP und Funktion pro Zeitfenster; wird von den Edge
-- Functions mit dem Service-Role-Key aufgerufen (für anon gesperrt).
create table if not exists public.request_log (
  id         bigint generated always as identity primary key,
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists request_log_key_time_idx on public.request_log(key, created_at);
alter table public.request_log enable row level security;

create or replace function public.check_rate_limit(
  p_key text, p_max int default 5, p_window_seconds int default 600
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  delete from public.request_log where created_at < now() - interval '1 day';
  select count(*) into v_count from public.request_log
    where key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_max then return false; end if;
  insert into public.request_log (key) values (p_key);
  return true;
end; $$;

revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant  execute on function public.check_rate_limit(text, int, int) to service_role;

-- 8) Test (optional) --------------------------------------------------------
-- select * from public.get_availability(current_date + 1);
-- select public.book_slot(current_date + 1, '09:00', 'Max Mustermann', 'max@example.com', 'ACME', 'Test');

```

# EDGE FUNCTION "book" (Schritt 3)

```ts
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

  // Honeypot: Feld "website" füllen nur Bots -> vorgetäuschter Erfolg, kein Versand.
  if (payload.website) return json({ status: "booked" });
  if (await rateLimited(req, "book")) return json({ status: "invalid_slot", error: "rate_limit" }, 429);

  const date = cap(payload.date, 20), slot_id = cap(payload.slot_id, 10);
  const name = cap(payload.name, 160), email = cap(payload.email, 200);
  const company = cap(payload.company, 200) || null, note = cap(payload.note, 2000) || null;
  const page_url = cap(payload.page_url, 400) || null;
  if (!date || !slot_id || !name || !EMAIL_RE.test(email)) return json({ status: "invalid_slot" }, 400);

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

```

# EDGE FUNCTION "contact" (Schritt 3)

```ts
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

```

# EDGE FUNCTION "roi" (Schritt 3)

```ts
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

```
