// 2.1 ZIP code areas: headless check at an iPhone viewport with made-up stops only.
// Run: PORT=8765 SHOTS=/workspace node tests/zip.test.js   (needs a static server on PORT, playwright, Chrome)
'use strict';
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765, BASE = `http://127.0.0.1:${PORT}/`, SHOTS = process.env.SHOTS || '/tmp';
let fails = 0; const ok = (name, c, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + name + (c ? '' : '  ' + extra)); if (!c) fails++; };
const STOPS = [   // made-up names; #1 sits exactly on the 48910 label point so a label covers it
  { name: 'Robin Test', street: '1517 Cedar Ln', city: 'Lansing', state: 'MI', zip: '48910', lat: 42.6971, lon: -84.5251 },
  { name: 'Dana Example', street: '4400 Birch Rd', city: 'Holt', state: 'MI', zip: '48842', lat: 42.6406, lon: -84.5153 },
  { name: 'Lee Fixture', street: '88 Willow Ct', city: 'Okemos', state: 'MI', zip: '48864', lat: 42.7187, lon: -84.4269 },
  { name: 'Pat Sample', street: '210 Pine St', city: 'Lansing', state: 'MI', zip: '48933', lat: 42.7330, lon: -84.5555 },
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ctx.route('https://nominatim.openstreetmap.org/**', r => r.fulfill({ contentType: 'application/json', body: '[]' }));
  const zipReqs = []; ctx.on('request', r => { if (r.url().includes('/data/zcta_mid_michigan.json') && !r.serviceWorker()) zipReqs.push(r.url()); });   // the page's own request (the service worker's pass-through is not counted)
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/tile|Failed to load resource/.test(m.text())) errors.push(m.text()); });

  await page.goto(BASE);
  await page.evaluate(stops => {
    let n = 0;
    localStorage.setItem('ct2-stops', JSON.stringify(stops.map(s => ({ id: 's' + (++n), n, ...s, added: Date.now(), ran: null, geoFor: SheetParser.address(s) }))));
    localStorage.setItem('ct2-seq', String(n));
    localStorage.setItem('ct2-markers', JSON.stringify([{ id: 'm1', name: 'Kim Newer', address: '6 Made Up Ln, Lansing MI 48911', phone: '', notes: '', notesAt: 0, added: Date.now(), log: [], ran: null,
      lat: 42.676, lon: -84.575, geoFor: '6 Made Up Ln, Lansing MI 48911' }]));
    localStorage.removeItem('ct2-zip-on');
  }, STOPS);
  await page.reload();
  ok('version 2.1 in sw cache name', (await (await page.request.get(BASE + 'sw.js')).text()).includes("credit-tracker-ios-2.1.0"));
  await page.click('#tabs [data-tab=map]');
  await page.waitForSelector('.leaflet-marker-pane .pin');
  await page.waitForTimeout(800);
  ok('pins drawn (4 stops + 1 marker)', await page.locator('.leaflet-marker-pane .pin, .leaflet-marker-pane .mpin').count() === 5);
  ok('ZIP data NOT downloaded while the switch is off', zipReqs.length === 0);
  ok('switch off by default', !(await page.isChecked('#zip-on')));

  await page.click('#btn-legend');
  await page.waitForSelector('#legend:not([hidden])');
  const firstRow = await page.evaluate(() => { const l = document.querySelector('#legend'); const sw = l.querySelector('.switch-row'); const rows = l.querySelector('.legend-rows');
    return sw.getBoundingClientRect().top < rows.getBoundingClientRect().top && l.querySelector('.switch-row') === l.children[1]; });
  ok('ZIP switch is at the top of the Legend, above every legend row', firstRow);
  await page.screenshot({ path: `${SHOTS}/ct-ios-2.1-legend.png` });
  await page.click('.switch-row');
  await page.waitForSelector('.leaflet-zipLabels-pane .zip-chip', { timeout: 15000 });
  await page.waitForTimeout(500);
  ok('switch on: ZIP data downloaded once', zipReqs.length === 1, String(zipReqs.length));
  ok('saved in localStorage', await page.evaluate(() => localStorage.getItem('ct2-zip-on')) === '1');
  const labels = await page.locator('.leaflet-zipLabels-pane .zip-chip').allTextContents();
  ok('ZIP labels drawn for the area in view', labels.length >= 5 && labels.includes('48910'), labels.join(','));
  ok('outlines drawn on a canvas in the ZIP lines pane', await page.locator('.leaflet-zipLines-pane canvas').count() === 1);
  const z = await page.evaluate(() => ['zipLines', 'marker', 'zipLabels', 'selPin'].map(p => +getComputedStyle(document.querySelector(`.leaflet-${p}-pane`)).zIndex));
  ok('layer order: outlines < pins < ZIP labels < selected pin', z[0] < z[1] && z[1] < z[2] && z[2] < z[3], z.join(','));
  await page.click('#legend-close');
  await page.screenshot({ path: `${SHOTS}/ct-ios-2.1-zip-on.png` });

  // A label sitting on pin #1: the label is drawn on top, but a tap there selects the pin (labels never take taps).
  const chip = page.locator('.leaflet-zipLabels-pane .zip-chip', { hasText: '48910' });
  const b = await chip.boundingBox();
  const under = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e.closest('.pin, .mpin') || {}).textContent; }, [b.x + b.width / 2, b.y + b.height / 2]);
  ok('a tap on a ZIP label reaches the pin under it', under === '1', String(under));
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForSelector('#card:not([hidden])');
  ok('card opened for that pin', (await page.textContent('#card .card-name')) === 'Robin Test');
  ok('selected pin moved above the labels', await page.locator('.leaflet-selPin-pane .pin.sel').count() === 1);
  await page.screenshot({ path: `${SHOTS}/ct-ios-2.1-selected.png` });
  await page.click('#card .x');

  // persists across reload; off removes everything; zoomed out hides
  await page.reload();
  await page.click('#tabs [data-tab=map]');
  await page.waitForSelector('.leaflet-zipLabels-pane .zip-chip', { timeout: 15000 });
  ok('stays on after reopening the app', await page.isChecked('#zip-on'));
  await page.evaluate(() => { const m = document.querySelector('#map'); return true; });
  await page.click('#btn-legend'); await page.click('.switch-row'); await page.click('#legend-close');
  await page.waitForTimeout(300);
  ok('switch off: no labels or outlines', await page.locator('.leaflet-zipLabels-pane .zip-chip').count() === 0 &&
    await page.evaluate(() => !document.querySelector('.leaflet-zipLines-pane canvas')));
  ok('off saved', await page.evaluate(() => localStorage.getItem('ct2-zip-on')) === '0');
  await page.screenshot({ path: `${SHOTS}/ct-ios-2.1-zip-off.png` });
  ok('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
