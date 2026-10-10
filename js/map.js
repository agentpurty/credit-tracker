'use strict';
/* Map tab: pins, gold ring (ran today), name card, search, ROUTE (ZIP / ALL / selected), DAILY RUN. */
window.mapState = {daily:false, view:null, map:null, layer:null, keep:false, dirty:false, markers:new Map()};
const pinColor = p => ({FPD:'#d9534f',SPD:'#e6c34a'})[badge(p)] || '#c98f95';
function nameCard(p, extra=''){ return `<div class="ncard"><span class="nname">${esc(cardName(p))}</span><button class="nopen" data-pid="${p.id}" aria-label="Open profile">${ICON_PERSON}</button></div><div class="nsub">${esc(daysLabel(p))}${extra}</div><div class="nsub">${esc(addrText(p))}</div>`; }

function renderMap(v){
  $('#title').textContent='Map';
  const st=mapState;
  v.innerHTML=`<div class="mapbar"><input class="search" id="msearch" type="search" placeholder="Find someone on the map"><button class="btn small" id="routeBtn">ROUTE</button><button class="btn small ${st.daily?'on-gold':'ghost'}" id="dailyBtn">DAILY RUN</button></div>
   <div id="msresults"></div><div id="daybar" class="${st.daily?'':'hidden'}"></div><div id="map"></div><div id="maphint" class="lbl hint">${st.daily?'':'Gold ring = ran today'}</div><div id="runlist"></div>`;
  if(!window.L){ $('#map').outerHTML='<div class="empty">Map could not load.</div>'; return; }
  try{ st.map?.remove(); }catch{} const map=L.map('map',{zoomControl:false,attributionControl:true}); st.map=map;
  L.tileLayer('https://{s}.basemap.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'© OpenStreetMap © CARTO',maxZoom:19,subdomains:'abcd'}).addTo(map);
  if(st.view) map.setView(st.view.center, st.view.zoom); else map.setView([42.73,-84.55],11);
  map.on('moveend',()=>st.view={center:map.getCenter(),zoom:map.getZoom()});
  map.on('popupopen',e=>{ const b=e.popup.getElement().querySelector('[data-pid]'); if(b) b.onclick=()=>openProfile(+b.dataset.pid); });
  st.layer=L.layerGroup().addTo(map);
  st.refreshPins=()=>{ if(!st.daily) drawPins(false); };
  $('#routeBtn').onclick=routeSheet;
  $('#dailyBtn').onclick=()=>{ st.daily=!st.daily; st.dayView=null; render(); };
  bindMapSearch();
  if(st.daily) drawDaily(); else drawPins(!st.view);
  setTimeout(()=>map.invalidateSize(),50);
  queueGeocode();
}
function drawPins(fit){
  const st=mapState, map=st.map; st.layer.clearLayers(); st.markers.clear();
  const ran=ranTodayIds(people); const pts=[];
  people.filter(p=>isActiveList(p)&&p.status==='Active').forEach(p=>{ const loc=located(p); if(!loc) return; pts.push(loc);
    if(ran.has(p.id)) L.circleMarker(loc,{radius:14,color:'#1a1a1a',weight:1,fillColor:'#f2c14e',fillOpacity:1,interactive:false}).addTo(st.layer);
    const m=L.circleMarker(loc,{radius:9,color:'#fff',weight:2,fillColor:pinColor(p),fillOpacity:1}).addTo(st.layer).bindPopup(nameCard(p),{closeButton:false,className:'npop'});
    st.markers.set(p.id,m); });
  if(fit&&pts.length) map.fitBounds(pts,{padding:[30,30],maxZoom:14});
}
function bindMapSearch(){
  const inp=$('#msearch'), out=$('#msresults');
  inp.oninput=()=>{ const q=inp.value.trim(); if(!q){ out.innerHTML=''; return; }
    const hits=filterNames(people.filter(p=>!mapState.daily?isActiveList(p):true),q).slice(0,6);
    out.innerHTML=`<div class="group">${hits.map(p=>`<div class="item tap" data-h="${p.id}"><span>${esc(cardName(p))}</span><span class="lbl">${located(p)?'':'not on map'}</span></div>`).join('')||'<div class="item lbl">No match</div>'}</div>`;
    $$('[data-h]',out).forEach(r=>r.onclick=()=>{ const p=byId(+r.dataset.h); out.innerHTML=''; inp.value=''; inp.blur(); highlight(p); }); };
}
function highlight(p){ const loc=located(p), map=mapState.map; if(!loc){ toast(`${cardName(p)} isn't on the map yet`); return; }
  map.flyTo(loc, Math.max(map.getZoom()+1,15), {duration:.6});
  const halo=L.circleMarker(loc,{radius:22,color:'#f2c14e',weight:4,fill:false,className:'halo'}).addTo(map); setTimeout(()=>halo.remove(),4000);
  const m=mapState.markers.get(p.id); if(m) setTimeout(()=>m.openPopup(),650); else L.popup({closeButton:false,className:'npop'}).setLatLng(loc).setContent(nameCard(p)).openOn(map); }

/* ---- ROUTE ---- */
function routeSheet(){
  const zips=activeZips(people); let zip=settings.lastZip||''; let fresh=true;
  sheet(`<h3>ROUTE</h3><div class="zipbox ${zip?'sel':''}" id="zb">${esc(zip)||'<span class="lbl">ZIP</span>'}</div>
   <div class="pad">${[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map(k=>`<button class="btn ghost" data-k="${k}">${k}</button>`).join('')}</div>
   <label>Active ZIPs (tap to route)</label><div class="zips">${zips.map(([z,n])=>`<button class="btn small ghost" data-z="${z}">${z} (${n})</button>`).join('')||'<span class="lbl">None</span>'}</div>
   <button class="btn full" id="rall">ROUTE ALL (every Active pin)</button><button class="btn ghost full" id="rsel">Route selected…</button><button class="btn ghost full" data-close>Cancel</button>`, s=>{
    const show=()=>{ const b=$('#zb',s); b.classList.toggle('sel',fresh&&!!zip); b.innerHTML=esc(zip)||'<span class="lbl">ZIP</span>'; };
    $$('[data-k]',s).forEach(b=>b.onclick=()=>{ const k=b.dataset.k;
      if(k==='⌫'){ zip=fresh?'':zip.slice(0,-1); fresh=false; } else if(k==='✓'){ return routeZip(zip); } else { if(fresh){ zip=''; fresh=false; } if(zip.length<5) zip+=k; } show(); });
    $$('[data-z]',s).forEach(b=>b.onclick=()=>routeZip(b.dataset.z));
    $('#rall',s).onclick=()=>{ const st=pinnedStops(people); if(!st.length){ toast('No Active accounts are on the map yet'); return; } showRoute('ALL', orderStops(st), []); };
    $('#rsel',s).onclick=pickSheet;
  });
}
function routeZip(zip){ if(!/^\d{5}$/.test(zip)){ toast('Type a 5-digit ZIP'); return; } settings.lastZip=zip; saveSettings();
  const r=routeFor(people,zip); if(!r.stops.length){ toast(r.skipped.length?`No usable addresses in ${zip}`:`No Active accounts in ${zip}`); if(!r.skipped.length) return; }
  showRoute('ZIP '+zip, orderStops(r.stops), r.skipped); }
function showRoute(title, ordered, skipped){
  const ps=parts(ordered); const single=ordered.length===1?ordered[0]:null;
  sheet(`<h3>Route ${esc(title)}</h3><p class="lbl hint">${ordered.length} stop${ordered.length===1?'':'s'}${ps.length>1?` in ${ps.length} parts of up to ${STOPS_PER_PART}`:''}. Google Maps starts from your location.</p>
   ${ps.map((pt,i)=>`<div class="group"><div class="item col"><b>${ps.length>1?`Part ${i+1} — stops ${i*STOPS_PER_PART+1}–${i*STOPS_PER_PART+pt.length}`:'Stops'}</b>
     <ol class="stops" start="${i*STOPS_PER_PART+1}">${pt.map(x=>`<li>${esc(x.name)} <span class="lbl">${esc(x.address)}${x.lat==null?' · no pin':''}</span></li>`).join('')}</ol>
     <a class="btn full" href="${mapsPathUrl(pt)}">Open ${ps.length>1?'Part '+(i+1)+' ':''}in Google Maps</a></div></div>`).join('')}
   ${single?`<a class="btn ghost full" href="${appleDirections(single.address)}">Open in Apple Maps</a>`:ps.length?'<p class="lbl hint">Apple Maps links take one stop at a time, so multi-stop routes open in Google Maps.</p>':''}
   ${skipped.length?`<h2>Left out</h2><div class="group">${skipped.map(k=>`<div class="item"><span>${esc(k.name)}</span><span class="lbl">${esc(k.reason)}</span></div>`).join('')}</div>`:''}
   <button class="btn ghost full" data-close>Done</button>`);
}
function pickSheet(){
  let all=false, chosen=new Set(), q='';
  const cands=()=>people.filter(p=>located(p)&&(all||isActiveList(p))).sort(sortAZ);
  const draw=s=>{ const list=filterNames(cands(),q);
    $('#pl',s).innerHTML=list.map(p=>`<label class="pick"><input type="checkbox" data-c="${p.id}" ${chosen.has(p.id)?'checked':''}> ${esc(cardName(p))} <span class="lbl">${esc(daysLabel(p))}</span></label>`).join('')||'<div class="empty">No one with a map location</div>';
    $('#pc',s).textContent=`Route ${chosen.size} selected`; $$('[data-c]',s).forEach(c=>c.onchange=()=>{ c.checked?chosen.add(+c.dataset.c):chosen.delete(+c.dataset.c); $('#pc',s).textContent=`Route ${chosen.size} selected`; }); };
  sheet(`<h3>Route selected</h3><input class="search" id="pq" placeholder="Search name"><label class="check"><input type="checkbox" id="pa"> Include all (not just Active)</label>
   <button class="btn ghost full" id="paste">Paste names…</button><div id="pl" class="picklist"></div><div id="pm"></div><button class="btn full" id="pc">Route 0 selected</button><button class="btn ghost full" data-close>Cancel</button>`, s=>{
    $('#pq',s).oninput=e=>{ q=e.target.value; draw(s); }; $('#pa',s).onchange=e=>{ all=e.target.checked; draw(s); };
    $('#paste',s).onclick=()=>{ const box=$('#pm',s); box.innerHTML=`<textarea id="pt" rows="4" placeholder="One per line or comma: Smith J, Garfield, Margosian K."></textarea><button class="btn small full" id="pgo">Match names</button><div id="pr"></div>`;
      $('#pgo',s).onclick=()=>{ const r=matchNames(parseNames($('#pt',s).value), cands()); r.matched.forEach(([,p])=>chosen.add(p.id));
        $('#pr',s).innerHTML=`<p class="lbl">${r.matched.length} matched and ticked.</p>${r.ambiguous.map(([raw,ps])=>`<p class="lbl">“${esc(raw)}” matches several: ${ps.map(p=>esc(cardName(p))).join(', ')} — tick the right one.</p>`).join('')}${r.unmatched.length?`<p class="lbl">No match: ${r.unmatched.map(esc).join(', ')}</p>`:''}`; draw(s); }; };
    $('#pc',s).onclick=()=>{ const ch=people.filter(p=>chosen.has(p.id)); const stops=distinctStops(ch.map(p=>{ const a=primaryAddress(p); const ad=a?forMaps(a.street,a.zip):''; const loc=located(p); return ad?{name:listName(p),id:p.id,address:ad,lat:loc?.[0]??null,lng:loc?.[1]??null}:null; }).filter(Boolean));
      if(!stops.length){ toast('Pick at least one person'); return; } showRoute('selected', orderStops(stops), []); };
    draw(s);
  });
}

/* ---- DAILY RUN ---- */
function drawDaily(){
  const st=mapState, map=st.map, now=Date.now();
  if(!st.dayView){ const sv=startView(people,now); if(sv.kind==='12h') st.dayView={kind:'12h'};
    else if(sv.kind==='day'){ st.dayView={kind:'day',day:sv.day}; toast(`No runs in the last 12 hours — showing ${dayLabel(sv.day)}`); }
    else { st.dayView={kind:'12h'}; toast('No runs logged yet'); } }
  const dv=st.dayView; const win = dv.kind==='12h'?[now-WINDOW_MS,now]:dayWindow(dv.day);
  const visits=visitsIn(people,win); const sp=spots(visits);
  const title = dv.kind==='12h'?'Last 12h':dayLabel(dv.day);
  $('#daybar').innerHTML=`<button class="btn small ghost" id="dprev">◀</button><button class="btn small ${dv.kind==='12h'?'':'ghost'}" id="d12">Last 12h</button><button class="btn small ${dv.kind==='day'&&+dv.day===+addDays(today0(),-1)?'':'ghost'}" id="dy">Yesterday</button><button class="btn small ghost" id="dnext">▶</button>`;
  st.layer.clearLayers(); st.markers.clear();
  const path=visits.map(v=>v.point).filter(Boolean); if(path.length>1) L.polyline(path,{color:'#f2c14e',weight:2,opacity:.8}).addTo(st.layer);
  const mk=new Map();
  sp.forEach(s=>{ const icon=L.divIcon({className:'runpin',html:`<span>${s.numbers.join(',')}</span>`,iconSize:null});
    const m=L.marker(s.point,{icon}).addTo(st.layer).bindPopup(nameCard(s.person,' · runs '+s.numbers.join(',')),{closeButton:false,className:'npop'}); mk.set(s.person.id,m); });
  if(path.length) map.fitBounds(path,{padding:[40,40],maxZoom:15});
  $('#runlist').innerHTML=`<h2>Runs — ${esc(title)} (${visits.length})</h2><div class="group">${visits.map(v=>`<div class="item tap" data-v="${v.person.id}"><span class="num">${v.number}</span><div class="grow"><div>${esc(cardName(v.person))} <span class="lbl">${timeOnly(v.run.at)}</span></div><div class="lbl">${esc(v.run.result)}${v.run.note?' · '+esc(v.run.note):''}${v.point?'':' · no map location'}</div></div><button class="btn small ghost" data-o="${v.person.id}">Open</button></div>`).join('')||'<div class="item lbl">No runs in this view.</div>'}</div>`;
  $$('[data-v]').forEach(r=>r.onclick=e=>{ if(e.target.closest('[data-o]')) return; const m=mk.get(+r.dataset.v); if(m){ map.setView(m.getLatLng(),16); m.openPopup(); window.scrollTo({top:0,behavior:'smooth'}); } else toast('No map location for this profile'); });
  $$('[data-o]').forEach(b=>b.onclick=()=>openProfile(+b.dataset.o));
  const setDay=d=>{ st.dayView=d; drawDaily(); };
  $('#d12').onclick=()=>setDay({kind:'12h'});
  $('#dy').onclick=()=>{ const y=addDays(today0(),-1); const has=visitsIn(people,dayWindow(y)).length; if(!has) toast('No runs yesterday'); setDay({kind:'day',day:y}); };
  $('#dprev').onclick=()=>{ const from= dv.kind==='12h'?now-WINDOW_MS:dayWindow(dv.day)[0]; const d=nearestEarlierDay(people,from); if(d) setDay({kind:'day',day:d}); else toast('No earlier runs'); };
  $('#dnext').onclick=()=>{ if(dv.kind==='12h'){ toast('Already at the latest runs'); return; } const end=dayWindow(dv.day)[1]; const d=nearestLaterDay(people,end);
    if(d&&+d<=+today0()) setDay({kind:'day',day:d}); else if(+dv.day<+today0()) setDay({kind:'day',day:today0()}); else toast('No later runs'); };
}
