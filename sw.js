// Bump CACHE when publishing an update. New versions take over immediately (skipWaiting + clients.claim)
// and open pages reload themselves. App files are network-first (cache is the offline fallback).
// Cross-origin requests (map tiles, geocoding) are never intercepted.
const CACHE='credit-tracker-ios-1.3.0';
const ASSETS=['./','index.html','styles.css','js/db.js','js/model.js','js/app.js','js/map.js','changelog.json','manifest.webmanifest',
 'icons/icon-180.png','icons/icon-192.png','icons/icon-512.png','vendor/leaflet/leaflet.js','vendor/leaflet/leaflet.css',
 'vendor/leaflet/images/marker-icon.png','vendor/leaflet/images/marker-icon-2x.png','vendor/leaflet/images/marker-shadow.png','vendor/leaflet/images/layers.png','vendor/leaflet/images/layers-2x.png'];
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(u=>new Request(u,{cache:'reload'}))))); });
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{ if(e.data==='skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch',e=>{ const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin) return; // tiles etc. go straight to the network
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{ if(r.ok){ const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); } return r; })
    .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))));
});
