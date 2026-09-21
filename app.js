/* MTG Comandante — colección, traducción y constructor de mazos Commander */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const uid = () => Math.random().toString(36).slice(2, 10);
const LS = { mazos: 'mtgc_mazos', lang: 'mtgc_lang', tema: 'mtgc_tema', flags: 'mtgc_flags' };
const COLORES = ['W', 'U', 'B', 'R', 'G'];
const NOMBRE_COLOR = { W: 'Blanco', U: 'Azul', B: 'Negro', R: 'Rojo', G: 'Verde', C: 'Incoloro' };
const BASICAS = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
const ORDEN_TIPOS = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Otro'];
const TIPO_ES = { Creature: 'Criaturas', Planeswalker: 'Planeswalkers', Battle: 'Batallas', Instant: 'Instantáneos', Sorcery: 'Conjuros', Artifact: 'Artefactos', Enchantment: 'Encantamientos', Land: 'Tierras', Otro: 'Otros', Comandante: 'Comandante' };
const RAREZA_ES = { common: 'Común', uncommon: 'Infrecuente', rare: 'Rara', mythic: 'Mítica', special: 'Especial', bonus: 'Bonus' };

/* ---------------- IndexedDB (colección importada) ---------------- */
const idb = {
  abrir() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('mtgc', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
  async get(k) { try { const db = await this.abrir(); return await new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); } catch { return undefined; } },
  async set(k, v) { try { const db = await this.abrir(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) { console.warn(e); } },
  async del(k) { try { const db = await this.abrir(); await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; }); } catch {} },
};

/* ---------------- Estado ---------------- */
const S = {
  lang: 'es', cartas: [], porNombre: new Map(), extras: new Map(), mazos: [], mazo: null, origen: 'incluida', meta: null,
  filtro: { q: '', colores: new Set(), tipo: '', binder: '', rareza: '', orden: 'nombre', cmd: false },
  filtroD: { q: '', tipo: '', rol: '', orden: 'puntaje', libres: false, fuente: 'col' },
  scry: { items: [], next: null, cargando: false, clave: '' },
  panel: 'mazo', listaVisible: [], listaDispVisible: [], mostrados: 0, mostradosD: 0,
};
const PAGINA = 60;

/* ---------------- Ayudas de cartas ---------------- */
const nom = (c) => (S.lang === 'es' && c.es && c.es.name) ? c.es.name : c.name;
/* Traducción aproximada de la línea de tipo cuando Scryfall no trae la impresa */
const TIPO_PAL = { Creature: 'Criatura', Instant: 'Instantáneo', Sorcery: 'Conjuro', Artifact: 'Artefacto', Enchantment: 'Encantamiento', Land: 'Tierra', Planeswalker: 'Planeswalker', Battle: 'Batalla', Kindred: 'Estirpe', Tribal: 'Tribal' };
const SUPER_PAL = { Legendary: 'legendari', Basic: 'básic', Snow: 'nevad', World: 'mundial', Token: 'ficha' };
function traducirTipo(t) {
  return String(t || '').split(' // ').map((parte) => {
    const [izq, der] = parte.split(' — ');
    const pal = izq.trim().split(/\s+/);
    const tipos = pal.filter((p) => TIPO_PAL[p]).map((p) => TIPO_PAL[p]);
    const sup = pal.filter((p) => SUPER_PAL[p]);
    if (!tipos.length) return parte;
    const fem = /^(Criatura|Tierra|Batalla|Estirpe)$/.test(tipos[0]);
    const sups = sup.map((p) => SUPER_PAL[p]).map((s) => s.endsWith('i') || s.endsWith('c') || s.endsWith('d') ? s + (fem ? 'a' : 'o') : s);
    return [tipos.join(' '), ...sups].join(' ') + (der ? ' — ' + der : '');
  }).join(' // ');
}
const tip = (c) => S.lang === 'es' ? ((c.es && c.es.type) ? c.es.type : traducirTipo(c.type)) : c.type;
const txt = (c) => (S.lang === 'es' && c.es && c.es.text) ? c.es.text : c.text;
const img = (c, tam = 'small', dorso = false) => {
  let u = '';
  if (S.lang === 'es' && c.es) u = dorso ? c.es.imgB : c.es.img;
  if (!u) u = dorso ? c.imgB : c.img;
  return u ? u.replace('/normal/', '/' + tam + '/') : '';
};
const esTierra = (c) => /\bLand\b/.test(c.type || '');
const esBasica = (c) => /\bBasic\b/.test(c.type || '');
const sinLimite = (c) => esBasica(c) || /any number of cards named/i.test(c.text || '');
const esComandante = (c) => c.legal !== false && (c.lider || (/\bLegendary\b/.test(c.type || '') && /\bCreature\b/.test((c.type || '').split(' // ')[0])));
const tienePartner = (c) => /\bPartner\b|Friends forever|Doctor's companion|choose a Background/i.test(c.text || '');
const tipoPrincipal = (c) => {
  const t = (c.type || '').split(' // ')[0];
  for (const k of ORDEN_TIPOS) if (t.includes(k)) return k;
  return 'Otro';
};
const subtipos = (c) => {
  const t = (c.type || '').split(' // ')[0];
  const i = t.indexOf('—');
  return i < 0 ? [] : t.slice(i + 1).trim().split(/\s+/).filter(Boolean);
};
const identidadOk = (c, ci) => (c.ci || []).every((x) => ci.includes(x));
const manaHTML = (m) => String(m || '').replace(/\{([^}]+)\}/g, (_, s) => {
  const k = s.replace(/\//g, '').toUpperCase();
  const cls = /^[WUBRG]$/.test(k) ? k : (/[WUBRG]{2}/.test(k) ? 'H' : (/^\d+$/.test(k) ? 'N' : 'X'));
  return `<i class="pip-s ${cls}">${esc(s.length > 2 ? s[0] : s)}</i>`;
});
const pipsHTML = (ci) => `<span class="pips">${(ci && ci.length ? ci : ['C']).map((c) => `<i class="pip-s ${c}">${c}</i>`).join('')}</span>`;

