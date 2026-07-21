// ============================================================================
// Vercel Function: POST /api/availability — Slot-Verfügbarkeit lesen.
// Das Frontend liest die Kunden-Tabellen nie direkt (Neon hat keine öffentliche
// API; DATABASE_URL liegt nur serverseitig) — deshalb läuft auch das LESEN hier.
// Body: { date: "YYYY-MM-DD" | null }  ->  [{ slot_id, label, remaining }]
// ============================================================================
import { sql, body } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const raw = String(body(req).date ?? '').slice(0, 20);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  try {
    const rows = await sql`
      select s.slot_id, s.label, (1 - count(b.id))::int as remaining
      from machineering.slots s
      left join machineering.bookings b
        on b.slot_start = ((coalesce(${date}::date, current_date)::text || ' ' || s.slot_id)::timestamp at time zone 'Europe/Berlin')
      group by s.slot_id, s.label, s.sort
      order by s.sort, s.slot_id`;
    return res.status(200).json(rows);
  } catch {
    return res.status(500).json({ error: 'availability_failed' });
  }
}
