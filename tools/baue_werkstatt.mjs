// Baut werkstatt/werkstatt.html aus der Vorlage: setzt die gemeinsame Prüfung (pruefung.js)
// und einen fertig analysierten Beispielsatz aus daten.js ein.  Aufruf: node tools/baue_werkstatt.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const lies = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const ctx = {};
vm.runInNewContext(lies('daten.js') + '\nthis.TEXTE = TEXTE;', ctx);
const beispiel = ctx.TEXTE[0].saetze[1];          // Satz 2: Konsekutivsatz, Deponentien, Falle – deckt alle Schritt-Typen ab
const json = JSON.stringify(beispiel).replace(/</g, '\\u003c');

let html = lies('werkstatt/vorlage.html');
const ersetze = (marke, inhalt) => {
  if (!html.includes(marke)) throw new Error('Marke fehlt: ' + marke);
  html = html.replace(marke, () => inhalt);
};
ersetze('/*PRUEFUNG*/', lies('pruefung.js'));
ersetze('/*BEISPIEL*/null', json);
html = html.replace(/<!-- Quelle der Werkstatt-Seite[\s\S]*?-->\n/, '');
writeFileSync(new URL('../werkstatt/werkstatt.html', import.meta.url), html);
console.log(`werkstatt/werkstatt.html: ${(html.length / 1024).toFixed(0)} KB`);
