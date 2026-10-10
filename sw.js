// Bump CACHE when publishing an update; users then see "Update available, tap to refresh".
// All paths are relative, so this works at / or under a subpath such as /credit-tracker/.
const CACHE='credit-tracker-ios-1.1.0';
const ASSETS=['./','index.html','styles.css','js/db.js','js/model.js','js/app.js','js/map.js','changelog.json','manifest.webmanifest',
 'icons/icon-180.png','icons/icon-192.png','icons/icon-512.png','vendor/leaflet/leaflet.js','vendor/leaflet/leaflet.css',
 'vendor/leaflet/images/marker-icon.png','vendor/leaflet/images/marker-icon-2x.png','vendor/leaflet/images/marker-shadow.png','vendor/leaflet/images/layers.png','vendor/leaflet/images/layers-2x.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('credit-tracker-ios')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{ if(e.data==='skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch',e=>{ const u=new URL(e.request.url);
  // Map tiles: network first, fall back to anything cached.
  if(/basemaps\.cartocdn\.com/.test(u.host)){ e.respondWith(caches.open('ct-tiles').then(c=>fetch(e.request).then(r=>{ c.put(e.request,r.clone()); return r; }).catch(()=>c.match(e.request)))); return; }
  if(e.request.method!=='GET'||u.origin!==location.origin) return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)));
});
