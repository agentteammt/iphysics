# GO-LIVE CHECKLISTE — E-Mail-Versand Formulare (Stand 2026-07-14)

**⚠️ NICHT VERGESSEN beim Go-Live — sonst laufen beide Formulare im Demo-Modus (verschicken KEINE Mails).**

Fixe Werte sind bereits im Code hinterlegt (Empfänger `u.zenker@team-mt.de`, Reply-To = Absender,
Betreffzeilen, Body mit URL+Slot+allen Feldern, Bestätigungsmail 48h, Outlook-.ics + Kalender-Button).
Es fehlen nur noch diese Deploy-/Verknüpfungsschritte:

1. **Resend:** Domain `team-mt.de` als Absender verifizieren.
   (Schnelltest-Alternative: `onboarding@resend.dev` als `MAIL_FROM` — Bestätigung geht dann nur an
   die bei Resend registrierte Testadresse.)
2. **Supabase-Projekt** anlegen; SQL aus `uploads/supabase-setup.sql` ausführen (Slots/Zeiten).
3. **Edge Functions deployen:**
   - `supabase functions deploy book --no-verify-jwt`
   - `supabase functions deploy contact --no-verify-jwt`
   - `supabase secrets set RESEND_API_KEY=<key>`
4. **Config auf der Live-Seite** einbinden (in `iPhysics Landingpage.html` / `github-export/index.html`):
   ```html
   <script>
     window.KIW_SUPABASE = { url: "https://DEINPROJEKT.supabase.co", anonKey: "sb_publishable_..." };
   </script>
   <script defer src="supabase.js"></script>
   ```
   `uploads/supabase.js` neben die Seite kopieren (Datei bereitgestellt).
5. **Testen:** Terminbuchung + Kontaktformular je einmal abschicken → interne Mail + Bestätigung prüfen,
   .ics/Outlook-Button testen.

Betroffene Dateien (bereits fertig konfiguriert):
`uploads/supabase/functions/book/index.ts`, `uploads/supabase/functions/contact/index.ts`,
`uploads/supabase.js`, `booking-widget.js`, `contact-form.js`.
