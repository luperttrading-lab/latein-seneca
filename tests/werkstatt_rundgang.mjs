// Artefakt-Fassung (claude.ai): Foto → Text prüfen → Analyse (Claude nachgebaut) → in die Bibliothek →
// übersetzen → Stand im Konto (db nachgebaut) → Neuladen → Text entfernen.
// Aufruf: node tools/baue_artefakt.mjs && node tests/werkstatt_rundgang.mjs [bildordner]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

// Das Gerüst, in das die Plattform die Seite setzt – hier nachgebildet
const geruest = html => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>${html}</body></html>`;
const server = createServer(async (req, res) => {
  try {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(geruest(await readFile(join(wurzel, 'artefakt/seneca.html'), 'utf8')));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const fehler = [];
const pruefe = (bed, text) => { if (!bed) fehler.push(text); };
const browser = await chromium.launch();
const kontext = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
if (bilder) await mkdir(bilder, { recursive: true });
const seite = await kontext.newPage();
seite.on('pageerror', e => fehler.push('JS: ' + e.message));
seite.on('console', m => { if (m.type() === 'error') fehler.push('Konsole: ' + m.text()); });

// window.claude nachgebaut: sample (Claude), db (Speicher in sessionStorage – überlebt Neuladen), user
await seite.addInitScript(({ SAETZE, einheiten }) => {
  const aufrufe = window.__aufrufe = [];
  const fake = async () => ({ text: '', truncated: false });
  fake.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 2e7, mediaTypes: ['image/jpeg', 'image/png'] } });
  const sok = window.__sok = [];
  const SOK_ANTWORTEN = [
    { urteil: 'fehler', fehler_id: 'volunt-person', stufe: 1, frage: 'Schau dir das Prädikat des Hauptsatzes an – welche Person hat volunt?', woerter: ['volunt'], richtig: 'Das Subjekt omnes hast du richtig erkannt.' },
    { urteil: 'fehler', fehler_id: 'volunt-person', stufe: 1, frage: 'Stimmt. Was heißt das für deine Übersetzung?', woerter: ['volunt'], richtig: 'Deine Antwort ist richtig.' },
    { urteil: 'fehler', fehler_id: 'volunt-person', stufe: 1, frage: 'Noch einmal: Wer will?', woerter: ['volunt'], richtig: '' },
    { urteil: 'gut', fehler_id: '', stufe: 1, frage: 'Wie könntest du die Betonung von Vivere im Deutschen nachbilden?', woerter: [], richtig: 'Satzbau, Bezüge und Formen stimmen.' },
  ];
  fake.json = async (input, opts = {}) => {
    await new Promise(r => setTimeout(r, 30));
    if (input.includes('sokratischen Methode')) { sok.push(input); return SOK_ANTWORTEN[Math.min(sok.length - 1, 3)]; }
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
  const lade = () => JSON.parse(sessionStorage.getItem('fakedb') || '{}');
  const sichere = d => sessionStorage.setItem('fakedb', JSON.stringify(d));
  const schreibe = window.__schreibe = [];
  const docRef = pfad => ({
    id: pfad.split('/').pop(), path: pfad,
    async get() { const d = lade()[pfad]; return { id: pfad.split('/').pop(), exists: !!d, data: () => d && Object.freeze(JSON.parse(JSON.stringify(d))) }; },
    async set(data) { if (JSON.stringify(data).length > 262144) throw { code: 'invalid_argument' }; const d = lade(); d[pfad] = JSON.parse(JSON.stringify(data)); sichere(d); schreibe.push(pfad); },
    async delete() { const d = lade(); delete d[pfad]; sichere(d); },
    collection: p => colRef(pfad + '/' + p),
  });
  const colRef = pfad => ({
    path: pfad, doc: id => docRef(pfad + '/' + (id || Math.random().toString(36).slice(2))),
    async get() { const docs = Object.entries(lade()).filter(([k]) => k.startsWith(pfad + '/') && !k.slice(pfad.length + 1).includes('/')).map(([k, v]) => ({ id: k.split('/').pop(), exists: true, data: () => v })); return { docs, size: docs.length, empty: !docs.length }; },
  });
  const db = { doc: p => { if (p.split('/').length % 2) throw new TypeError('Dokumentpfad braucht gerade Segmentzahl: ' + p); return docRef(p); },
    collection: p => { if (p.split('/').length % 2 === 0) throw new TypeError('Sammlungspfad braucht ungerade Segmentzahl: ' + p); return colRef(p); } };
  const user = { id: async () => 'u_test', isOwner: async () => true };
  window.claude = { use: async n => ({ sample: fake, db, user })[n] || null };
}, { SAETZE, einheiten });

process.on('uncaughtException', async e => {
  console.log('ABBRUCH:', e.message.split('\n')[0], '|', (e.stack || '').split('\n').find(l => l.includes('werkstatt_rundgang')) || '');
  if (fehler.length) console.log('FEHLER BISHER:\n' + fehler.join('\n'));
  if (bilder) await seite.screenshot({ path: `${bilder}/abbruch.png` }).catch(() => {});
  process.exit(1);
});
process.on('unhandledRejection', e => { console.log('ABBRUCH:', String(e?.message || e).split('\n')[0]); if (fehler.length) console.log('FEHLER BISHER:\n' + fehler.join('\n')); process.exit(1); });
const geladen = () => seite.waitForFunction(() => !document.querySelector('.lade') && document.getElementById('haupt').children.length > 0);
await seite.goto(url);
await geladen();
pruefe((await seite.locator('.mitte').innerText()).includes('von 8'), 'Eingebauter Text nicht aktiv');
await seite.click('[data-act=intro-weg]');

// ───────── Übersetzung prüfen lassen (sokratisch), Satz 1 im Modus „Selbstständig“
await seite.click('[data-act=modus][data-m=selbst]');
await seite.click('[data-act=sokrates]');
pruefe((await seite.locator('.sok-fehler').innerText()).includes('Schreib zuerst'), 'Sokrates: Hinweis bei leerem Feld fehlt');
await seite.fill('#ueb', 'Leben will jeder glücklich, Bruder Gallio, aber sie sehen nicht, was das Leben glücklich macht.');
await seite.click('[data-act=sokrates]');
await seite.waitForFunction(() => document.querySelectorAll('.runde').length === 1);
pruefe((await seite.locator('.runde .stufe').innerText()).includes('1/3'), 'Sokrates: Stufe 1 fehlt');
pruefe(await seite.locator('#latein .wort.frage').count() === 1, 'Sokrates: volunt sollte im Text markiert sein');
const p1 = await seite.evaluate(() => window.__sok[0]);
pruefe(p1.includes('Leben will jeder glücklich') && p1.includes('volunt | velle'), 'Sokrates: Prompt ohne Übersetzung oder Analyse');
await seite.fill('#sok-antwort', '3. Person Plural');
await seite.click('[data-act=sokrates]');
await seite.waitForFunction(() => document.querySelectorAll('.runde').length === 2);
const p2 = await seite.evaluate(() => window.__sok[1]);
pruefe(p2.includes('Antwort auf deine letzte Frage: „3. Person Plural“'), 'Sokrates: Antwort fehlt im Prompt');
pruefe((await seite.locator('.runde').nth(1).locator('.stufe').innerText()).includes('1/3'), 'Sokrates: nach richtiger Antwort sollte die Stufe bleiben');
await seite.click('[data-act=sokrates]');
await seite.waitForFunction(() => document.querySelectorAll('.runde').length === 3);
pruefe(await seite.evaluate(() => window.__sok[2].includes('Stufe 2')), 'Sokrates: Prompt fordert nicht Stufe 2');
pruefe((await seite.locator('.runde').nth(2).locator('.stufe').innerText()).includes('2/3'), 'Sokrates: gleicher Fehler ohne Antwort muss Stufe 2 werden');
await seite.fill('#ueb', 'Glücklich leben wollen alle, Bruder Gallio; doch beim Durchschauen, was ein Leben glücklich macht, tappen sie im Dunkeln.');
await seite.click('[data-act=sokrates]');
await seite.waitForFunction(() => document.querySelectorAll('.runde').length === 4);
pruefe(await seite.locator('.runde .stufe.gut').count() === 1, 'Sokrates: Urteil „stimmt“ fehlt');
pruefe(await seite.locator('#latein .wort.frage').count() === 0, 'Sokrates: Markierung sollte nach „gut“ verschwinden');
if (bilder) await seite.screenshot({ path: `${bilder}/s1-sokrates.png`, fullPage: true });
await seite.waitForFunction(() => { const d = JSON.parse(sessionStorage.getItem('fakedb') || '{}'); const st = Object.entries(d).find(([k]) => k.endsWith('/stand')); return st && st[1].dialog?.s1?.length === 4; }, null, { timeout: 5000 })
  .catch(() => fehler.push('Sokrates: Gespräch nicht ins Konto geschrieben'));
await seite.reload();
await seite.waitForFunction(() => !document.querySelector('.lade') && document.getElementById('haupt').children.length > 0);
pruefe(await seite.locator('.runde').count() === 4, 'Sokrates: Gespräch nach Neuladen verloren');
await seite.click('[data-act=sokrates-neu]');
pruefe(await seite.locator('.runde').count() === 0, 'Sokrates: Gespräch leeren geht nicht');
await seite.click('[data-act=modus][data-m=gefuehrt]');
await seite.click('[data-act=vor]');                          // Fortschritt im eingebauten Text: Satz 2
await seite.waitForFunction(() => window.__schreibe.some(p => p.endsWith('/stand')), null, { timeout: 5000 }).catch(() => fehler.push('Stand wurde nicht ins Konto geschrieben'));

// Neue Seite: Foto → erkennen
await seite.click('[data-tab=neu]');
await seite.waitForSelector('#ws-foto');
await seite.setInputFiles('#ws-foto', join(wurzel, 'icon-512.png'));
await seite.click('#ws-erkennen');
await seite.waitForSelector('#ws-einheiten .einheit');
pruefe(await seite.locator('#ws-einheiten .einheit').count() === 3, 'Werkstatt: 3 Einheiten erwartet');
pruefe(await seite.evaluate(() => window.__aufrufe[0]?.bilder) === 3, 'Werkstatt: Foto sollte in 3 Streifen gehen');
pruefe((await seite.locator('#ws-unsicher').innerText()).includes('inpellit'), 'Werkstatt: Unsicher-Hinweis fehlt');
if (bilder) await seite.screenshot({ path: `${bilder}/n1-pruefen.png` });

// Analyse mit einer Nachbesserung
await seite.click('#ws-analysieren');
await seite.waitForFunction(() => !document.getElementById('ws-s4').classList.contains('zu'), null, { timeout: 20000 });
const aufrufe = await seite.evaluate(() => window.__aufrufe);
pruefe(aufrufe.some(a => a.n === 2 && a.nachbesserung && a.cache === false), 'Werkstatt: Nachbesserung für Einheit 2 fehlt');
pruefe(aufrufe.filter(a => a.art === 'analyse').length === 4, 'Werkstatt: 3 Analysen + 1 Nachbesserung erwartet');
pruefe((await seite.locator('#ws-ergebnis').innerText()).includes('3 Sätze'), 'Werkstatt: Ergebnis nicht bereit');
if (bilder) await seite.screenshot({ path: `${bilder}/n2-fertig.png`, fullPage: true });

// Werkstatt-Stand überlebt Neuladen (Konto) – erst warten, bis der Stand geschrieben ist
await seite.waitForFunction(() => { const d = JSON.parse(sessionStorage.getItem('fakedb') || '{}'); const w = Object.entries(d).find(([k]) => k.endsWith('/werkstatt')); return !!w && w[1].phase === 4; }, null, { timeout: 5000 })
  .catch(() => fehler.push('Werkstatt-Stand (Phase 4) wurde nicht ins Konto geschrieben'));
await seite.reload();
await geladen();
pruefe(await seite.locator('#tabs button.an').innerText() === 'Neue Seite', 'Reiter nach Neuladen nicht gemerkt');
await seite.waitForSelector('#ws-uebernehmen');
pruefe(!(await seite.locator('#ws-uebernehmen').isDisabled()), 'Werkstatt: Stand nach Neuladen verloren');

// Übernehmen → Text aktiv
await seite.click('#ws-uebernehmen');
await seite.waitForFunction(() => document.getElementById('schrift').textContent === 'De vita beata' && document.querySelector('.mitte')?.textContent.includes('von 3'));
pruefe(await seite.locator('.auto').count() === 1, 'App: Hinweis „automatisch erstellt“ fehlt');
pruefe((await seite.locator('.update').innerText()).includes('Neu in der Bibliothek'), 'App: Meldung nach Übernahme fehlt');
await seite.locator('#latein .wort').first().click();
await seite.click('[data-act=loesung]');
pruefe(await seite.locator('.lehrer').count() === 1, 'App: Schritt im neuen Text nicht lösbar');
if (bilder) await seite.screenshot({ path: `${bilder}/n3-uebernommen.png` });

// Alles im Konto: Neuladen hält Text, Position und Werkstatt (leer)
await seite.waitForFunction(() => window.__schreibe.some(p => p.includes('/bibliothek/texte/')), null, { timeout: 5000 }).catch(() => fehler.push('Text wurde nicht ins Konto geschrieben'));
await seite.reload();
await geladen();
pruefe((await seite.locator('.mitte').innerText()).includes('von 3'), 'App: neuer Text nach Neuladen nicht aktiv');
await seite.click('[data-act=uebersicht]');
await seite.waitForSelector('.blatt.an');
pruefe(await seite.locator('.tliste li').count() === 2, 'App: Textliste sollte 2 Texte zeigen');
if (bilder) await seite.screenshot({ path: `${bilder}/n4-texte.png` });
await seite.locator('.tliste [data-act=text]').first().click();
await seite.click('.blatt [data-act=schliessen]');
pruefe((await seite.locator('.mitte').innerText()).includes('Satz 2 von 8'), 'App: Position im eingebauten Text verloren');
await seite.click('[data-tab=neu]');
await seite.waitForSelector('#ws-s1');
pruefe(await seite.locator('#ws-s2.zu').count() === 1, 'Werkstatt: nach Übernahme nicht zurückgesetzt');

// Text entfernen (zweistufig)
await seite.click('[data-tab=text]');
await seite.click('[data-act=uebersicht]');
await seite.locator('[data-act=text-weg]').click();
await seite.locator('[data-act=text-weg]').click();
pruefe(await seite.locator('.tliste li').count() === 0, 'App: Text nicht entfernt');
pruefe(await seite.evaluate(() => !Object.keys(JSON.parse(sessionStorage.getItem('fakedb'))).some(k => k.includes('/texte/'))), 'App: Textdokument nicht aus dem Konto gelöscht');

// Dunkelmodus
await seite.emulateMedia({ colorScheme: 'dark' });
await seite.click('.blatt [data-act=schliessen]');
await seite.click('[data-tab=neu]');
if (bilder) await seite.screenshot({ path: `${bilder}/n5-dunkel.png` });

await browser.close(); server.close();
if (fehler.length) { console.log('FEHLER:\n' + fehler.join('\n')); process.exit(1); }
console.log('ok: Artefakt – Werkstatt, Bibliothek und Konto ohne Fehler');
