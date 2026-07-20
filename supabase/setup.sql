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
