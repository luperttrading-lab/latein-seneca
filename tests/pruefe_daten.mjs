// Prüft daten.js mit derselben Prüfung, die App und Werkstatt nutzen.  Aufruf: node tests/pruefe_daten.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const lies = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const ctx = {};
vm.runInNewContext(lies('pruefung.js') + '\n' + lies('daten.js') + '\nthis.TEXTE = TEXTE;', ctx);

const fehler = ctx.TEXTE.flatMap(t => ctx.Pruefung.pruefeText(t).map(f => `${t.id} · ${f}`));
const n = (f) => ctx.TEXTE.reduce((m, t) => m + t.saetze.reduce((k, s) => k + f(s), 0), 0);
if (fehler.length) { console.log(fehler.join('\n')); process.exit(1); }
console.log(`ok: ${n(() => 1)} Sätze, ${n(s => s.w.filter(x => !x.p).length)} Wörter, ${n(s => s.schritte.length)} Schritte`);
