-- ============================================================================
-- db-setup.sql — Neon-Datenbank (über Vercel) · Multi-Kunden-Modell
-- Kunde: machineering (iPhysics-Landingpage)
-- ----------------------------------------------------------------------------
-- Architektur: EINE gemeinsame Neon-Datenbank (Region Frankfurt, eu-central-1)
-- für alle Agentur-Kunden; jeder Kunde bekommt ein EIGENES Postgres-Schema mit
-- eigenen Tabellen — Kundendaten sind strikt getrennt. Für weitere Kunden:
-- Skript kopieren und überall "machineering" durch den Kundennamen ersetzen.
--
-- Sicherheitsmodell — keine öffentlichen Zugriffe:
--   · Neon hat keine öffentliche Daten-API: Zugriff nur über den
--     Connection-String (DATABASE_URL). Der liegt ausschließlich als
--     Environment Variable in Vercel und landet nie im Frontend.
--   · Alle Zugriffe laufen serverseitig über die Vercel Functions in /api.
--   · Row Level Security ist zusätzlich auf allen Tabellen aktiv, ohne
--     Policies (Defense-in-Depth; die App-Rolle ist Tabellen-Eigentümerin
--     und bleibt zugriffsberechtigt).
--
-- Ausführen: Neon Console -> SQL Editor -> einfügen -> Run. Idempotent.
--  >>> ZEITRÄUME ändern: Abschnitt 5 (insert into machineering.slots) <<<
-- ============================================================================

create schema if not exists machineering;

-- 1) Terminbuchung: Uhrzeit-Vorlagen + Buchungen ------------------------------
create table if not exists machineering.slots (
  slot_id      text primary key,          -- '09:00'
  label        text not null,             -- Anzeige-Label
  duration_min int  not null default 30,
  sort         int  not null default 0
);

create table if not exists machineering.bookings (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  company    text,
  note       text,
  slot_start timestamptz not null unique, -- unique = verhindert Doppelbuchungen
  slot_end   timestamptz not null,
  created_at timestamptz not null default now()
);

-- 2) Kontaktformular ("Anfrage-Blatt") ----------------------------------------
create table if not exists machineering.inquiries (
  id         uuid primary key default gen_random_uuid(),
  name       text,          -- Formular hat aktuell kein Namensfeld -> nullable
  email      text not null,
  topic      text,
  message    text,
  page_url   text,
  created_at timestamptz not null default now()
);

-- 3) VIBN Potenzial-Check (Auswertungen) --------------------------------------
create table if not exists machineering.roi_results (
  id             uuid primary key default gen_random_uuid(),
  name           text,
  company        text,
  email          text not null,
  score          int,
  title          text,
  top_potential  text,
  priority       text,
  recommendation text,
  categories     jsonb,
  answers        jsonb,
  page_url       text,
  created_at     timestamptz not null default now()
);

-- 4) Rate-Limit-Log (Spam-Schutz der /api-Functions) --------------------------
create table if not exists machineering.request_log (
  id         bigint generated always as identity primary key,
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists request_log_key_time_idx on machineering.request_log(key, created_at);

-- RLS überall aktiv, KEINE Policies -------------------------------------------
alter table machineering.slots       enable row level security;
alter table machineering.bookings    enable row level security;
alter table machineering.inquiries   enable row level security;
alter table machineering.roi_results enable row level security;
alter table machineering.request_log enable row level security;

-- 5) >>> ZEITRÄUME <<< — Uhrzeiten anpassen (1 Platz je Slot und Tag) ---------
insert into machineering.slots (slot_id, label, duration_min, sort) values
  ('09:00', '09:00', 30, 10),
  ('10:00', '10:00', 30, 20),
  ('11:00', '11:00', 30, 30),
  ('14:00', '14:00', 30, 40),
  ('15:00', '15:00', 30, 50),
  ('16:00', '16:00', 30, 60)
on conflict (slot_id) do nothing;

-- 6) Test (optional) ----------------------------------------------------------
-- select s.slot_id, s.label, (1 - count(b.id))::int as remaining
-- from machineering.slots s
-- left join machineering.bookings b
--   on b.slot_start = ((current_date::text || ' ' || s.slot_id)::timestamp at time zone 'Europe/Berlin')
-- group by s.slot_id, s.label, s.sort order by s.sort;
