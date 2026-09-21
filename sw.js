/* Service worker: app disponible sin conexión + caché de imágenes de Scryfall */
const VERSION = 'mtgc-v1';
const APP = ['./', './index.html', './app.js', './scryfall.js', './data/coleccion.js', './data/mazos-iniciales.js', './data/basicas.js','./manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];
const IMAGENES = 'mtgc-img';
const MAX_IMG = 1500;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== IMAGENES).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'cards.scryfall.io') {
    e.respondWith(caches.open(IMAGENES).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) { c.put(e.request, r.clone()); limpiar(c); }
      return r;
    }).catch(() => new Response('', { status: 504 })));
    return;
  }
  if (url.hostname === 'api.scryfall.com') return; // siempre red
  if (url.origin === location.origin) {
    // red primero (para recibir actualizaciones), caché si no hay conexión
    e.respondWith(fetch(e.request).then((r) => {
      if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, r.clone()));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))));
  }
});
let limpiando = false;
async function limpiar(c) {
  if (limpiando) return; limpiando = true;
  try { const ks = await c.keys(); if (ks.length > MAX_IMG) for (const k of ks.slice(0, ks.length - MAX_IMG)) await c.delete(k); }
  finally { limpiando = false; }
}
