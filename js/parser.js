/* Credit Tracker iOS 2.0 sheet parser (port of the Android 9.7 Speed Scan reader).
 * Input: OCR lines {text,left,top,right,bottom} from ONE read of a photo. Output: name + address blocks.
 * Phone numbers are never returned. Pure JS (works in the browser and in Node for tests). */
(function (root) {
'use strict';
const DIRS = new Set(['n','s','e','w','ne','nw','se','sw','north','south','east','west']);
const STREET = /^\s*(\d{1,6}[A-Za-z]?)\s+([A-Za-z][A-Za-z0-9.'#-]*)(.*)$/;
const UNIT_FIRST = /^\s*(apt|apartment|unit|lot|ste|suite|trlr|trailer|rm|#)\.?\s*#?\s*([A-Za-z]?\d[\w-]*|[A-Za-z])\s*[,.]?\s+(\S.*)$/i;
const DATEISH = /\d{1,2}\/\d{1,2}\/\d{2,4}/;
const ZIP = /(?<!\d)(\d{5})(?:-\d{4})?(?!\d)/;
const CITY_ST = /^\s*([A-Za-z][A-Za-z .'-]*?)[,\s]+([A-Za-z][A-Za-z1|])\b\.?\s*(\d{5})?/;
/** OCR-tolerant state code: "MI", or Michigan misread as "Mi"/"Ml"/"M1". Other codes must be capitals. */
const fixState = s => { const u = s.toUpperCase().replace(/^M[L1|]$/, 'MI'); return STATES.has(u) && (s === u || u === 'MI') ? u : null; };
const SUFFIX = /\b(rd|road|st|street|ave|avenue|dr|drive|ln|lane|ct|court|blvd|way|hwy|pl|place|cir|circle|trl|trail|pkwy|ter|apt|lot|unit|n|s|e|w)\b/i;
const STREET_END = /\b(rd|road|st|street|ave|av|avenue|dr|drive|ln|lane|ct|court|blvd|boulevard|way|hwy|highway|pl|place|cir|circle|trl|trail|pkwy|parkway|ter|terrace|sq|xing|loop|run|pass|row|path)\b\.?/ig;
const LABEL = /^(customer|store|route|manager|total|rent|ra#|club|payments?|inventory|product|past due|grand|current|worked|retention|alerts?|work|delivery|vehicle|phone|shift|best time|call)\b/i;
const PHONEISH = /\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/;
const STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
const AREA_CITIES = new Set(['lansing','east lansing','mason','holt','okemos','haslett','dewitt','de witt','grand ledge','charlotte','williamston','eaton rapids',
  'dimondale','bath','laingsburg','st johns','saint johns','jackson','leslie','stockbridge','webberville','potterville','portland','perry','owosso','lake odessa',
  'olivet','onondaga','eagle','westphalia','fowlerville','howell','ionia','delta','delhi','meridian','diamondale','lansing township','springport','eaton','ingham','clinton']);

const H = l => Math.max(1, l.bottom - l.top);
const CY = l => (l.top + l.bottom) / 2;

/* ---------- fuzzy labels ---------- */
function letters(t) { return t.toLowerCase().replace(/0/g, 'o').replace(/[1|]/g, 'l').replace(/rn/g, 'm').replace(/[^a-z]/g, ''); }
function dist(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
  return d[b.length];
}
function isLabel(t, word, maxDist) { const l = letters(t); return l.length >= word.length - maxDist && l.length <= word.length + maxDist && dist(l, word) <= maxDist; }
function isSince(t) {
  const i = t.toLowerCase().indexOf('since');
  const head = letters(i >= 0 ? t.substring(0, i + 5) : t.split(':')[0]);
  if (head.length >= 10 && head.length <= 17 && dist(head, 'customersince') <= 3) return true;
  return i >= 0 && i <= 14 && DATEISH.test(t.substring(i));
}

/* ---------- line tests ---------- */
function unitLast(t) {
  const x = t.trim().replace(/\s+/g, ' ');
  const m = x.match(UNIT_FIRST);
  if (!m) return x.replace(/apt\s*#\s*/ig, 'apt ');
  let kind = m[1].toLowerCase(); if (kind === '#' || kind === 'apartment') kind = 'apt'; else if (kind === 'trailer') kind = 'trlr';
  return `${m[3].trim().replace(/,$/, '')} ${kind} ${m[2]}`;
}
function looksStreet(raw) {
  if (DATEISH.test(raw) || raw.includes('$') || PHONEISH.test(raw)) return false;
  const t = unitLast(raw);
  const m = t.match(STREET);
  if (m) { const rest = m[2] + m[3]; if ((rest.match(/[A-Za-z]/g) || []).length < 3) return false; return SUFFIX.test(rest) || rest.trim().includes(' '); }
  if (UNIT_FIRST.test(raw.trim())) { STREET_END.lastIndex = 0; return STREET_END.test(t) && (t.match(/[A-Za-z]/g) || []).length >= 6; }
  return false;
}
function looksCityState(t) {
  const s = t.trim().replace(/[.,]+$/, '');
  if (ZIP.test(s)) return true;
  const words = s.replace(/,/g, ' , ').split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const last = words[words.length - 1], comma = words.includes(',');
  if (last.length === 2 && STATES.has(last.toUpperCase()) && (comma || last === last.toUpperCase() || last.toLowerCase() === 'mi')) return true;
  return AREA_CITIES.has(s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim());
}
function looksName(t) {
  const s = t.trim();
  if (s.length < 3 || LABEL.test(s) || /\d/.test(s) || s.includes(':') || s.includes('$')) return false;
  if (looksCityState(s) || isSince(s)) return false;
  const words = s.split(/\s+/).filter(w => /[A-Za-z]/.test(w));
  return words.length >= 2 && words.length <= 5 && (s.match(/[A-Za-z]/g) || []).length >= 4;
}
function withRight(line, all, maxRight = Infinity) {
  let text = line.text.trim(), right = line.right; const h = H(line); const used = new Set();
  for (let k = 0; k < 6; k++) {
    const next = all.filter(o => o !== line && !used.has(o) && Math.abs(CY(o) - CY(line)) < h * 0.6 && o.left >= right - h * 0.3 && o.left - right < h * 1.2 && o.left < maxRight)
      .sort((a, b) => a.left - b.left)[0];
    if (!next) break;
    const frag = next.text.trim();
    if (!frag || /\d/.test(frag) || frag.includes(':')) break;
    used.add(next);
    text += (frag[0] === frag[0].toLowerCase() && frag[0] !== frag[0].toUpperCase() && next.left - right < h * 0.5) ? frag : ' ' + frag;
    right = Math.max(right, next.right);
  }
  return text;
}
const cleanName = t => t.replace(/\s+/g, ' ').trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
function cityState(t) {
  const s = t.trim(); const m = s.match(CITY_ST);
  const st = m && fixState(m[2]);
  if (!m || m.index > 1 || !st) return null;
  let zip = m[3] || ''; if (!zip) { const z = s.substring(m.index + m[0].length).match(ZIP); if (z) zip = z[1]; }
  return { city: m[1].trim().replace(/,$/, ''), state: st, zip };
}
function splitOneLine(raw, knownCity = '') {
  const t = raw.trim().replace(/\s+/g, ' ');
  const m = t.match(/^(.*?)[,\s]+([A-Za-z][A-Za-z1|])\.?[,\s]*(\d{5})?(?:-\d{4})?\s*$/);
  const st = m && fixState(m[2]);
  if (!st) return null;
  const body = m[1].trim().replace(/,$/, '');
  let street, city;
  if (body.includes(',')) { street = body.substring(0, body.lastIndexOf(',')).trim(); city = body.substring(body.lastIndexOf(',') + 1).trim(); }
  else if (knownCity && body.toLowerCase().endsWith(' ' + knownCity.toLowerCase())) { street = body.slice(0, -knownCity.length).trim(); city = body.slice(-knownCity.length); }
  else {
    const ends = [...body.matchAll(STREET_END)]; if (!ends.length) return null;
    const e = ends[ends.length - 1]; const cut = e.index + e[0].length;
    street = body.substring(0, cut).trim(); city = body.substring(cut).trim();
    const u = city.match(/^(apt|unit|lot|ste|#)\.?\s*#?\s*\w+\s+/i);
    if (u) { street += ' ' + u[0].trim(); city = city.substring(u[0].length).trim(); }
  }
  if (!city || !looksStreet(street)) return null;
  return { name: '', street: unitLast(street), city, state: st, zip: m[3] || '' };
}
function key(street) {
  const w = street.toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
  let i = 1; while (i < w.length && DIRS.has(w[i])) i++;
  return [w[0], w[i]].filter(Boolean).join(' ');
}
function found(name, street, city, state, zip, at) { return { name, street, city, state, zip, cx: at ? (at.left + at.right) / 2 : -1, cy: at ? CY(at) : -1 }; }

/** Returns {found:[...], missed:[since lines with no name/address]} */
function parseDetailed(lines) {
  lines = lines.filter(l => l && l.text && l.text.trim());
  const workLabels = lines.filter(l => isLabel(l.text, 'work', 1));
  const sheetStarts = lines.filter(l => isSince(l.text) || isLabel(l.text, 'customer', 2) || isLabel(l.text, 'route', 1));
  const zones = workLabels.map(w => { const h = H(w); const x0 = w.left - h * 0.6, x1 = w.left + h * 11;
    const cuts = sheetStarts.filter(o => o.left + 1 >= x0 && o.left < x1 && o.top > w.bottom).map(o => o.top);
    return [x0, x1, w.top - h * 0.5, Math.min(w.bottom + h * 7, cuts.length ? Math.min(...cuts) : Infinity)]; });
  const inWork = o => zones.some(z => o.left >= z[0] && o.left < z[1] && CY(o) > z[2] && o.top < z[3]);
  const usable = lines.filter(l => !inWork(l));
  const out = [], usedStreets = new Set(), missed = [];

  for (const sl of lines.filter(l => isSince(l.text))) {
    const h = H(sl);
    const work = workLabels.filter(w => w.left > sl.left + h * 2 && Math.abs(CY(w) - CY(sl)) < h * 3.5).sort((a, b) => a.left - b.left)[0];
    const rightBound = work ? work.left - h * 0.3 : sl.left + h * 16;
    const col = usable.filter(o => o !== sl && o.left >= sl.left - h * 1.5 && o.left < rightBound && o.top > CY(sl) && o.top - sl.bottom < h * 9).sort((a, b) => a.top - b.top);
    const chain = []; let lastBottom = sl.bottom;
    for (const c of col) { if (c.top - lastBottom > h * 2.6 || chain.length >= 5) break; chain.push(c); lastBottom = Math.max(lastBottom, c.bottom); }
    const nameLine = chain[0] && looksName(chain[0].text) ? chain[0] : null;
    let street = '', streetLine = null, city = '', state = '', zip = '';
    for (const c of chain.slice(1)) {
      const t = c.text.trim();
      if (PHONEISH.test(t)) continue;
      if (!street && looksStreet(t)) { streetLine = c; const one = splitOneLine(t);
        if (one) ({ street, city, state, zip } = one); else street = unitLast(t); continue; }
      if (street && !city) { const cs = cityState(t); if (cs) { city = cs.city; state = cs.state; if (!zip) zip = cs.zip; continue; } }
      if (street && !zip) { const z = t.replace(/ /g, '').match(/^(\d{5})(?:-\d{4})?$/); if (z) zip = z[1]; }
    }
    if (!street || (!city && !zip)) {   // Delivery header fallback (top right, one line)
      const del = lines.filter(o => isLabel(o.text, 'delivery', 2) && o.left > sl.left + h * 4 && o.bottom < CY(sl) && sl.top - o.bottom < h * 7)
        .sort((a, b) => (sl.top - a.bottom) - (sl.top - b.bottom))[0];
      const cand = del ? lines.filter(o => o !== del && Math.abs(CY(o) - CY(del)) < H(del) * 2.6).sort((a, b) => Math.abs(CY(a) - CY(del)) - Math.abs(CY(b) - CY(del))) : [];
      for (const c of cand) { const one = splitOneLine(c.text, city); if (!one) continue;
        if (!street) { street = one.street; streetLine = streetLine || c; }
        if (!city) { city = one.city; state = one.state; }
        if (!zip) zip = one.zip; break; }
    }
    if (!nameLine || !street || (!city && !zip)) { missed.push(sl); continue; }
    if (streetLine) usedStreets.add(streetLine);
    out.push(found(cleanName(withRight(nameLine, usable, rightBound)), street, city, state, zip, streetLine || nameLine));
  }

  for (const s of usable.filter(l => !usedStreets.has(l) && looksStreet(l.text))) {   // street-anchored (no "Customer since" read)
    const h = H(s); const same = o => Math.abs(o.left - s.left) < h * 2;
    const below = usable.filter(o => o !== s && same(o) && o.top > CY(s) && o.top - s.bottom < h * 3.2).sort((a, b) => a.top - b.top);
    const above = usable.filter(o => o !== s && same(o) && o.bottom < CY(s) && s.top - o.bottom < h * 2.2).sort((a, b) => b.bottom - a.bottom);
    let street = s.text.trim(), city = '', state = '', zip = '';
    const after = street.includes(',') ? street.substring(street.indexOf(',') + 1) : '';
    const m0 = after.match(CITY_ST);
    if (m0) { city = m0[1].trim(); state = m0[2]; zip = m0[3] || ''; street = street.split(',')[0].trim(); }
    if (!city) { const one = splitOneLine(street); if (one) ({ street, city, state, zip } = one); }
    for (const b of below.slice(0, 3)) {
      const t = b.text.trim();
      if (!city) { const m = t.match(CITY_ST); if (m && fixState(m[2]) && (m.index === 0 || t.indexOf(m[0]) <= 1)) { city = m[1].trim(); state = fixState(m[2]); if (!zip) zip = m[3] || ''; continue; } }
      if (!zip) { const z = t.match(/^(\d{5})(?:-\d{4})?$/); if (z) zip = z[1]; }
      if (zip && city) break;
    }
    if (!city && !zip) continue;
    if (below.slice(0, 3).some(b => PHONEISH.test(b.text))) continue;   // Work column with its label unread
    const nameLine = above.slice(0, 2).find(a => looksName(a.text)); if (!nameLine) continue;
    out.push(found(cleanName(withRight(nameLine, usable)), unitLast(street), city, state, zip, s));
  }
  const seen = new Set(), res = [];
  for (const f of out) { const k = key(f.street); if (!seen.has(k)) { seen.add(k); res.push(f); } }
  return { found: res.map(f => ({ ...f, name: noPhone(f.name), street: noPhone(f.street) })), missed };
}
const noPhone = t => t.replace(PHONEISH, '').replace(/\s+/g, ' ').trim();

/* ---------- photo layout: scan order, merging reads ---------- */
/** Rows top to bottom (new row when the y jumps by more than rowGap of the photo), left to right in a row. cx/cy normalized 0..1. */
function order(items, rowGap = 0.12) {
  const placed = items.filter(i => i.cx >= 0 && i.cy >= 0).sort((a, b) => a.cy - b.cy), loose = items.filter(i => !(i.cx >= 0 && i.cy >= 0));
  const rows = [];
  for (const p of placed) { const last = rows[rows.length - 1]; if (!last || p.cy - last[last.length - 1].cy > rowGap) rows.push([p]); else last.push(p); }
  return rows.flatMap(r => r.sort((a, b) => a.cx - b.cx)).concat(loose);
}
/** Best reads first; same house (key) or same spot = one; a later read only fills a missing city/ZIP. */
function mergePlaced(reads, near = 0.015) {
  const out = [];
  for (const r of reads) for (const f of r) {
    const i = out.findIndex(o => key(o.street) === key(f.street) || (o.cx >= 0 && f.cx >= 0 && Math.abs(o.cx - f.cx) < near && Math.abs(o.cy - f.cy) < near));
    if (i < 0) { out.push(f); continue; }
    const o = out[i];
    if ((!o.zip && f.zip) || (!o.city && f.city)) out[i] = { ...o, city: o.city || f.city, state: o.state || f.state, zip: o.zip || f.zip };
  }
  return out;
}

/* ---------- units, dedupe ---------- */
const DESIGNATED = /[\s,]*\b(?:apt|apartment|apartmen|aprt|ap|unit|ste|suite|lot|bldg|building|rm|room|fl|floor|spc|space|trlr|trailer|no)\b\.?\s*(?:#|no\.?|number)?\s*(?!\d{5}\b)(?:[a-z]?\d[\w-]*|[a-z](?![a-z]))/ig;
const GLUED = /[\s,]*\bapt[.#]?(?:\d[\w-]*|[a-z](?![a-z]))/ig;
const HASH = /[\s,]*#\s*(?:[a-z]?\d[\w-]*|[a-z](?![a-z]))/ig;
/** Units removed for map lookups and navigation only (the saved address keeps them). */
function stripUnits(a) {
  a = a.trim(); if (!a) return a;
  const lead = (a.match(/^\s*\d+[A-Za-z]?\s+/) || [''])[0];
  let rest = a.substring(lead.length);
  for (const r of [GLUED, DESIGNATED, HASH]) rest = rest.replace(r, '');
  return (lead + rest).replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim().replace(/^,|,$/g, '').trim();
}
const ABBR = { street:'st', str:'st', avenue:'ave', av:'ave', road:'rd', drive:'dr', lane:'ln', court:'ct', boulevard:'blvd', place:'pl', circle:'cir', highway:'hwy',
  parkway:'pkwy', terrace:'ter', trail:'trl', way:'wy', square:'sq', crossing:'xing', point:'pt', north:'n', south:'s', east:'e', west:'w', northeast:'ne',
  northwest:'nw', southeast:'se', southwest:'sw', mount:'mt', saint:'st', fort:'ft' };
const words = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map(w => ABBR[w] || w);
const normStreet = s => words(stripUnits(s)).join(' ');
const normName = n => n.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).join(' ');
function sameAddress(a, b) {
  const s1 = normStreet(a.street), s2 = normStreet(b.street);
  if (!s1 || s1 !== s2) return false;
  const z1 = (a.zip || '').trim().slice(0, 5), z2 = (b.zip || '').trim().slice(0, 5);
  if (z1 && z2) return z1 === z2;
  const c1 = words(a.city || '').join(' '), c2 = words(b.city || '').join(' ');
  return !c1 || !c2 || c1 === c2;
}
/** Same stop: same normalized address, or a close name (≤1 typo per 6 letters) at the same house number + street word. */
function same(a, b) {
  if (sameAddress(a, b)) return true;
  const n1 = normName(a.name), n2 = normName(b.name);
  if (!n1 || !n2) return false;
  const close = n1 === n2 || dist(n1, n2) <= Math.max(1, Math.floor(Math.min(n1.length, n2.length) / 6));
  const k1 = key(normStreet(a.street)), k2 = key(normStreet(b.street));
  return close && !!k1 && k1 === k2;
}
function unique(found, existing) {
  const kept = []; let skipped = 0;
  for (const f of found) if (existing.some(e => same(e, f)) || kept.some(k => same(k, f))) skipped++; else kept.push(f);
  return { kept, skipped };
}
function address(f) {
  const cs = [f.city, f.state].filter(Boolean).join(' ');
  return f.street + (cs ? ', ' + cs : '') + (f.zip ? ' ' + f.zip : '');
}

const API = { parseDetailed, parse: l => parseDetailed(l).found, unitLast, looksCityState, splitOneLine, order, mergePlaced, stripUnits, same, unique, address, key, isSince, PHONEISH };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.SheetParser = API;
})(typeof self !== 'undefined' ? self : this);
