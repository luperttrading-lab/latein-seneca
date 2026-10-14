// Baut artefakt/seneca.html: die ganze App als eine Seite für claude.ai (Artefakt).
// Quelle sind dieselben Dateien wie für GitHub Pages: index.html (Gerüst), style.css, pruefung.js,
// daten.js, werkstatt.js, app.js.  Aufruf: node tools/baue_artefakt.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const lies = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const index = lies('index.html');
const version = index.match(/APP_VERSION = '([^']+)'/)[1];

// Rumpf aus index.html, ohne die Skript-Verweise – sie werden unten eingebettet
let rumpf = index.match(/<body>([\s\S]*)<\/body>/)[1].replace(/\s*<script src="[^"]+"><\/script>/g, '');

// Im Artefakt setzt das Gerüst der Plattform die Sicherheitsabstände; eigene Zugaben dafür zurücknehmen
const extra = `
.kopf { top: env(safe-area-inset-top, 0px); padding-top: 8px; }
.tabs { padding-bottom: 6px; }
main { padding-bottom: 96px; }`;

const skripte = ['pruefung.js', 'daten.js', 'werkstatt.js', 'app.js'].map(lies).join('\n');
const html = `<title>Seneca übersetzen</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${lies('style.css')}${extra}
</style>
<script>const APP_VERSION = '${version}';</script>
${rumpf.trim()}
<script>
${skripte.replace(/<\/script/gi, '<\\/script')}
</script>
`;
mkdirSync(new URL('../artefakt/', import.meta.url), { recursive: true });
writeFileSync(new URL('../artefakt/seneca.html', import.meta.url), html);
console.log(`artefakt/seneca.html: Version ${version}, ${(html.length / 1024).toFixed(0)} KB`);
