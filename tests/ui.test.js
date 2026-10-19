// Headless UI flow test (made-up people only). Needs: playwright, a local static server on PORT, Chrome.
// Run: PORT=8765 node tests/ui.test.js   (screenshots go to $SHOTS, default /tmp)
'use strict';
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765, BASE = `http://127.0.0.1:${PORT}/`, SHOTS = process.env.SHOTS || '/tmp';
let fails = 0; const ok = (name, c, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + name + (c ? '' : '  ' + extra)); if (!c) fails++; };

// Made-up sheets. Phone numbers are printed on them to prove they are never read.
const SHEETS = [
  ['Dana Example', '4400 Birch Rd apt#30', 'Holt MI', '48842'],
  ['Pat Sample', '210 Maple Hollow Dr', 'Mason MI', '48854'],
  ['Robin Test', '1517 Cedar Ln', 'Lansing MI', '48910'],
  ['Lee Fixture', '88 Willow Ct', 'Okemos MI', '48864'],
];
const COORDS = { 'birch': [42.6406, -84.5153], 'maple hollow': [42.5795, -84.4436], 'cedar': [42.7012, -84.5472], 'willow': [42.7187, -84.4269], 'oak': [42.6702, -84.4950], 'pine': [42.7330, -84.5555] };

function drawSheets(sheets) {   // runs in the page; returns a PNG data URL of a 2x2 fan of sheets
  const c = document.createElement('canvas'); c.width = 2200; c.height = 1500; const g = c.getContext('2d');
  g.fillStyle = '#6b5a4a'; g.fillRect(0, 0, c.width, c.height);
  sheets.forEach(([name, street, city, zip], i) => {
    const x = 60 + (i % 2) * 1060, y = 60 + Math.floor(i / 2) * 720, h = 26;
    g.fillStyle = '#fff'; g.fillRect(x, y, 1000, 660);
    g.fillStyle = '#111'; g.font = `${h}px Arial`;
    const t = (s, dx, dy) => g.fillText(s, x + 30 + dx, y + 50 + dy);
    t('Route 1', 0, 0); t('Delivery', 620, 0);
    t('Customer', 0, 50); t('Work', 470, 50); t('Phone', 760, 50);
    t('Customer since: 11/18/2021', 0, 90); t('Acme Supply', 470, 90);
    t(name, 0, 130); t('123 Market St', 470, 130); t('(555) 010-12' + (10 + i), 760, 130);
    t(street, 0, 170); t('Lansing MI', 470, 170);
    t(city, 0, 210); t('(555) 010-34' + (10 + i), 470, 210);
    t(zip, 0, 250);
    t('Total number 0 0 0', 0, 340); t('Total amount $0.00 $0.00', 0, 380);
  });
  return c.toDataURL('image/png');
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const geoQueries = [];
  await ctx.route('https://nominatim.openstreetmap.org/**', r => {
    const q = new URL(r.request().url()).searchParams.get('q').toLowerCase(); geoQueries.push(q);
    const k = Object.keys(COORDS).find(k => q.includes(k));
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(k ? [{ lat: String(COORDS[k][0]), lon: String(COORDS[k][1]) }] : []) });
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/tile|Failed to load resource/.test(m.text())) errors.push(m.text()); });

  // Old 1.x data that must survive untouched
  await page.goto(BASE + 'manifest.webmanifest');
  await page.evaluate(() => new Promise(res => {
    localStorage.setItem('ct-settings', '{"old":true}'); localStorage.setItem('ct-tiles', 'x');
    const o = indexedDB.open('credit-tracker', 1); o.onupgradeneeded = () => o.result.createObjectStore('profiles', { keyPath: 'id' });
    o.onsuccess = () => { const tx = o.result.transaction('profiles', 'readwrite'); tx.objectStore('profiles').put({ id: 1, name: 'Old Record' }); tx.oncomplete = () => { o.result.close(); res(); }; };
  }));

  await page.goto(BASE);
  await page.waitForSelector('#scan-view:not([hidden])');
  ok('opens on Scanner when empty', await page.isVisible('#btn-cam') && await page.isVisible('#btn-pics'));
  ok('only Scanner + Map tabs', (await page.$$eval('#tabs button', b => b.map(x => x.dataset.tab))).join() === 'scan,map');
  ok('no route button / routing UI', !/route/i.test(await page.evaluate(() => [...document.querySelectorAll('button,a')].map(b => b.textContent).join(' '))));
  await page.screenshot({ path: `${SHOTS}/ct-ios-2.0-scanner.png` });

  // ---- scan a synthetic photo end to end (real tesseract in the page) ----
  const png = Buffer.from((await page.evaluate(drawSheets, SHEETS)).split(',')[1], 'base64');
  const t0 = Date.now();
  await page.setInputFiles('#pics', { name: 'sheets.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('.modal .rv', { timeout: 240000 });
  console.log(`  (OCR took ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const rows = await page.$$eval('.rv', rs => rs.map(r => ({ n: r.querySelector('.rv-name').value, s: r.querySelector('.rv-street').value, c: r.querySelector('.rv-city').value, on: r.querySelector('[type=checkbox]').checked })));
  console.log('  read:', JSON.stringify(rows));
  ok('read all 4 sheets in scan order', rows.map(r => r.n).join('|') === SHEETS.map(s => s[0]).join('|'), JSON.stringify(rows.map(r => r.n)));
  ok('unit-last + city/zip', rows[0] && rows[0].s === '4400 Birch Rd apt 30' && rows[0].c === 'Holt MI 48842', JSON.stringify(rows[0]));
  ok('Work column ignored', !rows.some(r => /Market|Acme/.test(r.s + r.n)));
  ok('no phone numbers read', !JSON.stringify(rows).match(/555|010-/));
  ok('photo not kept (inputs cleared)', await page.$eval('#pics', i => i.files.length === 0));
  await page.click('.modal .btn.primary');
  await page.waitForSelector('#toast.show');
  ok('toast added 4', /Added 4/.test(await page.textContent('#toast')), await page.textContent('#toast'));

  // ---- same photo again: all duplicates ----
  await page.click('#tabs [data-tab=scan]');
  await page.setInputFiles('#pics', { name: 'sheets.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('.modal .rv', { timeout: 240000 });
  ok('rescan: all marked duplicate + unticked', await page.$$eval('.rv', rs => rs.length === 4 && rs.every(r => r.classList.contains('dup') && !r.querySelector('[type=checkbox]').checked)));
  await page.$$eval('.rv [type=checkbox]', cs => cs.forEach(c => c.checked = true));   // even if ticked, the strong check skips them
  await page.click('.modal .btn.primary'); await page.waitForTimeout(300);
  ok('toast skipped 4', /Added 0 · skipped 4/.test(await page.textContent('#toast')), await page.textContent('#toast'));
  ok('still 4 stops', await page.evaluate(() => Store.stops().length) === 4);

  // ---- appending a later scan keeps order ----
  await page.evaluate(() => { const extra = [{ name: 'Kim Placeholder', street: '19 Oak St', city: 'Holt', state: 'MI', zip: '48842' }]; const r = SheetParser.unique(extra, Store.stops()); Store.addStops(r.kept); });
  ok('later scan appended as #5', (await page.evaluate(() => Store.stops().map(s => s.n + ' ' + s.name))).join('|') === '1 Dana Example|2 Pat Sample|3 Robin Test|4 Lee Fixture|5 Kim Placeholder');

  // ---- map ----
  await page.click('#tabs [data-tab=map]');
  await page.waitForFunction(() => document.querySelectorAll('.pin').length === 5, null, { timeout: 15000 });
  ok('5 numbered pins', (await page.$$eval('.pin', p => p.map(x => x.textContent).sort().join())) === '1,2,3,4,5');
  ok('geocode used units stripped', geoQueries.some(q => q.startsWith('4400 birch rd, holt')) && !geoQueries.some(q => /apt/.test(q)), JSON.stringify(geoQueries));
  ok('geocode results cached', await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ct2-geo'))).length) >= 5);
  await page.locator('.pin', { hasText: /^2$/ }).click();
  ok('card shows name + address', /Pat Sample/.test(await page.textContent('#card')) && /210 Maple Hollow Dr, Mason MI 48854/.test(await page.textContent('#card')));
  ok('Go -> Apple Maps', /^https:\/\/maps\.apple\.com\/\?daddr=210%20Maple%20Hollow%20Dr/.test(await page.getAttribute('#card a[data-act=go]', 'href')));
  ok('Go + Send run text side by side, no Done button', (await page.$$eval('#card .card-btns', c => [...c[0].children].map(x => x.textContent.trim()).join('|'))) === 'Go|Send run text' && !(await page.$('#card [data-act=done]')));
  // run text: template menu -> compose -> Messages link (no recipient), marks the stop as run
  await page.click('#card [data-act=run]');
  ok('run-text menu lists templates', (await page.$$eval('.modal .tpl', b => b.map(x => x.textContent).join('|'))) === 'N/A|N/A LDT|Answered|Note');
  await page.click('.modal .tpl:text-is("N/A LDT")');
  await page.fill('.modal .rt-note', 'left door hanger');
  ok('run text body like Android', (await page.inputValue('.modal .rt-body')) === 'P. Sample, N/A LDT, left door hanger');
  const sms = await page.getAttribute('.modal .rt-send', 'href');
  ok('sms: link, no recipient, body prefilled', sms === 'sms:&body=' + encodeURIComponent('P. Sample, N/A LDT, left door hanger'), sms);
  await page.$eval('.modal .rt-send', a => a.addEventListener('click', e => e.preventDefault()));   // don't navigate away in the test
  await page.click('.modal .rt-send');
  await page.waitForTimeout(200);
  const ran = await page.evaluate(() => Store.stops().find(s => s.name === 'Pat Sample').ran);
  ok('sending marks stop as run', ran && ran.result === 'N/A LDT' && ran.note === 'left door hanger', JSON.stringify(ran));
  ok('ran pin gets gold ring, keeps number', await page.$$eval('.pin.ran', p => p.length === 1 && p[0].textContent === '2'));
  ok('card shows run + undo', /Run text .*N\/A LDT, left door hanger/.test(await page.textContent('#card')) && !!(await page.$('#card [data-act=undo]')));
  await page.locator('.pin', { hasText: /^1$/ }).click();
  await page.click('#card [data-act=run]'); await page.click('.modal .tpl:text-is("Note")');
  await page.$eval('.modal .rt-send', a => a.addEventListener('click', e => e.preventDefault()));
  await page.click('.modal .rt-send');
  ok('Note needs text', await page.isVisible('.modal .err'));
  await page.fill('.modal .rt-note', 'spoke to neighbor'); await page.click('.modal .rt-send'); await page.waitForTimeout(200);
  ok('Note run logged', (await page.evaluate(() => Store.stops()[0].ran.result + '|' + Store.stops()[0].ran.note)) === 'Note|spoke to neighbor');

  // ---- manual markers ----
  const addMarker = async (name, address, phone) => {
    await page.click('#btn-add-marker');
    await page.fill('.modal [name=name]', name); await page.fill('.modal [name=address]', address); await page.fill('.modal [name=phone]', phone);
    await page.click('.modal .btn.primary');
  };
  await addMarker('Jordan Mockley', '501 Pine St, Lansing MI 48933', '(555) 010-7788');
  await page.waitForSelector('.mpin');
  ok('manual marker pin is different', await page.$$eval('.mpin', p => p.length) === 1);
  ok('marker card selected after add', /Jordan Mockley/.test(await page.textContent('#card')));
  ok('marker card tap-to-call', (await page.getAttribute('#card .card-phone', 'href')) === 'tel:5550107788');
  ok('marker card has Go + Send run text + Notes', await page.isVisible('#card a[data-act=go]') && await page.isVisible('#card [data-act=run]') && await page.isVisible('#card [data-act=notes]'));
  await page.click('#card [data-act=run]'); await page.click('.modal .tpl:text-is("Answered")'); await page.fill('.modal .rt-note', 'will pay Friday');
  await page.$eval('.modal .rt-send', a => a.addEventListener('click', e => e.preventDefault())); await page.click('.modal .rt-send'); await page.waitForTimeout(200);
  ok('marker run text logged in its history', (await page.evaluate(() => Store.markers()[0].log.map(l => l.text).join())) === 'Texted group: Answered, will pay Friday');
  await page.waitForTimeout(3600);
  await page.screenshot({ path: `${SHOTS}/ct-ios-2.0-map-marker.png` });

  // duplicate warning vs scanned stop
  await page.click('#btn-add-marker');
  await page.fill('.modal [name=name]', 'Robin Test'); await page.fill('.modal [name=address]', '1517 Cedar Ln, Lansing MI 48910');
  await page.click('.modal .btn.primary');
  await page.waitForSelector('.modal h3:text("Possible duplicate")');
  ok('duplicate warning lists scanned stop', /#3 Robin Test/.test(await page.textContent('.modal')));
  await page.click('.modal .btn:text("Cancel")');
  ok('cancel keeps 1 marker', await page.evaluate(() => Store.markers().length) === 1);
  await addMarker('Sky Dummyton', '7 Oak St, Holt MI 48842', '');
  await page.waitForFunction(() => document.querySelectorAll('.mpin').length === 2);
  await page.evaluate(() => { MapView.select(null); MapView.fit(); }); await page.waitForTimeout(400);

  // notes page
  await page.locator('.mpin').first().click();
  await page.click('#card [data-act=notes]');
  await page.waitForSelector('#notes-text');
  await page.fill('#notes-text', 'Gate code is fake 1234. Knock at side door.');
  await page.waitForFunction(() => /Saved/.test(document.querySelector('#notes-saved').textContent), null, { timeout: 3000 });
  ok('notes autosaved', (await page.evaluate(() => Store.markers()[0].notes)) === 'Gate code is fake 1234. Knock at side door.');
  await page.screenshot({ path: `${SHOTS}/ct-ios-2.0-notes.png` });
  await page.click('[data-act=edit]');
  await page.fill('.modal [name=phone]', '555-010-9999'); await page.click('.modal .btn.primary');
  await page.waitForTimeout(200);
  ok('edit marker saved', (await page.evaluate(() => Store.markers()[0].phone)) === '555-010-9999' && /555-010-9999/.test(await page.textContent('#notes-page')));
  await page.click('[data-act=back]');
  await page.reload(); await page.waitForSelector('#map-view:not([hidden])');
  ok('opens on Map with data; notes persist after reload', (await page.evaluate(() => Store.markers()[0].notes)).startsWith('Gate code'));
  await page.waitForFunction(() => document.querySelectorAll('.mpin').length === 2);
  await page.locator('.pin', { hasText: /^2$/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/ct-ios-2.0-map.png` });
  await page.click('#card [data-act=run]');
  await page.screenshot({ path: `${SHOTS}/ct-ios-2.0-runtext.png` });
  await page.click('.modal [data-x]');

  // ---- clears touch scanned stops only ----
  await page.click('#btn-clear-unrun');
  await page.click('.modal .btn:text("Cancel")');
  ok('clear cancelled keeps all', await page.evaluate(() => Store.stops().length) === 5);
  await page.click('#btn-clear-unrun'); await page.click('.modal .btn.danger');
  ok('clear unrun keeps stops with a run text + markers', JSON.stringify(await page.evaluate(() => [Store.stops().map(s => s.name), Store.markers().length])) === JSON.stringify([['Dana Example', 'Pat Sample'], 2]));
  await page.click('#btn-clear-all'); await page.click('.modal .btn.danger');
  ok('clear all keeps markers', JSON.stringify(await page.evaluate(() => [Store.stops().length, Store.markers().length, document.querySelectorAll('.mpin').length])) === '[0,2,2]');

  // delete marker from notes page
  await page.locator('.mpin').nth(1).click(); await page.click('#card [data-act=notes]');
  await page.click('[data-act=del]'); await page.click('.modal .btn.danger');
  ok('marker deleted', await page.evaluate(() => Store.markers().length) === 1);

  // ---- settings: Google Maps + change log ----
  await page.click('#gear');
  ok('settings shows Change Log 2.0', /2\.0/.test(await page.textContent('.modal details:last-of-type')));
  await page.check('.modal [name=nav][value=google]');
  await page.click('#set-tpl summary'); await page.click('.modal .tpl-add');
  await page.fill('.modal .tpl-row:last-child .tpl-b', 'Left card'); await page.fill('.modal .tpl-row:last-child .tpl-t', '{who}, left card at door');
  await page.click('.modal .btn.primary');
  await page.locator('.mpin').first().click();
  ok('Go -> Google Maps when chosen', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=501%20Pine%20St/.test(await page.getAttribute('#card a[data-act=go]', 'href')));
  await page.click('#card [data-act=run]');
  ok('edited template appears in menu', (await page.$$eval('.modal .tpl', b => b.map(x => x.textContent).join('|'))) === 'N/A|N/A LDT|Answered|Note|Left card');
  await page.click('.modal .tpl:text-is("Left card")');
  ok('edited template text used', (await page.inputValue('.modal .rt-body')) === 'J. Mockley, left card at door');
  await page.click('.modal [data-x]');

  // ---- storage ----
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  ok('no phone/photo from scans stored', !(await page.evaluate(() => localStorage.getItem('ct2-stops') || '')).match(/555|data:image/));
  ok('old keys untouched', (await page.evaluate(() => localStorage.getItem('ct-settings'))) === '{"old":true}' && (await page.evaluate(() => localStorage.getItem('ct-tiles'))) === 'x', keys.join());
  ok('old IndexedDB untouched', (await page.evaluate(() => new Promise(res => { const o = indexedDB.open('credit-tracker'); o.onsuccess = () => { const r = o.result.transaction('profiles').objectStore('profiles').get(1); r.onsuccess = () => { res(r.result && r.result.name); o.result.close(); }; }; }))) === 'Old Record');

  // ---- offline after first load ----
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => { const c = await caches.open('credit-tracker-ios-2.0.0'); return (await c.keys()).length >= 25; }, null, { timeout: 60000 });
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('#tabs');
  ok('loads offline', await page.isVisible('#tabs'));
  ok('reader files available offline', await page.evaluate(async () => (await fetch('vendor/tesseract/lang/eng.traineddata.gz')).ok && (await fetch('vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js')).ok));
  await ctx.setOffline(false);

  ok('no page errors', errors.length === 0, errors.join(' / '));
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL UI PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
