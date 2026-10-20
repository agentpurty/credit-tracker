// Bump CACHE when publishing an update. New versions take over immediately (skipWaiting + clients.claim)
// and open pages reload themselves. App files are network-first (cache is the offline fallback); the
// text reader (vendor/tesseract, ~11 MB) is cache-first so it is only downloaded once.
// data/ (ZIP areas, ~700 KB) is not pre-cached: it is fetched the first time the ZIP switch is turned on, then kept
// for offline use like the app files. Cross-origin requests (map tiles, address lookups) are never intercepted. Nothing here touches app data.
const CACHE='credit-tracker-ios-2.1.0';
const ASSETS=['./','index.html','styles.css','js/parser.js','js/ui.js','js/store.js','js/ocr.js','js/runtext.js','js/zip.js','js/map.js','js/app.js','changelog.json','manifest.webmanifest',
 'icons/icon-180.png','icons/icon-192.png','icons/icon-512.png','vendor/leaflet/leaflet.js','vendor/leaflet/leaflet.css',
 'vendor/leaflet/images/marker-icon.png','vendor/leaflet/images/marker-icon-2x.png','vendor/leaflet/images/marker-shadow.png','vendor/leaflet/images/layers.png','vendor/leaflet/images/layers-2x.png',
 'vendor/tesseract/tesseract.min.js','vendor/tesseract/worker.min.js','vendor/tesseract/core/tesseract-core-lstm.wasm.js','vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js','vendor/tesseract/lang/eng.traineddata.gz'];
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(u=>new Request(u,{cache:'reload'}))))); });
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('credit-tracker-ios-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{ if(e.data==='skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch',e=>{ const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin) return;
  if(u.pathname.includes('/vendor/tesseract/')){ e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(n=>{ if(n.ok){ const cp=n.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); } return n; }))); return; }
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{ if(r.ok){ const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); } return r; })
    .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||(e.request.mode==='navigate'?caches.match('index.html'):Response.error()))));
});