/* Roles por texto de reglas (inglés) */
const ROLES = {
  rampa: /\badd \{|\badd (one|two|three) mana|search your library for (a|up to \w+) (basic )?lands?|put (a|that|those) land cards? .*onto the battlefield|lands you control (have|gain) "|mana of any color/i,
  robo: /draw (a|two|three|four|x|that many) cards?|investigate|look at the top \w+ cards of your library.*put .* into your hand/i,
  remocion: /(destroy|exile) target (creature|artifact|enchantment|permanent|nonland|planeswalker|attacking|blocking|tapped)|deals? \d+ damage to (any target|target creature|each opponent's creature)|target creature gets -\d|\bfights?\b target|return target (creature|nonland permanent) to its owner's hand|choose target creature .* (exile|destroy)/i,
  barrida: /(destroy|exile) all (creatures|nonland permanents|artifacts|enchantments|permanents)|each creature|all creatures get -|deals \d+ damage to each (creature|opponent and each creature)/i,
  contra: /counter target (spell|creature spell|noncreature spell|instant|sorcery|activated|triggered)/i,
  tutor: /search your library for a (card|creature|artifact|enchantment|instant|sorcery|planeswalker)/i,
};
const NOMBRE_ROL = { rampa: 'Rampa', robo: 'Robo', remocion: 'Remoción', barrida: 'Barrida', contra: 'Contra', tutor: 'Tutor', sinergia: 'Sinergia' };
function roles(c) {
  const out = [];
  if (esTierra(c)) return out;
  for (const k in ROLES) if (ROLES[k].test(c.text || '')) out.push(k);
  return out;
}
/* Temas detectables en el comandante → regex para las demás cartas */
const TEMAS = [
  { n: 'Landfall', cmd: /landfall|whenever a land (enters|you control enters)/i, card: /landfall|land (enters|you control enters)|search your library for .*land|play an additional land|put a land/i },
  { n: 'Fichas', cmd: /create (a|two|three|x|\d+) .*token/i, card: /create (a|two|three|x|\d+|that many) .*token|tokens? you control|populate/i },
  { n: 'Contadores +1/+1', cmd: /\+1\/\+1 counter/i, card: /\+1\/\+1 counter|proliferate/i },
  { n: 'Sacrificio', cmd: /sacrifice (a|another|two) (creature|permanent)|whenever .* dies/i, card: /sacrifice (a|another) creature|whenever .* dies|when .* dies|aristocrat/i },
  { n: 'Hechizos', cmd: /instant (or|and) sorcery|noncreature spell|prowess|magecraft|whenever you cast/i, card: /instant (or|and) sorcery|noncreature spell|prowess|magecraft|whenever you cast an? (instant|sorcery|noncreature)|copy target instant/i },
  { n: 'Cementerio', cmd: /from your graveyard|graveyard to the battlefield|mill|dredge/i, card: /from (your|a) graveyard|graveyard to the battlefield|mill|return target creature card from your graveyard/i },
  { n: 'Artefactos', cmd: /artifact/i, card: /artifact/i },
  { n: 'Encantamientos', cmd: /enchantment|aura|constellation/i, card: /enchantment|aura|constellation/i },
  { n: 'Equipo', cmd: /equip|equipment/i, card: /equip|equipment|aura/i },
  { n: 'Vida', cmd: /gain(s)? life|lifelink|life you gained/i, card: /gain(s)? \d+ life|gain life|lifelink|whenever you gain life/i },
  { n: 'Volar', cmd: /creatures? with flying|flying creatures/i, card: /\bflying\b/i },
  { n: 'Vampiros/Robo de vida', cmd: /whenever .* loses life|each opponent loses/i, card: /loses? \d+ life|each opponent loses|extort|drain/i },
  { n: 'Atacar', cmd: /whenever .* attacks|combat damage/i, card: /whenever .* attacks|combat damage|haste|double strike|extra combat|additional combat/i },
  { n: 'Grandes', cmd: /power (\d+|5) or greater|total power/i, card: /power (\d+|4|5) or greater|\btrample\b/i },
  { n: 'Contrahechizos', cmd: /counter target spell|can't be countered/i, card: /counter target/i },
  { n: 'Tap/Untap', cmd: /untap|becomes tapped|\{T\}/i, card: /untap (target|all|another)|tap target/i },
];
function temasDe(cmds) {
  const texto = cmds.map((c) => (c.text || '') + ' ' + (c.kw || []).join(' ')).join('\n');
  const out = TEMAS.filter((t) => t.cmd.test(texto));
  const tribus = new Set();
  for (const c of cmds) for (const st of subtipos(c)) tribus.add(st);
  return { temas: out, tribus: [...tribus].filter((t) => !/Legend|Token/i.test(t)) };
}
function puntaje(c, ctx) {
  // ctx: { temas, tribus, ci }
  let s = 0;
  const r = roles(c);
  s += { mythic: 2, rare: 1.5, uncommon: .7, common: .3 }[c.rarity] || 0;
  if (c.cmc >= 7) s -= 2; else if (c.cmc >= 6) s -= 1; else if (c.cmc <= 2 && !esTierra(c)) s += .3;
  if (r.includes('rampa')) s += c.cmc <= 3 ? 3 : 1.5;
  if (r.includes('robo')) s += 2.5;
  if (r.includes('remocion')) s += 2.5;
  if (r.includes('barrida')) s += 1;
  if (r.includes('contra')) s += ctx.ci.includes('U') ? 1.5 : 0;
  if (r.includes('tutor')) s += 1;
  const t = c.type || '', tx = c.text || '';
  let sin = 0;
  for (const tribu of ctx.tribus) {
    const re = new RegExp('\\b' + tribu.replace(/y$/, '(y|ies)') + 's?\\b', 'i');
    if (re.test(t) && /Creature/.test(t)) sin += 3;
    else if (re.test(tx) || (tribu === 'Elf' && /Elves/i.test(tx))) sin += 2.5;
  }
  for (const tema of ctx.temas) if (tema.card.test(tx) || tema.card.test(t)) sin += 2;
  s += Math.min(sin, 7);
  if (esTierra(c)) {
    if (esBasica(c)) s = 0;
    else {
      const prod = COLORES.filter((k) => ctx.ci.includes(k) && new RegExp('\\{' + k + '\\}|any color|' + BASICAS[k] + '|of any type').test(tx));
      s = 1 + prod.length * 1.5 + (/enters tapped/.test(tx) ? -0.5 : 0) + (/Legendary/.test(t) ? .3 : 0);
    }
  }
  return { s: Math.round(s * 10) / 10, sin, roles: r };
}

/* ---------------- Carga de datos ---------------- */
function indexar() {
  S.porNombre = new Map();
  for (const c of S.cartas) {
    let e = S.porNombre.get(c.name);
    if (!e) { e = { name: c.name, qty: 0, imps: [], card: c }; S.porNombre.set(c.name, e); }
    e.qty += c.qty || 0; e.imps.push(c);
    if (!e.card.es && c.es) e.card = c;
  }
  // Cartas buscadas en Scryfall que no están en la colección (p. ej. un comandante por comprar)
  for (const c of S.extras.values()) if (!S.porNombre.has(c.name)) S.porNombre.set(c.name, { name: c.name, qty: 0, imps: [], card: c, extra: true });
  // Tierras básicas ilimitadas (ManaBox normalmente no las registra)
  if (basicasIlimitadas()) {
    for (const b of (window.BASICAS_VIRTUALES || [])) {
      let e = S.porNombre.get(b.name);
      if (!e) { e = { name: b.name, qty: 0, imps: [], card: b }; S.porNombre.set(b.name, e); }
      e.qty = 999; e.ilimitada = true;
    }
  }
  // llenar selects de tipo y carpeta
  const binders = new Set(); for (const c of S.cartas) for (const b in c.binders || {}) binders.add(b);
  const opciones = (sel, lista, primera) => { sel.innerHTML = `<option value="">${primera}</option>` + lista.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join(''); };
  opciones($('#f-binder'), [...binders].sort(), 'Carpeta');
  const tipos = ORDEN_TIPOS.filter((t) => t !== 'Otro').map((t) => [t, TIPO_ES[t]]);
  for (const id of ['#f-tipo', '#d-tipo']) $(id).innerHTML = '<option value="">Tipo</option>' + tipos.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
  $('#subtitulo').textContent = `${S.cartas.reduce((a, c) => a + (c.qty || 0), 0)} cartas`;
}
function cartaPorNombre(n) {
  const e = S.porNombre.get(n); if (e) return e.card;
  const k = norm(n);
  for (const [name, e2] of S.porNombre) {
    if (norm(name) === k || norm(name.split(' // ')[0]) === k || (e2.card.es && norm(e2.card.es.name) === k) || (e2.card.es && norm((e2.card.es.name || '').split(' // ')[0]) === k)) return e2.card;
  }
  return null;
}
/* Busca en Scryfall una carta que no está en la colección y la guarda como "extra" (cantidad 0) */
async function buscarExtra(nombre) {
  if (!navigator.onLine) throw new Error('Sin conexión');
  const h = { headers: { Accept: 'application/json' } };
  const r = await fetch('https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(nombre), h);
  if (!r.ok) throw new Error('No encontrada en Scryfall');
  const c = MTG.recortar(await r.json());
  try {
    const r2 = await fetch('https://api.scryfall.com/cards/search?q=' + encodeURIComponent(`!"${c.name}" lang:es`) + '&include_multilingual=true&unique=prints&order=released', h);
    if (r2.ok) { const j = await r2.json(); const mejor = (j.data || []).find((x) => x.printed_text || (x.card_faces && x.card_faces[0].printed_text)) || (j.data || [])[0]; if (mejor) c.es = MTG.recortarEs(mejor) || undefined; }
  } catch {}
  const extra = { ...c, qty: 0, foil: 0, binders: {}, extra: true };
  S.extras.set(extra.name, extra);
  await idb.set('extras', [...S.extras.values()]);
  indexar();
  return extra;
}
/* Registra una carta ya descargada como "extra" (sin volver a pedirla a Scryfall) */
async function registrarExtra(c) {
  if (S.porNombre.has(c.name)) return S.porNombre.get(c.name).card;
  const extra = { ...c, qty: 0, foil: 0, binders: {}, extra: true };
  S.extras.set(extra.name, extra);
  await idb.set('extras', [...S.extras.values()]);
  indexar();
  return extra;
}
/* Búsqueda en Scryfall de todas las cartas legales para la identidad del mazo */
const ROL_OTAG = { rampa: 'otag:ramp', robo: 'otag:draw', remocion: 'otag:removal', barrida: 'otag:board-wipe', contra: 'otag:counterspell', tutor: 'otag:tutor' };
function consultaScryfall(m) {
  const f = S.filtroD; const ci = identidad(m);
  const partes = [f.q.trim(), `id<=${ci.length ? ci.join('') : 'c'}`, 'f:commander', '-is:digital', '-t:basic'];
  if (f.tipo) partes.push('t:' + f.tipo);
  if (f.rol === 'sinergia') {
    const { tribus } = temasDe(m.comandantes.map(cartaPorNombre).filter(Boolean));
    if (tribus.length) partes.push('(' + tribus.map((t) => `t:${t} or o:${t}`).join(' or ') + ')');
  } else if (f.rol && ROL_OTAG[f.rol]) partes.push(ROL_OTAG[f.rol]);
  if (S.lang === 'es') partes.push('lang:es');
  const orden = { puntaje: 'edhrec', nombre: 'name', cmc: 'cmc' }[f.orden] || 'edhrec';
  return `https://api.scryfall.com/cards/search?q=${encodeURIComponent(partes.filter(Boolean).join(' '))}&order=${orden}&include_multilingual=true&unique=cards`;
}
async function buscarScryfall(m, url) {
  const sc = S.scry;
  sc.cargando = true; pintarScryfall();
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const j = r.ok ? await r.json() : { data: [], total_cards: 0 };
    const nuevos = (j.data || []).map((c) => { const k = MTG.recortar(c); if (c.lang === 'es') k.es = MTG.recortarEs(c) || undefined; return k; });
    sc.items.push(...nuevos); sc.next = j.has_more ? j.next_page : null; sc.total = j.total_cards || 0;
    sc.error = r.ok || r.status === 404 ? '' : 'Error ' + r.status;
  } catch (e) { sc.error = navigator.onLine ? e.message : 'Sin conexión'; }
  sc.cargando = false; pintarScryfall();
}
function pintarScryfall() {
  const m = S.mazo; const sc = S.scry;
  const cont = $('#lista-disp');
  $('#conteo-disp').textContent = sc.cargando && !sc.items.length ? 'Buscando en Scryfall…' : `${sc.total || 0} cartas legales para ${pipsTexto(identidad(m))}${S.lang === 'es' ? ' con edición en español (cambia a EN para ver todas)' : ''} · por popularidad en Commander`;
  cont.innerHTML = sc.items.map((c) => {
    const e = S.porNombre.get(c.name);
    const enMazo = m.cartas[c.name] || 0;
    const tienes = e && !e.extra ? `Tienes ×${e.ilimitada ? '∞' : e.qty}` : '';
    return filaHTML(c, { modo: 'disp', enMazo, extra: [tienes, ...roles(c).map((r) => NOMBRE_ROL[r])].filter(Boolean).join(' · '), faltante: !tienes, qty: e ? e.qty : 0, scry: true });
  }).join('') || (sc.cargando ? '' : `<div class="vacio"><b>${sc.error || 'Sin resultados'}</b>${sc.error ? 'Se necesita internet para buscar fuera de tu colección.' : 'Prueba con otro texto o filtro.'}</div>`);
  $('#disp-mas').innerHTML = sc.cargando ? '<span class="l" style="color:var(--texto2)">Cargando…</span>' : (sc.next ? '<button class="btn" id="btn-scry-mas">Cargar más</button>' : '');
  const b = $('#btn-scry-mas'); if (b) b.onclick = () => buscarScryfall(m, sc.next);
}
function iniciarScryfall() {
  const m = S.mazo; if (!m) return;
  const url = consultaScryfall(m);
  if (url === S.scry.clave && S.scry.items.length) { pintarScryfall(); return; }
  S.scry = { items: [], next: null, cargando: false, clave: url, total: 0, error: '' };
  buscarScryfall(m, url);
}
/* Intenta resolver los nombres de un mazo que no están en la colección */
async function resolverFaltantes(m) {
  const nombres = [...m.comandantes, ...Object.keys(m.cartas)].filter((n) => !cartaPorNombre(n));
  if (!nombres.length || !navigator.onLine) return 0;
  let n = 0;
  for (const nombre of nombres) { try { await buscarExtra(nombre); n++; } catch {} await new Promise((r) => setTimeout(r, 120)); }
  return n;
}
async function cargarColeccion() {
  const ex = await idb.get('extras');
  S.extras = new Map((ex || []).map((c) => [c.name, c]));
  const imp = await idb.get('coleccion');
  if (imp && imp.cartas && imp.cartas.length) { S.cartas = imp.cartas; S.origen = 'importada'; S.meta = imp.meta; }
  else { S.cartas = window.COLECCION || []; S.origen = 'incluida'; S.meta = window.COLECCION_META || null; }
  indexar();
}
function flags() { try { return JSON.parse(localStorage.getItem(LS.flags) || '{}'); } catch { return {}; } }
function setFlag(k, v) { const f = flags(); f[k] = v; localStorage.setItem(LS.flags, JSON.stringify(f)); }
const basicasIlimitadas = () => flags().basicas !== false;
function cargarMazos() { try { S.mazos = JSON.parse(localStorage.getItem(LS.mazos) || '[]'); } catch { S.mazos = []; } }
function guardarMazos() { localStorage.setItem(LS.mazos, JSON.stringify(S.mazos)); }

/* ---------------- Mazos: lógica ---------------- */
const totalMazo = (m) => m.comandantes.length + Object.values(m.cartas).reduce((a, b) => a + b, 0);
const identidad = (m) => { const s = new Set(); for (const n of m.comandantes) { const c = cartaPorNombre(n); if (c) for (const k of c.ci || []) s.add(k); } return COLORES.filter((k) => s.has(k)); };
function usadasEnOtros(nombre, mazoId) {
  let n = 0; const donde = [];
  for (const m of S.mazos) { if (m.id === mazoId) continue; const q = (m.cartas[nombre] || 0) + (m.comandantes.includes(nombre) ? 1 : 0); if (q) { n += q; donde.push(m.nombre); } }
  return { n, donde };
}
function disponiblesPara(m) {
  // cartas de la colección que pueden ir en el mazo m, con puntaje
  const ci = identidad(m);
  const ctx = { ...temasDe(m.comandantes.map(cartaPorNombre).filter(Boolean)), ci };
  const out = [];
  for (const [name, e] of S.porNombre) {
    const c = e.card;
    if (e.extra || m.comandantes.includes(name)) continue;
    if (c.legal === false) continue;
    if (!identidadOk(c, ci)) continue;
    const p = puntaje(c, ctx);
    const otros = usadasEnOtros(name, m.id);
    out.push({ name, c, qty: e.qty, enMazo: m.cartas[name] || 0, otros, ...p });
  }
  return { lista: out, ctx };
}
function maxCopias(c, qty) { return sinLimite(c) ? qty : Math.min(1, qty); }
function agregar(m, name, delta) {
  const e = S.porNombre.get(name);
  const c = e ? e.card : null;
  const actual = m.cartas[name] || 0;
  let nuevo = actual + delta;
  if (nuevo < 0) nuevo = 0;
  const tope = !c ? 99 : (e.extra ? (sinLimite(c) ? 99 : 1) : maxCopias(c, e.qty));
  if (delta > 0 && nuevo > tope) { toast(c && sinLimite(c) ? 'No tienes más copias' : 'Solo 1 copia por mazo (singleton)'); return; }
  if (nuevo === 0) delete m.cartas[name]; else m.cartas[name] = nuevo;
  guardarMazos();
}
function avisosMazo(m) {
  const av = [];
  const ci = identidad(m);
  const total = totalMazo(m);
  if (m.comandantes.length === 0) av.push(['mal', 'El mazo no tiene comandante.']);
  for (const n of m.comandantes) { const e = S.porNombre.get(n); if (!e || e.extra) av.push(['aviso', `El comandante ${n} no está en tu colección.`]); }
  if (m.comandantes.length === 2) {
    const c = m.comandantes.map(cartaPorNombre);
    if (!c.every((x) => x && tienePartner(x))) av.push(['aviso', 'Dos comandantes: ambos deben tener Compañero (Partner), Background u otra habilidad similar.']);
  }
  if (total !== 100) av.push([total > 100 ? 'mal' : 'aviso', `El mazo tiene ${total} cartas (deben ser 100${total < 100 ? ', faltan ' + (100 - total) : ', sobran ' + (total - 100)}).`]);
  else av.push(['ok', '100 cartas exactas.']);
  let faltantes = 0, ilegales = [], fueraId = [], sobre = [], dup = [];
  for (const n in m.cartas) {
    const e = S.porNombre.get(n); const c = e ? e.card : cartaPorNombre(n);
    if (!c) { faltantes += m.cartas[n]; continue; }
    if (c.legal === false) ilegales.push(nom(c));
    if (!identidadOk(c, ci)) fueraId.push(nom(c));
    const e2 = S.porNombre.get(c.name);
    if (e2 && e2.extra) { faltantes += m.cartas[n]; continue; }
    if (e2 && m.cartas[n] > e2.qty) sobre.push(`${nom(c)} (${m.cartas[n]} de ${e2.qty})`);
    if (!sinLimite(c) && m.cartas[n] > 1) dup.push(nom(c));
    const o = usadasEnOtros(c.name, m.id);
    if (e2 && o.n + m.cartas[n] > e2.qty) av.push(['aviso', `${nom(c)}: también está en ${o.donde.join(', ')} (tienes ${e2.qty}).`]);
  }
  if (faltantes) av.push(['aviso', `${faltantes} carta(s) por comprar: no están en tu colección (ver Lista de compras).`]);
  if (ilegales.length) av.push(['mal', 'No legales en Commander: ' + ilegales.join(', ')]);
  if (fueraId.length) av.push(['mal', 'Fuera de la identidad de color: ' + fueraId.join(', ')]);
  if (sobre.length) av.push(['mal', 'Más copias de las que tienes: ' + sobre.join(', ')]);
  if (dup.length) av.push(['mal', 'Repetidas (singleton): ' + dup.join(', ')]);
  return av;
}

/* Sugerir: completa el mazo automáticamente con la colección */
function sugerir(m, opts = {}) {
  const { lista, ctx } = disponiblesPara(m);
  const ci = ctx.ci;
  const meta = 99 - (m.comandantes.length - 1);
  const objetivoTierras = opts.tierras || 37;
  const soloLibres = !!opts.libres;
  const disp = (x) => x.qty - (soloLibres ? x.otros.n : 0);
  const cand = lista.filter((x) => !x.enMazo && disp(x) > 0);
  const noTierra = cand.filter((x) => !esTierra(x.c)).sort((a, b) => b.s - a.s);
  const elegidas = new Map(Object.entries(m.cartas));
  let n = totalMazo(m) - m.comandantes.length;
  const tierrasActuales = [...elegidas].reduce((a, [k, q]) => { const c = cartaPorNombre(k); return a + (c && esTierra(c) ? q : 0); }, 0);
  let faltanNoTierra = Math.max(0, meta - n - Math.max(0, objetivoTierras - tierrasActuales));
  const tomar = (x, q = 1) => { elegidas.set(x.name, (elegidas.get(x.name) || 0) + q); n += q; };
  // cuotas mínimas por rol
  const cuotas = { rampa: 9, robo: 9, remocion: 9 };
  const conteo = { rampa: 0, robo: 0, remocion: 0 };
  for (const [k, q] of elegidas) { const c = cartaPorNombre(k); if (c) for (const r of roles(c)) if (conteo[r] != null) conteo[r] += q; }
  const usada = new Set();
  for (const rol in cuotas) {
    for (const x of noTierra) {
      if (faltanNoTierra <= 0 || conteo[rol] >= cuotas[rol]) break;
      if (usada.has(x.name) || !x.roles.includes(rol)) continue;
      tomar(x); usada.add(x.name); faltanNoTierra--;
      for (const r of x.roles) if (conteo[r] != null) conteo[r]++;
    }
  }
  let criaturas = [...elegidas].reduce((a, [k, q]) => { const c = cartaPorNombre(k); return a + (c && /Creature/.test(c.type) ? q : 0); }, 0);
  for (const x of noTierra) {
    if (faltanNoTierra <= 0) break;
    if (usada.has(x.name)) continue;
    // evitar que el mazo quede sin criaturas: prioriza criaturas cuando hay pocas
    if (criaturas < 20 && !/Creature/.test(x.c.type) && x.s < 4) continue;
    tomar(x); usada.add(x.name); faltanNoTierra--;
    if (/Creature/.test(x.c.type)) criaturas++;
  }
  // tierras: no básicas útiles primero, luego básicas según símbolos de maná
  let faltanTierras = meta - n;
  const noBasicas = cand.filter((x) => esTierra(x.c) && !esBasica(x.c) && x.s >= 2.5).sort((a, b) => b.s - a.s);
  const maxNoBasicas = Math.max(0, Math.round(faltanTierras * (ci.length >= 2 ? 0.45 : 0.25)));
  for (const x of noBasicas.slice(0, maxNoBasicas)) { if (faltanTierras <= 0) break; tomar(x); faltanTierras--; }
  const simbolos = {}; for (const k of ci) simbolos[k] = 1;
  for (const [k, q] of elegidas) { const c = cartaPorNombre(k); if (!c || esTierra(c)) continue; for (const mch of (c.mana || '').matchAll(/\{([WUBRG])\}/g)) simbolos[mch[1]] = (simbolos[mch[1]] || 0) + q; }
  const totalSim = Object.values(simbolos).reduce((a, b) => a + b, 0) || 1;
  const basicasDisp = {}; for (const k of ci) { const e = S.porNombre.get(BASICAS[k]); basicasDisp[k] = e ? e.qty - (soloLibres ? usadasEnOtros(BASICAS[k], m.id).n : 0) - (elegidas.get(BASICAS[k]) || 0) : 0; }
  const colores = [...ci];
  if (!colores.length) { const e = S.porNombre.get('Wastes'); if (e) basicasDisp.C = e.qty; colores.push('C'); simbolos.C = 1; basicasDisp.C = basicasDisp.C || 0; }
  const nombreBasica = (k) => k === 'C' ? 'Wastes' : BASICAS[k];
  let restantes = faltanTierras;
  const plan = {}; for (const k of colores) plan[k] = Math.min(basicasDisp[k], Math.round(restantes * (simbolos[k] || 0) / totalSim));
  let asignadas = Object.values(plan).reduce((a, b) => a + b, 0);
  let vueltas = 0;
  while (asignadas < restantes && vueltas < 200) { let hubo = false; for (const k of colores) { if (asignadas >= restantes) break; if (plan[k] < basicasDisp[k]) { plan[k]++; asignadas++; hubo = true; } } if (!hubo) break; vueltas++; }
  for (const k of colores) if (plan[k] > 0) tomar({ name: nombreBasica(k) }, plan[k]);
  faltanTierras -= asignadas;
  // si faltan básicas, rellena con tierras no básicas restantes o hechizos
  if (faltanTierras > 0) for (const x of noBasicas.slice(maxNoBasicas)) { if (faltanTierras <= 0) break; if (elegidas.has(x.name)) continue; tomar(x); faltanTierras--; }
  if (faltanTierras > 0) for (const x of noTierra) { if (faltanTierras <= 0) break; if (usada.has(x.name) || elegidas.has(x.name)) continue; tomar(x); faltanTierras--; }
  m.cartas = Object.fromEntries(elegidas);
  guardarMazos();
  return { ctx };
}

/* ---------------- Importar lista de texto ---------------- */
function parsearLista(texto) {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const cartas = [], noEncontradas = []; let comandantes = [];
  let seccion = '';
  for (const l of lineas) {
    if (/^(\/\/|#)/.test(l)) { seccion = l.toLowerCase(); continue; }
    const enc = /^(commander|comandante|deck|mazo|sideboard|main|mainboard)s?:?$/i.exec(l);
    if (enc) { seccion = l.toLowerCase(); continue; }
    const m = /^(\d+)\s*x?\s+(.+?)(\s+\([A-Za-z0-9]{2,6}\)\s*[\w★-]*)?(\s+\*\w+\*)?\s*$/.exec(l);
    if (!m) continue;
    const q = parseInt(m[1], 10); const nombre = m[2].trim();
    const c = cartaPorNombre(nombre);
    const esCmd = /cmdr/i.test(m[4] || '') || /command|comand/.test(seccion);
    if (esCmd && c && esComandante(c) && comandantes.length < 2) { comandantes.push(c.name); continue; }
    if (c) cartas.push({ name: c.name, q }); else { noEncontradas.push(nombre); cartas.push({ name: nombre, q }); }
  }
  if (!comandantes.length && cartas.length) {
    // primera línea si es comandante o no está en la colección (p. ej. un comandante por comprar); si no, la primera legendaria
    const c0 = cartaPorNombre(cartas[0].name);
    const i = (!c0 || esComandante(c0)) ? 0 : cartas.findIndex((x) => { const c = cartaPorNombre(x.name); return c && esComandante(c); });
    if (i >= 0) { comandantes = [cartas[i].name]; cartas.splice(i, 1); }
    else if (cartas.length) { comandantes = [cartas[0].name]; cartas.splice(0, 1); }
  }
  const obj = {};
  for (const x of cartas) obj[x.name] = (obj[x.name] || 0) + x.q;
  return { comandantes, cartas: obj, noEncontradas };
}
function exportarTexto(m) {
  const l = m.comandantes.map((n) => `1 ${n}`);
  const grupos = {};
  for (const n in m.cartas) { const c = cartaPorNombre(n); const t = c ? tipoPrincipal(c) : 'Otro'; (grupos[t] = grupos[t] || []).push(`${m.cartas[n]} ${n}`); }
  for (const t of ORDEN_TIPOS) if (grupos[t]) l.push(...grupos[t].sort());
  return l.join('\n');
}

/* ---------------- UI: navegación ---------------- */
function irA(v) {
  $$('nav.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  $$('.vista').forEach((x) => x.classList.toggle('on', x.id === 'v-' + v));
  if (v === 'mazos') pintarMazos();
  if (v === 'ajustes') pintarAjustes();
  if (v === 'coleccion') pintarColeccion();
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2200); }
function hoja(html) { $('#hoja').classList.remove('alta'); $('#hoja-cuerpo').innerHTML = html; $('#hoja-fondo').classList.add('on'); $('#hoja-cuerpo').scrollTop = 0; }
function cerrarHoja() { $('#hoja-fondo').classList.remove('on'); }

/* ---------------- UI: fila de carta ---------------- */
function filaHTML(c, o = {}) {
  const e = S.porNombre.get(c.name);
  const qty = o.qty != null ? o.qty : (e ? e.qty : 0);
  const sub = [tip(c).split(' // ')[0], c.pt].filter(Boolean).join(' · ');
  let derecha = '';
  if (o.modo === 'disp') {
    derecha = `<div class="accion">${o.enMazo ? `<button data-acc="menos">−</button><span class="n">${o.enMazo}</span>` : ''}<button class="mas" data-acc="mas">+</button></div>`;
  } else if (o.modo === 'mazo') {
    derecha = `<div class="accion"><button data-acc="menos">−</button><span class="n">${o.enMazo}</span><button class="mas" data-acc="mas">+</button></div>`;
  } else derecha = `<div class="qty">${e && e.ilimitada ? '<b>∞</b>' : '×<b>' + qty + '</b>'}</div>`;
  const faltante = o.faltante || (e && e.extra);
  const extra = (o.extra ? `<span class="badge">${esc(o.extra)}</span>` : '') + (e && e.extra ? '<span class="badge mal">No la tienes</span>' : '');
  const cls = ['fila', faltante ? 'faltante' : '', o.agotada ? 'agotada' : ''].join(' ');
  const src = img(c);
  return `<div class="${cls}" data-name="${esc(c.name)}">
    ${src ? `<img class="mini" loading="lazy" src="${esc(src)}" alt="">` : '<div class="mini"></div>'}
    <div class="datos"><div class="nombre">${esc(nom(c))}</div><div class="sub">${manaHTML(c.mana.split(' // ')[0])}<span>${esc(sub)}</span>${extra}</div></div>
    ${derecha}</div>`;
}

/* ---------------- UI: colección ---------------- */
function filtrarColeccion() {
  const f = S.filtro; const q = norm(f.q);
  let l = [];
  for (const [, e] of S.porNombre) {
    const c = e.card;
    if (e.extra) continue;
    if (f.cmd && !esComandante(c)) continue;
    if (f.tipo && tipoPrincipal(c) !== f.tipo && !(c.type || '').includes(f.tipo)) continue;
    if (f.rareza && !e.imps.some((i) => i.rarity === f.rareza)) continue;
    if (f.binder && !e.imps.some((i) => i.binders && i.binders[f.binder])) continue;
    if (f.colores.size) {
      const ci = c.ci || [];
      if (f.colores.has('C') && f.colores.size === 1) { if (ci.length) continue; }
      else if (![...f.colores].filter((x) => x !== 'C').every((x) => ci.includes(x))) continue;
    }
    if (q) {
      const campos = [c.name, c.es && c.es.name, c.type, c.es && c.es.type, c.text, c.es && c.es.text].map(norm).join(' | ');
      if (!campos.includes(q)) continue;
    }
    l.push(e);
  }
  const ord = { nombre: (a, b) => nom(a.card).localeCompare(nom(b.card), 'es'), cmc: (a, b) => a.card.cmc - b.card.cmc || nom(a.card).localeCompare(nom(b.card), 'es'), qty: (a, b) => b.qty - a.qty, rareza: (a, b) => (['mythic', 'rare', 'uncommon', 'common'].indexOf(a.card.rarity)) - (['mythic', 'rare', 'uncommon', 'common'].indexOf(b.card.rarity)), set: (a, b) => a.card.set.localeCompare(b.card.set) };
  l.sort(ord[f.orden] || ord.nombre);
  return l;
}
function pintarColeccion() {
  S.listaVisible = filtrarColeccion(); S.mostrados = 0;
  $('#lista-coleccion').innerHTML = '';
  const total = S.listaVisible.reduce((a, e) => a + (e.ilimitada ? e.imps.reduce((x, i) => x + (i.virtual ? 0 : i.qty), 0) : e.qty), 0);
  $('#conteo').textContent = `${S.listaVisible.length} cartas distintas · ${total} en total`;
  if (!S.listaVisible.length) $('#lista-coleccion').innerHTML = `<div class="vacio"><b>Sin resultados</b>${S.cartas.length ? 'Prueba con otros filtros.' : 'Importa tu CSV de ManaBox en Ajustes.'}</div>`;
  masColeccion();
}
function masColeccion() {
  const trozo = S.listaVisible.slice(S.mostrados, S.mostrados + PAGINA);
  if (!trozo.length) return;
  $('#lista-coleccion').insertAdjacentHTML('beforeend', trozo.map((e) => filaHTML(e.card)).join(''));
  S.mostrados += trozo.length;
}

/* ---------------- UI: detalle de carta ---------------- */
function detalle(name, ctx = {}) {
  const c = cartaPorNombre(name) || ctx.carta;
  if (!c) {
    hoja(`<div class="detalle"><h2>${esc(name)}</h2><p class="l">Esta carta no está en tu colección.</p><div class="fila-btn"><button class="btn primario" id="det-buscar">Buscar datos en Scryfall</button></div></div>`);
    $('#det-buscar').onclick = async () => { $('#det-buscar').disabled = true; try { await buscarExtra(name); detalle(name, ctx); if (S.mazo) pintarMazo(); } catch (e) { toast(e.message); $('#det-buscar').disabled = false; } };
    return;
  }
  const e = S.porNombre.get(c.name);
  const impresiones = e ? e.imps : [c];
  const enMazos = S.mazos.filter((m) => m.cartas[c.name] || m.comandantes.includes(c.name)).map((m) => m.nombre);
  const dorso = !!(c.imgB || (c.es && c.es.imgB));
  const caras = (S.lang === 'es' && c.es && c.es.faces && c.es.faces.some((f) => f.name)) ? c.es.faces.map((f, i) => ({ ...c.faces[i], ...f })) : c.faces;
  const cuerpoTexto = caras ? caras.map((f) => `<div class="cara"><b>${esc(f.name)}</b> ${manaHTML(f.mana)}<div class="l">${esc(f.type)} ${f.pt ? '· ' + esc(f.pt) : ''}</div><div class="texto">${esc(f.text)}</div></div>`).join('')
    : `<div class="texto">${esc(txt(c)) || '<i>(sin texto)</i>'}</div>`;
  const otroIdioma = S.lang === 'es' ? (c.es ? '' : '<p class="l">⚠ Sin traducción disponible; se muestra en inglés.</p>') : '';
  const r = roles(c);
  const html = `<div class="detalle">
    <img class="imagen" id="det-img" src="${esc(img(c, 'normal'))}" alt="${esc(nom(c))}" data-lado="0">
    ${dorso ? '<div style="text-align:center;margin:-4px 0 8px"><button class="btn chico" id="det-girar">↻ Girar carta</button></div>' : ''}
    <h2>${esc(nom(c))} <small style="font-weight:400;color:var(--texto2)">${S.lang === 'es' && c.es && c.es.name && c.es.name !== c.name ? esc(c.name) : ''}</small></h2>
    <div class="l">${manaHTML(c.mana)} ${c.mana ? '· ' : ''}${esc(tip(c))}${c.pt ? ' · ' + esc(c.pt) : ''}</div>
    <div class="l">Identidad: ${pipsHTML(c.ci)} · ${c.legal === false ? '<span class="badge mal">No legal en Commander</span>' : '<span class="badge ok">Legal</span>'} ${esComandante(c) ? '<span class="badge">Puede ser comandante</span>' : ''} ${r.map((x) => `<span class="badge">${NOMBRE_ROL[x]}</span>`).join(' ')}</div>
    ${otroIdioma}
    ${cuerpoTexto}
    <div class="l"><b>En tu colección:</b> ${e && e.ilimitada ? '∞ (tierra básica, se asume sin límite)' : (e ? e.qty : 0)} ${impresiones.filter((i) => !i.virtual).map((i) => `<span class="badge">${esc(i.set.toUpperCase())} #${esc(i.cn)} ×${i.qty}${i.foil ? ' ✨' : ''} · ${Object.entries(i.binders || {}).map(([b, q]) => esc(b) + (impresiones.length > 1 || Object.keys(i.binders).length > 1 ? ` (${q})` : '')).join(', ')}</span>`).join(' ')}</div>
    <div class="l">${RAREZA_ES[c.rarity] || c.rarity} · ${esc(c.setName || c.set)}</div>
    ${enMazos.length ? `<div class="l"><b>En mazos:</b> ${enMazos.map(esc).join(', ')}</div>` : ''}
    <div class="fila-btn">
      ${ctx.mazo ? `<button class="btn primario" id="det-add">＋ Agregar al mazo</button>` : ''}
      ${!ctx.mazo && esComandante(c) ? `<button class="btn primario" id="det-cmd">Armar mazo con este comandante</button>` : ''}
      <a class="btn" target="_blank" rel="noopener" href="https://scryfall.com/search?q=${encodeURIComponent('!"' + c.name + '"')}">Ver en Scryfall</a>
    </div></div>`;
  hoja(html);
  if (dorso) $('#det-girar').onclick = () => { const im = $('#det-img'); const lado = im.dataset.lado === '1' ? 0 : 1; im.dataset.lado = lado; im.src = img(c, 'normal', lado === 1); };
  if (ctx.mazo) $('#det-add').onclick = async () => { if (!S.porNombre.has(c.name)) await registrarExtra(c); agregar(ctx.mazo, c.name, 1); cerrarHoja(); pintarMazo(); toast('Agregada: ' + nom(c)); };
  if ($('#det-cmd')) $('#det-cmd').onclick = () => { cerrarHoja(); crearMazo([c.name]); };
}

/* ---------------- UI: lista de mazos ---------------- */
function pintarMazos() {
  const cont = $('#lista-mazos');
  if (!S.mazos.length) { cont.innerHTML = `<div class="vacio"><b>Aún no tienes mazos</b>Crea uno eligiendo un comandante de tu colección${window.MAZOS_INICIALES ? ', o carga los mazos de ejemplo desde Ajustes' : ''}.</div>`; return; }
  cont.innerHTML = S.mazos.map((m) => {
    const c = cartaPorNombre(m.comandantes[0] || '');
    const t = totalMazo(m); const av = avisosMazo(m).filter((a) => a[0] === 'mal').length;
    return `<div class="tarjeta" data-id="${m.id}">
      ${c && img(c) ? `<img class="arte" src="${esc(img(c, 'normal'))}" alt="">` : '<div class="arte"></div>'}
      <div class="info"><b>${esc(m.nombre)}</b><span>${m.comandantes.map((n) => { const x = cartaPorNombre(n); return x ? esc(nom(x)) : esc(n); }).join(' + ') || 'Sin comandante'}</span><br><span>${pipsHTML(identidad(m))} ${t}/100</span></div>
      <span class="badge ${av ? 'mal' : (t === 100 ? 'ok' : 'aviso')}">${av ? av + ' ⚠' : (t === 100 ? '✓' : (100 - t) + ' faltan')}</span></div>`;
  }).join('');
}
function crearMazo(comandantes) {
  const c = cartaPorNombre(comandantes[0]);
  const m = { id: uid(), nombre: c ? nom(c).split(',')[0] : 'Nuevo mazo', comandantes: comandantes.slice(0, 2), cartas: {}, creado: new Date().toISOString() };
  S.mazos.unshift(m); guardarMazos();
  abrirMazo(m.id);
}
function elegirComandante(cb, filtro) {
  let lista = [...S.porNombre.values()].map((e) => e.card).filter(esComandante);
  if (filtro) lista = lista.filter(filtro);
  lista.sort((a, b) => nom(a).localeCompare(nom(b), 'es'));
  const pintar = (q = '') => {
    const k = norm(q);
    const l = k ? lista.filter((c) => norm(nom(c) + ' ' + c.name + ' ' + c.type + ' ' + tip(c)).includes(k)) : lista;
    $('#cmd-lista').innerHTML = l.slice(0, 150).map((c) => filaHTML(c, { extra: (c.ci || []).join('') || 'C' })).join('') || '<div class="vacio">Ninguno coincide.</div>';
  };
  hoja(`<h2>Elige un comandante</h2><p class="l" style="color:var(--texto2)">${lista.length} criaturas legendarias legales en tu colección</p>
    <div class="buscar" style="margin-bottom:8px"><input id="cmd-q" type="search" placeholder="Buscar…" autocomplete="off"></div><div class="lista" id="cmd-lista"></div>`);
  $('#hoja').classList.add('alta');
  pintar();
  $('#cmd-q').oninput = (e) => pintar(e.target.value);
  $('#cmd-lista').onclick = (e) => { const f = e.target.closest('.fila'); if (!f) return; cerrarHoja(); cb(f.dataset.name); };
}

/* ---------------- UI: constructor ---------------- */
function abrirMazo(id) {
  S.mazo = S.mazos.find((m) => m.id === id); if (!S.mazo) return;
  S.panel = 'mazo';
  $$('.subtabs button').forEach((b) => b.classList.toggle('on', b.dataset.p === 'mazo'));
  $$('.panel').forEach((p) => p.classList.toggle('on', p.id === 'p-mazo'));
  $$('.vista').forEach((x) => x.classList.toggle('on', x.id === 'v-mazo'));
  $('#mazo-nombre').value = S.mazo.nombre;
  pintarMazo();
  resolverFaltantes(S.mazo).then((n) => { if (n && S.mazo && S.mazo.id === id) { pintarMazo(); toast(`${n} carta(s) buscadas en Scryfall`); } });
}
function pintarMazo() {
  const m = S.mazo; if (!m) return;
  const t = totalMazo(m);
  const cmds = m.comandantes.map((n) => { const c = cartaPorNombre(n); return `<span class="cmd" data-name="${esc(n)}">${c ? esc(nom(c)) : esc(n)}</span>`; }).join(' + ');
  $('#mazo-resumen').innerHTML = `${pipsHTML(identidad(m))} ${cmds || '<span class="cmd">Sin comandante</span>'} · <b style="color:${t === 100 ? 'var(--ok)' : 'var(--texto)'}">${t}/100</b>`;
  if (S.panel === 'mazo') pintarListaMazo();
  else if (S.panel === 'disp') pintarDisp();
  else pintarAnalisis();
}
function pintarListaMazo() {
  const m = S.mazo; const cont = $('#lista-mazo');
  const grupos = {};
  for (const n in m.cartas) { const c = cartaPorNombre(n); const t = c ? tipoPrincipal(c) : 'Otro'; (grupos[t] = grupos[t] || []).push({ n, c }); }
  let html = `<div class="grupo-t"><span>Comandante</span><span>${m.comandantes.length}</span></div>`;
  html += m.comandantes.map((n) => { const c = cartaPorNombre(n); return c ? filaHTML(c, { extra: 'CMD' }) : `<div class="fila faltante" data-name="${esc(n)}"><div class="mini"></div><div class="datos"><div class="nombre">${esc(n)}</div><div class="sub">No está en tu colección</div></div></div>`; }).join('');
  const cmd0 = cartaPorNombre(m.comandantes[0] || '');
  if (m.comandantes.length === 0 || (m.comandantes.length === 1 && cmd0 && tienePartner(cmd0))) html += `<div style="padding:4px 6px"><button class="btn chico" id="btn-add-cmd">${m.comandantes.length ? '＋ Compañero (Partner)' : '＋ Elegir comandante'}</button></div>`;
  for (const t of ORDEN_TIPOS) {
    if (!grupos[t]) continue;
    const q = grupos[t].reduce((a, x) => a + m.cartas[x.n], 0);
    html += `<div class="grupo-t"><span>${TIPO_ES[t]}</span><span>${q}</span></div>`;
    grupos[t].sort((a, b) => (a.c ? a.c.cmc : 0) - (b.c ? b.c.cmc : 0) || a.n.localeCompare(b.n));
    html += grupos[t].map(({ n, c }) => c ? filaHTML(c, { modo: 'mazo', enMazo: m.cartas[n] }) :
      `<div class="fila faltante" data-name="${esc(n)}"><div class="mini"></div><div class="datos"><div class="nombre">${esc(n)}</div><div class="sub">No está en tu colección</div></div><div class="accion"><button data-acc="menos">−</button><span class="n">${m.cartas[n]}</span></div></div>`).join('');
  }
  if (!Object.keys(m.cartas).length) html += `<div class="vacio"><b>Mazo vacío</b>Agrega cartas desde «Disponibles» o usa «Sugerir mazo» en el menú ⋯.</div>`;
  cont.innerHTML = html;
  const b = $('#btn-add-cmd');
  if (b) b.onclick = () => {
    const primero = cartaPorNombre(m.comandantes[0] || '');
    elegirComandante((n) => { if (m.comandantes.includes(n)) return; m.comandantes.push(n); guardarMazos(); if (!m.nombre || m.nombre === 'Nuevo mazo') { const c = cartaPorNombre(n); m.nombre = c ? nom(c).split(',')[0] : m.nombre; $('#mazo-nombre').value = m.nombre; } pintarMazo(); },
      primero ? (c) => c.name !== primero.name && (tienePartner(c) || !tienePartner(primero)) : null);
  };
}
function pintarDisp() {
  const m = S.mazo; const f = S.filtroD; const q = norm(f.q);
  $('#d-fuente-col').classList.toggle('on', f.fuente === 'col');
  $('#d-fuente-scry').classList.toggle('on', f.fuente === 'scry');
  $('#d-libres').classList.toggle('oculto', f.fuente === 'scry');
  $('#q-disp').placeholder = f.fuente === 'scry' ? 'Buscar en todas las cartas (Scryfall)…' : 'Buscar en cartas disponibles…';
  if (f.fuente === 'scry') { iniciarScryfall(); return; }
  $('#disp-mas').innerHTML = '';
  const { lista } = disponiblesPara(m);
  let l = lista.filter((x) => {
    if (f.tipo && tipoPrincipal(x.c) !== f.tipo) return false;
    if (f.rol === 'sinergia' ? x.sin <= 0 : (f.rol && !x.roles.includes(f.rol))) return false;
    if (f.libres && x.qty - x.otros.n - x.enMazo <= 0) return false;
    if (q && !norm([x.c.name, x.c.es && x.c.es.name, x.c.type, x.c.es && x.c.es.type, x.c.text, x.c.es && x.c.es.text].join(' | ')).includes(q)) return false;
    return true;
  });
  const ord = { puntaje: (a, b) => b.s - a.s || nom(a.c).localeCompare(nom(b.c), 'es'), nombre: (a, b) => nom(a.c).localeCompare(nom(b.c), 'es'), cmc: (a, b) => a.c.cmc - b.c.cmc || nom(a.c).localeCompare(nom(b.c), 'es') };
  l.sort(ord[f.orden] || ord.puntaje);
  S.listaDispVisible = l; S.mostradosD = 0;
  $('#conteo-disp').textContent = `${l.length} cartas de tu colección encajan en ${pipsTexto(identidad(m))}`;
  $('#lista-disp').innerHTML = l.length ? '' : '<div class="vacio"><b>Nada por aquí</b>Cambia los filtros o elige un comandante.</div>';
  masDisp();
}
const pipsTexto = (ci) => ci.length ? ci.map((k) => NOMBRE_COLOR[k]).join('/') : 'incoloro';
function masDisp() {
  if (S.filtroD.fuente === 'scry') return;
  const trozo = S.listaDispVisible.slice(S.mostradosD, S.mostradosD + PAGINA);
  if (!trozo.length) return;
  $('#lista-disp').insertAdjacentHTML('beforeend', trozo.map((x) => {
    const libres = x.qty - x.otros.n;
    const extra = [x.sin > 0 ? '★ sinergia' : '', ...x.roles.map((r) => NOMBRE_ROL[r]), x.otros.n ? `en ${x.otros.donde[0]}${x.otros.donde.length > 1 ? ' +' + (x.otros.donde.length - 1) : ''}` : ''].filter(Boolean).join(' · ');
    return filaHTML(x.c, { modo: 'disp', enMazo: x.enMazo, extra, agotada: x.enMazo >= maxCopias(x.c, x.qty) || (S.filtroD.libres && libres - x.enMazo <= 0), qty: x.qty });
  }).join(''));
  S.mostradosD += trozo.length;
}
function pintarAnalisis() {
  const m = S.mazo; const cont = $('#analisis');
  const cartas = []; for (const n in m.cartas) { const c = cartaPorNombre(n); if (c) cartas.push({ c, q: m.cartas[n] }); }
  const noT = cartas.filter((x) => !esTierra(x.c)); const tierras = cartas.filter((x) => esTierra(x.c)).reduce((a, x) => a + x.q, 0);
  const nNoT = noT.reduce((a, x) => a + x.q, 0);
  const prom = nNoT ? (noT.reduce((a, x) => a + x.c.cmc * x.q, 0) / nNoT).toFixed(2) : '0';
  const curva = [0, 0, 0, 0, 0, 0, 0, 0]; for (const x of noT) curva[Math.min(7, Math.round(x.c.cmc))] += x.q;
  const maxC = Math.max(1, ...curva);
  const rolesC = {}; for (const x of cartas) for (const r of roles(x.c)) rolesC[r] = (rolesC[r] || 0) + x.q;
  const tipos = {}; for (const x of cartas) { const t = tipoPrincipal(x.c); tipos[t] = (tipos[t] || 0) + x.q; }
  const sim = {}; for (const x of noT) for (const mch of (x.c.mana || '').matchAll(/\{([WUBRG])\}/g)) sim[mch[1]] = (sim[mch[1]] || 0) + x.q;
  const fuentes = {}; for (const x of cartas) if (esTierra(x.c)) for (const k of COLORES) if (new RegExp('\\{' + k + '\\}|any color|' + BASICAS[k] + '\\b').test(x.c.text || '') || (esBasica(x.c) && x.c.name === BASICAS[k])) fuentes[k] = (fuentes[k] || 0) + x.q;
  const av = avisosMazo(m);
  const ctx = temasDe(m.comandantes.map(cartaPorNombre).filter(Boolean));
  const compras = listaCompras(m);
  cont.innerHTML = `
    <div class="stats"><div class="stat"><b>${totalMazo(m)}</b><span>cartas</span></div><div class="stat"><b>${tierras}</b><span>tierras</span></div><div class="stat"><b>${prom}</b><span>coste medio</span></div></div>
    <div class="seccion"><h3>Avisos</h3><ul class="avisos">${av.map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join('')}</ul></div>
    <div class="seccion"><h3>Curva de maná</h3><div class="curva">${curva.map((v, i) => `<div><b>${v || ''}</b><i style="height:${Math.round(v / maxC * 80)}%"></i><span>${i === 7 ? '7+' : i}</span></div>`).join('')}</div></div>
    <div class="seccion"><h3>Plan del comandante</h3><div class="roles">${ctx.tribus.map((t) => `<span class="badge">${esc(t)}</span>`).join('')}${ctx.temas.map((t) => `<span class="badge">${esc(t.n)}</span>`).join('')}${!ctx.tribus.length && !ctx.temas.length ? '<span class="l">Sin temas detectados</span>' : ''}</div>
      <div class="fila-btn"><button class="btn chico" id="an-populares">Ver cartas populares para esta identidad (Scryfall)</button>${compras.length ? `<button class="btn chico" id="an-compras">Lista de compras: ${compras.reduce((a, x) => a + x.q, 0)}</button>` : ''}</div></div>
    <div class="seccion"><h3>Roles</h3><div class="roles">${Object.keys(NOMBRE_ROL).filter((r) => r !== 'sinergia').map((r) => `<span class="badge ${(rolesC[r] || 0) >= 8 || r === 'barrida' || r === 'contra' || r === 'tutor' ? '' : 'aviso'}">${NOMBRE_ROL[r]}: ${rolesC[r] || 0}</span>`).join('')}</div><p class="l" style="color:var(--texto2);font-size:13px">Recomendado: ~10 rampa, ~10 robo, ~10 remoción, 36-38 tierras.</p></div>
    <div class="seccion"><h3>Tipos</h3><div class="roles">${ORDEN_TIPOS.filter((t) => tipos[t]).map((t) => `<span class="badge">${TIPO_ES[t]}: ${tipos[t]}</span>`).join('')}</div></div>
    <div class="seccion"><h3>Colores</h3><div class="roles">${COLORES.filter((k) => sim[k] || fuentes[k]).map((k) => `<span class="badge"><i class="pip-s ${k}">${k}</i> símbolos ${sim[k] || 0} · fuentes ${fuentes[k] || 0}</span>`).join('')}</div></div>`;
  $('#an-populares').onclick = () => { S.filtroD.fuente = 'scry'; S.filtroD.rol = ctx.tribus.length ? 'sinergia' : ''; $('#d-rol').value = S.filtroD.rol; S.filtroD.orden = 'puntaje'; $('#d-orden').value = 'puntaje'; $$('.subtabs button')[1].click(); };
  if ($('#an-compras')) $('#an-compras').onclick = () => comprasHoja(m);
}
function menuMazo() {
  const m = S.mazo;
  hoja(`<h2>${esc(m.nombre)}</h2>
    <div class="fila-btn" style="flex-direction:column;align-items:stretch">
      <button class="btn primario" id="mn-sugerir">✨ Sugerir mazo (completar hasta 100)</button>
      <button class="btn" id="mn-sugerir-libres">✨ Sugerir solo con cartas libres (no usadas en otros mazos)</button>
      <button class="btn" id="mn-cambiar-cmd">Cambiar comandante</button>
      <button class="btn" id="mn-exportar">Exportar lista (ManaBox / Moxfield)</button>
      <button class="btn" id="mn-compras">Lista de compras (cartas que no tienes)</button>
      <button class="btn" id="mn-duplicar">Duplicar mazo</button>
      <button class="btn" id="mn-vaciar">Vaciar cartas (mantener comandante)</button>
      <button class="btn peligro" id="mn-borrar">Eliminar mazo</button>
    </div>`);
  const sug = (libres) => { if (!m.comandantes.length) { toast('Elige un comandante primero'); return; } sugerir(m, { libres }); cerrarHoja(); pintarMazo(); toast('Mazo completado: ' + totalMazo(m) + ' cartas'); };
  $('#mn-sugerir').onclick = () => sug(false);
  $('#mn-sugerir-libres').onclick = () => sug(true);
  $('#mn-cambiar-cmd').onclick = () => elegirComandante((n) => { m.comandantes = [n]; delete m.cartas[n]; guardarMazos(); pintarMazo(); });
  $('#mn-exportar').onclick = () => exportarHoja(m);
  $('#mn-compras').onclick = () => comprasHoja(m);
  $('#mn-duplicar').onclick = () => { const d = JSON.parse(JSON.stringify(m)); d.id = uid(); d.nombre += ' (copia)'; S.mazos.unshift(d); guardarMazos(); cerrarHoja(); abrirMazo(d.id); };
  $('#mn-vaciar').onclick = () => { if (confirm('¿Quitar todas las cartas del mazo?')) { m.cartas = {}; guardarMazos(); cerrarHoja(); pintarMazo(); } };
  $('#mn-borrar').onclick = () => { if (confirm('¿Eliminar el mazo «' + m.nombre + '»?')) { S.mazos = S.mazos.filter((x) => x.id !== m.id); guardarMazos(); cerrarHoja(); S.mazo = null; irA('mazos'); } };
}
function exportarHoja(m) {
  const texto = exportarTexto(m);
  hoja(`<h2>Exportar «${esc(m.nombre)}»</h2><p class="l" style="color:var(--texto2)">Formato «1 Nombre» compatible con ManaBox, Moxfield y Archidekt.</p>
    <textarea class="caja" id="exp-txt" readonly>${esc(texto)}</textarea>
    <div class="fila-btn"><button class="btn primario" id="exp-copiar">Copiar</button><button class="btn" id="exp-descargar">Descargar .txt</button>${navigator.share ? '<button class="btn" id="exp-compartir">Compartir</button>' : ''}</div>`);
  $('#exp-copiar').onclick = async () => { try { await navigator.clipboard.writeText(texto); toast('Copiado'); } catch { $('#exp-txt').select(); document.execCommand('copy'); toast('Copiado'); } };
  $('#exp-descargar').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain' })); a.download = m.nombre.replace(/[^\w\- ]/g, '') + '.txt'; a.click(); };
  if ($('#exp-compartir')) $('#exp-compartir').onclick = () => navigator.share({ title: m.nombre, text: texto }).catch(() => {});
}
function listaCompras(m) {
  const out = [];
  for (const n of m.comandantes) { const e = S.porNombre.get(n); if (!e || e.extra) out.push({ n, q: 1 }); }
  for (const n in m.cartas) { const e = S.porNombre.get(n); const q = m.cartas[n]; if (!e || e.extra) out.push({ n, q }); else if (!e.ilimitada && q > e.qty) out.push({ n, q: q - e.qty }); }
  return out;
}
function comprasHoja(m) {
  const l = listaCompras(m);
  const texto = l.map((x) => `${x.q} ${x.n}`).join('\n');
  hoja(`<h2>Lista de compras</h2><p class="l" style="color:var(--texto2)">${l.length ? `${l.reduce((a, x) => a + x.q, 0)} carta(s) del mazo que no están en tu colección.` : 'Todo el mazo está en tu colección. 🎉'}</p>
    ${l.length ? `<textarea class="caja" id="cmp-txt" readonly>${esc(texto)}</textarea><div class="fila-btn"><button class="btn primario" id="cmp-copiar">Copiar</button></div>` : ''}`);
  if ($('#cmp-copiar')) $('#cmp-copiar').onclick = async () => { try { await navigator.clipboard.writeText(texto); toast('Copiado'); } catch { $('#cmp-txt').select(); document.execCommand('copy'); toast('Copiado'); } };
}
function importarListaHoja() {
  hoja(`<h2>Importar lista</h2><p class="l" style="color:var(--texto2)">Pega una lista tipo «1 Nombre de carta» (ManaBox, Moxfield, Archidekt). La primera carta legendaria será el comandante.</p>
    <input id="imp-nombre" class="buscar" style="width:100%;background:var(--bg3);border:1px solid var(--linea);border-radius:10px;padding:9px 12px;margin-bottom:8px" placeholder="Nombre del mazo (opcional)">
    <textarea class="caja" id="imp-txt" placeholder="1 Koma, Cosmos Serpent&#10;2 Llanowar Elves&#10;1 Rampant Growth…"></textarea>
    <div class="fila-btn"><button class="btn primario" id="imp-ok">Importar</button></div>`);
  $('#imp-ok').onclick = () => {
    const r = parsearLista($('#imp-txt').value);
    if (!r.comandantes.length && !Object.keys(r.cartas).length) { toast('No se reconoció ninguna carta'); return; }
    const c = cartaPorNombre(r.comandantes[0] || '');
    const m = { id: uid(), nombre: $('#imp-nombre').value.trim() || (c ? nom(c).split(',')[0] : 'Mazo importado'), comandantes: r.comandantes, cartas: r.cartas, creado: new Date().toISOString() };
    S.mazos.unshift(m); guardarMazos(); cerrarHoja(); abrirMazo(m.id);
    if (r.noEncontradas.length) toast(`${r.noEncontradas.length} carta(s) no están en tu colección`);
  };
}

/* ---------------- UI: ajustes ---------------- */
function pintarAjustes() {
  const fl = flags();
  const fecha = S.meta && S.meta.generado ? new Date(S.meta.generado).toLocaleDateString('es-CL') : '—';
  const conEs = S.cartas.filter((c) => c.es).length;
  $('#ajustes').innerHTML = `
    <div class="aj-item"><div class="t"><b>Idioma de las cartas</b><span>Nombre, tipo y texto impreso en español cuando existe la edición en español.</span></div>
      <div class="idioma"><button data-lang2="es" class="${S.lang === 'es' ? 'on' : ''}">ES</button><button data-lang2="en" class="${S.lang === 'en' ? 'on' : ''}">EN</button></div></div>
    <div class="aj-item"><div class="t"><b>Tema</b><span>Oscuro u claro.</span></div>
      <div class="idioma"><button data-tema="dark" class="${(localStorage.getItem(LS.tema) || 'dark') === 'dark' ? 'on' : ''}">Oscuro</button><button data-tema="light" class="${localStorage.getItem(LS.tema) === 'light' ? 'on' : ''}">Claro</button></div></div>
    <div class="aj-item"><div class="t"><b>Tierras básicas ilimitadas</b><span>ManaBox no suele registrar básicas. Con esto activado, la app asume que tienes todas las Llanuras, Islas, Pantanos, Montañas y Bosques que necesites.</span></div>
      <div class="idioma"><button data-basicas="1" class="${basicasIlimitadas() ? 'on' : ''}">Sí</button><button data-basicas="0" class="${basicasIlimitadas() ? '' : 'on'}">No</button></div></div>
    <div class="aj-item"><div class="t"><b>Colección ${S.origen === 'importada' ? 'importada' : 'incluida'}</b><span>${S.cartas.length} impresiones · ${S.cartas.reduce((a, c) => a + (c.qty || 0), 0)} cartas · ${conEs} con español · datos del ${fecha}</span></div></div>
    <div class="aj-item"><div class="t"><b>Importar CSV de ManaBox</b><span>ManaBox → Colección → Exportar → CSV. Descarga los datos de Scryfall (necesita internet, unos minutos).</span></div>
      <label class="btn primario">Elegir CSV<input type="file" id="aj-csv" accept=".csv,text/csv" class="oculto"></label></div>
    <div id="aj-progreso" class="oculto" style="padding:0 16px 12px"><div class="l" id="aj-prog-txt">Preparando…</div><div class="progreso"><i id="aj-prog-bar"></i></div></div>
    ${S.origen === 'importada' && window.COLECCION ? `<div class="aj-item"><div class="t"><b>Volver a la colección incluida</b><span>Descarta la colección importada y usa la que viene con la app.</span></div><button class="btn" id="aj-restaurar">Restaurar</button></div>` : ''}
    ${window.MAZOS_INICIALES ? `<div class="aj-item"><div class="t"><b>Mazos de ejemplo</b><span>Carga los ${window.MAZOS_INICIALES.length} mazos armados anteriormente (Harald, Vito, Balmor, Ghalta, Omnath, Koma).${fl.ejemplos ? ' Ya cargados.' : ''}</span></div><button class="btn" id="aj-ejemplos">Cargar</button></div>` : ''}
    <div class="aj-item"><div class="t"><b>Copia de seguridad de mazos</b><span>Exporta o importa todos tus mazos en un archivo JSON.</span></div><button class="btn" id="aj-exp-mazos">Exportar</button><label class="btn">Importar<input type="file" id="aj-imp-mazos" accept=".json,application/json" class="oculto"></label></div>
    <div class="aj-item"><div class="t"><b>Borrar todos los mazos</b><span>No se puede deshacer.</span></div><button class="btn peligro" id="aj-borrar-mazos">Borrar</button></div>
    <div class="aj-item"><div class="t"><b>Acerca de</b><span>MTG Comandante · datos de cartas e imágenes de Scryfall · Magic: The Gathering es marca de Wizards of the Coast. App sin fines comerciales.</span></div></div>`;
  $$('#ajustes [data-lang2]').forEach((b) => b.onclick = () => setLang(b.dataset.lang2));
  $$('#ajustes [data-tema]').forEach((b) => b.onclick = () => { localStorage.setItem(LS.tema, b.dataset.tema); aplicarTema(); pintarAjustes(); });
  $$('#ajustes [data-basicas]').forEach((b) => b.onclick = () => { setFlag('basicas', b.dataset.basicas === '1'); indexar(); pintarAjustes(); });
  $('#aj-csv').onchange = (e) => { const f = e.target.files[0]; if (f) importarCSV(f); };
  if ($('#aj-restaurar')) $('#aj-restaurar').onclick = async () => { if (!confirm('¿Volver a la colección incluida en la app?')) return; await idb.del('coleccion'); await cargarColeccion(); pintarAjustes(); toast('Colección restaurada'); };
  if ($('#aj-ejemplos')) $('#aj-ejemplos').onclick = () => {
    let n = 0;
    for (const ej of window.MAZOS_INICIALES) {
      if (S.mazos.some((m) => m.nombre === ej.nombre)) continue;
      const r = parsearLista(ej.lista);
      S.mazos.push({ id: uid(), nombre: ej.nombre, comandantes: r.comandantes, cartas: r.cartas, creado: new Date().toISOString() }); n++;
    }
    guardarMazos(); setFlag('ejemplos', true);
    toast(n ? `${n} mazos cargados` : 'Ya estaban cargados'); irA('mazos');
  };
  $('#aj-exp-mazos').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S.mazos, null, 1)], { type: 'application/json' })); a.download = 'mazos-mtg.json'; a.click(); };
  $('#aj-imp-mazos').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const arr = JSON.parse(await f.text()); if (!Array.isArray(arr)) throw 0; let n = 0; for (const m of arr) { if (!m.id || !m.cartas) continue; if (S.mazos.some((x) => x.id === m.id)) continue; S.mazos.push(m); n++; } guardarMazos(); toast(`${n} mazos importados`); }
    catch { toast('Archivo no válido'); }
  };
  $('#aj-borrar-mazos').onclick = () => { if (confirm('¿Borrar TODOS los mazos?')) { S.mazos = []; guardarMazos(); toast('Mazos borrados'); } };
}
async function importarCSV(archivo) {
  const prog = $('#aj-progreso'), txtP = $('#aj-prog-txt'), bar = $('#aj-prog-bar');
  prog.classList.remove('oculto');
  try {
    const filas = MTG.parseCSV(await archivo.text());
    if (!filas.length || !('Scryfall ID' in filas[0])) throw new Error('El archivo no parece un CSV de ManaBox (falta la columna Scryfall ID).');
    const imps = MTG.agrupar(filas);
    txtP.textContent = `${filas.length} filas · ${imps.length} impresiones. Descargando datos…`;
    const nombres = { datos: 'Datos de cartas', 'español': 'Texto en español por set', 'español-nombre': 'Español por nombre' };
    const cartas = await MTG.enriquecer(imps, (p) => { txtP.textContent = `${nombres[p.fase] || p.fase}: ${p.hecho}/${p.total}`; bar.style.width = Math.round(p.hecho / p.total * 100) + '%'; });
    const meta = { generado: new Date().toISOString(), origen: archivo.name, filas: filas.length };
    await idb.set('coleccion', { cartas, meta });
    S.cartas = cartas; S.meta = meta; S.origen = 'importada'; indexar();
    toast(`Colección importada: ${cartas.length} impresiones`);
    pintarAjustes();
  } catch (e) {
    console.error(e); txtP.textContent = 'Error: ' + e.message; toast('No se pudo importar');
  }
}

/* ---------------- Idioma / tema ---------------- */
function setLang(l) {
  S.lang = l; localStorage.setItem(LS.lang, l);
  $$('header .idioma button').forEach((b) => b.classList.toggle('on', b.dataset.lang === l));
  const v = $$('.vista').find((x) => x.classList.contains('on')).id.slice(2);
  if (v === 'coleccion') pintarColeccion(); else if (v === 'mazos') pintarMazos(); else if (v === 'mazo') pintarMazo(); else pintarAjustes();
}
function aplicarTema() { const t = localStorage.getItem(LS.tema) || 'dark'; document.documentElement.dataset.theme = t; $('meta[name=theme-color]').content = t === 'light' ? '#f5f2ea' : '#14121b'; }

/* ---------------- Eventos ---------------- */
function eventos() {
  $$('nav.tabs button').forEach((b) => b.onclick = () => irA(b.dataset.v));
  $$('header .idioma button').forEach((b) => b.onclick = () => setLang(b.dataset.lang));
  $('#hoja-fondo').onclick = (e) => { if (e.target === e.currentTarget) cerrarHoja(); };
  // colección
  let tq;
  $('#q').oninput = (e) => { clearTimeout(tq); tq = setTimeout(() => { S.filtro.q = e.target.value; pintarColeccion(); }, 180); };
  $('#btn-limpiar').onclick = () => { S.filtro = { q: '', colores: new Set(), tipo: '', binder: '', rareza: '', orden: 'nombre', cmd: false }; $('#q').value = ''; $$('#chips-color .pip').forEach((b) => b.classList.remove('on')); $('#f-cmd').classList.remove('on'); ['#f-tipo', '#f-binder', '#f-rareza'].forEach((s) => $(s).value = ''); $('#f-orden').value = 'nombre'; pintarColeccion(); };
  $$('#chips-color .pip').forEach((b) => b.onclick = () => { const c = b.dataset.c; if (S.filtro.colores.has(c)) S.filtro.colores.delete(c); else S.filtro.colores.add(c); b.classList.toggle('on'); pintarColeccion(); });
  $('#f-tipo').onchange = (e) => { S.filtro.tipo = e.target.value; pintarColeccion(); };
  $('#f-binder').onchange = (e) => { S.filtro.binder = e.target.value; pintarColeccion(); };
  $('#f-rareza').onchange = (e) => { S.filtro.rareza = e.target.value; pintarColeccion(); };
  $('#f-orden').onchange = (e) => { S.filtro.orden = e.target.value; pintarColeccion(); };
  $('#f-cmd').onclick = () => { S.filtro.cmd = !S.filtro.cmd; $('#f-cmd').classList.toggle('on', S.filtro.cmd); pintarColeccion(); };
  $('#lista-coleccion').onclick = (e) => { const f = e.target.closest('.fila'); if (f) detalle(f.dataset.name); };
  new IntersectionObserver((en) => { if (en[0].isIntersecting) masColeccion(); }, { root: $('#v-coleccion .scroll'), rootMargin: '400px' }).observe($('#cent-coleccion'));
  // mazos
  $('#btn-nuevo-mazo').onclick = () => elegirComandante((n) => crearMazo([n]));
  $('#btn-importar-lista').onclick = importarListaHoja;
  $('#lista-mazos').onclick = (e) => { const t = e.target.closest('.tarjeta'); if (t) abrirMazo(t.dataset.id); };
  // constructor
  $('#btn-volver').onclick = () => { S.mazo = null; irA('mazos'); };
  $('#btn-menu-mazo').onclick = menuMazo;
  $('#mazo-nombre').onchange = (e) => { if (S.mazo) { S.mazo.nombre = e.target.value.trim() || 'Mazo'; guardarMazos(); } };
  $('#mazo-resumen').onclick = (e) => { const c = e.target.closest('.cmd'); if (c && c.dataset.name) detalle(c.dataset.name); };
  $$('.subtabs button').forEach((b) => b.onclick = () => { S.panel = b.dataset.p; $$('.subtabs button').forEach((x) => x.classList.toggle('on', x === b)); $$('.panel').forEach((p) => p.classList.toggle('on', p.id === 'p-' + b.dataset.p)); pintarMazo(); });
  const accionFila = async (e) => {
    const f = e.target.closest('.fila'); if (!f || !S.mazo) return;
    const b = e.target.closest('[data-acc]');
    if (S.panel === 'disp' && S.filtroD.fuente === 'scry') {
      const carta = S.scry.items.find((x) => x.name === f.dataset.name);
      if (!carta) return;
      if (b) { if (b.dataset.acc === 'mas') await registrarExtra(carta); agregar(S.mazo, carta.name, b.dataset.acc === 'mas' ? 1 : -1); pintarMazo(); }
      else detalle(carta.name, { mazo: S.mazo, carta });
      return;
    }
    if (b) { agregar(S.mazo, f.dataset.name, b.dataset.acc === 'mas' ? 1 : -1); if (S.panel === 'disp') { const x = S.listaDispVisible.find((y) => y.name === f.dataset.name); if (x) { x.enMazo = S.mazo.cartas[f.dataset.name] || 0; const nuevo = document.createElement('div'); nuevo.innerHTML = filaHTML(x.c, { modo: 'disp', enMazo: x.enMazo, extra: f.querySelector('.badge') ? f.querySelector('.badge').textContent : '', agotada: x.enMazo >= maxCopias(x.c, x.qty), qty: x.qty }); f.replaceWith(nuevo.firstElementChild); } const t = totalMazo(S.mazo); $('#mazo-resumen').querySelector('b').textContent = t + '/100'; } else pintarMazo(); }
    else detalle(f.dataset.name, { mazo: S.mazo });
  };
  $('#lista-mazo').onclick = accionFila;
  $('#lista-disp').onclick = accionFila;
  let tq2;
  $('#q-disp').oninput = (e) => { clearTimeout(tq2); tq2 = setTimeout(() => { S.filtroD.q = e.target.value; pintarDisp(); }, S.filtroD.fuente === 'scry' ? 600 : 180); };
  $('#d-tipo').onchange = (e) => { S.filtroD.tipo = e.target.value; pintarDisp(); };
  $('#d-rol').onchange = (e) => { S.filtroD.rol = e.target.value; pintarDisp(); };
  $('#d-orden').onchange = (e) => { S.filtroD.orden = e.target.value; pintarDisp(); };
  $('#d-libres').onclick = () => { S.filtroD.libres = !S.filtroD.libres; $('#d-libres').classList.toggle('on', S.filtroD.libres); pintarDisp(); };
  $('#d-fuente-col').onclick = () => { S.filtroD.fuente = 'col'; pintarDisp(); };
  $('#d-fuente-scry').onclick = () => { S.filtroD.fuente = 'scry'; pintarDisp(); };
  new IntersectionObserver((en) => { if (en[0].isIntersecting) masDisp(); }, { root: $('#p-disp .scroll'), rootMargin: '400px' }).observe($('#cent-disp'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarHoja(); });
}

/* ---------------- Inicio ---------------- */
async function iniciar() {
  aplicarTema();
  S.lang = localStorage.getItem(LS.lang) || 'es';
  $$('header .idioma button').forEach((b) => b.classList.toggle('on', b.dataset.lang === S.lang));
  cargarMazos();
  await cargarColeccion();
  eventos();
  pintarColeccion();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.MTGC = { S, sugerir, parsearLista, exportarTexto, avisosMazo, disponiblesPara, roles, puntaje, temasDe };
iniciar();
})();
