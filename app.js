'use strict';
/* Übersetzungshilfe Seneca – Logik. Daten: daten.js (TEXTE, eingebaut) und eigene Seiten.
   Läuft an zwei Orten: als Artefakt in claude.ai (Stand im Konto, neue Seiten per Foto über werkstatt.js)
   und als Web-App auf GitHub Pages (Stand im Gerät, neue Seiten nur per Einfügen). */

// Die Fassung in claude.ai – von der Pages-Fassung aus verlinkt
const ARTEFAKT = 'https://claude.ai/artifact/EM8QYEVRPWn95FFsMkh4tx';

const ROLLEN = { P: 'Prädikat', S: 'Subjekt', O: 'Objekt / Ergänzung', A: 'Adverbiale', T: 'Attribut', K: 'Konnektor / Einleitewort', V: 'Anrede' };
const LEGENDE = { P: 'Prädikat', S: 'Subjekt', O: 'Objekt', A: 'Adverbiale', T: 'Attribut', K: 'Konnektor', V: 'Anrede' };
const PHASEN = {
  gliedern: '1 · Gliedern', verb: '2 · Prädikat', subjekt: '3 · Subjekt', ergaenzung: '4 · Ergänzungen',
  bezug: '5 · Bezüge', konstr: '6 · Konstruktion', falle: 'Falle!', uebersetzen: '7 · Übersetzen',
};
// Welche Satzglied-Farben nach einem gelösten Schritt sichtbar werden
const PHASE_ROLLEN = { gliedern: ['K'], verb: ['P'], subjekt: ['S'], ergaenzung: ['O'], bezug: ['T'] };

const CHECKLISTE = [
  ['Gliedern', 'Satzzeichen, Subjunktionen, Relativ- und Fragewörter: Wo beginnen Gliedsätze?'],
  ['Prädikate', 'Alle finiten Verben finden. Eins je Teilsatz – sonst Ellipse?'],
  ['Bestimmen', 'Person, Numerus, Tempus, Modus, Genus verbi. Konjunktiv → warum?'],
  ['Subjekt', 'Nominativ im passenden Numerus – oder steckt es in der Endung?'],
  ['Ergänzungen', 'Was verlangt das Verb? Akkusativ, Dativ, Infinitiv, Richtung?'],
  ['Bezüge', 'KNG: Was gehört zusammen? Pronomen → Bezugswort?'],
  ['Konstruktionen', 'nd-Formen, Partizipien, AcI, indirekte Frage, Signalwörter?'],
  ['Übersetzen', 'Vom Hauptsatz aus. Erst wörtlich, dann gutes Deutsch. Jedes Wort untergebracht?'],
];

const KONTROLLE = [
  'Jedes Prädikat übersetzt – mit richtigem Tempus und Modus?',
  'Jedes lateinische Wort ist in deiner Übersetzung vertreten?',
  'Bezüge stimmen (KNG, Pronomen)?',
  'Konstruktionen aufgelöst (Partizipien, nd-Formen, indirekte Fragen)?',
  'Ergibt der Satz im Zusammenhang Sinn?',
];

// ───────────────────────────── Texte: eingebaute und importierte
const finde = Pruefung.finde;
function bereite(text) {
  if (text._bereit) return;
  text._bereit = true;
  for (const s of text.saetze) {
    for (const wd of s.w) {
      if (wd.p) continue;
      wd.rolle = wd.r[0];
      wd.einl = Pruefung.istEinleitewort(wd);
    }
    for (const st of s.schritte) {
      st._ziel = (st.ziel || []).map(r => finde(s, r));
      st._auch = (st.auch || []).map(r => finde(s, r));
      st._falsch = new Map(Object.entries(st.falsch || {}).map(([r, t]) => [finde(s, r), t]));
      st._fokus = st.fokus ? finde(s, st.fokus) : -1;
    }
  }
}

// ───────────────────────────── Speicher: Konto (claude.ai) oder Gerät (localStorage)
// Dokumente: stand (Fortschritt), vokabeln, werkstatt (angefangene Seite), texte/<id> (eigene Seiten als JSON-Text).
// Im Konto liegt alles unter data/users/<id>/ – privat, auf jedem Gerät gleich. Auf dem Gerät unter seneca.*.
const use = n => (window.claude && typeof window.claude.use === 'function' ? window.claude.use(n) : Promise.resolve(null));
const klon = x => (x == null ? x : JSON.parse(JSON.stringify(x)));
let db = null, uid = null, sample = null, grenzen = null, geladen = false;

const Lager = {
  art: 'geraet',
  letzt: {}, kette: {},
  ref(name) { return db.doc(`data/users/${uid}/${name}`); },
  texte() { return db.collection(`data/users/${uid}/bibliothek/texte`); },
  async lies(name) {
    if (this.art === 'konto') {
      const snap = await this.ref(name).get();
      const d = snap.exists ? klon(snap.data()) : null;
      this.letzt[name] = d ? JSON.stringify(d) : null;
      return d;
    }
    try { return JSON.parse(localStorage.getItem('seneca.' + name)); } catch (_) { return null; }
  },
  // Schreibt nur bei Änderung, je Dokument einen Vorgang nach dem anderen
  schreib(name, obj) {
    const json = JSON.stringify(obj);
    if (json === this.letzt[name]) return;
    this.letzt[name] = json;
    if (this.art !== 'konto') { try { localStorage.setItem('seneca.' + name, json); } catch (_) { melde('Der Speicher auf diesem Gerät ist voll.'); } return; }
    const daten = JSON.parse(json);
    this.kette[name] = (this.kette[name] || Promise.resolve())
      .then(() => this.ref(name).set(daten))
      .catch(e => this.ref(name).set(daten).catch(e2 => melde(e2?.code === 'quota_exceeded' ? 'Dein Speicher in claude.ai ist voll – entferne einen älteren Text.' : 'Speichern im Konto fehlgeschlagen.')));
  },
  async ladeTexte() {
    if (this.art === 'konto') {
      const q = await this.texte().get();
      return q.docs.map(d => d.data().json).filter(x => typeof x === 'string');
    }
    try { return JSON.parse(localStorage.getItem('seneca.importe')) || []; } catch (_) { return []; }
  },
  async speichereText(id, json, alle) {
    if (this.art === 'konto') return this.texte().doc(id).set({ id, json });
    try { localStorage.setItem('seneca.importe', JSON.stringify(alle)); }
    catch (_) { throw new Error('voll'); }
  },
  loescheText(id, alle) {
    if (this.art === 'konto') return this.texte().doc(id).delete().catch(() => {});
    try { localStorage.setItem('seneca.importe', JSON.stringify(alle)); } catch (_) {}
  },
};

let importRoh = [];               // eigene Seiten als JSON-Zeichenketten (ohne Laufzeitfelder)
const ALLE = [...TEXTE];
ALLE.forEach(bereite);
let TEXT = null, SAETZE = [];

// ───────────────────────────── Zustand
function neuerStand() {
  return { text: null, pos: {}, satz: 0, tab: 'text', modus: {}, fort: {}, ueb: {}, haken: {}, vok: {}, alle: {} };
}
let stand = neuerStand();

