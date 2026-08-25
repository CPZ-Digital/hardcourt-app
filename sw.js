const CACHE = 'hardcourt-v3';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './js/app-core.js', './js/app-scorer.js', './js/app-rankings.js', './js/app-athlete.js', './js/app-draw.js', './js/app-championship.js'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

// ponytail: network-first pro HTML e pro JS do app (sempre pega versao nova quando online,
// senao um modulo desatualizado fica preso em cache igual ja aconteceu com o index.html antes)
self.addEventListener('fetch', e=>{
  const isAppCode = e.request.mode === 'navigate' || e.request.url.endsWith('.html') || e.request.url.endsWith('.js');
  if(isAppCode){
    e.respondWith(
      fetch(e.request).then(res=>{
        const copy = res.clone();
        caches.open(CACHE).then(c=>c.put(e.request, copy));
        return res;
      }).catch(()=> caches.match(e.request).then(c=> c || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached=> cached || fetch(e.request).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(c=>c.put(e.request, copy));
      return res;
    }))
  );
});
