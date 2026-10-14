'use strict';
/* Neue Seite per Foto: Text erkennen → prüfen → Satz für Satz analysieren → in die Bibliothek übernehmen.
   Braucht Claude (claude.ai-Artefakt). app.js ruft init() mit den Fähigkeiten auf und render() für den Reiter. */
window.Werkstatt = (() => {
  // Fertiger Beispielsatz für die Anweisung an Claude – vor bereite() in app.js festhalten, damit keine Laufzeitfelder hineingeraten
  const BEISPIEL = JSON.stringify(TEXTE[0].saetze[1]);
  const MAX_JSON = 230000;   // ein Dokument im Konto fasst 256 KiB; darüber muss die Seite geteilt werden

  let api = null;            // { sample, grenzen, laden, speichern, uebernehmen, melde, esc, $ }
  let st = leer(), fotos = [], vorschau = [], analyseLaeuft = false;
  const laufend = new Set();  // AbortController der laufenden Aufrufe

  function leer() { return { autor: '', werk: '', stelle: '', unsicher: [], einheiten: [], phase: 1 }; }
  const str = x => (typeof x === 'string' ? x.trim() : '');
  // Texte ohne Kapitel- und Abschnittszahlen (z. B. Lehrbuchtexte): laufende Nummer als Stelle
  const stelle = (e, i) => str(e.ref) || String(i + 1);
  const nurBuchstaben = t => t.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  const sichere = () => api.speichern(st);

  // ───────── Texterkennung
  function promptErkennen(teile, nFotos, rohtext) {
    const bildInfo = rohtext ? 'Der Text steht unten (eingefügt, nicht als Bild).'
      : teile > 1
        ? `Die ${nFotos * teile} Bilder zeigen ${nFotos === 1 ? 'eine Buchseite' : nFotos + ' Buchseiten'}, jede in ${teile} waagrechte Streifen von oben nach unten geschnitten, die sich leicht überlappen. Doppelt sichtbare Zeilen nur einmal übernehmen.`
        : `Die Bilder zeigen ${nFotos === 1 ? 'eine Buchseite' : nFotos + ' Buchseiten'} in Reihenfolge.`;
    return `Du hilfst beim Erstellen von Lernmaterial für eine Latein-Übersetzungs-App. ${bildInfo}

Aufgabe: Gib ausschließlich den lateinischen Text wieder. Übernimm nichts anderes – keine deutsche oder sonstige moderne Übersetzung, keine Einleitung, keine Anmerkungen, keine Vokabelangaben, keine Seitenzahlen, keine Kolumnentitel. Steht auf der Seite kein lateinischer Text, gib leere "einheiten" und einen "hinweis" zurück.

Regeln:
- Schreibweise der Ausgabe genau beibehalten (z. B. adpetamus, inpellit, Satzzeichen, Großschreibung).
- Silbentrennungen am Zeilenende zusammenfügen (quis- | que → quisque).
- Kapitel- und Abschnittszahlen wie „1 (1)“ oder „(2)“ nicht in den Text übernehmen, sondern als Stellenangabe "ref" im Format "1,1", "1,2" den Einheiten zuordnen. Hat der Text keine solchen Zahlen, "ref" leer lassen.
- Zerlege den Text in Lerneinheiten: in der Regel ein Satz bis zum Punkt. Sehr lange Perioden an Strichpunkt oder Doppelpunkt teilen, wenn jeder Teil für sich übersetzbar bleibt (Richtwert höchstens 30 Wörter).
- Bei unsicheren Lesungen das wahrscheinlichste Wort einsetzen und es in "unsicher" nennen.
- "autor" und "werk" nur angeben, wenn sie auf der Seite stehen oder der Text eindeutig erkennbar ist; sonst leer lassen.

Antworte nur mit JSON in dieser Form:
{"autor": "Seneca", "werk": "De vita beata", "stelle": "Kapitel 1, Abschnitt 1–2", "einheiten": [{"ref": "1,1", "text": "Vivere, Gallio frater, omnes beate volunt, …"}], "unsicher": [], "hinweis": ""}${rohtext ? '\n\nText:\n' + rohtext : ''}`;
  }

  // Fotos in waagrechte Streifen schneiden: die Plattform verkleinert jedes Bild auf etwa 1,2 Megapixel,
  // Streifen behalten so mehr Auflösung für die Schrift.
  async function streifen(datei, teile) {
    const url = URL.createObjectURL(datei);
    try {
      const bild = await new Promise((ok, nein) => { const i = new Image(); i.onload = () => ok(i); i.onerror = nein; i.src = url; });
      const b = bild.naturalWidth, h = bild.naturalHeight, ueber = Math.round(h * 0.06);
      const skal = Math.min(1, 2400 / Math.max(b, h / teile));
      const ergebnis = [];
      for (let k = 0; k < teile; k++) {
        const y0 = Math.max(0, Math.round(k * h / teile) - ueber), y1 = Math.min(h, Math.round((k + 1) * h / teile) + ueber);
        const c = document.createElement('canvas');
        c.width = Math.round(b * skal); c.height = Math.round((y1 - y0) * skal);
        c.getContext('2d').drawImage(bild, 0, y0, b, y1 - y0, 0, 0, c.width, c.height);
        ergebnis.push(await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9)));
      }
      return ergebnis;
    } finally { URL.revokeObjectURL(url); }
  }

  const MELDUNG = {
    not_granted: 'Du hast Claude für diese Seite nicht freigegeben. Lade die Seite neu, um wieder gefragt zu werden.',
    sampling_disabled: 'Claude ist für dieses Konto nicht verfügbar.',
    rate_limited: 'Nutzungslimit erreicht. Fertige Sätze sind gespeichert – später hier weitermachen.',
    session_expired: 'Bitte in claude.ai neu anmelden.',
    image_rejected: 'Das Foto wurde nicht angenommen. Bitte ein anderes (JPEG oder PNG) wählen.',
    images_unavailable: 'In dieser Ansicht gehen keine Fotos. Füge den Text stattdessen ein.',
    refused: 'Claude hat diese Anfrage abgelehnt.',
    invalid_json: 'Die Antwort war unvollständig.',
    prompt_too_large: 'Zu viel Text auf einmal. Bitte weniger Einheiten.',
    cancelled: 'Angehalten.',
  };
  const meldung = e => MELDUNG[e?.code] || 'Verbindungsfehler. Bitte noch einmal versuchen.';
  const endgueltig = c => ['not_granted', 'sampling_disabled', 'rate_limited', 'session_expired', 'not_declared', 'capability_disabled', 'capability_removed'].includes(c);

  async function erkennen() {
    const roh = (api.$('ws-rohtext')?.value || '').trim();
    if (!fotos.length && !roh) return;
    const knopf = api.$('ws-erkennen'); if (knopf) knopf.disabled = true;
    status('ws-s1-status', 'Claude liest den Text …');
    const ctl = new AbortController(); laufend.add(ctl);
    try {
      let bilder = [], teile = 1;
      if (fotos.length && !roh) {
        const max = api.grenzen?.images?.maxCount || 1;
        teile = Math.max(1, Math.min(3, Math.floor(max / fotos.length)));
        for (const f of fotos) bilder.push(...await streifen(f, teile));
      }
      const opts = { modelTier: 'complex', signal: ctl.signal, onText: ({ text }) => status('ws-s1-status', `Claude schreibt … ${text.length} Zeichen`) };
      if (bilder.length) opts.images = bilder;
      const a = await api.sample.json(promptErkennen(teile, fotos.length, roh || ''), opts);
      const einheiten = Array.isArray(a?.einheiten) ? a.einheiten.filter(e => e && typeof e.text === 'string' && e.text.trim()) : [];
      if (!einheiten.length) { status('ws-s1-status', a?.hinweis || 'Kein lateinischer Text erkannt. Bitte ein schärferes Foto wählen.'); return; }
      st = { ...leer(), autor: str(a.autor), werk: str(a.werk), stelle: str(a.stelle),
        unsicher: Array.isArray(a.unsicher) ? a.unsicher.map(String).slice(0, 20) : [],
        einheiten: einheiten.map((e, k) => ({ ref: str(e.ref) || String(k + 1), text: e.text.trim(), status: 'offen', satz: null, fehler: [] })), phase: 2 };
      sichere(); zeige();
      status('ws-s1-status', `${st.einheiten.length} Einheiten erkannt.`);
      api.$('ws-s2')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      status('ws-s1-status', meldung(e));
    } finally { laufend.delete(ctl); if (knopf) knopf.disabled = false; }
  }

  // ───────── Analyse je Einheit
  function promptAnalyse(i, vorige) {
    const e = st.einheiten[i];
    const kontext = st.einheiten.map((x, k) => `${k + 1}. [${stelle(x, k)}] ${x.text}`).join('\n');
    let p = `Du bist ein erfahrener Lateinlehrer und erstellst Lernmaterial für eine Übersetzungs-App. Sie bringt Lernenden eine feste Methode bei: Gliedern → Prädikat → Subjekt → Ergänzungen → Bezüge (KNG) → Konstruktionen → Übersetzen. Ziel: Wer die App benutzt, lernt das Vorgehen und kann es später ohne App anwenden.

Werk: ${[st.autor, st.werk].filter(Boolean).join(', ') || 'unbekannt'}${st.stelle ? ' (' + st.stelle + ')' : ''}
Die ganze Seite, damit du den Zusammenhang kennst:
${kontext}

Analysiere NUR Einheit ${i + 1} [${stelle(e, i)}]:
${e.text}

Gib genau ein JSON-Objekt zurück, aufgebaut wie dieses fertige Beispiel aus Seneca, De vita beata:
${BEISPIEL}

Feldregeln:
- "id": "s${i + 1}", "ref": "${stelle(e, i)}".
- "thema": ein Satz Orientierung, ohne die Übersetzung vorwegzunehmen.
- "w": alle Tokens in Textreihenfolge. Jedes Wort genau in der Schreibung der Einheit als {"t","l","b","f","fn","r","c"}, jedes Satzzeichen als {"p": ","}. Mehrteilige Subjunktionen wie "quam diu" oder "etiam si" dürfen ein Token sein; angehängtes -que bleibt am Wort.
- "l": Wörterbuchform ohne Längenzeichen – Verben mit allen Stammformen (Deponentien mit „(Deponens)“), Substantive mit Genitiv und Genus, Adjektive mit allen Endungen.
- "b": deutsche Bedeutungen, die hier passende zuerst.
- "f": Bestimmung mit den Abkürzungen des Beispiels, z. B. "3. Sg. Ind. Präs. Akt.", "Akk. Sg. f.", "Inf. Präs. Akt.", "Part. Perf. (Deponens), Nom. Pl. m.", "PPP Nom. Pl. m.", "Part. Präs. Akt. (PPA), Gen. Pl.", "Part. Fut. Akt. (PFA), Nom. Pl. m.", "Gerundium, Akk.", "Gerundivum, Nom. Sg. n.", "Adverb", "Präposition + Akk.", "Subjunktion", "Konjunktion", "Negation".
- "fn": Funktion im Satz, kurz, mit Bezugswort. Jedes Wort, das einen Gliedsatz einleitet, enthält in "fn" die Wendung „leitet … ein“.
- "r": P Prädikat (auch Prädikatsnomen und Teile zusammengesetzter Prädikate), S Subjekt, O Objekt/Ergänzung, A Adverbiale (auch Präpositionen), T Attribut, K Konnektor/Subjunktion, V Anrede. Relativ- und Fragewörter, die einen Gliedsatz einleiten, bekommen ihre Satzgliedrolle plus "*" ("S*", "O*", "A*").
- "c": Nummer des Teilsatzes. "teile": für jede verwendete Nummer {"lvl": Einrücktiefe (0 = Hauptsatz), "name": wie im Beispiel ("HS", "GS 1° · Relativsatz", "PC · Partizip Perfekt"), "info": kurze Erklärung}.
- "schritte": 5 bis 9 Lernschritte in der Reihenfolge der Methode. Zuerst "gliedern" (Typ "tippen", "ziel" = alle Einleitewörter; gibt es keinen Gliedsatz, Typ "wahl" zur Satzstruktur). Dann "verb" (Typ "tippen", "ziel" = alle finiten Verbformen, "auch" = übrige Teile zusammengesetzter Prädikate). Dann je nach Satz "subjekt", "ergaenzung", "bezug" (Typ "bezug" mit "fokus"), "konstr", "falle" (Typ "wahl"). Zuletzt immer {"ph": "uebersetzen", "typ": "text", "frage": …}.
  Verweise in "ziel", "auch", "fokus" und die Schlüssel von "falsch" nennen ein Wort genau wie in "t"; beim zweiten Vorkommen derselben Form "wort#2".
  "wahl": 2–3 Optionen, "ok" = Index der richtigen, "warum" so lang wie "opts", an der Stelle "ok" null, sonst kurz, warum die Option falsch ist.
  "falsch": typische Fehlgriffe mit Begründung. "tipp": Hilfe, die die Lösung nicht verrät. "erk": Erklärung nach dem Lösen, mit übertragbarer Regel.
  Setze die Schwerpunkte dort, wo Lernende typischerweise scheitern: mehrdeutige Endungen, Konjunktive, Konstruktionen, Pronomenbezüge, Ellipsen, getrennt Stehendes.
- "merke": 1–3 übertragbare Regeln. "woertlich" und "gut": deine eigenen Übersetzungen ins Deutsche, nah am Satzbau bzw. in gutem Deutsch.
Prüfe jede Form im Zusammenhang der ganzen Seite. Antworte nur mit dem JSON-Objekt.`;
    if (vorige) {
      p += `\n\nDeine vorige Antwort auf genau diese Aufgabe hatte formale Fehler:\n- ${vorige.fehler.join('\n- ')}\n\nVorige Antwort:\n${JSON.stringify(vorige.satz)}\n\nGib das vollständige, korrigierte JSON-Objekt zurück.`;
    }
    return p;
  }

  function pruefeEinheit(i, s) {
    const e = st.einheiten[i];
    if (!s || typeof s !== 'object' || Array.isArray(s)) return ['Antwort ist kein JSON-Objekt'];
    s.id = 's' + (i + 1); s.ref = stelle(e, i);   // setzt die Seite selbst, nie Claudes Fehler
    const fehler = Pruefung.pruefeSatz(s, 'Einheit ' + (i + 1));
    if (Array.isArray(s.w)) {
      const woerter = nurBuchstaben(s.w.filter(x => x && typeof x.t === 'string').map(x => x.t).join(''));
      if (woerter !== nurBuchstaben(e.text)) fehler.push(`Einheit ${i + 1}: Die Wörter in "w" weichen vom Text der Einheit ab – jedes Wort genau so übernehmen, wie es im Text steht.`);
    }
    return fehler;
  }

  async function analysiereEinheit(i, frisch) {
    const e = st.einheiten[i];
    e.status = 'laeuft'; e.fehler = []; e.info = 'Claude denkt nach …'; zeigeListe();
    const ctl = new AbortController(); laufend.add(ctl);
    const opts = (rund) => {
      const o = { modelTier: 'complex', signal: ctl.signal,
        onText: ({ text }) => { e.info = `${rund ? 'korrigiert' : 'schreibt'} … ${text.length.toLocaleString('de-DE')} Zeichen`; zeigeListe(); } };
      if (frisch || rund > 0) o.cache = false;   // „Nochmal“ und Nachbesserung sollen wirklich neu fragen
      return o;
    };
    try {
      let satz = await api.sample.json(promptAnalyse(i), opts(0));
      let fehler = pruefeEinheit(i, satz);
      if (fehler.length) {                       // eine gezielte Nachbesserung, nicht mehr
        e.info = 'Formfehler gefunden, Claude bessert nach …'; zeigeListe();
        satz = await api.sample.json(promptAnalyse(i, { fehler: fehler.slice(0, 15), satz }), opts(1));
        fehler = pruefeEinheit(i, satz);
      }
      if (fehler.length) { e.status = 'fehler'; e.fehler = fehler.slice(0, 4); e.satz = null; e.roh = satz; }
      else { e.status = 'fertig'; e.satz = satz; delete e.roh; }
    } catch (err) {
      e.status = err?.code === 'cancelled' ? 'offen' : 'fehler';
      e.fehler = err?.code === 'cancelled' ? [] : [meldung(err)];
      if (endgueltig(err?.code)) throw err;
    } finally {
      laufend.delete(ctl); e.info = ''; sichere(); zeigeListe();
    }
  }

  async function analysiereAlle(nur) {
    if (analyseLaeuft) return;
    analyseLaeuft = true; st.phase = Math.max(st.phase, 3); sichere(); zeige();
    const offen = st.einheiten.map((e, i) => i).filter(i => (nur ? i === nur.i : st.einheiten[i].status !== 'fertig'));
    let abbruch = null;
    const arbeiter = async () => {             // zwei Sätze gleichzeitig; die Plattform reiht weitere ein
      while (offen.length && !abbruch) {
        const i = offen.shift();
        try { await analysiereEinheit(i, !!nur); } catch (err) { abbruch = err; }
      }
    };
    await Promise.all([arbeiter(), arbeiter()]);
    analyseLaeuft = false;
    if (st.einheiten.length && st.einheiten.every(e => e.status === 'fertig')) st.phase = 4;
    sichere(); zeige();
    if (abbruch) status('ws-s4-status', meldung(abbruch));
    else if (st.phase === 4) api.$('ws-s4')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ───────── Ergebnis
  function textObjekt() {
    const titel = st.werk || 'Neuer Text';
    const slug = titel.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'text';
    return {
      id: `${slug}-${Date.now().toString(36)}`, autor: st.autor, titel, untertitel: st.stelle,
      auto: true, erstellt: new Date().toISOString().slice(0, 10),
      saetze: st.einheiten.map(e => e.satz),
    };
  }

  // ───────── Darstellung
  const STATUS = { offen: 'wartet', laeuft: 'läuft', fertig: 'fertig ✓', fehler: 'Fehler' };
  function status(id, text) { const el = api.$(id); if (el) el.textContent = text; }
  function hoehe(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 4 + 'px'; }

  function html() {
    const esc = api.esc, foto = !!api.grenzen?.images;
    return `<div class="ws">
    <h2>Neue Seite</h2>
    <p class="leise">Aus dem Foto einer Buchseite wird eine neue Seite in deiner Bibliothek: Claude liest den lateinischen Text, du prüfst ihn, Claude analysiert Satz für Satz. Das kostet Claude-Nutzung aus deinem Konto, etwa eine Chat-Nachricht je Satz.</p>

    <section class="schritt" id="ws-s1">
      <h3><span class="nr">1</span>Foto der Buchseite</h3>
      <p class="leise">Gerade von oben, gut ausgeleuchtet, die ganze Seite im Bild. Bis zu zwei Seiten auf einmal. Übernommen wird nur der lateinische Text.</p>
      ${foto ? `<label class="btn2 datei">Foto wählen<input type="file" id="ws-foto" accept="${esc((api.grenzen.images.mediaTypes || ['image/jpeg', 'image/png']).join(','))}" multiple></label>
      <div class="vorschau" id="ws-vorschau"></div>` : ''}
      <details ${foto ? '' : 'open'}><summary class="leise">${foto ? 'Ohne Foto: lateinischen Text einfügen' : 'Lateinischen Text einfügen'}</summary>
        <textarea id="ws-rohtext" class="latein" rows="5" placeholder="Vivere, Gallio frater, omnes beate volunt …"></textarea></details>
      <div class="knoepfe"><button class="btn" data-w="erkennen" id="ws-erkennen" disabled>Text erkennen</button><span class="leise" id="ws-s1-status"></span></div>
    </section>

    <section class="schritt zu" id="ws-s2">
      <h3><span class="nr">2</span>Text prüfen</h3>
      <p class="leise">Vergleiche jede Einheit Wort für Wort mit dem Buch und korrigiere Lesefehler. Trag ein, wie der Text heißen soll.</p>
      <div class="felder nur-offen">
        <label>Autor<input type="text" id="ws-autor" data-meta="autor"></label>
        <label>Werk / Lektion<input type="text" id="ws-werk" data-meta="werk"></label>
        <label>Stelle<input type="text" id="ws-stelle" data-meta="stelle"></label>
      </div>
      <p class="unsicher nur-offen" id="ws-unsicher" hidden></p>
      <ol class="einheiten nur-offen" id="ws-einheiten"></ol>
      <div class="knoepfe nur-offen"><button class="btn" data-w="analysieren" id="ws-analysieren">Analysieren</button></div>
    </section>

    <section class="schritt zu" id="ws-s3">
      <h3><span class="nr">3</span>Analyse</h3>
      <p class="leise">Pro Satz ein bis zwei Minuten. Fertige Sätze bleiben gespeichert, auch wenn du die App schließt.</p>
      <ul class="liste nur-offen" id="ws-fortschritt"></ul>
      <div class="knoepfe nur-offen">
        <button class="btn2" data-w="stopp" id="ws-stopp" hidden>Anhalten</button>
        <button class="btn" data-w="analysieren" id="ws-weiter" hidden>Fehlende analysieren</button>
      </div>
    </section>

    <section class="schritt zu" id="ws-s4">
      <h3><span class="nr">4</span>In die Bibliothek</h3>
      <div class="ergebnis nur-offen" id="ws-ergebnis" hidden></div>
      <div class="knoepfe nur-offen"><button class="btn" data-w="uebernehmen" id="ws-uebernehmen">Übernehmen und übersetzen</button><span class="leise" id="ws-s4-status"></span></div>
    </section>

    <div class="knoepfe"><button class="btn2" data-w="neu" id="ws-neu">Neue Seite beginnen</button><span class="leise" id="ws-neu-status"></span></div>
    </div>`;
  }

  function zeigeEinheiten() {
    const $ = api.$, esc = api.esc;
    if (!$('ws-einheiten')) return;
    for (const k of ['autor', 'werk', 'stelle']) $('ws-' + k).value = st[k];
    $('ws-unsicher').hidden = !st.unsicher.length;
    $('ws-unsicher').textContent = st.unsicher.length ? 'Unsicher gelesen, bitte besonders prüfen: ' + st.unsicher.join(', ') : '';
    $('ws-einheiten').innerHTML = st.einheiten.map((e, i) => `<li class="einheit">
        <div class="ekopf">Einheit ${i + 1} · Stelle <input type="text" data-feld="ref" data-i="${i}" value="${esc(e.ref)}" aria-label="Stelle Einheit ${i + 1}">
          <button class="weg" data-w="weg" data-i="${i}" type="button">Entfernen</button></div>
        <textarea class="latein" rows="3" data-feld="text" data-i="${i}" aria-label="Text Einheit ${i + 1}">${esc(e.text)}</textarea></li>`).join('');
    $('ws-einheiten').querySelectorAll('textarea').forEach(hoehe);
    const fertig = st.einheiten.filter(e => e.status === 'fertig').length;
    $('ws-analysieren').textContent = fertig ? `Weiter analysieren (${st.einheiten.length - fertig} offen)` : `Analysieren (${st.einheiten.length} Sätze)`;
  }

  function zeigeListe() {
    const $ = api.$, esc = api.esc;
    if (!$('ws-fortschritt')) return;
    $('ws-fortschritt').innerHTML = st.einheiten.map((e, i) => `<li>
        <span class="snr">${i + 1}</span><span class="sanf">${esc(e.text)}</span>
        <span class="sstat s-${e.status}">${esc(e.info || STATUS[e.status])}${e.status === 'fehler' && !analyseLaeuft ? ` <button class="btn2" data-w="nochmal" data-i="${i}" type="button">Nochmal</button>` : ''}</span>
        ${e.fehler?.length ? `<span class="smeld">${e.fehler.map(esc).join('<br>')}</span>` : ''}</li>`).join('');
    const offen = st.einheiten.some(e => e.status !== 'fertig');
    $('ws-stopp').hidden = !analyseLaeuft;
    $('ws-weiter').hidden = analyseLaeuft || !offen || st.phase < 3;
  }

  function zeigeErgebnis() {
    const $ = api.$, esc = api.esc;
    if (st.phase < 4 || !$('ws-ergebnis')) return;
    const t = textObjekt(), fehler = Pruefung.pruefeText(t), groesse = JSON.stringify(t).length;
    if (groesse > MAX_JSON) fehler.unshift('Die Seite ist zu umfangreich für ein Dokument. Entferne einige Einheiten und übernimm sie in einer zweiten Seite.');
    $('ws-ergebnis').hidden = false;
    $('ws-ergebnis').className = 'ergebnis ' + (fehler.length ? 'schlecht' : 'gut');
    $('ws-ergebnis').innerHTML = fehler.length
      ? 'Noch nicht übernehmbar:<br>' + fehler.slice(0, 5).map(esc).join('<br>')
      : `<b>${esc(t.titel)}</b>${t.untertitel ? ', ' + esc(t.untertitel) : ''} – ${t.saetze.length} Sätze, ${(groesse / 1024).toFixed(0)} KB.`;
    $('ws-uebernehmen').disabled = !!fehler.length;
  }

  function zeige() {
    const $ = api.$;
    if (!$('ws-s1')) return;
    for (const n of [2, 3, 4]) $('ws-s' + n).classList.toggle('zu', st.phase < n);
    if (st.phase >= 2) zeigeEinheiten();
    if (st.phase >= 3) zeigeListe();
    zeigeErgebnis();
    $('ws-erkennen').disabled = !fotos.length && !($('ws-rohtext')?.value || '').trim();
  }

  function render(el) {
    el.innerHTML = html();
    const v = api.$('ws-vorschau');
    if (v) for (const url of vorschau) { const img = document.createElement('img'); img.alt = 'Vorschau'; img.src = url; v.append(img); }
    zeige();
  }

  // ───────── Ereignisse (nur innerhalb des Reiters wirksam)
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-w]');
    if (!el || !api) return;
    const i = Number(el.dataset.i);
    switch (el.dataset.w) {
      case 'erkennen': return erkennen();
      case 'analysieren': return analysiereAlle();
      case 'nochmal': return analysiereAlle({ i });
      case 'stopp': for (const c of laufend) c.abort(); return;
      case 'weg': st.einheiten.splice(i, 1); sichere(); return zeige();
      case 'uebernehmen': {
        const fehler = api.uebernehmen(textObjekt());
        if (fehler) return status('ws-s4-status', fehler);
        st = leer(); fotos = []; vorschau.forEach(u => URL.revokeObjectURL(u)); vorschau = [];
        return sichere();
      }
      case 'neu':
        if (el.dataset.sicher !== '1') {
          el.dataset.sicher = '1'; el.textContent = 'Wirklich alles verwerfen?';
          return status('ws-neu-status', 'Erneut tippen zum Bestätigen.');
        }
        st = leer(); fotos = []; vorschau.forEach(u => URL.revokeObjectURL(u)); vorschau = [];
        sichere(); render(el.closest('.ws').parentElement); return window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  document.addEventListener('change', e => {
    if (e.target.id !== 'ws-foto' || !api) return;
    fotos = [...e.target.files].slice(0, 2);
    vorschau.forEach(u => URL.revokeObjectURL(u));
    vorschau = fotos.map(f => URL.createObjectURL(f));
    const v = api.$('ws-vorschau'); v.innerHTML = '';
    for (const url of vorschau) { const img = document.createElement('img'); img.alt = 'Vorschau'; img.src = url; v.append(img); }
    zeige();
  });
  document.addEventListener('input', e => {
    if (!api || !e.target.closest('.ws')) return;
    if (e.target.id === 'ws-rohtext') return zeige();
    if (e.target.dataset.meta) { st[e.target.dataset.meta] = e.target.value; return sichere(); }
    const i = Number(e.target.dataset.i), feld = e.target.dataset.feld;
    if (!feld || !st.einheiten[i]) return;
    st.einheiten[i][feld] = e.target.value;
    st.einheiten[i].status = 'offen'; st.einheiten[i].satz = null; delete st.einheiten[i].roh;   // geänderter Text → neu analysieren
    if (feld === 'text') hoehe(e.target);
    if (st.phase > 2) st.phase = 3;
    sichere();
  });

  function init(a) {
    api = a;
    st = Object.assign(leer(), api.laden() || {});
    // Ein unterbrochener Lauf gilt als wartend; aufgehobene Antworten nach einer Korrektur der Prüfung neu prüfen
    st.einheiten.forEach((e, i) => {
      if (e.status === 'laeuft') e.status = 'offen';
      if (e.status === 'fehler' && e.roh && !pruefeEinheit(i, e.roh).length) { e.status = 'fertig'; e.satz = e.roh; e.fehler = []; delete e.roh; }
    });
    if (st.einheiten.length && st.einheiten.every(e => e.status === 'fertig')) st.phase = 4;
  }

  return { init, render, laeuft: () => analyseLaeuft };
})();
