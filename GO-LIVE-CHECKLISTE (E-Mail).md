# GO-LIVE CHECKLISTE — Formular-Backend (Stand 2026-07-21 · Vercel + Neon + Lettermint)

**⚠️ NICHT VERGESSEN beim Go-Live — sonst laufen alle drei Formulare im Demo-Modus (verschicken KEINE Mails).**

Fixe Werte sind bereits im Code hinterlegt (Empfänger `u.zenker@team-mt.de`, Reply-To = Absender,
Betreffzeilen, Bestätigungsmail 48h, Outlook-.ics + Kalender-Button, VIBN-Auswertungsmail).
E-Mail-Versand über **Lettermint** (EU-Anbieter, Niederlande).

**Architektur (Multi-Kunden-Modell):** Website läuft auf **Vercel**; Backend = Vercel
Functions im Ordner `api/` (`availability`, `book`, `contact`, `roi`) + **Neon**-Postgres
(EINE gemeinsame Agentur-Datenbank, Region Frankfurt). Diese Website = Kunde "machineering"
mit eigenem Schema `machineering` (slots, bookings [Unique auf slot_start gegen
Doppelbuchungen], inquiries, roi_results, request_log). Keine öffentlichen Zugriffe:
DATABASE_URL nur als Vercel-Env-Variable, RLS überall aktiv ohne Policies, keine Keys im
Frontend (Endpoints same-origin). Formulardaten werden zusätzlich zum Mailversand in der
Datenbank gespeichert.

Fertiger Einrichtungs-Prompt für Claude im Browser: `SETUP-PROMPT Claude Browser.md`.
Die Schritte im Einzelnen:

1. **Code deployen:** Inhalt von `github-export/` (inkl. `api/`, `package.json`,
   `backend.js`) ins GitHub-Repo pushen → Vercel baut automatisch.
2. **Neon anlegen/verbinden:** Vercel → Projekt → Storage → Create Database → Neon,
   Region **Frankfurt (eu-central-1)**; alle Environments → setzt `DATABASE_URL` automatisch.
   SQL aus `github-export/db-setup.sql` in der Neon Console ausführen (legt Schema
   `machineering` komplett an). DPA-Hinweis: Neon/Vercel-AVV akzeptieren.
3. **Lettermint:** Domain `team-mt.de` verifiziert? (DNS bei Cloudflare — CNAMEs auf
   "DNS only".) Project API Token (Sending) erstellen. DPA (Art. 28 DSGVO) prüfen.
   In Vercel als Env-Variable `LETTERMINT_API_KEY` hinterlegen → **Redeploy**.
   (Test ohne echte Zustellung: Empfänger `ok@testing.lettermint.co`.)
4. **Config auf der Live-Seite** einbinden (in `index.html`, vor den Widget-Scripts):
   ```html
   <script>
     window.KIW_BACKEND = { base: "/api" };
   </script>
   <script defer src="backend.js"></script>
   ```
   (`backend.js` liegt in `github-export/`.) Ohne dieses Snippet: Demo-Modus.
   Der VIBN-Rechner (`roi-check.html`, läuft als iframe) liest die Config automatisch
   aus dem Eltern-Fenster mit.
5. **Kein Keep-alive nötig:** Neon schläft bei Inaktivität nur und wacht bei der nächsten
   Anfrage automatisch auf (erste Antwort ~1–2 s langsamer). Kein Pausieren wie bei Supabase Free.
6. **Testen:** Terminbuchung + Kontaktformular + VIBN-Check je einmal abschicken →
   interne Mail + Bestätigung/Auswertung prüfen, .ics/Outlook-Button testen; zweite Buchung
   auf denselben Slot muss "full" liefern. Daten in der Neon Console (Schema `machineering`)
   sichtbar? Testzeilen löschen.
   Rate-Limit: ab der 6. Anfrage (Buchung/Kontakt) bzw. 4. (VIBN) innerhalb von
   10 Minuten pro IP antwortet der Endpoint mit HTTP 429.

Spam-Schutz (bereits eingebaut, keine Aktion nötig): verstecktes Honeypot-Feld `website`
in allen drei Formularen (gefüllt = Bot → kein Versand) + Rate-Limit je IP über die
Tabelle `machineering.request_log`.

Betroffene Dateien (bereits fertig konfiguriert, alles in `github-export/`):
`api/_shared.js` (Neon + Lettermint-Helfer), `api/availability.js`, `api/book.js`,
`api/contact.js`, `api/roi.js`, `package.json`, `backend.js` (Frontend-API-Schicht),
`db-setup.sql`, `booking-widget.js`, `contact-form.js`, `roi-check.html`, `roi-widget.js`,
`datenschutz.html` / `Datenschutz.dc.html` (Abschnitt 03: Vercel/Neon/Lettermint).
