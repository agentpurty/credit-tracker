/* 2.1: ZIP code areas (U.S. Census Bureau 2020 ZCTAs, mid-Michigan, bundled in data/, no keys, no network
 * besides this site). Port of the Android ZIP overlay: blue outlines under the pins, ZIP numbers on white chips
 * above the pins (they never take taps, so pins under a label still work), and the selected pin above the labels.
 * The data file (~180 KB gzipped) is only downloaded when the switch is first turned on. Nothing below zoom 9. */
'use strict';
const ZipLayer = (() => {
  const KEY = 'ct2-zip-on', URL = 'data/zcta_mid_michigan.json', MIN_ZOOM = 9;
  let map = null, zones = null, loading = null, lines = null, labels = null, renderer = null, status = () => {};
  const isOn = () => { try { return localStorage.getItem(KEY) === '1'; } catch (_) { return false; } };

  function attach(m, onStatus) {
    map = m; status = onStatus || status;
    // Panes: outlines under the pins (markerPane 600), labels above them, the selected pin above the labels.
    map.createPane('zipLines').style.zIndex = 350;
    const lp = map.createPane('zipLabels'); lp.style.zIndex = 640; lp.style.pointerEvents = 'none';
    map.createPane('selPin').style.zIndex = 660;
    map.on('zoomend moveend', paint);
    if (isOn()) setOn(true);
  }

  function load() {
    if (zones) return Promise.resolve(zones);
    if (!loading) loading = fetch(URL).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(j => {
      zones = j.zones.map(z => {
        const rings = z.r.map(r => { const ll = []; for (let i = 0; i < r.length; i += 2) ll.push([r[i + 1], r[i]]); return ll; });
        let s = 90, w = 180, n = -90, e = -180;
        for (const r of rings) for (const [la, lo] of r) { if (la < s) s = la; if (la > n) n = la; if (lo < w) w = lo; if (lo > e) e = lo; }
        return { zip: z.z, lab: z.l, rings, bounds: L.latLngBounds([s, w], [n, e]) };
      });
      return zones;
    }).catch(e => { loading = null; throw e; });
    return loading;
  }

  function build() {
    renderer = L.canvas({ pane: 'zipLines', padding: 0.3 });
    lines = L.layerGroup(zones.map(z => L.polygon(z.rings, { renderer, pane: 'zipLines', interactive: false, fill: false,
      color: '#1E4FBF', opacity: 0.82, weight: 2.2, lineJoin: 'round', smoothFactor: 1.2 })));
    labels = L.layerGroup();
  }

  /** Labels only for ZIPs whose label point is in view (cheap at any count). */
  function paint() {
    if (!map || !zones || !isOn()) return;
    const zoomOk = map.getZoom() >= MIN_ZOOM;
    if (zoomOk && !map.hasLayer(lines)) lines.addTo(map);
    if (!zoomOk) hideLines();
    labels.clearLayers();
    if (zoomOk) {
      const view = map.getBounds().pad(0.1);
      for (const z of zones) if (view.contains(z.lab)) L.marker(z.lab, { pane: 'zipLabels', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'zip-wrap', iconSize: null, html: `<span class="zip-chip">${z.zip}</span>` }) }).addTo(labels);
      if (!map.hasLayer(labels)) labels.addTo(map);
    }
    status(zoomOk ? `${zones.length} ZIP areas · U.S. Census 2020 ZCTAs (mid-Michigan)` : 'Zoom in to see ZIP code areas.');
  }

  /** Outlines and their canvas both leave the map (an empty canvas would still sit in the pane). */
  function hideLines() { if (lines && map.hasLayer(lines)) map.removeLayer(lines); if (renderer && map.hasLayer(renderer)) map.removeLayer(renderer); }

  function setOn(on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {}
    if (!map) return;
    if (!on) { hideLines(); if (labels) map.removeLayer(labels); status('Off'); return; }
    status('Loading ZIP areas…');
    load().then(() => { if (!lines) build(); paint(); }).catch(e => status('Couldn\u2019t load ZIP areas (' + e.message + '). Check the connection and try again.'));
  }
  return { attach, setOn, isOn, MIN_ZOOM };
})();
