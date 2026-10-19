/* Run texts (same as the Android app's 9.3+ "Send run text"): pick a template, add an optional note, edit the
 * preview, then Messages opens with the text filled in. The app never sends anything itself: you pick your
 * group thread in Messages and tap Send. No recipient is filled in (scanned stops have no phone number, and
 * the text goes to your own group thread, not to the customer). Sending marks the stop as run. */
'use strict';
const RunText = (() => {
  const { esc, toast } = UI;
  const DEFAULTS = [
    { button: 'N/A', text: '{who}, N/A', ask: 'Optional note' },
    { button: 'N/A LDT', text: '{who}, N/A LDT', ask: 'Optional note' },
    { button: 'Answered', text: '{who}, Answered', ask: 'What happened?' },
    { button: 'Note', text: '{who}', ask: 'Note', needsNote: true },
  ];
  const templates = () => (Array.isArray(Store.settings.templates) && Store.settings.templates.length ? Store.settings.templates : DEFAULTS);
  /** "D. Example" (first initial + last word), like Android GroupText.who. */
  function who(name) {
    const t = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!t.length) return '';
    const last = t[t.length - 1], first = t.length > 1 ? t[0] : '';
    const ini = (first.match(/[A-Za-z0-9]/) || [''])[0].toUpperCase();
    return [ini && ini + '.', last].filter(Boolean).join(' ');
  }
  function message(tpl, name, note) {
    const base = tpl.text.replace(/\{who\}/g, who(name)).trim();
    const n = String(note || '').trim().replace(/\s*\n\s*/g, ' ');
    return [base, n].filter(Boolean).join(', ');
  }
  const ios = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  const smsUrl = body => (ios ? 'sms:&body=' : 'sms:?body=') + encodeURIComponent(body);

  /** Template menu, then the compose sheet. onSent({result, note, text}) runs when Messages is opened. */
  function pick(name, onSent) {
    const ts = templates();
    const w = document.createElement('div'); w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal"><h3>Text group: ${esc(who(name))}</h3><div class="modal-body tpl-list">${ts.map((t, i) => `<button class="btn tpl" data-t="${i}">${esc(t.button)}</button>`).join('')}</div><div class="modal-btns"><button class="btn" data-x>Cancel</button></div></div>`;
    w.onclick = e => { const b = e.target.closest('[data-t]'); if (b) { w.remove(); compose(name, ts[+b.dataset.t], onSent); } else if (e.target === w || e.target.closest('[data-x]')) w.remove(); };
    document.body.appendChild(w);
  }
  function compose(name, tpl, onSent) {
    const w = document.createElement('div'); w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal"><h3>${esc(tpl.needsNote ? 'Text group: note' : 'Text group: ' + tpl.button)}</h3><div class="modal-body">
      <label>${esc(tpl.ask || 'Optional note')}<textarea class="rt-note" rows="${tpl.needsNote ? 2 : 1}"></textarea></label>
      <label>Message (you can edit it)<textarea class="rt-body" rows="3">${esc(message(tpl, name, ''))}</textarea></label>
      <p class="hint">Opens Messages with this text filled in. Pick your group thread, then tap Send there.</p><p class="err" hidden></p></div>
      <div class="modal-btns"><button class="btn" data-x>Cancel</button><a class="btn primary rt-send" href="#">Open Messages</a></div></div>`;
    const note = w.querySelector('.rt-note'), body = w.querySelector('.rt-body'), send = w.querySelector('.rt-send');
    let edited = false;
    const sync = () => { send.href = smsUrl(body.value.trim()); };
    note.oninput = () => { if (!edited) body.value = message(tpl, name, note.value); sync(); };
    body.oninput = () => { edited = true; sync(); };
    sync();
    send.onclick = e => {   // a real link so iOS opens Messages straight from the tap
      const text = body.value.trim();
      if (!text || (tpl.needsNote && text === who(name))) { e.preventDefault(); const er = w.querySelector('.err'); er.textContent = 'Type a message first'; er.hidden = false; return; }
      sync();
      const prefix = who(name) + ',';
      const rest = text.startsWith(prefix) ? text.slice(prefix.length).trim() : text;
      const t = templates().find(x => !x.needsNote && (rest === x.button || rest.startsWith(x.button + ',')));
      const result = tpl.needsNote ? 'Note' : (t ? t.button : tpl.button);
      const runNote = t && !tpl.needsNote ? rest.slice(t.button.length).replace(/^,\s*/, '') : rest;
      try { onSent({ result, note: runNote, text }); toast('Run logged'); } catch (err) { toast('Run NOT logged: ' + err.message, 5000); }
      setTimeout(() => w.remove(), 50);
    };
    w.onclick = e => { if (e.target === w || e.target.closest('[data-x]')) w.remove(); };
    document.body.appendChild(w); note.focus();
  }

  /* settings editor */
  function editorHtml() {
    return `<div class="tpl-edit">${templates().map(t => `<div class="tpl-row" data-note="${t.needsNote ? 1 : ''}" data-ask="${esc(t.ask || '')}"><input class="tpl-b" value="${esc(t.button)}" aria-label="Button"><input class="tpl-t" value="${esc(t.text)}" aria-label="Text"><button class="x tpl-del" aria-label="Delete">×</button></div>`).join('')}</div>
      <div class="tpl-tools"><button class="btn tpl-add">＋ Add template</button><button class="btn tpl-reset">Reset</button></div>
      <p class="hint">{who} becomes the first initial and last name, e.g. “D. Example”. A note typed when sending is added after a comma.</p>`;
  }
  function wireEditor(root) {
    const list = root.querySelector('.tpl-edit');
    root.querySelector('.tpl-add').onclick = () => { const d = document.createElement('div'); d.className = 'tpl-row'; d.dataset.ask = 'Optional note'; d.innerHTML = '<input class="tpl-b" placeholder="Button" aria-label="Button"><input class="tpl-t" value="{who}, " aria-label="Text"><button class="x tpl-del" aria-label="Delete">×</button>'; list.appendChild(d); d.querySelector('input').focus(); };
    root.querySelector('.tpl-reset').onclick = () => { list.innerHTML = DEFAULTS.map(t => `<div class="tpl-row" data-note="${t.needsNote ? 1 : ''}" data-ask="${esc(t.ask)}"><input class="tpl-b" value="${esc(t.button)}" aria-label="Button"><input class="tpl-t" value="${esc(t.text)}" aria-label="Text"><button class="x tpl-del" aria-label="Delete">×</button></div>`).join(''); };
    list.onclick = e => { const d = e.target.closest('.tpl-del'); if (d) d.parentElement.remove(); };
  }
  function readEditor(root) {
    const out = [...root.querySelectorAll('.tpl-row')].map(r => ({ button: r.querySelector('.tpl-b').value.trim(), text: r.querySelector('.tpl-t').value.trim(), ask: r.dataset.ask || 'Optional note', needsNote: !!r.dataset.note }))
      .filter(t => t.button && t.text);
    return out.length ? out : DEFAULTS;
  }
  return { pick, who, message, smsUrl, editorHtml, wireEditor, readEditor, DEFAULTS };
})();
