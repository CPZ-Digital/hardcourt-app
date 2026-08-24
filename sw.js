const CACHE = 'hardcourt-v2';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

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

// ponytail: network-first pro HTML (sempre pega versao nova quando online), cache so serve offline
self.addEventListener('fetch', e=>{
  const isPage = e.request.mode === 'navigate' || e.request.url.endsWith('.html');
  if(isPage){
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
