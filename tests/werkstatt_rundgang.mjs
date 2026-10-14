// Werkstatt → App: Foto erkennen, analysieren (Claude nachgebaut), kopieren, in der App importieren.
// Aufruf: node tools/baue_werkstatt.mjs && node tests/werkstatt_rundgang.mjs [bildordner]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { execSync } from 'node:child_process';
import vm from 'node:vm';

const pw = await import('playwright').catch(() =>
  import(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.js')));
const chromium = pw.chromium || pw.default.chromium;

const wurzel = new URL('..', import.meta.url).pathname;
const bilder = process.argv[2];
const ctx = {};
vm.runInNewContext(readFileSync(join(wurzel, 'daten.js'), 'utf8') + '\nthis.TEXTE = TEXTE;', ctx);
const SAETZE = JSON.parse(JSON.stringify(ctx.TEXTE[0].saetze.slice(0, 3)));
const einheiten = SAETZE.map(s => ({ ref: s.ref, text: s.w.map(x => x.p ? x.p : ' ' + x.t).join('').trim() }));

// Die Werkstatt-Datei wird beim Veröffentlichen in ein Gerüst gesetzt – hier nachgebildet
const geruest = html => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${html}</body></html>`;
const TYPEN = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const pfad = decodeURIComponent(req.url.split('?')[0]);
  try {
    if (pfad === '/werkstatt') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(geruest(await readFile(join(wurzel, 'werkstatt/werkstatt.html'), 'utf8')));
    }
    const datei = join(wurzel, pfad.replace(/\/$/, '/index.html'));
    res.writeHead(200, { 'content-type': TYPEN[extname(datei)] || 'text/plain' }); res.end(await readFile(datei));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}`;

const fehler = [];
const pruefe = (bed, text) => { if (!bed) fehler.push(text); };
const browser = await chromium.launch();
const kontext = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
if (bilder) await mkdir(bilder, { recursive: true });

// ───────── Werkstatt
const ws = await kontext.newPage();
ws.on('pageerror', e => fehler.push('Werkstatt JS: ' + e.message));
await ws.addInitScript(({ SAETZE, einheiten }) => {
  const aufrufe = window.__aufrufe = [];
  const fake = async () => ({ text: '', truncated: false });
  fake.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 2e7, mediaTypes: ['image/jpeg', 'image/png'] } });
  fake.json = async (input, opts = {}) => {
    await new Promise(r => setTimeout(r, 30));
    if (opts.images) {
      aufrufe.push({ art: 'erkennen', bilder: opts.images.length });
      // Einheit 1 ohne Stellenangabe – so liefert Claude Lehrbuchtexte ohne Abschnittszahlen
      return { autor: '', werk: 'De vita beata', stelle: 'Kapitel 1, Abschnitt 1', einheiten: einheiten.map((e, i) => (i === 0 ? { text: e.text } : e)), unsicher: ['inpellit'] };
    }
    const n = Number(input.match(/Analysiere NUR Einheit (\d+)/)[1]);
    const nachbesserung = input.includes('hatte formale Fehler');
    aufrufe.push({ art: 'analyse', n, nachbesserung, cache: opts.cache });
    opts.onText?.({ text: '{"id"', delta: '{"id"' });
    const satz = JSON.parse(JSON.stringify(SAETZE[n - 1]));
    if (n === 2 && !nachbesserung) delete satz.gut;          // erster Versuch absichtlich unvollständig
    return satz;
  };
  window.claude = { use: async n => (n === 'sample' ? fake : n === 'downloads' ? { save: async () => {} } : null) };
}, { SAETZE, einheiten });

await ws.goto(url + '/werkstatt');
await ws.waitForFunction(() => !document.getElementById('foto-label').hidden);
await ws.setInputFiles('#foto', join(wurzel, 'icon-512.png'));
await ws.click('#erkennen');
await ws.waitForSelector('#einheiten .einheit');
pruefe(await ws.locator('#einheiten .einheit').count() === 3, 'Werkstatt: 3 Einheiten erwartet');
pruefe(await ws.evaluate(() => window.__aufrufe[0]?.bilder) === 3, 'Werkstatt: Foto sollte in 3 Streifen gehen');
pruefe((await ws.locator('#unsicher').innerText()).includes('inpellit'), 'Werkstatt: Unsicher-Hinweis fehlt');
if (bilder) await ws.screenshot({ path: `${bilder}/w1-pruefen.png` });

