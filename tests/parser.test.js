// Parser fixtures (made-up people and addresses only). Run: node tests/parser.test.js
'use strict';
const P = require('../js/parser.js');
let fails = 0, n = 0;
const L = (text, x, y, h = 11) => ({ text, left: x, top: y, right: x + Math.round(text.length * h * 0.55), bottom: y + h });
const scale = (ls, k) => ls.map(l => ({ text: l.text, left: Math.round(l.left * k), top: Math.round(l.top * k), right: Math.round(l.right * k), bottom: Math.round(l.bottom * k) }));
function check(name, got, want) {
  n++; const g = JSON.stringify(got.map(f => `${f.name} | ${P.address(f)}`)), w = JSON.stringify(want);
  if (g === w) console.log('PASS ' + name); else { fails++; console.log('FAIL ' + name + '\n   got:  ' + g + '\n   want: ' + w); }
}
function eq(name, got, want) { n++; if (JSON.stringify(got) === JSON.stringify(want)) console.log('PASS ' + name); else { fails++; console.log(`FAIL ${name}\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); } }

// A sheet laid out like the real ones: Customer column, Work column beside it, Delivery header top right.
function sheet({ since = 'Customer since: 03/14/2021', work = 'Work', withAddr = true } = {}) {
  return [
    L('Route', 161, 262), L('Store', 227, 262), L('Delivery', 592, 280), L('10/17/2026', 706, 287),
    L('Route 1', 161, 278), L('STORE 0001', 227, 280),
    L('apt 210 Maple Hollow Dr Mason MI 48854', 443, 290), L('CAR notes:', 678, 295),
    L('Customer', 159, 293), L(work, 343, 297), L('Vehicle', 450, 302), L('Phone', 603, 312),
    L(since, 157, 309), L('corner market', 343, 314),
    L('Dana Example', 157, 325), L('100 Sample St', 342, 330), L('(555) 010-0001', 568, 334),
    L('Lansing, MI', 342, 346), L('Best time to call:', 560, 348),
    L('(555) 010-0002', 342, 363), L('Call in Morning', 534, 364),
    L('Shift: -', 342, 379), L('Cust Credits:', 349, 396),
    L('Total number 0 0 0', 147, 428), L('Total amount $0.00 $0.00 $0.00', 147, 446),
  ].concat(withAddr ? [L('apt 210 Maple Hollow Dr', 158, 343), L('Mason MI', 158, 357), L('48854', 158, 374)] : []);
}
const S = ['Dana Example | Maple Hollow Dr apt 210, Mason MI 48854'];
check('sheet', P.parse(sheet()), S);
check('sheet, big font (x2.6)', P.parse(scale(sheet(), 2.6)), S);
check('sheet, small font (x0.6)', P.parse(scale(sheet(), 0.6)), S);
check('fuzzy labels Custorner / W0rk', P.parse(sheet({ since: 'Custorner since: 03/14/2021', work: 'W0rk' })), S);
check('fuzzy Cust0mer slnce', P.parse(sheet({ since: 'Cust0mer slnce: 03/14/2021' })), S);
check('no customer address -> Delivery header', P.parse(sheet({ withAddr: false })), S);
check('Work label unread', P.parse(sheet().filter(l => l.text !== 'Work')), S);
check('Customer since unread (street anchor)', P.parse(sheet().filter(l => !l.text.startsWith('Customer since'))), S);
eq('units stripped for map lookup', P.stripUnits(P.address(P.parse(sheet())[0])), 'Maple Hollow Dr, Mason MI 48854');
eq('never returns phone digits', P.parse(sheet()).some(f => /\d{3}\D*\d{4}/.test(JSON.stringify([f.name, f.street]))), false);

function classic(name, street, city, zip, x, y, h = 11) {
  const k = h / 11, r = v => Math.round(y + v * k);
  return [L('Customer', x, y, h), L('Work', x + 18 * h, y, h),
    L('Customer since: 11/18/2021', x, r(16), h), L('Acme Supply', x + 18 * h, r(16), h),
    L(name, x, r(32), h), L('123 Market St', x + 18 * h, r(32), h),
    L(street, x, r(48), h), L('Lansing MI', x + 18 * h, r(48), h),
    L(city, x, r(64), h), L('(555) 010-1212', x + 18 * h, r(64), h), L(zip, x, r(80), h)];
}
check('classic + Work column', P.parse(classic('Pat Sample', '4400 Birch Rd apt#30', 'Holt MI', '48842', 100, 100)), ['Pat Sample | 4400 Birch Rd apt 30, Holt MI 48842']);
check('classic, labels unread', P.parse(classic('Pat Sample', '4400 Birch Rd apt#30', 'Holt MI', '48842', 100, 100).filter(l => l.text !== 'Work' && !l.text.startsWith('Customer since'))),
  ['Pat Sample | 4400 Birch Rd apt 30, Holt MI 48842']);
check('"Lansing MI" never a name', P.parse([L('Lansing MI', 100, 100), L('4400 Birch Rd', 100, 116), L('Holt MI', 100, 132), L('48842', 100, 148)]), []);
check('"Mason, MI 48854" never a name', P.parse([L('Mason, MI 48854', 100, 100), L('12 Oak St', 100, 116), L('Holt MI', 100, 132)]), []);
check('name above a city line', P.parse([L('Customer since: 1/2/2020', 100, 84), L('Robin Test', 100, 100), L('Lansing MI', 100, 116), L('12 Oak St', 100, 132), L('Holt MI', 100, 148)]),
  ['Robin Test | 12 Oak St, Holt MI']);
check('lot first', P.parse([L('Customer since: 1/2/2020', 100, 84), L('Lee Fixture', 100, 100), L('Lot 12 3300 Oak St', 100, 116), L('Holt, MI 48842', 100, 132)]),
  ['Lee Fixture | 3300 Oak St lot 12, Holt MI 48842']);
check('OCR "Okemos Mi" / "Holt Ml" state', P.parse(classic('Lee Fixture', '88 Willow Ct', 'Okemos Mi', '48864', 100, 100)).concat(P.parse(classic('Pat Sample', '9 Elm St', 'Holt Ml', '48842', 100, 100))),
  ['Lee Fixture | 88 Willow Ct, Okemos MI 48864', 'Pat Sample | 9 Elm St, Holt MI 48842']);
check('"Kim Al" stays a name', P.parse([L('Customer since: 1/2/2020', 100, 84), L('Kim Al', 100, 100), L('12 Oak St', 100, 116), L('Holt MI', 100, 132)]), ['Kim Al | 12 Oak St, Holt MI']);
eq('unit-first rewrite', P.unitLast('apt 312 Pine Ridge Dr'), 'Pine Ridge Dr apt 312');
eq('city/state patterns', ['Lansing MI', 'Mason, MI', 'Mason MI 48854', 'Grand Ledge', 'East Lansing, MI', 'Robin Test', 'Kim Al'].map(P.looksCityState),
  [true, true, true, true, true, false, false]);

// 16 sheets, two fanned rows, mixed font sizes; each sheet covers the previous one's Work column
const many = [], want = [];
for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) {
  const h = (r + c) % 3 === 0 ? 14 : 9, i = r * 8 + c, nm = `Person ${String.fromCharCode(65 + i)}x Tester`;
  many.push(...classic(nm, `${100 + i} Elm St`, 'Lansing MI', `4891${c}`, 50 + c * 260, 100 + r * 700 + c * 20, h).filter(l => c === 7 || l.left < 50 + c * 260 + 15 * h));
  want.push(`${nm} | ${100 + i} Elm St, Lansing MI 4891${c}`);
}
const got = P.parse(many);
check('16 sheets two rows', P.order(got.map(f => ({ ...f, cx: f.cx / 2200, cy: f.cy / 1600 }))), want);
check('vertical shingle, both Work labels visible',
  P.parse(classic('Ann Able', '11 Oak St', 'Holt MI', '48842', 100, 100).concat(classic('Ben Baker', '22 Elm St', 'Mason MI', '48854', 104, 177))).sort((a, b) => a.name.localeCompare(b.name)),
  ['Ann Able | 11 Oak St, Holt MI 48842', 'Ben Baker | 22 Elm St, Mason MI 48854']);

// duplicates
const a = { name: 'Pat Sample', street: '4400 Birch Rd apt 30', city: 'Holt', state: 'MI', zip: '48842' };
eq('dup: same address, unit/abbr differ', P.same(a, { name: 'X Y', street: '4400 Birch Road #30', city: 'Holt', state: 'MI', zip: '48842' }), true);
eq('dup: misread name, same house', P.same(a, { name: 'Pat Sanple', street: '4400 Birch Rd', city: '', state: '', zip: '' }), true);
eq('not dup: other house', P.same(a, { name: 'Pat Sample', street: '4402 Birch Rd', city: 'Holt', state: 'MI', zip: '48842' }), false);
eq('not dup: same street, other ZIP', P.same(a, { name: 'Q R', street: '4400 Birch Rd', city: 'Mason', state: 'MI', zip: '48854' }), false);
const u = P.unique([a, { ...a, name: 'Pat Sample' }, { name: 'New One', street: '9 Ash Ct', city: 'Holt', state: 'MI', zip: '48842' }], [{ ...a, street: '4400 Birch Rd' }]);
eq('unique: skipped count', [u.kept.length, u.skipped], [1, 2]);
eq('merge keeps first, fills ZIP', P.mergePlaced([[{ ...a, zip: '', cx: .2, cy: .2 }], [{ ...a, cx: .2, cy: .2 }]]).map(f => f.zip), ['48842']);

console.log(fails ? `${fails} of ${n} FAILED` : `ALL ${n} PASS`);
process.exit(fails ? 1 : 0);
