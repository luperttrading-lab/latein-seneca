# Seneca übersetzen

Übersetzungshilfe für Seneca, *De vita beata* – Satz für Satz, nach einer festen Methode:
Gliedern → Prädikat → Subjekt → Ergänzungen → Bezüge (KNG) → Konstruktionen → Übersetzen.

- **Geführt:** Jeder Satz in Lernschritten mit Rückmeldung, Tipp und Lösung. Falsche Antworten werden begründet.
- **Selbstständig:** Nur die Checkliste – die Methode ohne Stützräder.
- **Wort antippen:** Wörterbuchform und Bedeutung; Form und Funktion erst auf Wunsch.
- **Vokabeln:** Jedes nachgeschlagene Wort landet in einer Liste mit Abfrage.
- **Satzbild:** Haupt- und Gliedsätze eingerückt (Einrückmethode).

Läuft als Web-App über GitHub Pages; auf dem iPhone über *Teilen → Zum Home-Bildschirm*.
Der Fortschritt bleibt im Browser des Geräts (localStorage).

## Neue Buchseite per Foto

Die **Import-Werkstatt** in claude.ai (https://claude.ai/artifact/EM8QYEVRPWn95FFsMkh4tx) liest
das Foto einer Buchseite, lässt dich den erkannten lateinischen Text prüfen und analysiert ihn
Satz für Satz – über dein Claude-Konto, ohne API-Schlüssel. Das Ergebnis kopierst du und fügst es
in der App unter *Übersicht → Seite importieren* ein. Importierte Seiten sind als
„automatisch erstellt“ gekennzeichnet: Die Analysen sind formal geprüft, inhaltlich nicht.

Quelle der Werkstatt: `werkstatt/vorlage.html`; `node tools/baue_werkstatt.mjs` setzt Prüfung
und Beispielsatz ein und schreibt `werkstatt/werkstatt.html`.

## Aufbau

| Datei | Inhalt |
|---|---|
| `daten.js` | Text, Wortanalysen, Teilsätze, Lernschritte, Übersetzungen |
| `pruefung.js` | formale Prüfung der Satzdaten – gemeinsam für App, Werkstatt, Tests |
| `app.js` | Logik und Darstellung |
| `style.css` | Gestaltung, hell und dunkel |
| `sw.js` | Service Worker „Netz zuerst“, damit Updates ankommen |
| `index.html` | Gerüst und `APP_VERSION` – **bei jeder Änderung hochzählen** |

## Neue Textseite ergänzen

Weitere Sätze kommen als neue Einträge in `saetze` in `daten.js`. Das Format steht oben in der
Datei. Danach prüfen:

```
node tests/pruefe_daten.mjs      # alle Verweise und Pflichtfelder
node tests/app_rundgang.mjs      # Klick-Rundgang im Handy-Format (Playwright)
node tests/werkstatt_rundgang.mjs  # Werkstatt (Claude nachgebaut) → Import in die App
```

Die Analysen und Übersetzungen wurden mit Claude erstellt.
