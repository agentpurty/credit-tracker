/* Device storage only (localStorage, keys "ct2-*"). The 1.x app's data (IndexedDB "credit-tracker",
 * "ct-settings", "ct-tiles") is left untouched. No photos and no phone numbers from scans are stored;
 * a phone number exists only on a marker the user added by hand. */
'use strict';
const Store = (() => {
  const K = { stops: 'ct2-stops', markers: 'ct2-markers', settings: 'ct2-settings', geo: 'ct2-geo', seq: 'ct2-seq' };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const listeners = new Set();
  const changed = () => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  const settings = Object.assign({ nav: 'apple', templates: null }, load(K.settings, {}));

  const api = {
    onChange: f => listeners.add(f),
    settings, saveSettings: () => { save(K.settings, settings); changed(); },
    stops: () => load(K.stops, []),
    markers: () => load(K.markers, []),
    /** Appends scanned stops in scan order; numbers keep counting up (never reused after a clear). */
    addStops(list) {
      const all = api.stops(); let seq = load(K.seq, 0);
      for (const f of list) all.push({ id: uid(), n: ++seq, name: f.name, street: f.street, city: f.city || '', state: f.state || '', zip: f.zip || '', added: Date.now(), ran: null });
      save(K.stops, all); save(K.seq, seq); changed();
    },
    updateStop(id, patch) { const all = api.stops(); const s = all.find(x => x.id === id); if (s) Object.assign(s, patch); save(K.stops, all); changed(); },
    clearStops(onlyUnrun) { const keep = onlyUnrun ? api.stops().filter(s => s.ran) : []; save(K.stops, keep); if (!keep.length) save(K.seq, 0); changed(); },
    addMarker(m) { const all = api.markers(); const x = { id: uid(), name: m.name, address: m.address, phone: m.phone || '', notes: '', notesAt: 0, added: Date.now(), log: [], ran: null }; all.push(x); save(K.markers, all); changed(); return x; },
    updateMarker(id, patch, quiet) { const all = api.markers(); const m = all.find(x => x.id === id); if (m) Object.assign(m, patch); save(K.markers, all); if (!quiet) changed(); return m; },
    deleteMarker(id) { save(K.markers, api.markers().filter(m => m.id !== id)); changed(); },
    geo: {
      get: q => load(K.geo, {})[q],
      put(q, v) { const g = load(K.geo, {}); g[q] = v; const ks = Object.keys(g); if (ks.length > 800) for (const k of ks.slice(0, ks.length - 800)) delete g[k]; save(K.geo, g); },
    },
  };
  return api;
})();

/* Geocoding: units stripped, one request at a time (≥1.1 s apart, OpenStreetMap Nominatim), results cached on the device. */
const Geo = (() => {
  let busy = false; const queue = []; const waiters = new Map();
  const query = a => SheetParser.stripUnits(a).replace(/\s+/g, ' ').trim();
  function lookup(address) {
    const q = query(address); const c = Store.geo.get(q);
    if (c && (c.lat != null || Date.now() - c.at < 864e5)) return Promise.resolve(c.lat != null ? c : null);
    return new Promise(res => { if (!waiters.has(q)) { waiters.set(q, []); queue.push(q); } waiters.get(q).push(res); pump(); });
  }
  async function pump() {
    if (busy || !queue.length) return; busy = true;
    while (queue.length) {
      const q = queue.shift(); let v = null;
      try {
        const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'en' } });
        if (r.status === 429) { queue.unshift(q); await new Promise(s => setTimeout(s, 30000)); continue; }
        const j = await r.json(); if (j && j[0]) v = { lat: +j[0].lat, lon: +j[0].lon, at: Date.now() };
        Store.geo.put(q, v || { lat: null, at: Date.now() });
      } catch (_) { /* offline: try again next time */ }
      (waiters.get(q) || []).forEach(f => f(v)); waiters.delete(q);
      await new Promise(s => setTimeout(s, 1100));
    }
    busy = false;
  }
  return { lookup, pending: () => queue.length };
})();
