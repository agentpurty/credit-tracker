/* On-device text reading for the Scanner (tesseract.js, self-hosted in vendor/tesseract; nothing is uploaded).
 * One photo at a time: an overview read, then 2x2 overlapping tiles for dense photos, then a sharper
 * (enlarged, contrast-boosted) re-read of any sheet header that gave no name/address. Every canvas and
 * bitmap is released right after use; photos are never stored. */
'use strict';
const OCR = (() => {
  const MAX_EDGE = 2000;           // longest side of any canvas sent to the reader
  let workerP = null;
  function worker(onLog) {
    if (!workerP) workerP = Tesseract.createWorker('eng', 1, {   // 1 = LSTM only (smaller core)
      workerPath: 'vendor/tesseract/worker.min.js', corePath: 'vendor/tesseract/core', langPath: 'vendor/tesseract/lang',
      gzip: true, cacheMethod: 'write', workerBlobURL: false,
      logger: m => onLog && onLog(m),
    }).then(async w => { await w.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' }); return w; });
    return workerP;
  }
  async function stop() { if (workerP) { const w = await workerP; workerP = null; await w.terminate(); } }

  /* ---- image helpers ---- */
  async function decode(file) {
    if (self.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) {} }
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode(); return img; }
    finally { URL.revokeObjectURL(url); }
  }
  const dims = b => ({ w: b.width || b.naturalWidth, h: b.height || b.naturalHeight });
  function free(c) { if (c) { c.width = 0; c.height = 0; } }
  /** Draws src rect (raw px) into a canvas scaled by k and turned deg clockwise. */
  function crop(src, sx, sy, sw, sh, k, deg = 0, boost = false) {
    const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    const c = document.createElement('canvas');
    const turn = deg === 90 || deg === 270;
    c.width = turn ? h : w; c.height = turn ? w : h;
    const g = c.getContext('2d', { willReadFrequently: boost });
    g.imageSmoothingQuality = 'high';
    g.translate(c.width / 2, c.height / 2); g.rotate(deg * Math.PI / 180);
    g.drawImage(src, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (boost) {   // grayscale + contrast (Safari has no ctx.filter)
      const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) { const y = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; const v = Math.max(0, Math.min(255, (y - 128) * 1.8 + 128)); p[i] = p[i + 1] = p[i + 2] = v; }
      g.putImageData(d, 0, 0);
    }
    return c;
  }
  /** Point in a canvas turned deg (size cw×ch) back to the unturned crop (w×h before turning). */
  function unturn(x, y, deg, cw, ch) {
    switch (deg) { case 90: return [y, cw - x]; case 180: return [cw - x, ch - y]; case 270: return [ch - y, x]; default: return [x, y]; }
  }
  /** Normalized raw point (0..1) in the reading frame of a reader that turned the photo deg. */
  function readingFrame(u, v, deg) {
    switch (deg) { case 90: return [1 - v, u]; case 180: return [1 - u, 1 - v]; case 270: return [v, 1 - u]; default: return [u, v]; }
  }

  /* ---- tesseract result -> lines (split where a big gap shows a new column) ---- */
  function linesOf(data) {
    const out = [];
    for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
      const ws = (l.words || []).filter(w => w.text && w.text.trim() && w.confidence > 15);
      if (!ws.length) continue;
      const h = Math.max(1, l.bbox.y1 - l.bbox.y0);
      let seg = [ws[0]];
      const flush = () => { const t = seg.map(w => w.text).join(' ');
        out.push({ text: t, left: Math.min(...seg.map(w => w.bbox.x0)), top: Math.min(...seg.map(w => w.bbox.y0)), right: Math.max(...seg.map(w => w.bbox.x1)), bottom: Math.max(...seg.map(w => w.bbox.y1)) }); };
      for (let i = 1; i < ws.length; i++) { if (ws[i].bbox.x0 - ws[i - 1].bbox.x1 > h * 1.3) { flush(); seg = []; } seg.push(ws[i]); }
      flush();
    }
    return out;
  }

  async function read(canvas, onLog) {
    const w = await worker(onLog);
    const r = await w.recognize(canvas, {}, { blocks: true, text: false, hocr: false, tsv: false });
    return linesOf(r.data);
  }

  /**
   * Reads one photo. progress(text) for status. Returns blocks with cx/cy normalized in the reading frame,
   * already merged (best reads first) and in scan order (top row left to right, then the next row).
   */
  async function readPhoto(file, progress = () => {}) {
    let src = await decode(file);
    try {
      const { w: W, h: Hh } = dims(src);
      const k0 = Math.min(1, MAX_EDGE / Math.max(W, Hh));
      const place = (found, deg, cw, ch, sx, sy, k, owns) => found.map(f => {
        const [bx, by] = unturn(f.cx, f.cy, deg, cw, ch);
        const x = sx + bx / k, y = sy + by / k;
        if (owns && !owns(x, y)) return null;
        const [u, v] = readingFrame(x / W, y / Hh, deg);
        return { ...f, cx: u, cy: v, rx: x, ry: y };
      }).filter(Boolean);

      // 1) overview; pick the rotation that finds sheets
      let deg = 0, best = null;
      for (const d of [0, 90, 270]) {
        progress(`Reading${d ? ' (turned ' + d + '°)' : ''}…`);
        const c = crop(src, 0, 0, W, Hh, k0, d);
        const lines = await read(c); const cw = c.width, ch = c.height; free(c);
        const res = SheetParser.parseDetailed(lines);
        const score = res.found.length * 2 + res.missed.length;
        if (!best || score > best.score) { best = { score, res, d, cw, ch }; deg = d; }
        if (score > 0) break;
      }
      const reads = [], missed = [];
      const take = (res, d, cw, ch, sx, sy, k, owns) => {
        reads.push(place(res.found, d, cw, ch, sx, sy, k, owns));
        for (const m of res.missed) { const [bx, by] = unturn(m.left, m.top, d, cw, ch); const hh = (m.bottom - m.top) / k;
          missed.push({ x: sx + bx / k, y: sy + by / k, h: hh, deg: d }); }
      };
      const overview = { res: best.res };
      // 2) tiles for dense or partly-read photos
      const dense = best.res.found.length >= 4 || best.res.missed.length > 0;
      const tileReads = [];
      if (dense && Math.max(W, Hh) > MAX_EDGE * 1.1) {
        const cols = 2, rows = 2, ov = 0.2, tiles = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const cl = W * c / cols, cr = W * (c + 1) / cols, ct = Hh * r / rows, cb = Hh * (r + 1) / rows, ox = W * ov / 2, oy = Hh * ov / 2;
          tiles.push({ l: Math.max(0, cl - ox), t: Math.max(0, ct - oy), r: Math.min(W, cr + ox), b: Math.min(Hh, cb + oy),
            owns: (x, y) => (c === 0 || x >= cl) && (c === cols - 1 || x < cr) && (r === 0 || y >= ct) && (r === rows - 1 || y < cb) });
        }
        for (const [i, t] of tiles.entries()) {
          progress(`Reading part ${i + 1} of ${tiles.length}…`);
          const k = Math.min(1, MAX_EDGE / Math.max(t.r - t.l, t.b - t.t));
          const c = crop(src, t.l, t.t, t.r - t.l, t.b - t.t, k, deg);
          const lines = await read(c); const cw = c.width, ch = c.height; free(c);
          const before = reads.length; take(SheetParser.parseDetailed(lines), deg, cw, ch, t.l, t.t, k, t.owns);
          tileReads.push(...reads.splice(before));
        }
      }
      take(overview.res, best.d, best.cw, best.ch, 0, 0, k0, null);
      let merged = SheetParser.mergePlaced([...tileReads, ...reads]);
      // 3) sharper look at headers nobody read
      const todo = [];
      for (const m of missed) {
        const near = merged.some(f => Math.abs(f.rx - m.x) < m.h * 30 && f.ry > m.y - m.h * 3 && f.ry < m.y + m.h * 10);
        if (!near && !todo.some(t => Math.abs(t.x - m.x) < m.h * 4 && Math.abs(t.y - m.y) < m.h * 4)) todo.push(m);
      }
      const extra = [];
      for (const [i, m] of todo.slice(0, 20).entries()) {
        progress(`Sharper look ${i + 1} of ${Math.min(20, todo.length)}…`);
        // header frame in raw px: from a bit above the Customer label to below the ZIP, across to the Delivery header
        const box = (deg === 90 || deg === 270) ? { w: 14 * m.h, h: 50 * m.h } : { w: 50 * m.h, h: 14 * m.h };
        let sx, sy;
        if (deg === 0) { sx = m.x - 2 * m.h; sy = m.y - 5 * m.h; } else if (deg === 180) { sx = m.x - 48 * m.h; sy = m.y - 9 * m.h; }
        else if (deg === 90) { sx = m.x - 9 * m.h; sy = m.y - 2 * m.h; } else { sx = m.x - 5 * m.h; sy = m.y - 48 * m.h; }
        sx = Math.max(0, sx); sy = Math.max(0, sy);
        const sw = Math.min(W - sx, box.w), sh = Math.min(Hh - sy, box.h);
        const k = Math.min(3, Math.max(1, 32 / m.h), 2400 / Math.max(sw, sh));
        const c = crop(src, sx, sy, sw, sh, k, deg, true);
        const lines = await read(c); const cw = c.width, ch = c.height; free(c);
        extra.push(place(SheetParser.parseDetailed(lines).found, deg, cw, ch, sx, sy, k, null));
      }
      if (extra.length) merged = SheetParser.mergePlaced([...extra, merged]);
      return SheetParser.order(merged).map(({ rx, ry, ...f }) => f);
    } finally {
      if (src && src.close) src.close();
      src = null;
    }
  }
  return { readPhoto, stop, linesOf };
})();
