'use strict';
const APP_VERSION = '1.1';
const $ = (s,r=document) => r.querySelector(s);
const $$ = (s,r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ICON_PERSON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';
const settings = Object.assign({columns:2, lastZip:''}, JSON.parse(localStorage.getItem('ct-settings')||'{}'));
const saveSettings = () => localStorage.setItem('ct-settings', JSON.stringify(settings));

let people=[], tab='active', stack=[], query='', expandedId=null, runsOpen=false, trackerMonth=(()=>{const d=today0(); d.setDate(1); return d;})();
const byId = id => people.find(p=>p.id===id);

/* ---------- shell ---------- */
function toast(msg, ms=2400){ const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.add('hidden'),ms); }
function sheet(html, bind){ const s=$('#sheet'); s.innerHTML=`<div class="panel">${html}</div>`; s.classList.remove('hidden'); const opened=Date.now(); s.onclick=e=>{ if(e.target===s&&Date.now()-opened>400) closeSheet(); }; $$('[data-close]',s).forEach(b=>b.onclick=closeSheet); bind&&bind(s); }
const closeSheet = () => { $('#sheet').classList.add('hidden'); $('#sheet').innerHTML=''; };
function ask(title, msg, okLabel='OK', danger=false){ return new Promise(res=>sheet(`<h3>${esc(title)}</h3>${msg?`<p class="msg">${esc(msg)}</p>`:''}<button class="btn full ${danger?'danger':''}" id="ok">${esc(okLabel)}</button><button class="btn ghost full" id="no">Cancel</button>`,
  s=>{ $('#ok',s).onclick=()=>{closeSheet();res(true);}; $('#no',s).onclick=()=>{closeSheet();res(false);}; s.onclick=e=>{ if(e.target===s){closeSheet();res(false);} }; })); }
async function load(){ people=(await DB.all()).map(normalize); }
async function save(p){ await DB.put(p); await load(); render(); }
function go(view){ stack.push(view); render(); window.scrollTo(0,0); }
function openProfile(id){ if(tab==='map'&&window.mapState) mapState.keep=true; go({type:'profile',id}); }
$('#back').onclick=()=>{ stack.pop(); render(); };
$('#gear').onclick=()=>{ stack=[]; go({type:'settings'}); };
$$('#tabs button').forEach(b=>b.onclick=()=>{ tab=b.dataset.tab; stack=[]; expandedId=null; $$('#tabs button').forEach(x=>x.classList.toggle('on',x===b)); render(); window.scrollTo(0,0); });
$('#addBtn').onclick=()=>newProfile();

function render(){
  const top=stack[stack.length-1];
  $('#back').classList.toggle('hidden',!top); $('#gear').classList.toggle('hidden',!!top);
  $('#addBtn').classList.toggle('hidden', !!top || !['active','charged'].includes(tab));
  document.body.classList.toggle('mapmode', !top && tab==='map');
  const v=$('#view');
  if(top?.type==='profile') return renderProfile(v, byId(top.id));
  if(top?.type==='files') return renderFiles(v, byId(top.id));
  if(top?.type==='settings') return renderSettings(v);
  if(top?.type==='changelog') return renderChangelog(v);
  if(top?.type==='rhistory') return renderResolvedHistory(v);
  ({active:renderActive,charged:renderCharged,resolved:renderResolved,map:renderMap,trackers:renderTrackers})[tab](v);
}
function fitNames(root){ $$('.fit',root).forEach(el=>{ let f=parseFloat(getComputedStyle(el).fontSize); while(el.scrollWidth>el.clientWidth+1&&f>11){ f-=0.5; el.style.fontSize=f+'px'; } }); }
const statusChip = s => { const c=STATUS_COLORS[s]||STATUS_COLORS.Active; return `<span class="status" style="background:${c[0]};color:${c[1]}">${esc(s)}</span>`; };
const confirmChip = (a, twoCol) => { if(!a) return ''; const c=CONFIRMS.find(x=>x[0]===a.confirm)||CONFIRMS[2]; if(twoCol&&c[0]==='Unconfirmed') return ''; return `<span class="chip" style="background:${c[2]}">${c[1]}</span>`; };
const badgeHTML = b => b?`<span class="badge b-${b.toLowerCase()}">${b}</span>`:'';

/* ---------- lists ---------- */
const matches = p => { if(!query) return true; const q=query.toLowerCase();
  const hay=[fullName(p),cardName(p),listName(p),p.notes,p.employer,...p.phones.map(x=>x.number+' '+digits(x.number)),...p.addresses.map(x=>x.street+' '+x.zip),...p.cards.map(c=>c.description+(c.paid?' resolved '+c.payOut:''))].join(' ').toLowerCase();
  return hay.includes(q); };
