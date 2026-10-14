// Prüft daten.js: Verweise, Teilsätze, Schritt-Felder.  Aufruf: node tests/pruefe_daten.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const quelle = readFileSync(new URL('../daten.js', import.meta.url), 'utf8');
const ctx = {};
vm.runInNewContext(quelle + '\nthis.TEXTE = TEXTE;', ctx);
const fehler = [];
const PHASEN = ['gliedern', 'verb', 'subjekt', 'ergaenzung', 'bezug', 'konstr', 'falle', 'uebersetzen'];
const ROLLEN = /^[PSOATKV]\*?$/;

function finde(satz, ref) {
  const [form, nr] = ref.split('#');
  let n = Number(nr || 1);
  for (let i = 0; i < satz.w.length; i++) {
    if (satz.w[i].t === form && --n === 0) return i;
  }
  return -1;
}

for (const text of ctx.TEXTE) {
  for (const s of text.saetze) {
    const ort = `${s.id}`;
    s.w.forEach((wort, i) => {
      if (wort.p) return;
      for (const feld of ['t', 'l', 'b', 'f', 'fn', 'r', 'c']) {
        if (wort[feld] === undefined || wort[feld] === '') fehler.push(`${ort} Wort ${i} (${wort.t}): Feld ${feld} fehlt`);
      }
      if (!ROLLEN.test(wort.r)) fehler.push(`${ort} ${wort.t}: Rolle ${wort.r} unbekannt`);
      if (!s.teile[wort.c]) fehler.push(`${ort} ${wort.t}: Teilsatz ${wort.c} nicht definiert`);
    });
    const benutzt = new Set(s.w.filter(x => !x.p).map(x => String(x.c)));
    for (const id of Object.keys(s.teile)) if (!benutzt.has(id)) fehler.push(`${ort}: Teilsatz ${id} ohne Wörter`);

    s.schritte.forEach((st, k) => {
      const o = `${ort} Schritt ${k + 1}`;
      if (!PHASEN.includes(st.ph)) fehler.push(`${o}: Phase ${st.ph}`);
      if (!st.frage) fehler.push(`${o}: frage fehlt`);
      const refs = [...(st.ziel || []), ...(st.auch || []), ...Object.keys(st.falsch || {})];
      if (st.fokus) refs.push(st.fokus);
      for (const r of refs) if (finde(s, r) < 0) fehler.push(`${o}: Verweis „${r}“ nicht gefunden`);
      if (st.typ === 'tippen' || st.typ === 'bezug') {
        if (!st.ziel?.length) fehler.push(`${o}: ziel fehlt`);
        if (!st.erk) fehler.push(`${o}: erk fehlt`);
        for (const r of st.ziel || []) if ((st.auch || []).includes(r)) fehler.push(`${o}: ${r} in ziel und auch`);
        for (const r of Object.keys(st.falsch || {})) if ((st.ziel || []).includes(r)) fehler.push(`${o}: ${r} in ziel und falsch`);
      }
      if (st.typ === 'bezug' && !st.fokus) fehler.push(`${o}: fokus fehlt`);
      if (st.typ === 'wahl') {
        if (!(st.ok >= 0 && st.ok < st.opts.length)) fehler.push(`${o}: ok außerhalb`);
        if (st.warum && st.warum.length !== st.opts.length) fehler.push(`${o}: warum-Länge`);
        if (st.warum && st.warum[st.ok] !== null) fehler.push(`${o}: warum bei richtiger Antwort`);
        if (!st.erk) fehler.push(`${o}: erk fehlt`);
      }
      if (!['tippen', 'bezug', 'wahl', 'text'].includes(st.typ)) fehler.push(`${o}: Typ ${st.typ}`);
    });
    if (s.schritte.at(-1)?.typ !== 'text') fehler.push(`${ort}: letzter Schritt ist nicht die Übersetzung`);
    for (const f of ['woertlich', 'gut', 'thema']) if (!s[f]) fehler.push(`${ort}: ${f} fehlt`);
    if (!s.merke?.length) fehler.push(`${ort}: merke fehlt`);
  }
}

const anzahl = ctx.TEXTE.reduce((n, t) => n + t.saetze.length, 0);
const woerter = ctx.TEXTE.reduce((n, t) => n + t.saetze.reduce((m, s) => m + s.w.filter(x => !x.p).length, 0), 0);
const schritte = ctx.TEXTE.reduce((n, t) => n + t.saetze.reduce((m, s) => m + s.schritte.length, 0), 0);
if (fehler.length) { console.log(fehler.join('\n')); process.exit(1); }
console.log(`ok: ${anzahl} Sätze, ${woerter} Wörter, ${schritte} Schritte`);
