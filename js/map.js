/* Map tab: Leaflet + OpenStreetMap. Scanned stops are numbered in scan order; manual markers have their own pin.
 * No route button or routing on purpose (routing may come back later as a separate module). */
'use strict';
const MapView = (() => {
  const { $, esc, toast, modal, confirm, when } = UI;
  let map, layer, tiles, ready = false, selected = null, fittedN = -1, missingN = 0;
  const markerAddr = m => m.address;
  const stopAddr = s => SheetParser.address(s);

  function navUrl(address) {
    const d = encodeURIComponent(SheetParser.stripUnits(address));
    return Store.settings.nav === 'google'
      ? `https://www.google.com/maps/dir/?api=1&destination=${d}&travelmode=driving`
      : `https://maps.apple.com/?daddr=${d}&dirflg=d`;
  }
  const telUrl = p => 'tel:' + String(p).replace(/[^\d+]/g, '');

  function init() {
    if (ready) return; ready = true;
    map = L.map('map', { zoomControl: false, attributionControl: true }).setView([42.73, -84.55], 11);
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    let ok = 0, bad = 0;
    const esri = () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });
    tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' })
      .on('tileload', () => ok++)
      .on('tileerror', () => { if (++bad >= 4 && ok === 0 && tiles) { map.removeLayer(tiles); tiles = null; esri().addTo(map); } })
      .addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on('click', () => select(null));
    $('#btn-add-marker').onclick = addMarker;
    $('#btn-clear-unrun').onclick = async () => {
      const n = Store.stops().filter(s => !s.ran).length;
      if (!n) return toast('No unrun stops to clear');
      if (await confirm('Clear unrun stops?', `Removes ${n} scanned stop${n === 1 ? '' : 's'} with no run text sent yet. Stops that got a run text and your own markers stay.`, 'Clear unrun')) { Store.clearStops(true); select(null); toast(`Cleared ${n} unrun`); }
    };
    $('#btn-clear-all').onclick = async () => {
      const n = Store.stops().length;
      if (!n) return toast('No scanned stops to clear');
      if (await confirm('Clear all scanned stops?', `Removes all ${n} scanned stop${n === 1 ? '' : 's'}, run or not. Your own markers stay.`, 'Clear all')) { Store.clearStops(false); select(null); toast(`Cleared ${n} stops`); }
    };
    Store.onChange(render);
    render();
  }
  function shown() { if (!ready) init(); setTimeout(() => { map.invalidateSize(); if (!missingN && !selected) fit(); }, 60); }

  const stopIcon = s => L.divIcon({ className: 'pin-wrap', iconSize: [30, 30], iconAnchor: [15, 15],
    html: `<div class="pin ${s.ran ? 'ran' : ''} ${selected === s.id ? 'sel' : ''}">${s.n}</div>` });
  const markIcon = m => L.divIcon({ className: 'pin-wrap', iconSize: [30, 40], iconAnchor: [15, 38],
    html: `<div class="mpin ${m.ran ? 'ran' : ''} ${selected === m.id ? 'sel' : ''}"><span>★</span></div>` });

  function locate(item, addr, save) {
    if (item.lat != null && item.geoFor === addr) return true;
    Geo.lookup(addr).then(g => { if (g) save({ lat: g.lat, lon: g.lon, geoFor: addr }); else if (item.geoFor !== addr + '#none') save({ lat: null, lon: null, geoFor: addr + '#none' }); });
    return false;
  }
  function render() {
    if (!ready) return;
    layer.clearLayers();
    const stops = Store.stops(), marks = Store.markers();
    let missing = 0;
    for (const s of stops) {
      const a = stopAddr(s);
      if (!locate(s, a, p => Store.updateStop(s.id, p))) { if (s.geoFor !== a + '#none') missing++; continue; }
      L.marker([s.lat, s.lon], { icon: stopIcon(s), bubblingMouseEvents: false, zIndexOffset: s.ran ? 0 : 500 + s.n }).on('click', () => select(s.id)).addTo(layer);
    }
    for (const m of marks) {
      const a = markerAddr(m);
      if (!locate(m, a, p => Store.updateMarker(m.id, p))) { if (m.geoFor !== a + '#none') missing++; continue; }
      L.marker([m.lat, m.lon], { icon: markIcon(m), bubblingMouseEvents: false, zIndexOffset: 2000 }).on('click', () => select(m.id)).addTo(layer);
    }
    const lost = [...stops, ...marks].filter(x => x.geoFor && x.geoFor.endsWith('#none')).length;
    const st = $('#map-status');
    st.textContent = missing ? `Finding ${missing} address${missing === 1 ? '' : 'es'}…` : lost ? `${lost} address${lost === 1 ? '' : 'es'} not found on the map` : '';
    st.hidden = !st.textContent;
    $('#map-count').textContent = `${stops.filter(s => !s.ran).length} to go · ${stops.filter(s => s.ran).length} ran · ${marks.length} marker${marks.length === 1 ? '' : 's'}`;
    missingN = missing;
    if (!missing && !selected && located() !== fittedN) fit();
    card();
  }
  const located = () => [...Store.stops(), ...Store.markers()].filter(x => x.lat != null).length;
  /** Shows every pin; runs again only when the number of pins on the map changes. */
  function fit() {
    const pts = [...Store.stops(), ...Store.markers()].filter(x => x.lat != null).map(x => [x.lat, x.lon]);
    fittedN = pts.length; if (!pts.length) return;
    map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  }
  function select(id) { selected = id; render(); }

  const ranLine = x => x.ran ? `<div class="card-ran">✓ Run text ${esc(UI.when(x.ran.at))} · ${esc([x.ran.result, x.ran.note].filter(Boolean).join(', '))} <button class="link" data-act="undo">Undo</button></div>` : '';
  /** Go + Send run text side by side on every card (Android 9.3+). Sending marks the stop as run. */
  function card() {
    const c = $('#card');
    const s = Store.stops().find(x => x.id === selected), m = !s && Store.markers().find(x => x.id === selected);
    $('#map-view').classList.toggle('has-card', !!(s || m));
    if (!s && !m) { c.hidden = true; c.innerHTML = ''; return; }
    c.hidden = false;
    const it = s || m, a = s ? stopAddr(s) : markerAddr(m);
    const badge = s ? `<span class="badge ${s.ran ? 'ran' : ''}">${s.n}</span>` : `<span class="badge star ${m.ran ? 'ran' : ''}">★</span>`;
    c.innerHTML = `<div class="card-head">${badge}<div><div class="card-name">${esc(it.name)}</div><div class="card-addr">${esc(a)}</div>${m && m.phone ? `<a class="card-phone" href="${esc(telUrl(m.phone))}">📞 ${esc(m.phone)}</a>` : ''}${ranLine(it)}</div><button class="x" aria-label="Close">×</button></div>
      <div class="card-btns"><a class="btn primary" data-act="go" href="${esc(navUrl(a))}" target="_blank" rel="noopener">Go</a><button class="btn run" data-act="run">Send run text</button></div>
      ${m ? `<div class="card-btns"><button class="btn" data-act="notes">Notes${m.notes ? ' •' : ''}</button></div>` : ''}`;
    c.querySelector('[data-act=run]').onclick = () => RunText.pick(it.name, r => markRun(it.id, !!s, r));
    const u = c.querySelector('[data-act=undo]');
    if (u) u.onclick = () => s ? Store.updateStop(s.id, { ran: null }) : Store.updateMarker(m.id, { ran: null });
    if (m) c.querySelector('[data-act=notes]').onclick = () => notes(m.id);
    c.querySelector('.x').onclick = () => select(null);
  }
  function markRun(id, isStop, r) {
    const ran = { at: Date.now(), result: r.result, note: r.note };
    if (isStop) { if (!Store.stops().some(x => x.id === id)) throw new Error('that stop was cleared'); Store.updateStop(id, { ran }); return; }
    const m = Store.markers().find(x => x.id === id); if (!m) throw new Error('that marker was deleted');
    Store.updateMarker(id, { ran, log: (m.log || []).slice(-49).concat({ at: ran.at, text: 'Texted group: ' + [r.result, r.note].filter(Boolean).join(', ') }) });
  }

  /* ---- manual markers ---- */
  const formHtml = (m = {}) => `<label>Name<input name="name" autocomplete="off" value="${esc(m.name || '')}"></label>
    <label>Address<input name="address" autocomplete="off" placeholder="123 Main St, Town MI 48800" value="${esc(m.address || '')}"></label>
    <label>Phone number<input name="phone" type="tel" inputmode="tel" autocomplete="off" value="${esc(m.phone || '')}"></label><p class="err" hidden></p>`;
  const readForm = w => ({ name: w.querySelector('[name=name]').value.trim(), address: w.querySelector('[name=address]').value.trim(), phone: w.querySelector('[name=phone]').value.trim() });
  const checkForm = w => { const v = readForm(w), e = w.querySelector('.err'); if (!v.name || !v.address) { e.textContent = 'Name and address are needed.'; e.hidden = false; return false; } return true; };
  const asStop = v => { const parts = v.address.split(','); return { name: v.name, street: parts[0].trim(), city: '', state: '', zip: (v.address.match(/\b\d{5}\b(?!.*\b\d{5}\b)/) || [''])[0] }; };
  function dupes(v, skipId) {
    const me = asStop(v);
    const hits = Store.stops().filter(s => SheetParser.same(s, me)).map(s => `#${s.n} ${s.name}`);
    hits.push(...Store.markers().filter(m => m.id !== skipId && SheetParser.same(asStop(m), me)).map(m => `★ ${m.name}`));
    return hits;
  }
  async function warnDupes(v, skipId) {
    const hits = dupes(v, skipId);
    if (!hits.length) return true;
    return modal('Possible duplicate', `<p>This looks like a stop already on the map:</p><ul class="dupes">${hits.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`,
      [{ label: 'Cancel', value: false }, { label: 'Add anyway', value: true, kind: 'primary' }]);
  }
  async function addMarker() {
    const v = await modal('Add marker', formHtml(), [{ label: 'Cancel', value: null }, { label: 'Add', kind: 'primary', check: checkForm, value: readForm }], w => w.querySelector('input').focus());
    if (!v || !(await warnDupes(v))) return;
    const m = Store.addMarker(v);
    toast('Marker added');
    Geo.lookup(v.address).then(g => { if (g) { selected = m.id; fittedN = located(); map.setView([g.lat, g.lon], Math.max(map.getZoom(), 14)); render(); } else toast('Address not found on the map; check it in Notes → Edit'); });
  }

  /* ---- notes page ---- */
  function notes(id) {
    const m = Store.markers().find(x => x.id === id); if (!m) return;
    const p = $('#notes-page'); p.hidden = false;
    p.innerHTML = `<header class="bar"><button class="link" data-act="back">‹ Map</button><h2>${esc(m.name)}</h2><span></span></header>
      <div class="notes-body"><div class="notes-meta"><div>${esc(m.address)}</div>${m.phone ? `<a href="${esc(telUrl(m.phone))}">📞 ${esc(m.phone)}</a>` : ''}</div>
      <textarea id="notes-text" placeholder="Notes for this stop…">${esc(m.notes || '')}</textarea>
      <div class="notes-saved" id="notes-saved">${m.notesAt ? 'Saved ' + esc(when(m.notesAt)) : 'Saves automatically'}</div>
      ${(m.log || []).length ? `<details class="notes-log"><summary>Edit history (${m.log.length})</summary><ul>${m.log.slice().reverse().map(l => `<li><b>${esc(when(l.at))}</b> ${esc(l.text)}</li>`).join('')}</ul></details>` : ''}
      <div class="notes-btns"><a class="btn primary" href="${esc(navUrl(m.address))}" target="_blank" rel="noopener">Go</a><button class="btn" data-act="edit">Edit marker</button><button class="btn danger" data-act="del">Delete marker</button></div></div>`;
    const ta = $('#notes-text'); let t, last = m.notes || '';
    const flush = () => { clearTimeout(t); const text = ta.value; if (text === last) return; const cur = Store.markers().find(x => x.id === id); if (!cur) return;
      const at = Date.now(); const log = (cur.log || []).slice(-49);
      if (log.length && at - log[log.length - 1].at < 5 * 60e3) log[log.length - 1] = { at, text: text.slice(0, 120) }; else log.push({ at, text: text.slice(0, 120) });
      Store.updateMarker(id, { notes: text, notesAt: at, log }, true); last = text; $('#notes-saved').textContent = 'Saved ' + when(at); };
    ta.oninput = () => { $('#notes-saved').textContent = 'Saving…'; clearTimeout(t); t = setTimeout(flush, 600); };
    ta.onblur = flush;
    const close = () => { flush(); p.hidden = true; p.innerHTML = ''; render(); };
    p.querySelector('[data-act=back]').onclick = close;
    p.querySelector('[data-act=edit]').onclick = async () => {
      flush(); const cur = Store.markers().find(x => x.id === id);
      const v = await modal('Edit marker', formHtml(cur), [{ label: 'Cancel', value: null }, { label: 'Save', kind: 'primary', check: checkForm, value: readForm }]);
      if (!v || !(await warnDupes(v, id))) return;
      Store.updateMarker(id, v); notes(id);
    };
    p.querySelector('[data-act=del]').onclick = async () => {
      if (!(await confirm('Delete marker?', `Deletes “${m.name}” and its notes from this phone.`, 'Delete'))) return;
      clearTimeout(t); Store.deleteMarker(id); selected = null; p.hidden = true; p.innerHTML = ''; toast('Marker deleted');
    };
  }
  return { init, shown, notes, select, fit };
})();