function rowHTML(p, sec){
  const t=today0(), b=badge(p), two=settings.columns===2 && sec!=='resolved';
  const days = sec==='active'?daysLabel(p,t) : sec==='resolved'?'Resolved' : `${maxDaysUnpaid(p,t)} days past due`;
  const cards = sec==='active'?openCards(p,t) : p.cards.filter(c=>!c.paid);
  const rv = rvLine(p,cards); const a=primaryAddress(p);
  const pin = sec==='resolved'?'' : `<button class="pinbtn ${p.pinned?'on':''}" data-pin="${p.id}" aria-label="Pin">📌</button>`;
  return `<div class="row ${b.toLowerCase()} ${expandedId===p.id?'sel':''}" data-id="${p.id}" data-sec="${sec}">
   ${two?`<div class="rtop"><span class="name fit">${esc(cardName(p))}</span>${pin}</div>
   <div class="sub"><span class="days">${esc(days)}</span>${badgeHTML(b)}</div><div class="sub">${statusChip(p.status)}${confirmChip(a,true)}</div>`
   :`<div class="rtop"><span class="name fit">${esc(cardName(p))}</span>${badgeHTML(b)}${confirmChip(a,false)}${pin}</div>
   <div class="sub"><span class="days">${esc(days)}</span>${statusChip(p.status)}</div>`}
   ${rv?`<div class="sub rv">${esc(rv)}</div>`:''}
   ${sec==='resolved'?p.cards.filter(c=>c.paid).map(c=>`<div class="sub rv">${esc((c.description||'Card')+' · '+paidLabel(c))}</div>`).join(''):''}
  </div>`;
}
function quickHTML(p){
  const t=today0(); const lr=runLine(lastRun(p));
  return `<div class="quick" data-q="${p.id}"><div class="qtitle">${esc(fullName(p))}</div>
   ${p.addresses.map(a=>`<div class="qh">Address, ${esc(CONFIRM_QUICK[a.confirm]||'Unconfirmed')}${a.note?' · '+esc(a.note):''}</div><a class="addr" href="${googleDirections(forMaps(a.street,a.zip))}">${esc(a.street)}</a>`).join('')||'<div class="qh">No address</div>'}
   ${p.phones.map(x=>`<div class="qh">Phone, ${esc(x.kind)}${x.note?' · '+esc(x.note):''}</div><a class="addr" href="tel:${digits(x.number)}">${esc(fmtPhone(x.number))}</a>`).join('')}
   ${p.cards.map((c,i)=>`<div class="qcard ${c.paid?'paid':''}"><b>${esc(c.description||'Card '+(i+1))}</b> ${!c.paid?badgeHTML(c.delinquency):''}<br><span>${esc(cardDueLabel(c,t))}${c.remainingValue!=null&&!c.paid?' · RV '+money(c.remainingValue)+'$':''}</span></div>`).join('')}
   ${lr?`<div class="qh lastrun">${esc(lr)}</div>`:''}
   <div class="qbtns"><button class="btn small" data-open="${p.id}">Open profile</button><button class="btn small ghost" data-log="${p.id}">Log run</button></div></div>`;
}
function listBlock(title, list, sec){
  if(!list.length) return `<h2>${title}</h2><div class="empty">No one in this section.</div>`;
  const cls = settings.columns===2&&sec!=='resolved'?'grid two':'grid';
  let html=''; const cols= cls.includes('two')?2:1;
  list.forEach((p,i)=>{ html+=rowHTML(p,sec); const endOfRow=(i%cols===cols-1)||i===list.length-1;
    if(endOfRow){ const rowItems=list.slice(i-(i%cols), i+1); const sel=rowItems.find(x=>x.id===expandedId); if(sel) html+=quickHTML(sel); } });
  return `<h2>${title} · ${list.length}</h2><div class="${cls}">${html}</div>`;
}
function bindList(v){
  $$('.row',v).forEach(r=>r.onclick=e=>{ const id=+r.dataset.id; if(e.target.closest('[data-pin]')) return; expandedId = expandedId===id?null:id; render(); });
  $$('[data-pin]',v).forEach(b=>b.onclick=async e=>{ e.stopPropagation(); const p=byId(+b.dataset.pin); p.pinned=!p.pinned; await save(p); });
  $$('[data-open]',v).forEach(b=>b.onclick=()=>openProfile(+b.dataset.open));
  $$('[data-log]',v).forEach(b=>b.onclick=()=>pickRun(byId(+b.dataset.log)));
  const s=$('.search',v); if(s) s.oninput=e=>{ query=e.target.value; const pos=e.target.selectionStart; render(); const n=$('.search'); n.focus(); n.setSelectionRange(pos,pos); };
  fitNames(v);
}
const searchHTML = ph => `<input class="search" type="search" placeholder="${ph}" value="${esc(query)}">`;
function renderActive(v){
  $('#title').textContent='Credit Tracker';
  const list=people.filter(p=>isActiveList(p)&&matches(p)).sort(sortActive);
  v.innerHTML=searchHTML('Search name, phone, address, item')+listBlock('Active',list,'active')+(people.length?'':'<div class="empty"><button class="btn" id="demo">Load demo data</button></div>');
  bindList(v); $('#demo',v)?.addEventListener('click',loadDemo);
}
function renderCharged(v){
  $('#title').textContent='Charged off';
  const prev=people.filter(p=>listedIn(p,'previous')&&matches(p)).sort(sortPrev);
  const old=people.filter(p=>listedIn(p,'charged')&&matches(p)).sort(sortAZ);
  v.innerHTML=searchHTML('Search')+listBlock('Previous month charge off',prev,'previous')+listBlock('Charged off',old,'charged'); bindList(v);
}
function renderResolved(v){
  $('#title').textContent='Resolved';
  const list=people.filter(p=>isResolved(p)&&matches(p)).sort(sortAZ);
  v.innerHTML=searchHTML('Search (try "returned")')+`<button class="btn ghost full" id="rh">Resolved history</button>`+listBlock('Resolved',list,'resolved');
  bindList(v); $('#rh',v).onclick=()=>go({type:'rhistory'});
}
function renderResolvedHistory(v){
  $('#title').textContent='Resolved history';
  const rows=people.flatMap(p=>p.resolvedHistory.map(h=>({p,h}))).sort((a,b)=>String(b.h.paidOn).localeCompare(String(a.h.paidOn)));
  v.innerHTML=`<div class="group">${rows.map(({p,h})=>`<div class="item col" data-open="${p.id}"><div><b>${esc(listName(p))}</b></div><div class="lbl">${esc([h.payOut||'Resolved',fmtDate(h.paidOn),resolvedDaysLabel(h.daysPastDue)].filter(Boolean).join(' · '))}</div>
    <div class="lbl">${esc([h.item,h.remainingValue!=null?'RV '+money(h.remainingValue)+'$':''].filter(Boolean).join(' · '))}</div>${h.note?`<div class="lbl">${esc(h.note)}</div>`:''}</div>`).join('')||'<div class="empty">Nothing resolved yet.</div>'}</div>`;
  $$('[data-open]',v).forEach(b=>b.onclick=()=>openProfile(+b.dataset.open));
}
function renderTrackers(v){
  $('#title').textContent='Trackers';
  const m=trackerMonth, lines=[];
  people.forEach(p=>{ p.cards.forEach((c,i)=>{ if(c.paid) return; const d=parseDate(c.pastDueDate); if(!d) return; const off=addDays(d,90); if(off.getFullYear()!==m.getFullYear()||off.getMonth()!==m.getMonth()) return;
    lines.push({p,off,label:c.description.trim()||'Card '+(i+1),rv:c.remainingValue}); }); });
  const groups=[...lines.reduce((mp,l)=>{ (mp.get(l.p.id)||mp.set(l.p.id,[]).get(l.p.id)).push(l); return mp; },new Map()).values()].map(ls=>({p:ls[0].p,ls:ls.sort((a,b)=>a.off-b.off)}))
    .sort((a,b)=>a.ls[0].off-b.ls[0].off||sortAZ(a.p,b.p));
  const total=sumMoney(lines.map(l=>l.rv||0));
  v.innerHTML=`<div class="monthbar"><button class="btn small ghost" id="mp">◀</button><div><b>${m.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</b><div class="lbl">Total RV ${money(total)}$</div></div><button class="btn small ghost" id="mn">▶</button></div>
   <p class="lbl hint">Cards charging off (day 90) this month.</p>
   ${groups.map(g=>`<div class="group" data-open="${g.p.id}"><div class="item"><b>${esc(listName(g.p))}</b><span class="lbl">${g.ls.some(l=>l.rv!=null)?'RV '+money(sumMoney(g.ls.map(l=>l.rv||0)))+'$':''}</span></div>
     ${g.ls.map(l=>`<div class="item"><span>${esc(l.label)}</span><span class="lbl">${fmtShort(iso(l.off))}${l.rv!=null?' · RV '+money(l.rv)+'$':''}</span></div>`).join('')}</div>`).join('')||'<div class="empty">No charge-offs this month.</div>'}`;
  $('#mp',v).onclick=()=>{ trackerMonth=new Date(m.getFullYear(),m.getMonth()-1,1); render(); };
  $('#mn',v).onclick=()=>{ trackerMonth=new Date(m.getFullYear(),m.getMonth()+1,1); render(); };
  $$('[data-open]',v).forEach(b=>b.onclick=()=>openProfile(+b.dataset.open));
}

