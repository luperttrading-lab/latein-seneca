// Rundgang durch die App im Handy-Format: Satz 1 komplett, Stichproben in allen Sätzen.
// Aufruf: node tests/app_rundgang.mjs [bildordner]   (startet selbst einen lokalen Server)
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { execSync } from 'node:child_process';

// Playwright lokal oder global (Cloud-Container hat es global installiert)
const pw = await import('playwright').catch(() =>
  import(join(execSync('npm root -g').toString().trim(), 'playwright', 'index.js')));
const chromium = pw.chromium || pw.default.chromium;

const wurzel = new URL('..', import.meta.url).pathname;
const bilder = process.argv[2];
const TYPEN = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const pfad = join(wurzel, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  try { res.writeHead(200, { 'content-type': TYPEN[extname(pfad)] || 'text/plain' }); res.end(await readFile(pfad)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const fehler = [];
const pruefe = (bed, text) => { if (!bed) fehler.push(text); };
const browser = await chromium.launch();
const seite = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
seite.on('pageerror', e => fehler.push('JS-Fehler: ' + e.message));
seite.on('console', m => { if (m.type() === 'error') fehler.push('Konsole: ' + m.text()); });
if (bilder) await mkdir(bilder, { recursive: true });
const foto = async name => { if (bilder) await seite.screenshot({ path: `${bilder}/${name}.png`, fullPage: false }); };

await seite.goto(url);
await seite.waitForSelector('#latein .wort');
const wort = (form, nr = 1) => seite.locator('#latein .wort', { hasText: new RegExp(`^${form}$`) }).nth(nr - 1);

// Schritt 1: Gliedern – erst ein falsches Wort, dann richtig
await foto('01-start');
await wort('sed').click();
await seite.click('[data-act=pruefen]');
pruefe(await seite.locator('.rueck').innerText().then(t => t.includes('sed verbindet')), 'Falsch-Rückmeldung zu sed fehlt');
await foto('02-falsch');
await wort('quid').click(); await wort('quod').click();
await seite.click('[data-act=pruefen]');
pruefe(await seite.locator('.lehrer').count() === 1, 'Erklärung nach Lösung fehlt');
pruefe(await seite.locator('.satzbild[open] .zeile').count() === 5, 'Satzbild Satz 1 sollte 5 Zeilen haben');
await foto('03-gegliedert');
await seite.click('[data-act=weiter]');

// Schritt 2: Prädikate
for (const f of ['volunt', 'sit', 'efficiat', 'caligant']) await wort(f).click();
await seite.click('[data-act=pruefen]');
pruefe(await seite.locator('.punkt.ok').count() === 1, 'Prädikat-Schritt sollte „auf Anhieb“ zählen');
pruefe(await seite.locator('#latein .r-P').count() === 4, 'Prädikate sollten rot gefärbt sein');
await seite.click('[data-act=weiter]');

// Schritt 3: Wahl – erst falsch, dann richtig
await seite.locator('.option').nth(0).click();
pruefe(await seite.locator('.option.falsch .warum').count() === 1, 'Begründung für falsche Wahl fehlt');
await seite.locator('.option').nth(1).click();
await foto('04-wahl');
await seite.click('[data-act=weiter]');

// Restliche Schritte per Lösung
while (await seite.locator('[data-act=loesung]').count()) {
  await seite.click('[data-act=loesung]');
  await seite.click('[data-act=weiter]');
}
await seite.fill('#ueb', 'Glücklich leben wollen alle, Bruder Gallio …');
await seite.click('[data-act=zeige-g]');
await seite.click('[data-act=fertig]');
pruefe(await seite.locator('.merke').count() === 1, 'Merke-Kasten nach Abschluss fehlt');
await foto('05-fertig');

// Wortkarte
await seite.evaluate(() => window.scrollTo(0, 0));
await wort('caligant').click();
await seite.waitForSelector('.blatt.an');
pruefe((await seite.locator('.blatt').innerText()).includes('im Dunkeln tappen'), 'Wortkarte zeigt Bedeutung nicht');
await foto('06-wortkarte');
await seite.click('.blatt [data-act=schliessen]');

// Alle Sätze: Satzbild freischalten, Lösung jedes Schritts zeigen – darf nirgends werfen
for (let k = 2; k <= 8; k++) {
  await seite.click('[data-act=vor]');
  await seite.waitForSelector('#latein .wort');
  pruefe((await seite.locator('.mitte').innerText()).includes(`Satz ${k}`), `Satz ${k} nicht erreicht`);
  while (await seite.locator('[data-act=loesung]').count()) {
    await seite.click('[data-act=loesung]');
    await seite.click('[data-act=weiter]');
  }
  if (k === 5) await foto('07-satz5');
  await seite.click('[data-act=fertig]');
}

// Selbstständig-Modus und Methode/Vokabeln
await seite.click('[data-act=modus][data-m=selbst]');
pruefe(await seite.locator('.haken li').count() === 8, 'Checkliste fehlt');
await foto('08-selbst');
await seite.click('[data-tab=methode]');
pruefe((await seite.locator('h2').first().innerText()).includes('Methode'), 'Methode-Seite fehlt');
await foto('09-methode');
await seite.click('[data-tab=vokabeln]');
pruefe(await seite.locator('.vzeile').count() >= 1, 'Nachgeschlagenes Wort nicht in Vokabeln');
await seite.click('[data-act=abfrage]');
await seite.click('[data-act=abfrage-zeigen]');
await foto('10-abfrage');

// Zustand bleibt nach Neuladen erhalten
await seite.reload();
await seite.click('[data-tab=text]');
pruefe((await seite.locator('.mitte').innerText()).includes('Satz 8'), 'Stand nach Neuladen verloren');

// Dunkelmodus
await seite.emulateMedia({ colorScheme: 'dark' });
await seite.click('[data-act=uebersicht]');
await seite.waitForSelector('.blatt.an');
await foto('11-dunkel-uebersicht');

await browser.close(); server.close();
if (fehler.length) { console.log('FEHLER:\n' + fehler.join('\n')); process.exit(1); }
console.log('ok: Rundgang ohne Fehler');