await ws.click('#analysieren');
await ws.waitForFunction(() => !document.getElementById('s4').classList.contains('zu'), null, { timeout: 20000 });
const aufrufe = await ws.evaluate(() => window.__aufrufe);
pruefe(aufrufe.some(a => a.n === 2 && a.nachbesserung && a.cache === false), 'Werkstatt: Nachbesserung für Einheit 2 fehlt');
pruefe(aufrufe.filter(a => a.art === 'analyse').length === 4, 'Werkstatt: 3 Analysen + 1 Nachbesserung erwartet (keine Nachbesserung wegen fehlender Stelle)');
pruefe(JSON.parse(await ws.inputValue('#ausgabe')).saetze[0].ref === '1', 'Werkstatt: Einheit ohne Stelle sollte laufende Nummer bekommen');
const json = await ws.inputValue('#ausgabe');
pruefe(json.length > 1000, 'Werkstatt: Ausgabe leer');
pruefe((await ws.locator('#ergebnis').innerText()).includes('Bereit für die App'), 'Werkstatt: Ergebnis nicht bereit');
if (bilder) await ws.screenshot({ path: `${bilder}/w2-fertig.png`, fullPage: true });
await ws.emulateMedia({ colorScheme: 'dark' });
if (bilder) await ws.screenshot({ path: `${bilder}/w3-dunkel.png` });

// Stand übersteht Neuladen
await ws.reload();
await ws.waitForFunction(() => document.getElementById('ausgabe').value.length > 1000);

// ───────── App: Import
const app = await kontext.newPage();
app.on('pageerror', e => fehler.push('App JS: ' + e.message));
await app.goto(url + '/');
await app.waitForSelector('#latein .wort');
await app.click('[data-act=vor]');                         // Fortschritt im eingebauten Text: Satz 2
await app.click('[data-act=uebersicht]');
await app.click('[data-act=import]');
await app.fill('#import-feld', '{"kaputt": true');
await app.click('[data-act=importieren]');
pruefe((await app.locator('.blatt .rueck').innerText()).includes('kein vollständiger Text'), 'App: Meldung bei kaputtem JSON fehlt');
await app.fill('#import-feld', json);
if (bilder) await app.screenshot({ path: `${bilder}/a1-import.png` });
await app.click('[data-act=importieren]');
await app.waitForFunction(() => document.getElementById('schrift').textContent === 'De vita beata' && document.querySelector('.mitte').textContent.includes('von 3'));
pruefe(await app.locator('.auto').count() === 1, 'App: Hinweis „automatisch erstellt“ fehlt');
await app.locator('#latein .wort').first().click();           // Gliedern-Schritt: Auswahl funktioniert
await app.click('[data-act=loesung]');
pruefe(await app.locator('.lehrer').count() === 1, 'App: Schritt im importierten Text nicht lösbar');
await app.reload();
await app.waitForSelector('#latein .wort');
pruefe((await app.locator('.mitte').innerText()).includes('von 3'), 'App: importierter Text nach Neuladen nicht aktiv');
await app.click('[data-act=uebersicht]');
pruefe(await app.locator('.tliste li').count() === 2, 'App: Textliste sollte 2 Texte zeigen');
if (bilder) await app.screenshot({ path: `${bilder}/a2-texte.png` });
await app.locator('.tliste [data-act=text]').first().click();
await app.click('.blatt [data-act=schliessen]');
pruefe((await app.locator('.mitte').innerText()).includes('Satz 2 von 8'), 'App: Position im eingebauten Text verloren');
await app.click('[data-act=uebersicht]');
await app.locator('[data-act=text-weg]').click();
await app.locator('[data-act=text-weg]').click();
pruefe(await app.locator('.tliste li').count() === 0, 'App: Text nicht entfernt');

await browser.close(); server.close();
if (fehler.length) { console.log('FEHLER:\n' + fehler.join('\n')); process.exit(1); }
console.log('ok: Werkstatt → App ohne Fehler');
