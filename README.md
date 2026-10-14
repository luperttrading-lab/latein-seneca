# Seneca übersetzen

Übersetzungshilfe für lateinische Texte – Satz für Satz, nach einer festen Methode:
Gliedern → Prädikat → Subjekt → Ergänzungen → Bezüge (KNG) → Konstruktionen → Übersetzen.
Eingebaut: Seneca, *De vita beata* 1,1–2 (von Hand analysiert). Weitere Seiten kommen per Foto dazu.

- **Geführt:** Jeder Satz in Lernschritten mit Rückmeldung, Tipp und Lösung. Falsche Antworten werden begründet.
- **Selbstständig:** Nur die Checkliste – die Methode ohne Stützräder.
- **Wort antippen:** Wörterbuchform und Bedeutung; Form und Funktion erst auf Wunsch.
- **Vokabeln:** Jedes nachgeschlagene Wort landet in einer Liste mit Abfrage.
- **Satzbild:** Haupt- und Gliedsätze eingerückt (Einrückmethode).
- **Neue Seite:** Foto einer Buchseite → Claude liest den lateinischen Text → du prüfst ihn → Claude
  analysiert Satz für Satz → die Seite liegt in deiner Bibliothek. Solche Seiten sind als
  „automatisch erstellt“ gekennzeichnet: formal geprüft, inhaltlich nicht.

## Zwei Fassungen aus denselben Dateien

| | claude.ai (Artefakt) | GitHub Pages |
|---|---|---|
| Link | https://claude.ai/artifact/EM8QYEVRPWn95FFsMkh4tx | https://luperttrading-lab.github.io/latein-seneca/ |
| Stand | im Claude-Konto, auf jedem Gerät gleich (`db`, privat unter `data/users/<id>/`) | im Browser des Geräts (localStorage) |
| Neue Seiten | per Foto, in der App (Claude über das eigene Konto) | nur per Einfügen einer fertigen Seite |
| Offline | nein | ja (Service Worker) |

Die Artefakt-Fassung ist die Hauptfassung. `node tools/baue_artefakt.mjs` baut sie als eine Datei
(`artefakt/seneca.html`) aus `index.html`, `style.css`, `pruefung.js`, `daten.js`, `werkstatt.js`
und `app.js`; veröffentlicht wird sie mit den Fähigkeiten `sample` (mit Bildern), `db` und `user`.

## Aufbau

| Datei | Inhalt |
|---|---|
| `daten.js` | eingebauter Text: Wortanalysen, Teilsätze, Lernschritte, Übersetzungen |
| `pruefung.js` | formale Prüfung der Satzdaten – gemeinsam für App, Werkstatt, Tests |
| `werkstatt.js` | Neue Seite per Foto: Erkennen, Prüfen, Analyse, Übernahme |
| `app.js` | Logik, Darstellung, Speicher (Konto oder Gerät) |
| `style.css` | Gestaltung, hell und dunkel |
| `sw.js` | Service Worker „Netz zuerst“ (nur Pages), damit Updates ankommen |
| `index.html` | Gerüst und `APP_VERSION` – **bei jeder Änderung hochzählen** |
| `tools/baue_artefakt.mjs` | baut die Artefakt-Fassung |

## Prüfen

```
node tests/pruefe_daten.mjs          # alle Verweise und Pflichtfelder in daten.js
node tests/app_rundgang.mjs          # Pages-Fassung: Klick-Rundgang im Handy-Format (Playwright)
node tools/baue_artefakt.mjs && node tests/werkstatt_rundgang.mjs   # Artefakt: Foto → Analyse → Bibliothek → Konto
```

Die Tests bauen Claude und den Konto-Speicher nach; der echte Weg mit Claude wird nur am Gerät geprüft.
Die Analysen und Übersetzungen wurden mit Claude erstellt.
