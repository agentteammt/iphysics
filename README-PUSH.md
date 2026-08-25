# Push: og:locale-Korrektur (2026-08-25)

## Was geändert wurde
Auf allen 15 Seiten (DE/EN/IT × index, roi-check, impressum, datenschutz, agb):

- `og:locale` einheitlich gesetzt: `de_DE` (Root), `en_US` (/en/), `it_IT` (/it/)
- `og:locale:alternate` für die jeweils zwei anderen Sprachen ergänzt
- alte/uneinheitliche og:locale-Einträge entfernt
- Position: direkt vor `<link rel="canonical">`

Nicht angetastet: hreflang-Blöcke, canonical, Sitemap, Skripte, Assets.

## Wie pushen
Ordnerstruktur 1:1 ins Repo-Root kopieren (überschreibt nur die 15 HTML-Dateien):

    index.html
    roi-check.html
    impressum.html
    datenschutz.html
    agb.html
    en/…  (dieselben 5)
    it/…  (dieselben 5)

## Verifikation nach Deploy
    curl -s https://virtuelle-inbetriebnahme.machineering.com/en/ | grep og:locale
    → <meta property="og:locale" content="en_US">
      <meta property="og:locale:alternate" content="de_DE">
      <meta property="og:locale:alternate" content="it_IT">
