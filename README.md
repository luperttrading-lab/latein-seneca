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

## Aufbau

| Datei | Inhalt |
|---|---|
| `daten.js` | Text, Wortanalysen, Teilsätze, Lernschritte, Übersetzungen |
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
```

Die Analysen und Übersetzungen wurden mit Claude erstellt.