function waehleText(id) {
  if (TEXT) stand.pos[TEXT.id] = stand.satz;
  TEXT = ALLE.find(t => t.id === id) || ALLE[0];
  SAETZE = TEXT.saetze;
  stand.text = TEXT.id;
  stand.satz = stand.pos[TEXT.id] ?? 0;
  if (!(stand.satz >= 0 && stand.satz < SAETZE.length)) stand.satz = 0;
}

let speicherTimer = null;
function speichere() { clearTimeout(speicherTimer); speicherTimer = setTimeout(speichereAlles, Lager.art === 'konto' ? 800 : 250); }
function speichereAlles() {
  clearTimeout(speicherTimer);
  if (!geladen) return;
  const { vok, ...rest } = stand;
  Lager.schreib('stand', rest);
  Lager.schreib('vokabeln', { vok });
  if (werkstattTimer) { clearTimeout(werkstattTimer); werkstattTimer = null; Lager.schreib('werkstatt', werkstattStand); }
}
let werkstattTimer = null, werkstattStand = null;
function speichereWerkstatt(st) {
  werkstattStand = st;
  clearTimeout(werkstattTimer);
  werkstattTimer = setTimeout(() => { werkstattTimer = null; Lager.schreib('werkstatt', werkstattStand); }, 600);
}

// Flüchtiger Zustand des gerade bearbeiteten Schritts
let sitzung;
function neueSitzung() {
  sitzung = {
    auswahl: new Set(), ergebnis: null, rueck: '', tipp: false, versuche: 0,
    wahlFalsch: new Set(), nachschlagen: false, zeigeW: false, zeigeG: false,
    satzbildOffen: sitzung ? sitzung.satzbildOffen : null, aufgedeckt: sitzung ? sitzung.aufgedeckt : new Set(),
  };
}
neueSitzung();
let abfrage = null;   // Vokabelabfrage

const satz = () => SAETZE[stand.satz];
const fort = () => (stand.fort[satz().id] ||= { akt: 0, g: {} });
const schritt = () => satz().schritte[fort().akt];
const modus = () => stand.modus[satz().id] || 'gefuehrt';

function sichtbareRollen() {
  const s = satz(), f = fort();
  if (f.fertig || stand.alle[s.id]) return new Set(Object.keys(ROLLEN));
  const r = new Set();
  s.schritte.forEach((st, k) => { if (f.g[k]) (PHASE_ROLLEN[st.ph] || []).forEach(x => r.add(x)); });
  return r;
}
function gegliedert() {
  const s = satz(), f = fort();
  return f.fertig || s.schritte.some((st, k) => st.ph === 'gliedern' && f.g[k]);
}

