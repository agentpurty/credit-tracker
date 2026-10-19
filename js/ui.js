/* Small UI helpers: escaping, toast, confirm and form sheets. */
'use strict';
const UI = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let toastT;
  function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
  /** Modal with title, html body and buttons [{label, value, kind}] -> Promise(value). */
  function modal(title, html, buttons, onOpen) {
    return new Promise(res => {
      const w = document.createElement('div'); w.className = 'modal-wrap';
      w.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><div class="modal-body">${html}</div><div class="modal-btns">${buttons.map((b, i) => `<button data-i="${i}" class="btn ${b.kind || ''}">${esc(b.label)}</button>`).join('')}</div></div>`;
      const close = v => { w.remove(); res(v); };
      w.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { const def = buttons[+b.dataset.i]; if (def.check && !def.check(w)) return; close(def.value === undefined ? null : (typeof def.value === 'function' ? def.value(w) : def.value)); } else if (e.target === w) close(null); });
      document.body.appendChild(w); if (onOpen) onOpen(w);
    });
  }
  const confirm = (title, text, yes = 'OK', danger = true) => modal(title, `<p>${esc(text)}</p>`, [{ label: 'Cancel', value: false }, { label: yes, value: true, kind: danger ? 'danger' : 'primary' }]);
  const when = t => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return { $, esc, toast, modal, confirm, when };
})();
