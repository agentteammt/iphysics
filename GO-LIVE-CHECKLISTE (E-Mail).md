# GO-LIVE CHECKLISTE — E-Mail-Versand Formulare (Stand 2026-07-20)

**⚠️ NICHT VERGESSEN beim Go-Live — sonst laufen alle drei Formulare im Demo-Modus (verschicken KEINE Mails).**

Fixe Werte sind bereits im Code hinterlegt (Empfänger `u.zenker@team-mt.de`, Reply-To = Absender,
Betreffzeilen, Bestätigungsmail 48h, Outlook-.ics + Kalender-Button, VIBN-Auswertungsmail).
Neu seit 20.07.: Edge Function `roi` (VIBN Potenzial-Check), Honeypot + Rate-Limit in allen
drei Functions, Datenschutzerklärung um Supabase/Resend ergänzt.
Es fehlen nur noch diese Deploy-/Verknüpfungsschritte:

1. **Resend:** Domain `team-mt.de` als Absender verifizieren (SPF- + DKIM-DNS-Einträge setzen,
   sonst landen Mails im Spam). AV-Vertrag (DPA) im Resend-Dashboard abschließen.
   (Schnelltest-Alternative: `onboarding@resend.dev` als `MAIL_FROM` — Bestätigung geht dann nur an
   die bei Resend registrierte Testadresse.)
2. **Supabase-Projekt** anlegen — Region **EU (Frankfurt)** wählen (DSGVO). SQL aus
   `uploads/supabase-setup.sql` ausführen (Slots/Zeiten + Rate-Limit, Abschnitt 7).
   AV-Vertrag (DPA) in den Supabase-Orga-Einstellungen bestätigen.
3. **Edge Functions deployen:**
   - `supabase functions deploy book --no-verify-jwt`
   - `supabase functions deploy contact --no-verify-jwt`
   - `supabase functions deploy roi --no-verify-jwt`
   - `supabase secrets set RESEND_API_KEY=<key>`
4. **Config auf der Live-Seite** einbinden (in `iPhysics Landingpage.html` / `github-export/index.html`):
   ```html
   <script>
     window.KIW_SUPABASE = { url: "https://DEINPROJEKT.supabase.co", anonKey: "sb_publishable_..." };
   </script>
   <script defer src="supabase.js"></script>
   ```
   `supabase.js` neben die Seite kopieren (liegt in `github-export/`). Der VIBN-Rechner
   (`roi-check.html`, läuft als iframe) liest die Config automatisch aus dem Eltern-Fenster mit.
5. **Free-Plan-Falle:** Supabase pausiert Free-Projekte nach 7 Tagen ohne Datenbank-Aktivität —
   dann ist die Buchung offline. Entweder **Pro-Plan** (kein Pausieren) oder ein täglicher
   automatischer Ping (z. B. GitHub Action, die `get_availability` aufruft).
6. **Testen:** Terminbuchung + Kontaktformular + VIBN-Check je einmal abschicken →
   interne Mail + Bestätigung/Auswertung prüfen, .ics/Outlook-Button testen.
   Rate-Limit: ab der 6. Anfrage (Buchung/Kontakt) bzw. 4. (VIBN) innerhalb von
   10 Minuten pro IP antwortet die Function mit HTTP 429.

Spam-Schutz (bereits eingebaut, keine Aktion nötig): verstecktes Honeypot-Feld `website`
in allen drei Formularen (gefüllt = Bot → kein Versand) + Rate-Limit über die SQL-Funktion
`check_rate_limit` (nur mit Service-Role-Key aufrufbar).

Betroffene Dateien (bereits fertig konfiguriert):
`github-export/supabase/functions/book|contact|roi/index.ts` (Spiegel in `uploads/supabase/`),
`uploads/supabase-setup.sql` (Spiegel in `github-export/supabase/setup.sql`),
`supabase.js`, `booking-widget.js`, `contact-form.js`, `roi-check.html`, `roi-widget.js`,
`Datenschutz.dc.html` / `github-export/datenschutz.html` (Abschnitt 03 ergänzt).
