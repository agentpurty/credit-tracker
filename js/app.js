/* Credit Tracker 2.1: Scanner + Map. Everything stays on this phone. */
'use strict';
(() => {
  const { $, esc, toast, modal } = UI;
  const VERSION = '2.1';

  /* ---- tabs ---- */
  function tab(name) {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    $('#scan-view').hidden = name !== 'scan'; $('#map-view').hidden = name !== 'map';
    $('#title').textContent = name === 'map' ? 'Map' : 'Scanner';
    if (name === 'map') MapView.shown();
  }
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => tab(b.dataset.tab));

  /* ---- scanner ---- */
  let busy = false;
  const status = (t, pct) => { $('#scan-status').textContent = t || ''; const bar = $('#scan-bar'); bar.hidden = pct == null; if (pct != null) bar.value = pct; };
  function counts() { const s = Store.stops(); $('#scan-count').textContent = s.length ? `${s.filter(x => !x.ran).length} stop${s.length === 1 ? '' : 's'} to go on the map` : 'No stops yet'; }
  Store.onChange(counts);

  async function scan(files) {
    files = [...files].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name));
    if (!files.length || busy) return;
    busy = true; document.body.classList.add('busy');
    const found = []; let failed = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const pre = files.length > 1 ? `Photo ${i + 1} of ${files.length}: ` : '';
        status(pre + 'Starting…', (i / files.length) * 100);
        try { found.push(...await OCR.readPhoto(files[i], t => status(pre + t, (i / files.length) * 100))); }
        catch (e) { console.error(e); failed++; }
        files[i] = null;   // let the photo go
      }
    } finally {
      busy = false; document.body.classList.remove('busy'); status('');
      $('#cam').value = ''; $('#pics').value = '';
      OCR.stop();   // free the reader's memory between scans
    }
    if (!found.length) { toast(failed ? 'Could not read that photo. Try again with more light, holding steady.' : 'No sheets found. Fill the frame with the sheets and try again.', 5000); return; }
    review(found, failed);
  }

  const joinCity = f => [[f.city, f.state].filter(Boolean).join(' '), f.zip].filter(Boolean).join(' ');
  function splitCity(t) {
    const m = t.trim().match(/^(.*?)[\s,]+([A-Za-z]{2})\.?\s*(\d{5})?(?:-\d{4})?$/);
    if (m) return { city: m[1].trim(), state: m[2].toUpperCase(), zip: m[3] || '' };
    const z = t.match(/\b(\d{5})\b/); return { city: t.replace(/\b\d{5}(-\d{4})?\b/, '').trim(), state: '', zip: z ? z[1] : '' };
  }
  async function review(found, failed) {
    // drop anything that looks like a phone number, just in case
    const PH = new RegExp(SheetParser.PHONEISH.source, 'g');
    found = found.map(f => ({ ...f, name: f.name.replace(PH, '').trim(), street: f.street.replace(PH, '').trim() }));
    const existing = Store.stops();
    const dup = found.map((f, i) => existing.some(e => SheetParser.same(e, f)) || found.slice(0, i).some(k => SheetParser.same(k, f)));
    const rows = found.map((f, i) => `<div class="rv ${dup[i] ? 'dup' : ''}" data-i="${i}"><input type="checkbox" ${dup[i] ? '' : 'checked'} aria-label="Add">
      <div class="rv-f"><input class="rv-name" value="${esc(f.name)}" aria-label="Name"><input class="rv-street" value="${esc(f.street)}" aria-label="Street"><input class="rv-city" value="${esc(joinCity(f))}" aria-label="City, state, ZIP">${dup[i] ? '<span class="tag">Already added</span>' : ''}</div></div>`).join('');
    const nd = dup.filter(Boolean).length;
    const v = await modal(`Found ${found.length} sheet${found.length === 1 ? '' : 's'}`,
      `<p class="hint">In scan order. Fix anything misread; unticked rows are skipped.${nd ? ` ${nd} duplicate${nd === 1 ? '' : 's'} unticked.` : ''}${failed ? ` ${failed} photo${failed === 1 ? '' : 's'} could not be read.` : ''}</p><div class="rv-list">${rows}</div>`,
      [{ label: 'Cancel', value: null }, { label: 'Add to map', kind: 'primary', value: w => [...w.querySelectorAll('.rv')].map(r => ({ on: r.querySelector('[type=checkbox]').checked, name: r.querySelector('.rv-name').value.trim(), street: r.querySelector('.rv-street').value.trim(), ...splitCity(r.querySelector('.rv-city').value) })) }]);
    if (!v) return toast('Nothing added');
    const picked = v.filter(r => r.on && r.name && r.street);
    const { kept, skipped } = SheetParser.unique(picked, Store.stops());
    Store.addStops(kept);
    const unticked = v.length - picked.length;
    toast(`Added ${kept.length} · skipped ${skipped + unticked} duplicate${skipped + unticked === 1 ? '' : 's'}/unticked`, 4500);
    if (kept.length) tab('map');
  }
  $('#cam').onchange = e => scan(e.target.files);
  $('#pics').onchange = e => scan(e.target.files);
  $('#btn-cam').onclick = () => $('#cam').click();
  $('#btn-pics').onclick = () => $('#pics').click();

  /* ---- settings / about ---- */
  $('#gear').onclick = async () => {
    let log = '';
    try { const c = await (await fetch('changelog.json')).json(); log = c.map(e => `<div class="cl"><b>${esc(e.version)}</b> <span>${esc(e.date)}</span><ul>${e.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`).join(''); } catch (_) { log = '<p>Change Log is not available offline yet.</p>'; }
    const nav = Store.settings.nav;
    const v = await modal('Settings', `<div class="set"><div class="set-h">Directions open in</div>
      <label class="radio"><input type="radio" name="nav" value="apple" ${nav !== 'google' ? 'checked' : ''}> Apple Maps</label>
      <label class="radio"><input type="radio" name="nav" value="google" ${nav === 'google' ? 'checked' : ''}> Google Maps</label></div>
      <div class="set"><div class="set-h">About</div><p>Credit Tracker ${VERSION}. Sheets are read on this phone; photos never leave it and are not saved. Phone numbers on sheets are never read. Send run text opens Messages with the text filled in and no recipient; you pick your group thread and tap Send. Stops, markers and notes are stored only on this phone. Map © OpenStreetMap contributors; addresses are looked up with OpenStreetMap (street address only, no names).</p></div>
      <details class="set" id="set-tpl"><summary class="set-h">Run text templates</summary>${RunText.editorHtml()}</details>
      <details class="set"><summary class="set-h">Change Log</summary>${log}</details>`,
      [{ label: 'Done', kind: 'primary', value: w => ({ nav: w.querySelector('[name=nav]:checked').value, templates: RunText.readEditor(w) }) }], w => RunText.wireEditor(w));
    if (v) { Store.settings.nav = v.nav; Store.settings.templates = JSON.stringify(v.templates) === JSON.stringify(RunText.DEFAULTS) ? null : v.templates; Store.saveSettings(); }
  };

  counts();
  tab(Store.stops().length || Store.markers().length ? 'map' : 'scan');

  /* ---- offline + updates ---- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js', { scope: './' }).then(reg => {
      if (reg.waiting) reg.waiting.postMessage('skipWaiting');
      reg.update();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update(); });
    }).catch(() => {});
    const had = !!navigator.serviceWorker.controller; let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!had || reloaded) return;
      if (busy || document.querySelector('.modal-wrap') || !$('#notes-page').hidden) { $('#update').hidden = false; $('#update').onclick = () => location.reload(); return; }
      reloaded = true; location.reload();
    });
  }
})();
