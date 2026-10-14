'use strict';
// Formale Prüfung von Satzdaten. Eine Quelle für App (Import), Werkstatt und Tests.
// Findet Strukturfehler (fehlende Felder, Verweise ins Leere, falsche Typen) –
// keine inhaltlichen Fehler in der Analyse.
(function (wurzel) {
  const PHASEN = ['gliedern', 'verb', 'subjekt', 'ergaenzung', 'bezug', 'konstr', 'falle', 'uebersetzen'];
  const TYPEN = ['tippen', 'bezug', 'wahl', 'text'];
  const ROLLE = /^[PSOATKV]\*?$/;
  const WORTFELDER = ['t', 'l', 'b', 'f', 'fn', 'r', 'c'];
  const istText = x => typeof x === 'string' && x.trim() !== '';

  // 'wort' = erstes Vorkommen, 'wort#2' = zweites
  function finde(s, ref) {
    if (typeof ref !== 'string') return -1;
    const [form, nr] = ref.split('#');
    let n = Number(nr || 1);
    for (let i = 0; i < s.w.length; i++) if (s.w[i].t === form && --n === 0) return i;
    return -1;
  }

  const istEinleitewort = wd => typeof wd.r === 'string' && (wd.r.endsWith('*') || /leitet .* ein/.test(wd.fn || ''));

  function pruefeSatz(s, ort = s && s.id || 'Satz') {
    const fehler = [];
    const f = t => fehler.push(`${ort}: ${t}`);
    if (!s || typeof s !== 'object') { f('kein Objekt'); return fehler; }
    for (const feld of ['id', 'ref', 'thema', 'woertlich', 'gut']) if (!istText(s[feld])) f(`${feld} fehlt`);
    if (!Array.isArray(s.merke) || !s.merke.length || !s.merke.every(istText)) f('merke fehlt');
    if (!Array.isArray(s.w) || !s.w.length) { f('Wortliste w fehlt'); return fehler; }
    if (!s.teile || typeof s.teile !== 'object') { f('teile fehlt'); return fehler; }

    s.w.forEach((wd, i) => {
      if (!wd || typeof wd !== 'object') return f(`Token ${i + 1} ist kein Objekt`);
      if ('p' in wd) { if (!istText(wd.p)) f(`Satzzeichen ${i + 1} leer`); return; }
      for (const feld of WORTFELDER) {
        if (feld === 'c' ? !(Number.isInteger(wd.c) || /^\d+$/.test(wd.c)) : !istText(wd[feld])) f(`${wd.t || 'Wort ' + (i + 1)}: Feld ${feld} fehlt`);
      }
      if (istText(wd.r) && !ROLLE.test(wd.r)) f(`${wd.t}: Rolle ${wd.r} unbekannt`);
      if (wd.c !== undefined && !s.teile[wd.c]) f(`${wd.t}: Teilsatz ${wd.c} nicht in teile`);
    });
    const benutzt = new Set(s.w.filter(x => x && !('p' in x)).map(x => String(x.c)));
    for (const [id, t] of Object.entries(s.teile)) {
      if (!benutzt.has(id)) f(`Teilsatz ${id} ohne Wörter`);
      if (!t || !Number.isInteger(t.lvl) || t.lvl < 0 || !istText(t.name)) f(`Teilsatz ${id}: lvl oder name fehlt`);
    }

    if (!Array.isArray(s.schritte) || !s.schritte.length) { f('schritte fehlen'); return fehler; }
    s.schritte.forEach((st, k) => {
      const o = `Schritt ${k + 1}`;
      if (!st || typeof st !== 'object') return f(`${o} ist kein Objekt`);
      if (!PHASEN.includes(st.ph)) f(`${o}: Phase ${st.ph} unbekannt`);
      if (!TYPEN.includes(st.typ)) f(`${o}: Typ ${st.typ} unbekannt`);
      if (!istText(st.frage)) f(`${o}: frage fehlt`);
      for (const liste of ['ziel', 'auch']) {
        if (st[liste] !== undefined && !(Array.isArray(st[liste]) && st[liste].every(istText))) f(`${o}: ${liste} ist keine Liste von Wörtern`);
      }
      if (st.falsch !== undefined && (typeof st.falsch !== 'object' || Array.isArray(st.falsch) || !Object.values(st.falsch).every(istText))) f(`${o}: falsch ungültig`);
      const refs = [...(st.ziel || []), ...(st.auch || []), ...Object.keys(st.falsch || {})];
      if (st.fokus !== undefined) refs.push(st.fokus);
      for (const r of refs) if (finde(s, r) < 0) f(`${o}: Verweis „${r}“ nicht im Satz`);
      if (st.typ === 'tippen' || st.typ === 'bezug') {
        if (!st.ziel || !st.ziel.length) f(`${o}: ziel fehlt`);
        if (!istText(st.erk)) f(`${o}: erk fehlt`);
        for (const r of st.ziel || []) {
          if ((st.auch || []).includes(r)) f(`${o}: ${r} steht in ziel und auch`);
          if (st.falsch && r in st.falsch) f(`${o}: ${r} steht in ziel und falsch`);
        }
      }
      if (st.typ === 'bezug' && !istText(st.fokus)) f(`${o}: fokus fehlt`);
      if (st.ph === 'gliedern' && st.typ === 'tippen') {
        for (const r of st.ziel || []) {
          const i = finde(s, r);
          if (i >= 0 && !istEinleitewort(s.w[i])) f(`${o}: ${r} ist Ziel beim Gliedern, aber nicht als Einleitewort markiert (r mit * oder fn „leitet … ein“)`);
        }
      }
      if (st.typ === 'wahl') {
        if (!Array.isArray(st.opts) || st.opts.length < 2 || !st.opts.every(istText)) f(`${o}: opts fehlen`);
        else {
          if (!(Number.isInteger(st.ok) && st.ok >= 0 && st.ok < st.opts.length)) f(`${o}: ok außerhalb der Optionen`);
          if (st.warum !== undefined) {
            if (!Array.isArray(st.warum) || st.warum.length !== st.opts.length) f(`${o}: warum muss so lang sein wie opts`);
            else if (st.warum[st.ok] !== null) f(`${o}: warum an der richtigen Stelle muss null sein`);
          }
        }
        if (!istText(st.erk)) f(`${o}: erk fehlt`);
      }
    });
    if (s.schritte[s.schritte.length - 1]?.typ !== 'text') f('letzter Schritt ist nicht die Übersetzung (typ text)');
    return fehler;
  }

  function pruefeText(text) {
    const fehler = [];
    if (!text || typeof text !== 'object') return ['Kein Text-Objekt.'];
    if (!istText(text.id)) fehler.push('id fehlt');
    if (!istText(text.titel)) fehler.push('titel fehlt');
    if (!Array.isArray(text.saetze) || !text.saetze.length) return [...fehler, 'saetze fehlen'];
    const ids = new Set();
    text.saetze.forEach((s, i) => {
      fehler.push(...pruefeSatz(s, `Satz ${i + 1}`));
      if (s && ids.has(s.id)) fehler.push(`Satz ${i + 1}: id ${s.id} doppelt`);
      if (s) ids.add(s.id);
    });
    return fehler;
  }

  wurzel.Pruefung = { finde, istEinleitewort, pruefeSatz, pruefeText };
})(typeof window !== 'undefined' ? window : globalThis);