// ───────────────────────────── Hilfen
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);
const lemmaKey = wd => wd.l.split(/[ ,(]/)[0].toLowerCase();

function wortKlassen(s, i, rollen, imText) {
  const wd = s.w[i], k = ['wort'];
  if (rollen.has(wd.rolle)) k.push('r-' + wd.rolle);
  if (rollen.has('K') && wd.einl) k.push('e');
  if (imText && modus() === 'gefuehrt') {
    const st = schritt(), geloest = fort().g[fort().akt];
    if (st.typ === 'tippen' || st.typ === 'bezug') {
      if (geloest) {
        if (st._ziel.includes(i)) k.push('ok');
      } else {
        if (sitzung.auswahl.has(i)) k.push('sel');
        if (sitzung.ergebnis?.ok.has(i)) k.push('ok');
        if (sitzung.ergebnis?.bad.has(i)) k.push('bad');
      }
      if (st._fokus === i) k.push('fokus');
    }
  }
  return k.join(' ');
}

function woerterHtml(s, von, bis, rollen, imText) {
  let h = '';
  for (let i = von; i < bis; i++) {
    const wd = s.w[i];
    if (wd.p) continue;
    // Satzzeichen hängen am Wort davor, damit kein Zeilenumbruch dazwischen fällt
    let pz = '', j = i;
    while (j + 1 < bis && s.w[j + 1].p) pz += `<span class="pz">${esc(s.w[++j].p)}</span>`;
    h += (h ? ' ' : '') + `<span class="wg"><span class="${wortKlassen(s, i, rollen, imText)}" data-i="${i}">${esc(wd.t)}</span>${pz}</span>`;
    i = j;
  }
  return h;
}

// ───────────────────────────── Darstellung: Übersetzen
function renderText() {
  const s = satz(), f = fort(), n = SAETZE.length, rollen = sichtbareRollen();
  let h = `<section class="navi">
    <button class="pfeil" data-act="zurueck" ${stand.satz === 0 ? 'disabled' : ''} aria-label="Voriger Satz">‹</button>
    <button class="mitte" data-act="uebersicht"><b>Satz ${stand.satz + 1}</b> von ${n} <small>· § ${esc(s.ref)}${f.fertig ? ' · ✓' : ''}</small></button>
    <button class="pfeil" data-act="vor" ${stand.satz === n - 1 ? 'disabled' : ''} aria-label="Nächster Satz">›</button>
  </section>
  <div class="modus">
    <button data-act="modus" data-m="gefuehrt" class="${modus() === 'gefuehrt' ? 'an' : ''}">Geführt</button>
    <button data-act="modus" data-m="selbst" class="${modus() === 'selbst' ? 'an' : ''}">Selbstständig</button>
  </div>
  <p class="thema"><b>Worum geht’s:</b> ${esc(s.thema)}</p>`;
  if (TEXT.auto) h += '<p class="auto">Automatisch erstellt – niemand hat diese Analysen von Hand geprüft. Kommt dir etwas falsch vor, prüf es im Wörterbuch.</p>';

  if (stand.satz > 0) {
    const v = SAETZE[stand.satz - 1].w;
    const rest = v.slice(-7).map(x => x.p ? x.p : ' ' + x.t).join('').trim();
    h += `<div class="kontext">… ${esc(rest)}</div>`;
  }
  h += `<div class="latein" id="latein">${woerterHtml(s, 0, s.w.length, rollen, true)}</div>`;

  if (rollen.size) {
    h += '<div class="legende">' + Object.keys(LEGENDE).filter(r => rollen.has(r))
      .map(r => `<span class="leg-${r}">${LEGENDE[r]}</span>`).join('') +
      (rollen.has('K') ? '<span class="l-e leg-K">Einleitewort</span>' : '') + '</div>';
  }

  // Aufgabe direkt unter den Text: Antippen und Prüfen ohne Scrollen; das Satzbild ist Nachschlagewerk
  h += modus() === 'selbst' ? renderCheckliste() : renderKarte();
  h += renderSatzbild(s, rollen);
  $('haupt').innerHTML = h;
}

function renderSatzbild(s, rollen) {
  const frei = gegliedert() || sitzung.satzbildOffen;
  if (!frei) {
    return `<details class="satzbild"><summary>Satzbild</summary>
      <div class="gesperrt">Das Satzbild zeigt Haupt- und Gliedsätze eingerückt. Es erscheint, sobald du den Satz gegliedert hast.
      <div class="knoepfe" style="margin-top:8px"><button class="btn2" data-act="satzbild-frei">Trotzdem zeigen</button></div></div></details>`;
  }
  const zeilen = [], gesehen = new Set();
  let akt = null;
  s.w.forEach((wd, i) => {
    if (wd.p) return;
    if (!akt || akt.c !== wd.c) { akt = { c: wd.c, von: i, bis: i + 1, neu: !gesehen.has(wd.c) }; gesehen.add(wd.c); zeilen.push(akt); }
    akt.bis = i + 1;
    while (akt.bis < s.w.length && s.w[akt.bis].p) akt.bis++;
  });
  const offen = sitzung.satzbildOffen !== false;
  return `<details class="satzbild" ${offen ? 'open' : ''}><summary>Satzbild</summary><div class="zeilen">` +
    zeilen.map(z => {
      const t = s.teile[z.c];
      return `<div class="zeile" data-lvl="${t.lvl}" style="--lvl:${t.lvl}">
        <div class="ztag">${z.neu ? esc(t.name) : '↳ Fortsetzung ' + esc(t.name)}</div>
        <div class="zwoerter">${woerterHtml(s, z.von, z.bis, rollen, false)}</div>
        ${z.neu && t.info ? `<div class="zinfo">${esc(t.info)}</div>` : ''}</div>`;
    }).join('') + '</div></details>';
}

function renderKarte() {
  const s = satz(), f = fort(), k = f.akt, st = s.schritte[k], status = f.g[k], n = s.schritte.length;
  let h = `<div class="karte" id="karte"><div class="kkopf"><span class="phase ph-${st.ph}">${PHASEN[st.ph]}</span><span class="zaehler">Schritt ${k + 1} von ${n}</span></div>
    <p class="frage">${esc(st.frage)}</p>`;

  if ((st.typ === 'tippen' || st.typ === 'bezug') && !status) {
    h += `<div class="antippen">Wort antippen =
      <button data-act="nachschlagen" data-v="0" class="${sitzung.nachschlagen ? '' : 'an'}">auswählen</button>
      <button data-act="nachschlagen" data-v="1" class="${sitzung.nachschlagen ? 'an' : ''}">nachschlagen</button></div>`;
  }
  if (st.typ === 'wahl') {
    h += '<div class="optionen">' + st.opts.map((o, i) => {
      const falsch = sitzung.wahlFalsch.has(i), richtig = status && i === st.ok;
      const warum = falsch && st.warum?.[i] ? `<span class="warum">${esc(st.warum[i])}</span>` : '';
      return `<button class="option ${falsch ? 'falsch' : ''} ${richtig ? 'richtig' : ''}" data-act="wahl" data-o="${i}" ${status ? 'disabled' : ''}>${falsch ? '✗ ' : richtig ? '✓ ' : ''}${esc(o)}${warum}</button>`;
    }).join('') + '</div>';
  }
  if (st.typ === 'text') return h + renderUebersetzung() + punkteHtml() + '</div>';

  if (sitzung.tipp && st.tipp && !status) h += `<div class="tipp">Tipp: ${esc(st.tipp)}</div>`;
  if (sitzung.rueck && !status) h += `<div class="rueck">${sitzung.rueck}</div>`;
  if (status) {
    const titel = status === 'ok' ? 'Richtig – auf Anhieb.' : status === 'fehler' ? 'Richtig.' : 'Die Lösung:';
    h += `<div class="lehrer"><div class="ltitel">${titel}</div>${esc(st.erk)}</div>`;
  }

  h += '<div class="knoepfe">';
  if (!status) {
    if (st.tipp) h += `<button class="btn2" data-act="tipp" ${sitzung.tipp ? 'disabled' : ''}>Tipp</button>`;
    if (st.typ !== 'wahl') h += '<button class="btn" data-act="pruefen">Prüfen</button>';
    h += '<button class="btn2" data-act="loesung">Lösung zeigen</button>';
  } else {
    h += '<button class="btn rechts" data-act="weiter">Weiter →</button>';
  }
  return h + '</div>' + punkteHtml() + '</div>';
}

function punkteHtml() {
  const s = satz(), f = fort();
  const erster = s.schritte.findIndex((_, k) => !f.g[k]);
  return '<div class="punkte">' + s.schritte.map((st, k) => {
    const g = f.g[k], erlaubt = g || k === erster || f.fertig;
    return `<button class="punkt ${g || ''} ${k === f.akt ? 'akt' : ''}" data-act="gehe" data-k="${k}" ${erlaubt ? '' : 'disabled'} aria-label="Schritt ${k + 1}">${k + 1}</button>`;
  }).join('') + '</div>';
}

function renderUebersetzung() {
  const s = satz(), f = fort();
  let h = `<textarea id="ueb" placeholder="Deine Übersetzung …" autocomplete="off" autocapitalize="sentences">${esc(stand.ueb[s.id] || '')}</textarea>
    <details class="kontrolle"><summary>Selbstkontrolle vor dem Vergleich</summary><ul>${KONTROLLE.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>
    <div class="knoepfe">
      <button class="btn2" data-act="zeige-w">${sitzung.zeigeW ? 'Wörtlich ✓' : 'Wörtliche Fassung'}</button>
      <button class="btn2" data-act="zeige-g">${sitzung.zeigeG ? 'Gutes Deutsch ✓' : 'Gutes Deutsch'}</button>
    </div>`;
  if (sitzung.zeigeW || f.fertig) h += `<div class="loesung"><div class="wlabel">Wörtlich</div>${esc(s.woertlich)}</div>`;
  if (sitzung.zeigeG || f.fertig) h += `<div class="loesung"><div class="wlabel">Gutes Deutsch</div>${esc(s.gut)}</div>`;

  if (!f.fertig) {
    h += '<div class="knoepfe" style="margin-top:10px"><button class="btn voll" data-act="fertig">Satz abschließen ✓</button></div>';
  } else {
    h += `<div class="merke"><div class="ltitel">Das nimmst du mit</div><ul>${s.merke.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
    if (modus() === 'gefuehrt') {
      const aufg = s.schritte.filter(st => st.typ !== 'text').length;
      const anhieb = s.schritte.filter((st, k) => st.typ !== 'text' && f.g[k] === 'ok').length;
      h += `<p class="bilanz">${anhieb} von ${aufg} Schritten auf Anhieb gelöst. Die Farben im Text zeigen jetzt alle Satzglieder.</p>`;
    }
    if (stand.satz < SAETZE.length - 1) h += '<div class="knoepfe"><button class="btn voll" data-act="vor">Nächster Satz →</button></div>';
    else h += '<p class="bilanz">Das war der letzte Satz dieses Abschnitts. Deine Gesamtübersetzung findest du in der Übersicht (Mitte oben).</p>';
  }
  return h;
}

function renderCheckliste() {
  const s = satz(), haken = stand.haken[s.id] || [];
  return `<div class="karte" id="karte"><div class="kkopf"><span class="phase ph-selbst">Selbstständig</span><span class="zaehler">${haken.filter(Boolean).length} / ${CHECKLISTE.length}</span></div>
    <p class="frage">Arbeite die Schritte ab wie bei einem Text ohne App. Wörter antippen = nachschlagen.</p>
    <ol class="haken">${CHECKLISTE.map(([t, d], i) => `<li><label><input type="checkbox" data-act="haken" data-k="${i}" ${haken[i] ? 'checked' : ''}><span><b>${i + 1}. ${t}</b><small>${esc(d)}</small></span></label></li>`).join('')}</ol>
    <div class="knoepfe" style="margin-bottom:12px">
      <button class="btn2" data-act="alle">${stand.alle[s.id] ? 'Farben aus' : 'Satzglieder färben'}</button>
    </div>
    ${renderUebersetzung()}</div>`;
}

// ───────────────────────────── Darstellung: Methode
function renderMethode() {
  const gesammelt = ALLE.flatMap(t => t.saetze.filter(s => stand.fort[s.id]?.fertig)
    .map(s => ({ s, wo: (ALLE.length > 1 ? t.titel + ', ' : '') + 'Satz ' + (t.saetze.indexOf(s) + 1) })));
  $('haupt').innerHTML = `
  <h2>Die Methode</h2>
  <p>Von links nach rechts Wort für Wort zu raten, scheitert an jedem langen Satz. Gute Übersetzer gehen immer in derselben Reihenfolge vor – so lange, bis es automatisch läuft. Genau diese Reihenfolge übt die App mit dir.</p>
  <ol class="schrittliste">
    <li><b>0 · Lesen</b>Den ganzen Satz lesen, am besten laut. Was weißt du schon aus dem Zusammenhang? Satzzeichen beachten.</li>
    <li><b>1 · Gliedern</b>Einleitewörter suchen: Subjunktionen (ut, cum, si, quod, quia, quoniam, ubi, dum, ne …), Relativpronomen (qui, quae, quod …), Fragewörter (quis, quid, quo, qua, quantus …). Jedes eröffnet einen Gliedsatz.<div class="pf">Ergebnis: das Satzbild – Hauptsatz links, Gliedsätze eingerückt.</div></li>
    <li><b>2 · Prädikat</b>Alle finiten Verben (mit Personalendung) suchen und bestimmen: Person, Numerus, Tempus, Modus, Genus verbi.<div class="pf">Prüffrage: Je Teilsatz ein Prädikat? Wenn nicht → Ellipse. Konjunktiv → sofort fragen: warum?</div></li>
    <li><b>3 · Subjekt</b>Ein Nominativ, der im Numerus zum Prädikat passt. Keiner da → es steckt in der Endung (wir, sie …).<div class="pf">Vorsicht: Anrede (Vokativ), Prädikatsnomen, Neutrum Plural auf -a.</div></li>
    <li><b>4 · Ergänzungen</b>Was verlangt das Verb? Akkusativ (wen/was), Dativ (wem), Infinitiv, Richtung. Das Wörterbuch zeigt die Konstruktion.</li>
    <li><b>5 · Bezüge</b>Adjektive, Pronomen und Partizipien suchen ihr Bezugswort: gleicher Kasus, Numerus, Genus (KNG) – nicht unbedingt gleiche Endung.<div class="pf">Getrennt Stehendes (Hyperbaton) zusammenführen. Jedes Pronomen auf sein Bezugswort zurückführen.</div></li>
    <li><b>6 · Konstruktionen</b>Partizipien (PC, Ablativus absolutus), AcI, nd-Formen, indirekte Fragen, Relativsätze, Litotes, Ellipsen – die Signale stehen in der Tabelle unten.</li>
    <li><b>7 · Übersetzen</b>Vom Hauptsatz aus, Gliedsatz für Gliedsatz. Erst wörtlich (alles untergebracht?), dann gutes Deutsch.<div class="pf">Kontrolle: Jedes Wort vertreten? Jede Form richtig? Sinn im Zusammenhang?</div></li>
  </ol>

  <h3>Signale und was sie bedeuten</h3>
  <table class="tabelle"><thead><tr><th>Signal</th><th>Bedeutung → Übersetzung</th></tr></thead><tbody>
    <tr><td>Name zwischen zwei Kommas</td><td>Anrede (Vokativ)</td></tr>
    <tr><td>qu-Wort + Konj. nach Verb des Wissens, Fragens, Sehens</td><td>indirekte Frage → deutsch Indikativ</td></tr>
    <tr><td>adeo / ita / tam / sic / tantus / talis … ut + Konj.</td><td>Konsekutivsatz → „so …, dass“</td></tr>
    <tr><td>ut / ne + Konj. ohne „so“-Wort</td><td>Final- oder Begehrsatz → „damit“, „dass“, „damit nicht“</td></tr>
    <tr><td>ut / ubi + Indikativ</td><td>„wie“ / „sobald, wenn“</td></tr>
    <tr><td>eo … quo + Komparativ</td><td>„um so …, je …“</td></tr>
    <tr><td>nd-Form + esse</td><td>Notwendigkeit → „muss … werden“, „man muss“</td></tr>
    <tr><td>ad + nd-Form (Akk.)</td><td>Zweck → „zum …“, „um zu“</td></tr>
    <tr><td>-urus, -ura, -urum</td><td>Partizip Futur → „im Begriff zu“, „werden“</td></tr>
    <tr><td>-ns, -ntis</td><td>Partizip Präsens → gleichzeitig: „während“, „indem“, „einer, der …“</td></tr>
    <tr><td>Partizip + Nomen im Ablativ, von keinem Verb verlangt</td><td>Ablativus absolutus → „nachdem / während / weil …“</td></tr>
    <tr><td>Akkusativ + Infinitiv nach Verb des Sagens, Denkens, Wahrnehmens</td><td>AcI → „dass“-Satz</td></tr>
    <tr><td>Relativpronomen am Satzanfang</td><td>relativer Satzanschluss → „dieser“</td></tr>
    <tr><td>Konjunktiv im Hauptsatz, ohne Einleitewort</td><td>Aufforderung oder Wunsch → „soll“, „lasst uns“, „möge“</td></tr>
    <tr><td>Wörterbuch: 1. Person auf -or</td><td>Deponens → aktiv übersetzen, auch das Partizip Perfekt</td></tr>
    <tr><td>-e- in der 3./4. Konjugation (1. Sg. -am)</td><td>Futur I → „wird …“</td></tr>
    <tr><td>Superlativ + quisque</td><td>„gerade die …-sten“</td></tr>
    <tr><td>non sine, non nemo, haud …</td><td>Litotes → betont bejahend</td></tr>
    <tr><td>Zeitangabe im Akkusativ ohne Präposition</td><td>Zeitdauer → „… lang“</td></tr>
    <tr><td>esse, fieri, videri</td><td>Kopula → Prädikatsnomen suchen</td></tr>
  </tbody></table>

  <h3>Typische Fallen</h3>
  <ul class="fallen">
    <li><b>-a</b>: Nom. Sg. f. – Abl. Sg. f. – Nom./Akk. Pl. n. (via, ea, diversa). Die Kongruenz entscheidet.</li>
    <li><b>-is</b>: Gen. Sg. der 3. Dekl. – Dat./Abl. Pl. – Nom. Sg. (brevis, naturalis).</li>
    <li><b>-e</b>: Adverb – Abl. Sg. – Neutrum Sg. (beate, facile).</li>
    <li><b>hic, illo, eo, quo</b>: Pronomen oder Adverb? Gibt es ein Bezugswort? Keins → Adverb.</li>
    <li><b>causa</b>: Substantiv („Ursache“) oder nachgestellt „wegen“? Braucht ein Kopulaverb ein Prädikatsnomen?</li>
    <li><b>incola, nauta, agricola, poeta</b>: a-Deklination, aber maskulin.</li>
    <li><b>-etur</b>: in der 2. Konjugation Präsens (videtur), in der 3./4. Futur (conteretur).</li>
    <li><b>Vorsilben</b>: adp → app, inp → imp – im Wörterbuch beide Schreibungen prüfen.</li>
  </ul>

  <h3>So lernst du es</h3>
  <ol>
    <li><b>Geführt:</b> Jeder Satz in Schritten, mit Rückmeldung. Erst selbst versuchen, Tipps sparsam nutzen. Ziel: möglichst viele Schritte auf Anhieb.</li>
    <li><b>Selbstständig:</b> Nur noch die Checkliste. Die App hilft beim Nachschlagen und zeigt am Ende die Lösung.</li>
    <li><b>Ohne App:</b> Buch, Bleistift, Checkliste daneben. Prädikate unterstreichen, Einleitewörter einkreisen, Gliedsätze einklammern.</li>
    <li><b>Vokabeln:</b> Alles, was du nachschlägst, landet unter „Vokabeln“. Genau das ist dein Lernbedarf – täglich fünf Minuten abfragen.</li>
  </ol>

  <h3>Deine Merksätze</h3>
  ${gesammelt.length ? '<ul>' + gesammelt.flatMap(({ s, wo }) => s.merke.map(m => `<li>${esc(m)} <span class="leise">(${esc(wo)})</span></li>`)).join('') + '</ul>'
    : '<p class="leise">Sobald du einen Satz abschließt, sammeln sich hier seine Merksätze.</p>'}

  <p class="hinweis">Analysen und Übersetzungen wurden mit Claude erstellt. Wenn dir eine Analyse falsch vorkommt: Wörterbuch und Grammatik gegenprüfen und Bescheid geben.</p>`;
}

// ───────────────────────────── Darstellung: Vokabeln
function renderVokabeln() {
  const eintraege = Object.entries(stand.vok).sort((a, b) => a[1].zeit - b[1].zeit);
  if (abfrage) return renderAbfrage();
  $('haupt').innerHTML = `<h2>Meine Vokabeln</h2>
    <p class="leise">Jedes Wort, das du im Text nachschlägst, landet hier. Was du dreimal gewusst hast, bekommt einen Haken.</p>
    ${eintraege.length ? `<div class="knoepfe" style="margin:10px 0"><button class="btn voll" data-act="abfrage">Abfragen (${eintraege.length})</button></div>` : ''}
    ${eintraege.length ? eintraege.map(([key, v]) => `<div class="vzeile"><div class="vtext">
        <div class="vlemma">${esc(v.l)}</div><div>${esc(v.b)}</div>
        <div class="vmeta">im Text: ${esc(v.form)} · ${v.werk ? esc(v.werk) + ', ' : ''}Satz ${v.satz}${v.gewusst >= 3 ? ' · <span class="sitzt">sitzt ✓</span>' : v.gewusst ? ` · ${v.gewusst}× gewusst` : ''}</div></div>
        <button class="vweg" data-act="vok-weg" data-key="${esc(key)}" aria-label="Entfernen">✕</button></div>`).join('')
      : '<p>Noch leer. Tippe im Text auf ein Wort, um es nachzuschlagen.</p>'}`;
}

function renderAbfrage() {
  const key = abfrage.reihe[0];
  if (!key) {
    $('haupt').innerHTML = `<div class="karte abfrage"><div class="afrage">Fertig</div>
      <p>${abfrage.gewusst} gewusst, ${abfrage.nochmal} wiederholt.</p>
      <div class="knoepfe"><button class="btn" data-act="abfrage-ende">Zur Liste</button></div></div>`;
    return;
  }
  const v = stand.vok[key];
  $('haupt').innerHTML = `<div class="karte abfrage">
    <div class="leise">Noch ${abfrage.reihe.length}</div>
    <div class="afrage">${esc(v.l.split(',')[0])}</div>
    <div class="aform">im Text: ${esc(v.form)}</div>
    ${abfrage.zeigen ? `<div class="aantwort"><div class="wlemma">${esc(v.l)}</div><div>${esc(v.b)}</div></div>
      <div class="knoepfe"><button class="btn2" data-act="abfrage-nochmal">Nochmal ↺</button><button class="btn" data-act="abfrage-gewusst">Gewusst ✓</button></div>`
      : '<div class="knoepfe"><button class="btn" data-act="abfrage-zeigen">Aufdecken</button></div>'}
    <div class="knoepfe" style="margin-top:16px"><button class="btn2" data-act="abfrage-ende">Beenden</button></div></div>`;
}

function renderNeu() {
  if (sample) return Werkstatt.render($('haupt'));
  // Ohne Claude (GitHub Pages): auf die Fassung in claude.ai verweisen, Einfügen bleibt als Weg
  $('haupt').innerHTML = `<h2>Neue Seite</h2>
    <p>Fotos von Buchseiten analysiert die App nur in claude.ai – dort gehört Claude zur App. <a href="${ARTEFAKT}" target="_blank" rel="noopener">Seneca übersetzen in claude.ai öffnen</a></p>
    <div class="karte nurpages"><h3 style="margin-top:0">Seite einfügen</h3>
      <p class="leise">Hast du anderswo eine fertig analysierte Seite als Text, füge sie hier ein.</p>
      <textarea id="import-feld" placeholder="Hier einfügen …" autocomplete="off" spellcheck="false"></textarea>
      <label class="btn2 datei">Oder Datei wählen (.json)<input type="file" id="import-datei" accept=".json,application/json,text/plain"></label>
      <div class="rueck" id="import-meldung" hidden></div>
      <div class="knoepfe" style="margin-top:12px"><button class="btn" data-act="importieren">Übernehmen</button></div></div>`;
}

function render() {
  if (!geladen) { $('haupt').innerHTML = '<p class="lade">Dein Stand wird geladen …</p>'; return; }
  $('autor').textContent = TEXT.autor || '';
  $('schrift').textContent = TEXT.titel;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('an', b.dataset.tab === stand.tab));
  if (stand.tab === 'methode') renderMethode();
  else if (stand.tab === 'vokabeln') renderVokabeln();
  else if (stand.tab === 'neu') renderNeu();
  else renderText();
}

// ───────────────────────────── Blatt (Wortkarte, Übersicht)
let blattTimer = null;
function oeffneBlatt(html) {
  clearTimeout(blattTimer);
  const b = $('blatt'), sch = $('schleier');
  b.innerHTML = '<div class="griff"></div>' + html;
  b.hidden = false; sch.hidden = false; void b.offsetWidth;
  b.classList.add('an'); sch.classList.add('an');
  b.scrollTop = 0;
}
function schliesseBlatt() {
  const b = $('blatt'), sch = $('schleier');
  b.classList.remove('an'); sch.classList.remove('an');
  clearTimeout(blattTimer);
  blattTimer = setTimeout(() => { b.hidden = true; sch.hidden = true; }, 300);
}

function zeigeWort(i) {
  const s = satz(), wd = s.w[i], key = lemmaKey(wd);
  if (!stand.vok[key]) {
    stand.vok[key] = { l: wd.l, b: wd.b, form: wd.t, werk: TEXT.titel, satz: stand.satz + 1, zeit: Date.now(), gewusst: 0 };
    speichere();
  }
  const offen = fort().fertig || sitzung.aufgedeckt.has(s.id + ':' + i);
  oeffneBlatt(`<div class="wkopf"><span class="wform">${esc(wd.t)}</span>
      <button class="stern ${stand.vok[key] ? 'an' : ''}" data-act="stern" data-i="${i}">${stand.vok[key] ? '★ in Vokabeln' : '☆ merken'}</button></div>
    <div class="wfeld"><div class="wlabel">Wörterbuch</div><div class="wlemma">${esc(wd.l)}</div></div>
    <div class="wfeld"><div class="wlabel">Bedeutung</div><div>${esc(wd.b)}</div></div>
    ${offen ? `<div class="wfeld"><div class="wlabel">Form</div><div>${esc(wd.f)}</div></div>
      <div class="wfeld"><div class="wlabel">Im Satz</div><div><span class="wrolle r-${wd.rolle}">${ROLLEN[wd.rolle]}</span> ${esc(wd.fn)}</div></div>`
      : `<div class="wfeld"><p class="leise">Form und Funktion erst selbst bestimmen – dann aufdecken.</p>
      <button class="btn2 voll" data-act="aufdecken" data-i="${i}">Form &amp; Funktion aufdecken</button></div>`}
    <button class="btn voll" data-act="schliessen" style="margin-top:6px">Schließen</button>`);
}

function fortschritt(t) {
  return t.saetze.filter(s => stand.fort[s.id]?.fertig).length;
}
function textListe() {
  if (ALLE.length < 2) return '';
  return '<h3>Deine Texte</h3><ul class="tliste">' + ALLE.map(t => {
    const hier = t.id === TEXT.id, eigen = !TEXTE.includes(t);
    return `<li class="${hier ? 'hier' : ''}"><button class="twahl" data-act="text" data-id="${esc(t.id)}">
        <span class="ttitel">${esc(t.titel)}</span><span class="tunter">${esc(t.untertitel || '')}${t.auto ? ' · automatisch erstellt' : ''}</span>
        <span class="tstand">${fortschritt(t)} / ${t.saetze.length}</span></button>
      ${eigen ? `<button class="vweg" data-act="text-weg" data-id="${esc(t.id)}" aria-label="Text entfernen">✕</button>` : ''}</li>`;
  }).join('') + '</ul>';
}

function zeigeUebersicht() {
  const gesamt = SAETZE.map(s => (stand.ueb[s.id] || '').trim()).filter(Boolean).join(' ');
  oeffneBlatt(`${textListe()}<h2>${esc(TEXT.titel)}</h2><p class="leise">${esc(TEXT.untertitel || '')}</p>
    <ul class="uliste">${SAETZE.map((s, k) => {
      const f = stand.fort[s.id], anf = s.w.filter(x => !x.p).slice(0, 5).map(x => x.t).join(' ');
      const st = f?.fertig ? '✓' : f && Object.keys(f.g).length ? '…' : '';
      return `<li><button data-act="springe" data-k="${k}"><span class="nr ${k === stand.satz ? 'hier' : ''}">${k + 1}</span><span class="anf">${esc(anf)} …</span><span class="st">${st}</span></button></li>`;
    }).join('')}</ul>
    <h3>Deine Übersetzung</h3>
    <p class="gesamt">${gesamt ? esc(gesamt) : '<span class="leise">Noch leer.</span>'}</p>
    <div class="knoepfe" style="margin-top:14px">
      <button class="btn2" data-act="reset-satz">Satz ${stand.satz + 1} neu beginnen</button>
      <button class="btn rechts" data-act="schliessen">Schließen</button></div>`);
}

// Nimmt eine Seite (Objekt oder JSON-Text) in die Bibliothek auf. Liefert null bei Erfolg, sonst eine Fehlermeldung (HTML).
function uebernimm(quelle) {
  let t = quelle;
  if (typeof quelle === 'string') {
    try { t = JSON.parse(quelle.trim()); } catch (_) { return 'Das ist keine vollständige Seite. Bitte den ganzen Text einfügen.'; }
  }
  const fehler = Pruefung.pruefeText(t);
  if (fehler.length) {
    return 'Nicht übernommen – die Seite hat formale Fehler:<br>' + fehler.slice(0, 6).map(esc).join('<br>') +
      (fehler.length > 6 ? `<br>… und ${fehler.length - 6} weitere.` : '');
  }
  t = klon(t);
  if (!/^[A-Za-z0-9_.~:@+-]+$/.test(t.id) || ALLE.some(x => x.id === t.id)) t.id = 'seite-' + Date.now().toString(36);
  t.saetze.forEach(s => { s.id = `${t.id}/${s.id}`; });   // Fortschritt je Text getrennt halten
  if (t.auto !== false) t.auto = true;
  const json = JSON.stringify(t);
  importRoh.push(json);
  try { Lager.speichereText(t.id, json, importRoh)?.catch?.(() => melde('Speichern im Konto fehlgeschlagen.')); }
  catch (_) { importRoh.pop(); return 'Der Speicher auf diesem Gerät ist voll. Entferne zuerst eine ältere Seite.'; }
  bereite(t); ALLE.push(t);
  waehleText(t.id); neueSitzung();
  stand.tab = 'text'; speichereAlles(); render(); window.scrollTo(0, 0);
  showInfo('Neu in der Bibliothek: ' + TEXT.titel + ' – ' + SAETZE.length + ' Sätze', 4);
  return null;
}

function entferneText(id) {
  const t = ALLE.find(x => x.id === id);
  if (!t || TEXTE.includes(t)) return;
  importRoh = importRoh.filter(roh => { try { return JSON.parse(roh).id !== id; } catch (_) { return false; } });
  Lager.loescheText(id, importRoh);
  ALLE.splice(ALLE.indexOf(t), 1);
  for (const s of t.saetze) for (const feld of ['fort', 'ueb', 'haken', 'alle', 'modus']) delete stand[feld][s.id];
  delete stand.pos[id];
  if (TEXT === t) { TEXT = null; waehleText(TEXTE[0].id); }
  neueSitzung(); speichereAlles();
}

// ───────────────────────────── Aktionen
function grund(st, i) {
  if (st._falsch.has(i)) return st._falsch.get(i);
  const wd = satz().w[i];
  switch (st.ph) {
    case 'verb':
      if (/Inf\./.test(wd.f)) return 'Infinitiv – keine Personalendung, also kein Prädikat.';
      if (/Part\.|PPP|PPA|PFA/.test(wd.f)) return 'Partizip – keine Personalendung, also kein Prädikat.';
      if (/Gerund/.test(wd.f)) return 'nd-Form – keine Personalendung.';
      return `keine finite Verbform (${wd.f}).`;
    case 'gliedern': return 'leitet keinen Gliedsatz ein.';
    case 'subjekt': return /Nom\./.test(wd.f) ? 'Nominativ ja – aber passt es inhaltlich und im Numerus zum Prädikat?' : `kein Nominativ (${wd.f}).`;
    case 'ergaenzung': return 'ist keine Ergänzung dieses Verbs.';
    case 'bezug': return 'passt nicht – prüfe Kasus, Numerus, Genus und den Sinn.';
  }
  return 'passt hier nicht.';
}

function loese(status) {
  fort().g[fort().akt] = status;
  sitzung.ergebnis = null; sitzung.rueck = '';
  speichere(); render();
}

function pruefe() {
  const s = satz(), st = schritt(), sel = sitzung.auswahl;
  if (!sel.size) { sitzung.rueck = 'Tippe zuerst im Text die passenden Wörter an.'; return render(); }
  const ziel = new Set(st._ziel), auch = new Set(st._auch);
  const ok = new Set(), bad = new Set();
  sel.forEach(i => (ziel.has(i) || auch.has(i) ? ok : bad).add(i));
  const fehlt = st._ziel.filter(i => !sel.has(i)).length;
  sitzung.versuche++;
  if (!bad.size && !fehlt) return loese(sitzung.versuche === 1 && !sitzung.tipp ? 'ok' : 'fehler');
  const meld = [...bad].map(i => `<b>${esc(s.w[i].t)}</b>: ${esc(grund(st, i))}`);
  if (fehlt) meld.push(fehlt === 1 ? (bad.size ? 'Außerdem fehlt noch eines.' : 'Gut so weit – eines fehlt noch.') : `${bad.size ? 'Außerdem fehlen' : 'Gut so weit – es fehlen'} noch ${fehlt}.`);
  bad.forEach(i => sel.delete(i));
  sitzung.ergebnis = { ok, bad };
  sitzung.rueck = meld.join('<br>');
  render();
}

function wechsleSatz(k) {
  if (k < 0 || k >= SAETZE.length) return;
  stand.satz = k; stand.pos[TEXT.id] = k; neueSitzung(); sitzung.satzbildOffen = null;
  speichere(); render(); window.scrollTo(0, 0);
}

function zumText() {
  const el = $('latein');
  if (el && el.getBoundingClientRect().top < 60) window.scrollTo({ top: el.offsetTop - 70, behavior: 'smooth' });
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act], [data-i], [data-tab]');
  if (!el || !geladen) return;

  if (el.dataset.tab) {
    stand.tab = el.dataset.tab; abfrage = null; speichere(); render(); window.scrollTo(0, 0); return;
  }
  const act = el.dataset.act;

  // Wort im Text angetippt
  if (!act && el.dataset.i !== undefined) {
    const i = Number(el.dataset.i), st = schritt(), offen = !fort().g[fort().akt];
    const auswahl = el.closest('#latein') && modus() === 'gefuehrt' && offen && !sitzung.nachschlagen &&
      (st.typ === 'tippen' || st.typ === 'bezug');
    if (!auswahl) return zeigeWort(i);
    if (i === st._fokus) return;
    if (st.typ === 'bezug') sitzung.auswahl = sitzung.auswahl.has(i) ? new Set() : new Set([i]);
    else sitzung.auswahl.has(i) ? sitzung.auswahl.delete(i) : sitzung.auswahl.add(i);
    sitzung.ergebnis = null; sitzung.rueck = '';
    return render();
  }

  const s = satz(), f = fort(), st = schritt();
  switch (act) {
    case 'zurueck': return wechsleSatz(stand.satz - 1);
    case 'vor': return wechsleSatz(stand.satz + 1);
    case 'uebersicht': return zeigeUebersicht();
    case 'springe': schliesseBlatt(); return wechsleSatz(Number(el.dataset.k));
    case 'text':
      waehleText(el.dataset.id); neueSitzung(); speichereAlles(); render();
      window.scrollTo(0, 0); return zeigeUebersicht();
    case 'text-weg':
      // Zweistufig: erst nachfragen, dann entfernen (confirm() gibt es in Web-Apps nicht zuverlässig)
      if (el.dataset.sicher !== '1') { el.dataset.sicher = '1'; el.textContent = 'Entfernen?'; el.classList.add('warnen'); return; }
      entferneText(el.dataset.id); render(); return zeigeUebersicht();
    case 'importieren': {
      const fehler = uebernimm($('import-feld').value);
      if (fehler) { const m = $('import-meldung'); m.innerHTML = fehler; m.hidden = false; }
      return;
    }
    case 'schliessen': return schliesseBlatt();
    case 'modus': stand.modus[s.id] = el.dataset.m; neueSitzung(); speichere(); return render();
    case 'nachschlagen': sitzung.nachschlagen = el.dataset.v === '1'; return render();
    case 'tipp': sitzung.tipp = true; return render();
    case 'pruefen': return pruefe();
    case 'loesung':
      if (st.typ === 'wahl') sitzung.wahlFalsch.clear();
      sitzung.auswahl.clear();
      return loese('hilfe');
    case 'wahl': {
      const o = Number(el.dataset.o);
      if (o === st.ok) return loese(sitzung.wahlFalsch.size || sitzung.tipp ? 'fehler' : 'ok');
      sitzung.wahlFalsch.add(o); return render();
    }
    case 'weiter':
      if (f.akt < s.schritte.length - 1) f.akt++;
      neueSitzung(); speichere(); render(); return zumText();
    case 'gehe': f.akt = Number(el.dataset.k); neueSitzung(); speichere(); return render();
    case 'satzbild-frei': sitzung.satzbildOffen = true; return render();
    case 'zeige-w': sitzung.zeigeW = true; speichereAlles(); return render();
    case 'zeige-g': sitzung.zeigeG = true; speichereAlles(); return render();
    case 'fertig':
      f.fertig = true;
      if (modus() === 'gefuehrt') f.g[s.schritte.length - 1] ||= 'ok';
      speichereAlles(); return render();
    case 'alle': stand.alle[s.id] = !stand.alle[s.id]; speichere(); return render();
    case 'aufdecken': sitzung.aufgedeckt.add(s.id + ':' + el.dataset.i); return zeigeWort(Number(el.dataset.i));
    case 'stern': {
      const wd = s.w[Number(el.dataset.i)], key = lemmaKey(wd);
      if (stand.vok[key]) delete stand.vok[key];
      else stand.vok[key] = { l: wd.l, b: wd.b, form: wd.t, werk: TEXT.titel, satz: stand.satz + 1, zeit: Date.now(), gewusst: 0 };
      speichere();
      el.classList.toggle('an', !!stand.vok[key]);
      el.textContent = stand.vok[key] ? '★ in Vokabeln' : '☆ merken';
      return;
    }
    case 'reset-satz':
      delete stand.fort[s.id]; delete stand.haken[s.id]; delete stand.alle[s.id];
      neueSitzung(); speichereAlles(); schliesseBlatt(); return render();
    case 'vok-weg': delete stand.vok[el.dataset.key]; speichere(); return render();
    case 'abfrage': {
      const keys = Object.keys(stand.vok);
      for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
      keys.sort((a, b) => stand.vok[a].gewusst - stand.vok[b].gewusst);   // stabil: Ungeübtes zuerst
      abfrage = { reihe: keys, zeigen: false, gewusst: 0, nochmal: 0 };
      return render();
    }
    case 'abfrage-zeigen': abfrage.zeigen = true; return render();
    case 'abfrage-gewusst': {
      const key = abfrage.reihe.shift();
      if (stand.vok[key]) stand.vok[key].gewusst++;
      abfrage.gewusst++; abfrage.zeigen = false; speichere(); return render();
    }
    case 'abfrage-nochmal': {
      const key = abfrage.reihe.shift();
      abfrage.reihe.splice(Math.min(3, abfrage.reihe.length), 0, key);
      abfrage.nochmal++; abfrage.zeigen = false; return render();
    }
    case 'abfrage-ende': abfrage = null; return render();
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'import-datei' && e.target.files[0]) {
    const leser = new FileReader();
    leser.onload = () => { $('import-feld').value = leser.result; };
    leser.readAsText(e.target.files[0]);
    return;
  }
  if (e.target.dataset.act === 'haken') {
    const id = satz().id, h = stand.haken[id] ||= [];
    h[Number(e.target.dataset.k)] = e.target.checked;
    speichere(); render();
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'ueb') { stand.ueb[satz().id] = e.target.value; speichere(); }
});
document.addEventListener('toggle', e => {
  if (e.target.matches?.('details.satzbild') && gegliedert()) sitzung.satzbildOffen = e.target.open;
}, true);
$('schleier').addEventListener('click', schliesseBlatt);
window.addEventListener('pagehide', speichereAlles);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') speichereAlles(); });

function melde(text) { showInfo(text, 5); }

async function starte() {
  render();                                   // Ladezustand
  db = await use('db');
  if (db) { const user = await use('user'); uid = user ? await user.id() : null; }
  if (db && uid) Lager.art = 'konto';
  const [standRoh, vokRoh, texte, werkstattRoh] = await Promise.all([Lager.lies('stand'), Lager.lies('vokabeln'), Lager.ladeTexte(), Lager.lies('werkstatt')]);
  stand = Object.assign(neuerStand(), standRoh || {});
  if (vokRoh?.vok) stand.vok = vokRoh.vok;    // sonst bleibt vok aus einem alten Stand (Version 1.x) erhalten
  for (const roh of texte) {
    try { const t = JSON.parse(roh); if (!Pruefung.pruefeText(t).length) { importRoh.push(roh); ALLE.push(t); bereite(t); } } catch (_) {}
  }
  if (!stand.text && stand.satz) stand.pos[TEXTE[0].id] = stand.satz;   // Stand aus Version 1.0 übernehmen
  waehleText(stand.text);
  geladen = true;

  sample = await use('sample');
  if (sample) {
    grenzen = await sample.limits().catch(() => null);
    Werkstatt.init({ sample, grenzen, esc, $, melde, laden: () => werkstattRoh, speichern: speichereWerkstatt, uebernehmen: uebernimm });
  }
  render();
}
starte();

// ───────────────────────────── Updates (siehe Skill app-update-iphone)
const versionEl = $('version');
versionEl.textContent = 'v' + APP_VERSION;
const updateEl = $('update');
let ausTimer = null, infoTimer = null;

function einblenden() {
  clearTimeout(ausTimer);
  updateEl.hidden = false; void updateEl.offsetWidth;
  updateEl.classList.add('an');
}
function ausblenden() {
  updateEl.classList.remove('an'); clearTimeout(ausTimer);
  ausTimer = setTimeout(() => { if (!updateEl.classList.contains('an')) updateEl.hidden = true; }, 380);
}
function bannerAnKante(ausloeser) {
  if (!ausloeser) { updateEl.classList.remove('unten'); return; }
  const r = ausloeser.getBoundingClientRect();
  updateEl.classList.toggle('unten', r.top + r.height / 2 > window.innerHeight / 2);
}
function showInfo(text, sekunden = 2, ausloeser = null) {
  updateEl.className = 'update info';
  bannerAnKante(ausloeser);
  $('update-text').textContent = text;
  $('update-go').hidden = true;
  einblenden();
  clearTimeout(infoTimer);
  if (sekunden) infoTimer = setTimeout(() => { if (updateEl.classList.contains('info')) ausblenden(); }, sekunden * 1000);
}
function zeigeBanner(text) {
  updateEl.className = 'update';
  bannerAnKante(null);
  $('update-text').textContent = text;
  $('update-go').hidden = false;
  einblenden();
}
updateEl.addEventListener('click', () => { if (updateEl.classList.contains('info')) ausblenden(); });
$('update-go').addEventListener('click', () => { speichereAlles(); location.reload(); });

let pruefeGerade = false, gemeldet = null;
const imArtefakt = !!(window.claude && typeof window.claude.use === 'function');
async function checkForUpdate(manual = false) {
  if (imArtefakt) { if (manual) showInfo('Version ' + APP_VERSION + ' – Aktualisierungen kommen in claude.ai von selbst', 4, versionEl); return; }
  if (pruefeGerade) return;
  if (!manual && document.visibilityState !== 'visible') return;
  if (!navigator.onLine) { if (manual) showInfo('Offline – Prüfung nicht möglich', 3, versionEl); return; }
  pruefeGerade = true;
  try {
    const res = await fetch('index.html', { cache: 'no-store' });
    if (!res.ok) return;
    const m = (await res.text()).match(/APP_VERSION = '([^']+)'/);
    if (m && m[1] !== APP_VERSION) announceUpdate(m[1], manual);
    else if (manual) showInfo('Version ' + APP_VERSION + ' ist aktuell', 4, versionEl);
  } catch (_) { if (manual) showInfo('Prüfung fehlgeschlagen', 3, versionEl); }
  finally { pruefeGerade = false; }
}
function announceUpdate(v, manual) {
  if (gemeldet === v && !manual) return;
  gemeldet = v;
  speichereAlles();
  zeigeBanner('Neue Version ' + v + ' ist da');
  const tippt = document.activeElement && document.activeElement.id === 'ueb';
  if (manual || !tippt) setTimeout(() => { speichereAlles(); location.reload(); }, manual ? 1500 : 3000);
}
window.addEventListener('pageshow', () => setTimeout(checkForUpdate, 800));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
versionEl.addEventListener('click', () => checkForUpdate(true));

{
  const GESEHEN = 'seneca.gesehen';
  let vorher = null;
  try { vorher = localStorage.getItem(GESEHEN); } catch (_) {}
  if (vorher !== APP_VERSION) {
    try { localStorage.setItem(GESEHEN, APP_VERSION); } catch (_) {}
    if (vorher) setTimeout(() => showInfo('Version ' + APP_VERSION + ' ist geladen', 4), 400);
  }
}

if (!imArtefakt && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
