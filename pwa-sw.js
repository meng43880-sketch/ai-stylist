/* pwa-sw.js — сервис-воркер sainvio: офлайн-оболочка и уведомления. API не кешируем никогда. */
'use strict';
const VER = 'sainvio-shell-v3';
const SHELL = ['/', '/index.html', '/styles.css', '/ui.css', '/features.css', '/theme.css', '/responsive.css', '/demo.js', '/app.js', '/chat.js', '/features.js', '/manifest.webmanifest', '/icon-192.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return; // API и чужие домены — мимо кеша
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(VER).then((c) => c.put('/index.html', cp)); return r; }).catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))));
    return;
  }
  /* статика: отдаём из кеша сразу и обновляем в фоне */
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r && r.ok) { const cp = r.clone(); caches.open(VER).then((c) => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (er) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'sainvio', { body: d.body || 'Есть новости по ценам', icon: '/icon-192.png', badge: '/icon-192.png', tag: 'price', data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.postMessage({ type: 'open' }); return c.focus(); } }
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || '/');
  }));
});