/* ---------- profile ---------- */
function age(b){ const d=parseDate(b); if(!d) return ''; const t=today0(); let a=t.getFullYear()-d.getFullYear(); if(t<new Date(t.getFullYear(),d.getMonth(),d.getDate())) a--; return a; }
function renderProfile(v,p){
  if(!p){ stack.pop(); return render(); }
  $('#title').textContent=cardName(p);
  const t=today0(), b=badge(p), open=p.cards.filter(c=>!c.paid), done=p.cards.filter(c=>c.paid);
  const trv=totalRv(open); const lr=lastRun(p); const runs=[...p.runHistory].sort((a,b)=>b.at-a.at);
  const links=p.links.map(byId).filter(Boolean);
  v.innerHTML=`<div class="hero"><div class="big">${esc(fullName(p))}</div><div class="days">${esc(daysLabel(p,t))} ${badgeHTML(b)}</div>
   <div class="herobtns"><button class="statusbtn" id="stBtn" style="background:${STATUS_COLORS[p.status][0]};color:${STATUS_COLORS[p.status][1]}">${esc(p.status)} ▾</button>
   <button class="btn small ghost ${p.pinned?'pinon':''}" id="pinBtn">📌 ${p.pinned?'Pinned':'Pin'}</button><button class="btn small ghost" id="filesBtn">Files</button></div></div>
  <h2>Text group</h2><div class="quickrun">${RUN_KINDS.map(([k])=>`<button class="btn ghost" data-run="${k}">${k}</button>`).join('')}</div>
  <div class="group"><div class="item" id="runHdr"><span class="${lr?'':'lbl'}">${lr?esc(`Last run: ${lr.result} · ${shortWhen(lr.at)} · ${runs.length} run${runs.length===1?'':'s'}`):'No runs logged yet'}</span><span class="lbl">${runs.length?(runsOpen?'▾':'▸'):''}</span></div>
   ${runsOpen?runs.map(r=>`<div class="item"><div><div>${esc(r.result)}${r.note?' · '+esc(r.note):''}</div><div class="lbl">${esc(new Date(r.at).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</div></div><button class="x" data-delrun="${r.id}" aria-label="Delete run">✕</button></div>`).join(''):''}</div>
  <h2>Addresses <button class="add" id="addAddr">＋</button></h2><div class="group">${p.addresses.map((a,i)=>`<div class="item"><div class="grow" data-eaddr="${i}"><div class="lbl">Address, ${esc(CONFIRM_QUICK[a.confirm])}${a.primary?' · Primary':''} ${confirmChip(a)}</div><div>${esc(a.street)}</div><div class="lbl">ZIP ${esc(a.zip||'—')}${a.note?' · '+esc(a.note):''}</div></div><button class="btn small" data-go="${i}">Go ➤</button></div>`).join('')||'<div class="item lbl">No address</div>'}</div>
  <h2>Phones <button class="add" id="addPhone">＋</button></h2><div class="group">${p.phones.map((x,i)=>`<div class="item"><div class="grow" data-ephone="${i}"><div class="lbl">Phone, ${esc(x.kind)}${x.note?' · '+esc(x.note):''}${x.primary?' · Primary':''}</div><div>${esc(fmtPhone(x.number))}</div></div><div class="btnrow"><a class="btn small" href="tel:${digits(x.number)}">Call</a><a class="btn small ghost" href="sms:${digits(x.number)}">Text</a></div></div>`).join('')||'<div class="item lbl">No phone</div>'}</div>
  <h2>Cards ${trv!=null?`<span class="lbl">Total RV ${money(trv)}$</span>`:''}</h2>${open.map(c=>cardHTML(p,c,t)).join('')}<button class="btn ghost full" id="addCard">＋ Add card</button>
  ${open.length>1?'<button class="btn ghost full" id="allPaid">Mark all cards resolved</button>':''}
  ${done.length?`<h2>Resolved cards</h2>${done.map(c=>cardHTML(p,c,t)).join('')}`:''}
  <h2>Details <button class="add" id="editDetails">Edit</button></h2><div class="group">
   <div class="item"><span class="lbl">Name</span><span>${esc(fullName(p))}</span></div>
   <div class="item"><span class="lbl">Birthday</span><span>${p.birthday?esc(fmtShort(p.birthday))+' ('+age(p.birthday)+')':'—'}</span></div>
   <div class="item"><span class="lbl">Reason speculated</span><span>${esc(p.reasonSpeculated)}</span></div>
   <div class="item"><span class="lbl">Language</span><span>${esc(p.language)}</span></div>
   <div class="item"><span class="lbl">Employer</span><span>${esc(p.employer||'—')}${p.employerNote?`<br><span class="lbl">${esc(p.employerNote)}</span>`:''}</span></div></div>
  <h2>Linked profiles <button class="add" id="addLink">＋</button></h2><div class="group">${links.map(l=>`<div class="item"><span class="grow" data-openl="${l.id}">${esc(fullName(l))} <span class="lbl">${esc(statusLine(l))}</span></span><button class="x" data-unlink="${l.id}">✕</button></div>`).join('')||'<div class="item lbl">None (up to 3)</div>'}</div>
  <h2>Notes</h2><textarea id="notes" rows="4" placeholder="Notes">${esc(p.notes)}</textarea>
  ${p.resolvedHistory.length?`<h2>Resolved history</h2><div class="group">${p.resolvedHistory.map(h=>`<div class="item col"><div>${esc([h.payOut||'Resolved',fmtDate(h.paidOn),resolvedDaysLabel(h.daysPastDue)].filter(Boolean).join(' · '))}</div><div class="lbl">${esc([h.item,h.remainingValue!=null?'RV '+money(h.remainingValue)+'$':''].filter(Boolean).join(' · '))}${h.note?' — '+esc(h.note):''}</div></div>`).join('')}</div>`:''}
  <button class="btn danger full" id="del" style="margin-top:24px">Delete profile</button>`;
  $('#pinBtn').onclick=()=>{ p.pinned=!p.pinned; save(p); };
  $('#filesBtn').onclick=()=>go({type:'files',id:p.id});
  $('#stBtn').onclick=()=>sheet(`<h3>Status</h3><div class="opts">${STATUSES.map(s=>`<button class="btn" style="background:${STATUS_COLORS[s][0]};color:${STATUS_COLORS[s][1]}" data-s="${s}">${s===p.status?'✓ ':''}${s}</button>`).join('')}</div>`, s=>$$('[data-s]',s).forEach(b=>b.onclick=()=>{ p.status=b.dataset.s; closeSheet(); save(p); }));
  $$('[data-run]',v).forEach(b=>b.onclick=()=>logRun(p,b.dataset.run));
  $('#runHdr').onclick=()=>{ if(p.runHistory.length){ runsOpen=!runsOpen; render(); } };
  $$('[data-delrun]',v).forEach(b=>b.onclick=async e=>{ e.stopPropagation(); if(await ask('Delete this run?','It is removed from Run History and Daily Run.','Delete',true)){ p.runHistory=p.runHistory.filter(r=>r.id!==+b.dataset.delrun); save(p); toast('Run deleted'); } });
  $('#addAddr').onclick=()=>editAddress(p,-1); $$('[data-eaddr]',v).forEach(b=>b.onclick=()=>editAddress(p,+b.dataset.eaddr));
  $$('[data-go]',v).forEach(b=>b.onclick=()=>directionsSheet(p.addresses[+b.dataset.go]));
  $('#addPhone').onclick=()=>editPhone(p,-1); $$('[data-ephone]',v).forEach(b=>b.onclick=()=>editPhone(p,+b.dataset.ephone));
  $('#addCard').onclick=()=>editCard(p,-1); $$('[data-card]',v).forEach(b=>b.onclick=()=>editCard(p,+b.dataset.card));
  $$('[data-resolve]',v).forEach(b=>b.onclick=()=>resolveCards(p,[+b.dataset.resolve]));
  $$('[data-undo]',v).forEach(b=>b.onclick=async()=>{ const c=p.cards[+b.dataset.undo]; if(!await ask(`Mark ${c.description||'card'} unresolved?`,'It counts toward days past due and RV again.','Mark unresolved')) return;
    Object.assign(c,{paid:false,payOut:'',paidOn:null,resolvedDaysPastDue:null,resolutionNote:''}); if(!c.pastDueDate) c.pastDueDate=iso(today0()); save(p); });
  $('#allPaid')?.addEventListener('click',()=>resolveCards(p,p.cards.map((c,i)=>c.paid?-1:i).filter(i=>i>=0)));
  $('#editDetails').onclick=()=>editDetails(p);
  $('#addLink').onclick=()=>linkPicker(p);
  $$('[data-openl]',v).forEach(b=>b.onclick=()=>go({type:'profile',id:+b.dataset.openl}));
  $$('[data-unlink]',v).forEach(b=>b.onclick=async()=>{ const o=byId(+b.dataset.unlink); p.links=p.links.filter(x=>x!==o.id); o.links=o.links.filter(x=>x!==p.id); await DB.put(o); save(p); });
  $('#notes').onchange=e=>{ p.notes=e.target.value; DB.put(p); toast('Notes saved'); };
  $('#del').onclick=async()=>{ if(await ask(`Delete ${fullName(p)}?`,"This removes the profile, its runs and files. It can't be undone.",'Delete',true)){
    for(const id of p.links){ const o=byId(id); if(o){ o.links=o.links.filter(x=>x!==p.id); await DB.put(o); } } await DB.del(p.id); stack.pop(); await load(); render(); } };
}
function cardHTML(p,c,t){
  const i=p.cards.indexOf(c); const pi=paidInLabel(c);
  const bits=[c.pastDueDate?'Due '+fmtShort(c.pastDueDate):null, c.amountDue!=null?`Amount due ${money(c.amountDue)}$`:null, c.remainingValue!=null?`RV ${money(c.remainingValue)}$`:null, c.epo!=null?`EPO ${c.epo}$`:null, pi].filter(Boolean);
  return `<div class="group card ${c.paid?'paid':''}"><div class="item"><div class="grow" data-card="${i}"><div><span class="lbl">Card #${i+1}</span> <b>${esc(c.description||'—')}</b> ${!c.paid?badgeHTML(c.delinquency):''}</div>
   <div class="${c.paid?'lbl':'cdays'}">${esc(cardDueLabel(c,t))}</div><div class="lbl">${esc(bits.join(' · '))}</div>${c.paid&&c.resolutionNote?`<div class="lbl">${esc(c.resolutionNote)}</div>`:''}</div>
   ${c.paid?`<button class="btn small ghost" data-undo="${i}">Undo</button>`:`<button class="btn small" data-resolve="${i}">Resolved…</button>`}</div></div>`;
}
function directionsSheet(a){ const addr=forMaps(a.street,a.zip);
  sheet(`<h3>${esc(addr)}</h3><div class="opts"><a class="btn full" href="${googleDirections(addr)}">Google Maps</a><a class="btn ghost full" href="${appleDirections(addr)}">Apple Maps</a><button class="btn ghost" id="cp">Copy address</button><button class="btn ghost" data-close>Cancel</button></div>`,
   s=>$('#cp',s).onclick=async()=>{ try{ await navigator.clipboard.writeText(addr); toast('Address copied'); }catch{ toast('Copy failed'); } closeSheet(); }); }
function resolveCards(p, idxs){
  sheet(`<h3>${idxs.length>1?'Mark all cards resolved':'Resolved: '+esc(p.cards[idxs[0]].description||'card')}</h3><label>Date</label><input type="date" id="pd" value="${iso(today0())}"><label>Resolution note (optional)</label><input id="rn" placeholder="Why / how">
   <label>How</label><div class="opts">${PAYOUTS.map(x=>`<button class="btn ghost" data-po="${esc(x)}">${esc(x)}</button>`).join('')}</div><button class="btn ghost full" data-close>Cancel</button>`,
   s=>$$('[data-po]',s).forEach(b=>b.onclick=async()=>{ const on=$('#pd',s).value||iso(today0()), note=$('#rn',s).value.trim();
     idxs.forEach(i=>{ const c=p.cards[i]; const pd=parseDate(c.pastDueDate); const d=pd?Math.max(0,daysBetween(pd,parseDate(on))):null;
       Object.assign(c,{paid:true,payOut:b.dataset.po,paidOn:on,resolvedDaysPastDue:d,resolutionNote:note});
       p.resolvedHistory.push({payOut:b.dataset.po,paidOn:on,note,item:c.description,remainingValue:c.remainingValue??null,daysPastDue:d}); });
     closeSheet(); await save(p); toast(isResolved(p)?'All cards resolved — moved to Resolved':'Card resolved'); }));
}

/* runs: log first, then open Messages via sms: */
function pickRun(p){ sheet(`<h3>Text group: ${esc(who(p))}</h3><div class="opts">${RUN_KINDS.map(([k])=>`<button class="btn ghost" data-k="${k}">${k}</button>`).join('')}<button class="btn ghost" data-close>Cancel</button></div>`, s=>$$('[data-k]',s).forEach(b=>b.onclick=()=>logRun(p,b.dataset.k))); }
function logRun(p, kind){
  const [,status,prompt]=RUN_KINDS.find(r=>r[0]===kind);
  sheet(`<h3>${esc(kind)}</h3><label>Message (edit before sending)</label><textarea id="msg" rows="3">${esc(runMessage(p,status,''))}${kind==='Note'||kind==='Answered'?', ':''}</textarea><p class="lbl hint">${esc(prompt)} — add it after the comma.</p>
   <button class="btn full" id="go">Log &amp; open Messages</button><button class="btn ghost full" data-close>Cancel</button>`, s=>{
    const ta=$('#msg',s); setTimeout(()=>{ ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length); },50);
    $('#go',s).onclick=async()=>{ const body=ta.value.trim().replace(/,\s*$/,''); const run=runFromMessage(p,kind,body);
      try{ p.runHistory.push(run); await DB.put(p); toast('Run logged'); }catch(e){ toast('Run NOT logged: '+e.message,4000); return; }
      closeSheet(); await load(); render(); if(window.mapState) mapState.dirty=true;
      setTimeout(()=>openSms('sms:&body='+encodeURIComponent(body)),150); };
  });
}

let openSms = url => { location.href = url; }; // iOS: opens Messages with the text filled in

/* ---------- editors ---------- */
const opt = (list,sel) => list.map(x=>`<option ${x===sel?'selected':''}>${esc(x)}</option>`).join('');
function editAddress(p,i){
  const a = i>=0 ? {...p.addresses[i]} : {street:'',confirm:'Unconfirmed',note:'',primary:!p.addresses.length,zip:''};
  sheet(`<h3>${i>=0?'Edit address':'New address'}</h3><label>Address</label><textarea id="st" rows="2" placeholder="3501 Ronald St, Lansing, MI">${esc(a.street)}</textarea>
   <label>Confirmed</label><select id="cf">${opt(CONFIRMS.map(c=>c[0]),a.confirm)}</select><label>Short note</label><input id="nt" value="${esc(a.note)}">
   <label class="check"><input type="checkbox" id="pr" ${a.primary?'checked':''}> Primary address</label><p class="lbl hint">ZIP fills in automatically: ${esc(a.zip||'—')}</p>
   <button class="btn full" id="sv">Save</button>${i>=0?'<button class="btn danger full" id="rm">Remove address</button>':''}<button class="btn ghost full" data-close>Cancel</button>`, s=>{
    $('#rm',s)?.addEventListener('click',async()=>{ p.addresses.splice(i,1); normalize(p); closeSheet(); await save(p); });
    $('#sv',s).onclick=async()=>{ const street=$('#st',s).value.trim(); if(!street){ toast('Type an address'); return; }
      const changed=street!==a.street; Object.assign(a,{street,confirm:$('#cf',s).value,note:$('#nt',s).value.trim(),primary:$('#pr',s).checked}); if(changed) a.zip=zipOf(street)||'';
      if(a.primary) p.addresses.forEach(x=>x.primary=false); if(i>=0) p.addresses[i]=a; else p.addresses.push(a); normalize(p);
      closeSheet(); await save(p); if(changed){ checkSame(p); fillZip(p.id, street); queueGeocode(); } };
  });
}
async function fillZip(id, street){ const z=await lookupZip(street); const p=byId(id); if(!p) return; const a=p.addresses.find(x=>x.street===street); if(!a) return; if(z&&a.zip!==z){ a.zip=z; await save(p); } }
function editPhone(p,i){
  const x = i>=0 ? {...p.phones[i]} : {number:'',kind:'Confirmed',note:'',primary:!p.phones.length};
  sheet(`<h3>${i>=0?'Edit phone':'New phone'}</h3><label>Number</label><input id="nu" type="tel" value="${esc(x.number)}"><label>Belongs to</label><select id="kd">${opt(PHONE_KINDS,x.kind)}</select>
   <label>Name / note</label><input id="nt" value="${esc(x.note)}" placeholder="e.g. Maria"><label class="check"><input type="checkbox" id="pr" ${x.primary?'checked':''}> Primary phone</label>
   <button class="btn full" id="sv">Save</button>${i>=0?'<button class="btn danger full" id="rm">Remove phone</button>':''}<button class="btn ghost full" data-close>Cancel</button>`, s=>{
    $('#rm',s)?.addEventListener('click',async()=>{ p.phones.splice(i,1); normalize(p); closeSheet(); await save(p); });
    $('#sv',s).onclick=async()=>{ const n=$('#nu',s).value.trim(); if(!n){ toast('Type a number'); return; } const changed=digits(n)!==digits(x.number);
      Object.assign(x,{number:fmtPhone(n),kind:$('#kd',s).value,note:$('#nt',s).value.trim(),primary:$('#pr',s).checked});
      if(x.primary) p.phones.forEach(y=>y.primary=false); if(i>=0) p.phones[i]=x; else p.phones.push(x); normalize(p); closeSheet(); await save(p); if(changed) checkSame(p); };
  });
}
function editCard(p,i){
  const c = i>=0 ? p.cards[i] : {description:'',pastDueDate:iso(today0()),remainingValue:null,amountDue:null,epo:null,paidIn:'',delinquency:'',paid:false};
  sheet(`<h3>${i>=0?'Card #'+(i+1):'New card'}</h3><label>Item</label><input id="ci" value="${esc(c.description)}" placeholder="PS5">
   <label>Past-due date</label><input id="cd" type="date" value="${esc(c.pastDueDate||'')}">
   <div class="two"><div><label>RV $</label><input id="cr" inputmode="decimal" value="${money(c.remainingValue)}"></div><div><label>EPO $</label><input id="ce" inputmode="numeric" value="${c.epo??''}"></div></div>
   <div class="two"><div><label>Amount due $</label><input id="ca" inputmode="decimal" value="${money(c.amountDue)}"></div><div><label>Paid In</label><input id="pi" value="${esc(c.paidIn)}" placeholder="$240 or 6 of 18 wks"></div></div>
   <label>FPD / SPD</label><select id="cq">${['','FPD','SPD'].map(x=>`<option value="${x}" ${x===c.delinquency?'selected':''}>${x||'None'}</option>`).join('')}</select>
   <button class="btn full" id="sv">Save</button>${i>=0?'<button class="btn danger full" id="rm">Remove card</button>':''}<button class="btn ghost full" data-close>Cancel</button>`, s=>{
    $('#rm',s)?.addEventListener('click',async()=>{ if(!await ask('Remove this card?','','Remove',true)) return; p.cards.splice(i,1); await save(p); });
    $('#sv',s).onclick=async()=>{ const epo=parseMoney($('#ce',s).value);
      Object.assign(c,{description:$('#ci',s).value.trim(),pastDueDate:$('#cd',s).value||null,remainingValue:parseMoney($('#cr',s).value),amountDue:parseMoney($('#ca',s).value),epo:epo==null?null:Math.ceil(epo),paidIn:$('#pi',s).value.trim(),delinquency:$('#cq',s).value});
      if(i<0) p.cards.push(c); closeSheet(); await save(p); };
  });
}
function editDetails(p){
  sheet(`<h3>Details</h3><div class="two"><div><label>First name</label><input id="fn" value="${esc(p.firstName)}"></div><div><label>Last name</label><input id="ln" value="${esc(p.lastName)}"></div></div>
   <label>Birthday</label><input id="bd" type="date" value="${esc(p.birthday||'')}"><label>Reason speculated</label><select id="rs">${opt(REASONS,p.reasonSpeculated)}</select>
   <label>Language</label><select id="lg">${opt(LANGUAGES,p.language)}</select><label>Employer / workplace</label><input id="em" value="${esc(p.employer)}"><label>Hours or best time</label><input id="en" value="${esc(p.employerNote)}">
   <button class="btn full" id="sv">Save</button><button class="btn ghost full" data-close>Cancel</button>`, s=>{
    $('#sv',s).onclick=async()=>{ const ln=$('#ln',s).value.trim(); if(!ln){ toast('Last name is required'); return; } const changed=ln!==p.lastName||$('#fn',s).value.trim()!==p.firstName;
      Object.assign(p,{firstName:$('#fn',s).value.trim(),lastName:ln,birthday:$('#bd',s).value||null,reasonSpeculated:$('#rs',s).value,language:$('#lg',s).value,employer:$('#em',s).value.trim(),employerNote:$('#en',s).value.trim()});
      closeSheet(); await save(p); if(changed) checkSame(p); };
  });
}
function linkPicker(p){
  if(p.links.length>=3){ toast('Up to 3 linked profiles'); return; }
  const cands=people.filter(o=>o.id!==p.id&&!p.links.includes(o.id)).sort(sortAZ);
  const list=q=>filterNames(cands,q).slice(0,40).map(o=>`<button class="pick" data-l="${o.id}">${esc(fullName(o))} <span class="lbl">${esc(statusLine(o))}</span></button>`).join('')||'<div class="empty">No match</div>';
  sheet(`<h3>Link a profile</h3><input class="search" id="lq" placeholder="Search name"><div id="ll">${list('')}</div><button class="btn ghost full" data-close>Cancel</button>`, s=>{
    const bind=()=>$$('[data-l]',s).forEach(b=>b.onclick=async()=>{ const o=byId(+b.dataset.l); if(o.links.length>=3){ toast(`${cardName(o)} already has 3 links`); return; } p.links.push(o.id); o.links.push(p.id); await DB.put(o); closeSheet(); await save(p); });
    $('#lq',s).oninput=e=>{ $('#ll',s).innerHTML=list(e.target.value); bind(); }; bind(); });
}
/* Same-person check (after name/phone/address edits; before creating a new profile) */
function sameDialog(hits, {title='Is this the same person?', newLabel='Keep both'}={}){
  return new Promise(res=>sheet(`<h3>${title}</h3>${hits.slice(0,5).map(h=>`<div class="group"><div class="item col"><b>${esc(fullName(h.person))}</b><div class="lbl">${esc(whyLine(h))}</div><div class="lbl">${esc(statusLine(h.person))}</div>
   <div class="lbl">${esc(addrText(h.person)||'No address')} · ${esc(primaryPhone(h.person)?fmtPhone(primaryPhone(h.person).number):'No phone')}</div><button class="btn small" data-same="${h.person.id}">Open this profile</button></div></div>`).join('')}
   <button class="btn ghost full" id="nw">${esc(newLabel)}</button>`, s=>{ $$('[data-same]',s).forEach(b=>b.onclick=()=>{ closeSheet(); res(+b.dataset.same); }); $('#nw',s).onclick=()=>{ closeSheet(); res(null); }; s.onclick=e=>{ if(e.target===s){ closeSheet(); res(null);} }; }));
}
async function checkSame(p){ const hits=findSame(people,p); if(!hits.length) return; const id=await sameDialog(hits,{title:'Possible duplicate',newLabel:'Not the same person'}); if(id) go({type:'profile',id}); }
function newProfile(){
  sheet(`<h3>New profile</h3><div class="two"><div><label>First name</label><input id="fn"></div><div><label>Last name</label><input id="ln"></div></div>
   <label>Address</label><textarea id="ad" rows="2" placeholder="3501 Ronald St, Lansing, MI"></textarea><label>Phone</label><input id="ph" type="tel">
   <label>First card item</label><input id="ci" placeholder="PS5"><div class="two"><div><label>Past-due date</label><input id="cd" type="date" value="${iso(today0())}"></div><div><label>RV $</label><input id="cr" inputmode="decimal"></div></div>
   <label>FPD / SPD</label><select id="cq"><option value="">None</option><option>FPD</option><option>SPD</option></select>
   <button class="btn full" id="sv">Create profile</button><button class="btn ghost full" data-close>Cancel</button>`, s=>{
    $('#sv',s).onclick=async()=>{ const g=id=>$(id,s).value.trim(); if(!g('#ln')){ toast('Last name is required'); return; }
      const p=normalize({id:Date.now(),firstName:g('#fn'),lastName:g('#ln'),status:'Active',
        addresses:g('#ad')?[{street:g('#ad'),confirm:'Unconfirmed',note:'',primary:true,zip:zipOf(g('#ad'))||''}]:[],
        phones:g('#ph')?[{number:fmtPhone(g('#ph')),kind:'Confirmed',note:'',primary:true}]:[],
        cards:(g('#ci')||g('#cr'))?[{description:g('#ci'),pastDueDate:g('#cd')||iso(today0()),remainingValue:parseMoney(g('#cr')),delinquency:$('#cq',s).value,paid:false,paidIn:'',payOut:''}]:[]});
      closeSheet(); const hits=findSame(people,p);
      if(hits.length){ const id=await sameDialog(hits,{newLabel:'No — create new profile'}); if(id){ go({type:'profile',id}); return; } }
      await DB.put(p); await load(); go({type:'profile',id:p.id}); if(p.addresses[0]){ fillZip(p.id,p.addresses[0].street); queueGeocode(); } };
  });
}

/* ---------- files ---------- */
async function renderFiles(v,p){
  if(!p){ stack.pop(); return render(); }
  $('#title').textContent='Files · '+cardName(p);
  const files=await DB.files(p.id); const urls=[];
  v.innerHTML=PHOTO_CATS.map(([k,t])=>{ const fs=files.filter(f=>f.category===k).sort((a,b)=>a.added-b.added);
    return `<h2>${t} · ${fs.length} <label class="add">＋<input type="file" accept="image/*" multiple hidden data-cat="${k}"></label></h2><div class="thumbs">${fs.map(f=>{ const u=URL.createObjectURL(f.blob); urls.push(u); return `<img src="${u}" data-f="${f.id}">`; }).join('')||'<div class="lbl">No photos</div>'}</div>`; }).join('');
  $$('input[type=file]',v).forEach(inp=>inp.onchange=async()=>{ for(const file of inp.files){ const blob=await shrink(file); await DB.putFile({id:Date.now()+Math.random(),personId:p.id,category:inp.dataset.cat,blob,added:Date.now(),name:file.name}); } toast('Photo saved'); render(); });
  $$('img[data-f]',v).forEach(img=>img.onclick=()=>viewer(img.src, +img.dataset.f));
}
async function shrink(file, max=2000){ try{ const bmp=await createImageBitmap(file); const s=Math.min(1,max/Math.max(bmp.width,bmp.height)); if(s===1&&file.size<1.5e6) return file;
  const c=document.createElement('canvas'); c.width=Math.round(bmp.width*s); c.height=Math.round(bmp.height*s); c.getContext('2d').drawImage(bmp,0,0,c.width,c.height); return await new Promise(r=>c.toBlob(r,'image/jpeg',0.85)); }catch{ return file; } }
function viewer(src,id){ const o=document.createElement('div'); o.className='viewer'; o.innerHTML=`<img src="${src}"><div class="vbar"><button class="btn ghost" id="vc">Close</button><button class="btn danger" id="vd">Delete</button></div>`;
  document.body.appendChild(o); $('#vc',o).onclick=()=>o.remove(); $('#vd',o).onclick=async()=>{ o.remove(); if(await ask('Delete this photo?','This removes it from the phone.','Delete',true)){ await DB.delFile(id); render(); } }; }

/* ---------- settings ---------- */
function renderSettings(v){
  $('#title').textContent='Settings';
  v.innerHTML=`<h2>Active list layout</h2><div class="seg"><button data-col="1" class="${settings.columns===1?'on':''}">1 column</button><button data-col="2" class="${settings.columns===2?'on':''}">2 columns</button></div>
   <div class="group" style="margin-top:14px"><div class="item"><span>Version</span><span class="lbl">Credit Tracker iOS ${APP_VERSION}</span></div><div class="item"><span>Profiles on this phone</span><span class="lbl">${people.length}</span></div>
   <div class="item tap" id="cl"><span>Change Log</span><span class="lbl">›</span></div></div>
   <h2>Backup</h2><div class="group"><div class="item tap" id="exp"><span>Export backup (with photos)</span><span class="lbl">›</span></div><div class="item tap" id="imp"><span>Import backup</span><span class="lbl">›</span></div></div>
   <p class="lbl hint">Your data lives only on this phone. Export a backup now and then — iOS can clear website data if the app isn't opened for a long time.</p>
   <h2>Demo</h2><div class="group"><div class="item tap" id="demo"><span>Load demo data</span><span class="lbl">›</span></div><div class="item tap" id="wipe"><span style="color:#e57373">Erase all data</span></div></div>
   <input type="file" id="file" accept="application/json,.json" hidden>`;
  $$('[data-col]',v).forEach(b=>b.onclick=()=>{ settings.columns=+b.dataset.col; saveSettings(); render(); });
  $('#cl').onclick=()=>go({type:'changelog'}); $('#exp').onclick=exportBackup; $('#imp').onclick=()=>$('#file').click();
  $('#file').onchange=e=>importBackup(e.target.files[0]); $('#demo').onclick=loadDemo;
  $('#wipe').onclick=async()=>{ if(await ask('Erase every profile on this phone?','Profiles, runs and photos are deleted. Export a backup first if you need one.','Erase all',true)){ await DB.clear(); await load(); render(); toast('All data erased'); } };
}
async function renderChangelog(v){
  $('#title').textContent='Change Log';
  const log=await fetch('changelog.json').then(r=>r.json()).catch(()=>[]);
  v.innerHTML=`<div class="group cl">${log.map(e=>`<h4>${esc(e.version)} <span class="lbl">${esc(fmtShort(e.date))}</span></h4><ul>${e.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`).join('')}</div>`;
}
const blobToData = b => new Promise(r=>{ const f=new FileReader(); f.onload=()=>r(f.result); f.readAsDataURL(b); });
async function exportBackup(){
  toast('Preparing backup…'); const files=await DB.allFiles();
  const data=JSON.stringify({app:'credit-tracker-ios',version:APP_VERSION,exported:new Date().toISOString(),people:await DB.all(),
    files:await Promise.all(files.map(async f=>({id:f.id,personId:f.personId,category:f.category,added:f.added,data:await blobToData(f.blob)})))});
  const name=`credit-tracker-backup-${iso(today0())}.json`; const file=new File([data],name,{type:'application/json'});
  if(navigator.canShare?.({files:[file]})){ try{ await navigator.share({files:[file],title:name}); return; }catch(e){ if(e.name==='AbortError') return; } }
  const a=document.createElement('a'); a.href=URL.createObjectURL(file); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
async function importBackup(f){
  if(!f) return; let j; try{ j=JSON.parse(await f.text()); }catch{ toast('That file is not a Credit Tracker backup'); return; }
  const list=Array.isArray(j)?j:j.people; if(!Array.isArray(list)){ toast('That file is not a Credit Tracker backup'); return; }
  if(!await ask(`Import ${list.length} profiles?`,'Profiles with the same ID are replaced; others are kept.','Import')) return;
  for(const p of list) if(p&&p.id!=null) await DB.put(normalize(p));
  for(const x of (j.files||[])){ const blob=await (await fetch(x.data)).blob(); await DB.putFile({id:x.id,personId:x.personId,category:x.category,added:x.added,blob}); }
  await load(); render(); toast(`Imported ${list.length} profiles`);
}

/* ---------- demo data (fake people, fake numbers 555-01xx) ---------- */
async function loadDemo(){
  const t=today0(), ago=n=>iso(addDays(t,-n)); let id=Date.now(); const H=3600e3, now=Date.now();
  const P=(fn,ln,street,zip,lat,lng,phone,cards,extra={})=>normalize({id:id++,firstName:fn,lastName:ln,
    addresses:street?[{street,confirm:'Confirmed Current',note:'',primary:true,zip}]:[],phones:phone?[{number:phone,kind:'Confirmed',note:'',primary:true}]:[],cards,
    lat,lng,geocodedFor:lat!=null?street:null,...extra});
  const C=(description,days,rv,delinquency='',more={})=>({description,pastDueDate:ago(days),remainingValue:rv,amountDue:Math.round(rv/9),epo:Math.ceil(rv*0.55),paidIn:'',delinquency,paid:false,payOut:'',...more});
  const run=(hAgo,result,note='')=>({id:now-hAgo*H,at:now-hAgo*H,result,note});
  const demo=[
    P('Harold','Fitzgerald','1200 Demo Ave, Lansing, MI','48912',42.7330,-84.5370,'555-0101',[C('PS5',22,375,'FPD')],{runHistory:[run(2,'N/A LDT'),run(27,'N/A')]}),
    P('Kara','Margosian','415 Sample St, Lansing, MI','48933',42.7365,-84.5555,'555-0102',[C('Sectional sofa',41,1180,'SPD'),C('TV 65"',12,640)],{runHistory:[run(1,'Answered','Will pay Friday')]}),
    P('Benny','Nyegun','88 Example Rd, Lansing, MI','48910',42.7105,-84.5450,'555-0103',[C('Washer',63,520)],{pinned:true,reasonSpeculated:'Unemployed'}),
    P('Tessa','Garfield','2700 Placeholder Ln, East Lansing, MI','48823',42.7420,-84.4800,'555-0104',[C('Laptop',14,290)],{runHistory:[run(26,'N/A')]}),
    P('Maria','Rodriguez-Alvarez','910 Mock Blvd, Lansing, MI','48911',42.6900,-84.5600,'555-0105',[C('Bedroom set',8,1450)],{status:'Moved OoS',language:'Spanish'}),
    P('Gus','Pemberton-Whitfield','5150 Rural Route 9, Mason, MI','48854',42.5800,-84.4400,'555-0109',[C('Dryer',14,410),C('Microwave',30,0,'',{paid:true,payOut:'Company $50 payoff',paidOn:ago(3),resolvedDaysPastDue:27})]),
    P('Dwayne','Okafor','33 Fiction Ct, Lansing, MI','48906',42.7600,-84.5500,'555-0106',[C('Refrigerator',101,880)]),
    P('Lena','Abernathy','77 Invented Way, Holt, MI','48842',42.6400,-84.5200,'555-0107',[C('Dinette',150,310)]),
    P('Sam','Quill','12 Pretend Pl, Lansing, MI','48917',42.7200,-84.6200,'555-0108',[C('Xbox',30,0,'',{paid:true,payOut:'Returned',paidOn:ago(2),resolvedDaysPastDue:28})],{resolvedHistory:[{payOut:'Returned',paidOn:ago(2),note:'Picked up at door',item:'Xbox',remainingValue:220,daysPastDue:28}]}),
  ];
  demo[0].links=[demo[1].id]; demo[1].links=[demo[0].id];
  for(const p of demo) await DB.put(p); await load(); render(); toast('Demo data loaded (fake people)');
}

/* ---------- background geocoding (pins), 1 request/sec ---------- */
let geoBusy=false; const geoFailed=new Set();
async function queueGeocode(){ if(geoBusy||!navigator.onLine) return; geoBusy=true;
  try{ for(;;){ const p=people.find(x=>isActiveList(x)&&addrText(x)&&x.geocodedFor!==addrText(x)&&!geoFailed.has(addrText(x))); if(!p) break;
      const a=addrText(p); const ll=await geocodeAddress(forMaps(a,primaryAddress(p).zip)); const fresh=byId(p.id);
      if(fresh&&addrText(fresh)===a){ if(ll){ fresh.lat=ll[0]; fresh.lng=ll[1]; fresh.geocodedFor=a; await DB.put(fresh); } else geoFailed.add(a); }
      await load(); if(window.mapState&&tab==='map'&&!stack.length) mapState.refreshPins?.(); await new Promise(r=>setTimeout(r,1100)); } }
  finally{ geoBusy=false; } }

/* ---------- service worker + update prompt ---------- */
if('serviceWorker' in navigator && location.protocol!=='file:'){
  navigator.serviceWorker.register('sw.js',{scope:'./'}).then(reg=>{
    const show=w=>{ const u=$('#update'); u.classList.remove('hidden'); u.onclick=()=>w.postMessage('skipWaiting'); };
    if(reg.waiting && navigator.serviceWorker.controller) show(reg.waiting);
    reg.addEventListener('updatefound',()=>{ const w=reg.installing; w.addEventListener('statechange',()=>{ if(w.state==='installed'&&navigator.serviceWorker.controller) show(w); }); });
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') reg.update(); });
  });
  const hadController=!!navigator.serviceWorker.controller; let reloaded=false; navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(hadController&&!reloaded){ reloaded=true; location.reload(); } });
}
navigator.storage?.persist?.();
document.addEventListener('visibilitychange',async()=>{ if(document.visibilityState==='visible'){ await load(); if(!$('#sheet').classList.contains('hidden')) return; render(); } });
(async()=>{ await load(); render(); queueGeocode(); })();
