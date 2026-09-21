/* Módulo compartido (navegador y Node): lectura del CSV de ManaBox y
   enriquecimiento con Scryfall (datos en inglés + texto impreso en español). */
const MTG = (() => {
  const API = 'https://api.scryfall.com';
  const UA = 'MTGComandante/1.0';
  const PAUSA = 110; // ms entre peticiones (Scryfall pide ≤10/s)

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function pedir(url, opts = {}) {
    await sleep(PAUSA);
    const headers = { Accept: 'application/json', 'User-Agent': UA, ...(opts.headers || {}) };
    for (let intento = 0; intento < 4; intento++) {
      try {
        const r = await fetch(url, { ...opts, headers });
        if (r.status === 404) return null;
        if (r.status === 429 || r.status >= 500) { await sleep(1500 * (intento + 1)); continue; }
        if (!r.ok) throw new Error('Scryfall ' + r.status);
        return await r.json();
      } catch (e) {
        if (intento === 3) throw e;
        await sleep(1000 * (intento + 1));
      }
    }
    return null;
  }

  /* ---------- CSV ---------- */
  function parseCSV(texto) {
    const filas = [];
    let fila = [], campo = '', enComillas = false;
    const t = texto.replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (enComillas) {
        if (c === '"') {
          if (t[i + 1] === '"') { campo += '"'; i++; } else enComillas = false;
        } else campo += c;
      } else if (c === '"') enComillas = true;
      else if (c === ',') { fila.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i++;
        fila.push(campo); campo = '';
        if (fila.some((x) => x !== '')) filas.push(fila);
        fila = [];
      } else campo += c;
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    if (!filas.length) return [];
    const cab = filas[0].map((h) => h.trim());
    return filas.slice(1).map((f) => Object.fromEntries(cab.map((h, i) => [h, (f[i] || '').trim()])));
  }

  /* Agrupa las filas de ManaBox por impresión (Scryfall ID) */
  function agrupar(filas) {
    const mapa = new Map();
    for (const f of filas) {
      const id = f['Scryfall ID'];
      if (!id) continue;
      const qty = parseInt(f['Quantity'] || '1', 10) || 1;
      const foil = (f['Foil'] || 'normal').toLowerCase() !== 'normal';
      const binder = f['Binder Name'] || 'Sin carpeta';
      let e = mapa.get(id);
      if (!e) {
        e = { id, name: f['Name'], set: (f['Set code'] || '').toLowerCase(), setName: f['Set name'] || '',
              cn: f['Collector number'] || '', qty: 0, foil: 0, binders: {} };
        mapa.set(id, e);
      }
      e.qty += qty;
      if (foil) e.foil += qty;
      e.binders[binder] = (e.binders[binder] || 0) + qty;
    }
    return [...mapa.values()];
  }

  /* ---------- Recorte de datos de Scryfall ---------- */
  function cara(f) {
    return {
      name: f.name, mana: f.mana_cost || '', type: f.type_line || '', text: f.oracle_text || '',
      pt: f.power != null ? `${f.power}/${f.toughness}` : (f.loyalty != null ? 'L' + f.loyalty : (f.defense != null ? 'D' + f.defense : '')),
      colors: f.colors || [],
    };
  }
  function recortar(c) {
    const faces = (c.card_faces || []).map(cara);
    const front = faces[0] || cara(c);
    const img = c.image_uris ? c.image_uris.normal : (c.card_faces && c.card_faces[0].image_uris ? c.card_faces[0].image_uris.normal : '');
    const imgB = (c.card_faces && c.card_faces[1] && c.card_faces[1].image_uris) ? c.card_faces[1].image_uris.normal : '';
    return {
      id: c.id, oid: c.oracle_id || (c.card_faces && c.card_faces[0].oracle_id) || '', name: c.name,
      mana: c.mana_cost || faces.map((f) => f.mana).filter(Boolean).join(' // '),
      cmc: c.cmc || 0, type: c.type_line || front.type,
      text: c.oracle_text != null ? c.oracle_text : faces.map((f) => f.text).join('\n//\n'),
      pt: front.pt, colors: c.colors || front.colors || [], ci: c.color_identity || [],
      kw: c.keywords || [], legal: c.legalities ? c.legalities.commander === 'legal' : true,
      layout: c.layout || 'normal', rarity: c.rarity || '', set: c.set, setName: c.set_name || '', cn: c.collector_number || '',
      img, imgB, faces: faces.length > 1 ? faces : undefined,
      lider: !!(c.oracle_text && /can be your commander/i.test(c.oracle_text)) ||
             (c.card_faces || []).some((f) => /can be your commander/i.test(f.oracle_text || '')),
    };
  }
  function recortarEs(c) {
    const faces = c.card_faces || [];
    const es = {
      name: c.printed_name || (faces[0] && faces[0].printed_name) || '',
      type: c.printed_type_line || (faces[0] && faces[0].printed_type_line) || '',
      text: c.printed_text != null ? c.printed_text : faces.map((f) => f.printed_text || '').join('\n//\n'),
      img: c.image_uris ? c.image_uris.normal : (faces[0] && faces[0].image_uris ? faces[0].image_uris.normal : ''),
      imgB: (faces[1] && faces[1].image_uris) ? faces[1].image_uris.normal : '',
    };
    if (faces.length > 1) es.faces = faces.map((f) => ({ name: f.printed_name || '', type: f.printed_type_line || '', text: f.printed_text || '' }));
    if (!es.name && !es.text) return null;
    return es;
  }

  /* ---------- Enriquecimiento ---------- */
  async function buscarTodo(q) {
    let url = `${API}/cards/search?q=${encodeURIComponent(q)}&include_multilingual=true&unique=prints`;
    const out = [];
    while (url) {
      const j = await pedir(url);
      if (!j) break;
      out.push(...(j.data || []));
      url = j.has_more ? j.next_page : null;
    }
    return out;
  }

  async function enriquecer(impresiones, onProgreso = () => {}) {
    const total = impresiones.length;
    const porId = new Map();
    // 1) Datos en inglés por Scryfall ID (75 por petición)
    for (let i = 0; i < total; i += 75) {
      const lote = impresiones.slice(i, i + 75);
      const j = await pedir(`${API}/cards/collection`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: lote.map((x) => ({ id: x.id })) }),
      });
      for (const c of (j && j.data) || []) porId.set(c.id, recortar(c));
      // reintento por set + número para los no encontrados
      for (const x of lote) {
        if (porId.has(x.id) || !x.set || !x.cn) continue;
        const c = await pedir(`${API}/cards/${x.set}/${encodeURIComponent(x.cn)}`);
        if (c) porId.set(x.id, recortar(c));
      }
      onProgreso({ fase: 'datos', hecho: Math.min(i + 75, total), total });
    }
    const cartas = [];
    for (const x of impresiones) {
      const d = porId.get(x.id);
      if (!d) continue;
      cartas.push({ ...d, qty: x.qty, foil: x.foil, binders: x.binders, setName: d.setName || x.setName });
    }
    // 2) Español por set (misma impresión)
    const sets = [...new Set(cartas.map((c) => c.set))];
    const esPorSetCn = new Map();
    let n = 0;
    for (const set of sets) {
      const res = await buscarTodo(`set:${set} lang:es`);
      for (const c of res) {
        const r = recortarEs(c);
        if (r) esPorSetCn.set(set + '/' + c.collector_number, r);
      }
      onProgreso({ fase: 'español', hecho: ++n, total: sets.length });
    }
    for (const c of cartas) {
      const r = esPorSetCn.get(c.set + '/' + c.cn);
      if (r) c.es = r;
    }
    // 3) Español por nombre (cualquier impresión) para las que faltan
    const faltan = [...new Set(cartas.filter((c) => !c.es).map((c) => c.name))];
    const esPorNombre = new Map();
    n = 0;
    for (const nombre of faltan) {
      const j = await pedir(`${API}/cards/search?q=${encodeURIComponent(`!"${nombre}" lang:es`)}&include_multilingual=true&unique=prints&order=released`);
      const lista = (j && j.data) || [];
      const mejor = lista.find((c) => c.printed_text || (c.card_faces && c.card_faces[0].printed_text)) || lista[0];
      if (mejor) { const r = recortarEs(mejor); if (r) esPorNombre.set(nombre, r); }
      onProgreso({ fase: 'español-nombre', hecho: ++n, total: faltan.length });
    }
    for (const c of cartas) if (!c.es && esPorNombre.has(c.name)) c.es = esPorNombre.get(c.name);
    return cartas;
  }

  return { parseCSV, agrupar, enriquecer, recortar, recortarEs };
})();
if (typeof module !== 'undefined') module.exports = MTG;
