# iPhysics Landingpage — machineering

Physikbasierte Digital-Twin-Plattform, Landingpage mit interaktivem 3D-Hero
(three.js, GLB mit Meshopt-Kompression), Prozess-Tour per Scroll-Scrub und
vier Inhaltsabschnitten. Sprache: Deutsch (Sie-Form).

## Struktur

```
index.html                      Seite (Markup + Boot-Logik)
datenschutz.html                Datenschutzerklärung
impressum.html                  Impressum
roi-check.html                  VIBN Potenzial-Check (eigenständige Seite)
support.js                      Rendering-Runtime für index.html (muss lokal liegen)
hero-engine.js                  3D-Hero: Intro, Wireframe→Real, Framing, Tour,
                                Mobile-Layout (Headline oben, Scrim, Tap-Ping)
section2.js / section3.js /
section4.js / polish.js         Abschnitts-Logik + Feinschliff
footer.js                       Footer „Zeichnungs-Schriftfeld“: Eingangs-Draw,
                                Responsive-Raster, Status-Hover
booking-widget.js               Terminbuchung (Supabase; ohne Config Demo-Modus)
contact-form.js                 Kontaktformular (Versand-Backend offen, [Offen 17])
roi-widget.js                   VIBN-Potenzial-Rechner (Inline-Widget)
image-slot.js                   Bild-Platzhalter-Komponente
supabase/                       Backend: setup.sql + Edge Functions book/contact/roi
                                (Einrichtung lt. „SETUP-PROMPT Claude Browser.md“)
fonts/                          Titillium Web (lokal, DSGVO) + SIL-OFL-Lizenz
assets/                         Logo, Favicon, OG-Bild, Poster, Fotos, Intro-Video,
                                3D-Modelle montagezelle_web_v2.glb (Desktop, 5,3 MB)
                                + _v2_mobile.glb (touch, 3,4 MB) — EXT_meshopt
.nojekyll                       GitHub Pages: Dateien unverändert ausliefern
```

## Lokal starten

ES-Module funktionieren nicht über `file://` — einen kleinen Server nutzen:

```
python3 -m http.server 8000
# → http://localhost:8000
```

## GitHub Pages

1. Repo anlegen, diesen Ordnerinhalt pushen (Branch `main`).
2. Settings → Pages → Source: „Deploy from a branch", Branch `main`, Ordner `/ (root)`.
3. Seite liegt dann unter `https://<user>.github.io/<repo>/`.

## Vor Go-Live (offene Punkte)

- **three.js self-hosten (DSGVO):** `hero-engine.js` lädt three.js r160 aktuell
  von jsdelivr (drei `import`-Zeilen am Dateianfang). Für Produktion die Module
  lokal ablegen (z. B. `vendor/`) und die drei URLs ersetzen — oder die
  Standalone-Variante der Seite verwenden, dort ist three.js bereits eingebettet.
- **`og:image` absolut setzen:** Social-Scraper brauchen die volle URL,
  z. B. `https://<user>.github.io/<repo>/assets/og-hero.jpg` (in `index.html`,
  zwei Stellen: `<meta property="og:image">` und `_seo()`).
- **Formular-Backend aktivieren:** Supabase + Resend lt. „SETUP-PROMPT Claude
  Browser.md“ einrichten (Code liegt in `supabase/`), danach in `index.html` den
  auskommentierten `window.KIW_SUPABASE`-Block am Ende des `<head>` mit Project-URL
  und anon key füllen und einkommentieren. Ohne Config laufen Terminbuchung und
  VIBN-Check im Demo-Modus (keine echten Buchungen/Mails).
- Kontaktformular sendet noch nicht ([Offen 17] — Backend/Edge Function `contact`
  ist vorbereitet, Anbindung im Widget fehlt).
- Rechtliches: Impressum/Datenschutz sind eigene Seiten (Inhalte übernommen von
  machineering.com — Dienste-Liste im Datenschutz und Bildrechte im Impressum
  vor Go-Live fachlich prüfen; „Google Analytics deaktivieren“-Opt-Out ist noch
  ohne Funktion).

## Dev-/QA-Hinweise

- `window.__hero` = Dev-API (Zustände, `qaTour(p, q)`, `heroTrim`, `framingLog`,
  `perf` = GPU-/DPR-Status des Render-Governors).
- QA-Flags via `sessionStorage.iph_qa_flags` (kommasepariert):
  `reduced`, `touch`, `skip` (Intro überspringen), `lowedges` (schneller Kantenbau),
  `slowload` (GLB-Start +6 s), `nostill` (Real-Standbild aus),
  `weak` (reduziertes Perf-Profil erzwingen — DPR-Stufen/Governor testen).
- Performance: adaptives Profil — GPU-Probe beim Start (iGPU/Software-GL),
  DPR-Stufenleiter mit Laufzeit-Governor (misst echte Frames, senkt bei Ruckeln
  die Renderauflösung stufenweise), Schaltungen werden in die Konsole geloggt.
- Hero-Framing: Anlage rechtsbündig an der Content-Kante — Sichtkanten-Messung,
  Feinjustage über `HERO_TRIM` in `hero-engine.js` (oder live `__hero.heroTrim = -8`).

## Lizenzen

- Titillium Web: SIL Open Font License (`fonts/OFL.txt`).
- three.js: MIT (© three.js authors).
- Inhalte/Logo: © machineering GmbH & Co. KG.
