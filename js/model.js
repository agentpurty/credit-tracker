'use strict';
/* Data model and rules, ported from the Android app (Person.kt, RoutePlanner.kt, RoutePick.kt, DailyRun.kt, ScanMatch.kt). */
const STATUSES = ['Active','Moved OoS','Dead','Pawned','Stolen','Broken','BedBugs','Roaches','Dangerous'];
const STATUS_COLORS = {'Active':['#4E9A62','#fff'],'Moved OoS':['#7D93A6','#1a1a1a'],'Dead':['#D0D5DA','#1a1a1a'],'Pawned':['#C6A35A','#1a1a1a'],'Stolen':['#C75A56','#fff'],'Broken':['#D08A45','#1a1a1a'],'BedBugs':['#9A7264','#fff'],'Roaches':['#8B8F3E','#1a1a1a'],'Dangerous':['#8F3E42','#fff']};
const CONFIRMS = [ // label, short chip, bg
  ['Confirmed Current','Current','#7DAB86'],['Confirmed Moved','Moved','#D4B483'],['Unconfirmed','Unconfirmed','#8E99A4'],['Address Fake','Fake','#D98989'],['Abandon House','Abandoned','#B09ABF']];
const CONFIRM_QUICK = {'Confirmed Current':'Current','Confirmed Moved':'Confirmed Moved','Unconfirmed':'Unconfirmed','Address Fake':'Fake','Abandon House':'Abandoned'};
const PHONE_KINDS = ['Confirmed','Relative','Spouse','Disconnected','Old Number'];
const REASONS = ['N/A','Unemployed','Incarcerated','Ratchet','Mental Issue','Ignorance','No Contact','Stealing','Hospitalized'];
const LANGUAGES = ['English','Spanish'];
const PAYOUTS = ['Returned','Bailout','EPO','RV Pay Out','Full due payment','Company $50 payoff'];
const RUN_KINDS = [['N/A','N/A','Note (optional)'],['N/A LDT','N/A LDT','Note (optional)'],['Answered','Answered','What happened?'],['Note','','Note']];
const PHOTO_CATS = [['id','ID'],['lease','Lease'],['income','Income'],['other','Other']];

const DAY = 864e5;
const today0 = () => { const d=new Date(); d.setHours(0,0,0,0); return d; };
const parseDate = s => { if(!s) return null; const [y,m,d]=String(s).split('-').map(Number); return y?new Date(y,m-1,d):null; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const daysBetween = (a,b) => Math.round((b-a)/DAY);
const addDays = (d,n) => new Date(d.getFullYear(), d.getMonth(), d.getDate()+n);
const fmtDate = s => { const d=parseDate(s); return d? d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):''; };
const fmtShort = s => { const d=parseDate(s); return d? d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):''; };
const dayLabel = d => d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}); // Thu, Oct 8
const shortWhen = ms => new Date(ms).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const timeOnly = ms => new Date(ms).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
const money = v => { if(v==null||v===''||isNaN(v)) return ''; const c=Math.round(v*100); return c%100===0? String(c/100) : (c/100).toFixed(2); };
const parseMoney = raw => { const c=String(raw??'').trim().replace(/[$,]/g,''); if(!c||!/^\d*\.?\d*$/.test(c)||c==='.') return null; return Math.round(parseFloat(c)*100)/100; };
const sumMoney = vs => vs.reduce((a,v)=>a+Math.round((v||0)*100),0)/100;
const titleCase = s => (s===s.toUpperCase()||s===s.toLowerCase()) ? s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()) : s;
const digits = raw => { const d=String(raw||'').replace(/\D/g,''); return d.length===11&&d[0]==='1'?d.slice(1):d; };
const fmtPhone = raw => { const d=digits(raw); return d.length===10?`${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`:raw; };

/* Normalize anything loaded (1.0 data, imports) to the 1.1 shape. */
function normalize(p){
  p.firstName ??= ''; p.lastName ??= ''; p.notes ??= ''; p.status = STATUSES.includes(p.status)?p.status:'Active';
  p.pinned = !!p.pinned; p.addresses ||= []; p.phones ||= []; p.cards ||= []; p.links ||= []; p.resolvedHistory ||= [];
  p.reasonSpeculated ||= 'N/A'; p.language ||= 'English'; p.employer ??= ''; p.employerNote ??= ''; p.birthday ??= null;
  p.addresses.forEach(a=>{ a.street??=''; a.confirm ||= 'Unconfirmed'; a.note??=''; a.zip??=''; });
  p.phones.forEach(x=>{ x.number??=''; x.kind ||= 'Confirmed'; x.note??=''; });
  if(p.addresses.length && !p.addresses.some(a=>a.primary)) p.addresses[0].primary=true;
  if(p.phones.length && !p.phones.some(a=>a.primary)) p.phones[0].primary=true;
  p.cards.forEach(c=>{ c.description??=''; c.delinquency||=''; c.paid=!!c.paid; c.payOut??=''; c.paidIn??=''; });
  p.runHistory = (p.runHistory||[]).map((r,i)=> r.result!==undefined ? r : (()=>{ // 1.0 {at,text}
    const [res,...rest]=String(r.text||'').split(', '); const known=RUN_KINDS.some(k=>k[1]===res&&res);
    return {id:r.at+i, at:r.at, result:known?res:'Note', note:known?rest.join(', '):r.text}; })());
  return p;
}

const primaryAddress = p => p.addresses.find(a=>a.primary) || p.addresses[0] || null;
const primaryPhone = p => p.phones.find(a=>a.primary) || p.phones[0] || null;
const addrText = p => (primaryAddress(p)?.street||'').trim();

function cardDays(c, t=today0()){ const d=parseDate(c.pastDueDate); if(!d) return null; return Math.max(0, daysBetween(d,t)); }
function cardPhase(c, t=today0()){ if(c.paid) return null; const n=cardDays(c,t); if(n==null) return null; return n<90?'active':n<120?'previous':'charged'; }
const keepsActive = (c,t=today0()) => { if(c.paid) return false; const n=cardDays(c,t); return n==null||n<90; };
const openCards = (p,t=today0()) => p.cards.filter(c=>keepsActive(c,t));
function effectiveDue(p,t=today0()){ const ds=openCards(p,t).map(c=>parseDate(c.pastDueDate)).filter(Boolean); return ds.length?new Date(Math.min(...ds)):null; }
const daysPastDue = (p,t=today0()) => { const d=effectiveDue(p,t); return d?Math.max(0,daysBetween(d,t)):0; };
function maxDaysUnpaid(p,t=today0()){ const ds=p.cards.filter(c=>!c.paid).map(c=>cardDays(c,t)).filter(n=>n!=null); return ds.length?Math.max(...ds):0; }
const isResolved = p => p.cards.length>0 && p.cards.every(c=>c.paid);
function listedIn(p, sec, t=today0()){
  if(isResolved(p)) return false;
  if(!p.cards.length) return sec==='active';
  if(sec==='active') return openCards(p,t).length>0;
  return p.cards.some(c=>cardPhase(c,t)===sec);
}
const isActiveList = p => listedIn(p,'active');
function badge(p){ const u=p.cards.filter(c=>!c.paid); if(u.some(c=>c.delinquency==='FPD')) return 'FPD'; if(u.some(c=>c.delinquency==='SPD')) return 'SPD'; return ''; }
const tier = p => ({FPD:0,SPD:1})[badge(p)] ?? 2;
const cardName = p => { const l=titleCase(p.lastName.trim()); const i=p.firstName.trim()[0]; return i? `${l} ${i.toUpperCase()}.` : l; };
const listName = p => { const l=p.lastName.trim().toUpperCase(); const i=p.firstName.trim()[0]; return i?`${l}, ${i.toUpperCase()}.`:l; };
const fullName = p => [titleCase(p.firstName.trim()), titleCase(p.lastName.trim())].filter(Boolean).join(' ');
const who = p => { const i=p.firstName.trim().match(/[\p{L}\d]/u); return [i?i[0].toUpperCase()+'.':null,p.lastName.trim()||null].filter(Boolean).join(' '); };
const totalRv = cards => { const v=cards.filter(c=>c.remainingValue!=null); return v.length?sumMoney(v.map(c=>c.remainingValue)):null; };
function daysLabel(p,t=today0()){
  if(isResolved(p)) return 'Resolved';
  if(p.cards.length && !openCards(p,t).length) return p.cards.some(c=>!c.paid)?'Charged off':'No unpaid cards';
  if(p.cards.length && !effectiveDue(p,t)) return 'No past-due date';
  const n=daysPastDue(p,t); return n===1?'1 day past due':`${n} days past due`;
}
function rvLine(p, cards){ const rv=totalRv(cards); const lead=[...cards].sort((a,b)=>(cardDays(b)??-1)-(cardDays(a)??-1))[0];
  const bits=[]; if(rv!=null) bits.push(`RV ${money(rv)}$`); if(lead&&lead.description.trim()) bits.push(lead.description.trim()); return bits.join(' - '); }
const resolvedDaysLabel = n => n==null?null : n<=0?'current' : n===1?'1 day past due' : `${n} days past due`;
const paidLabel = c => [c.payOut||'Resolved', fmtDate(c.paidOn), resolvedDaysLabel(c.resolvedDaysPastDue)].filter(Boolean).join(' · ');
const cardDueLabel = (c,t=today0()) => { if(c.paid) return 'Resolved · '+paidLabel(c); const n=cardDays(c,t); return n==null?'No past-due date':(n===1?'1 day past due':`${n} days past due`); };
const paidInLabel = c => { const r=String(c.paidIn||'').trim(); if(!r) return null; const b=r.replace(/^\$/,'').replace(/,/g,''); return !isNaN(parseFloat(b))&&/^[\d.]+$/.test(b)?`Paid in $${r.replace(/^\$/,'')}`:`Paid in ${r}`; };

const sortActive = (a,b) => (b.pinned-a.pinned) || tier(a)-tier(b) || daysPastDue(b)-daysPastDue(a) || sortAZ(a,b);
const sortPrev = (a,b) => (b.pinned-a.pinned) || tier(a)-tier(b) || maxDaysUnpaid(b)-maxDaysUnpaid(a) || sortAZ(a,b);
const sortAZ = (a,b) => a.lastName.toLowerCase().localeCompare(b.lastName.toLowerCase()) || a.firstName.toLowerCase().localeCompare(b.firstName.toLowerCase());

/* Runs */
const lastRun = p => p.runHistory.reduce((m,r)=>!m||r.at>m.at?r:m, null);
const runLine = r => r ? `Last run: ${r.result} · ${shortWhen(r.at)}${r.note?' · '+r.note:''}` : null;
const runMessage = (p,status,note) => [who(p),status,String(note||'').trim().replace(/\s*\n\s*/g,' ')].filter(s=>s&&s.trim()).join(', ');
function runFromMessage(p, kind, body){ // logText: message minus "F. Last, " prefix and the status word
  let t=body.trim(); const pre=who(p); if(pre&&t.startsWith(pre+',')) t=t.slice(pre.length+1).trim(); else if(t===pre) t='';
  const st=RUN_KINDS.find(k=>k[0]===kind)[1]; if(st&&t.startsWith(st)) t=t.slice(st.length).replace(/^,\s*/,'').trim();
  return {id:Date.now(), at:Date.now(), result:kind, note:t};
}

/* ZIP / route (RoutePlanner.kt) */
function zipOf(address){ const a=String(address||'').replace(/\n/g,','); const tail=a.includes(',')?a.slice(a.indexOf(',')+1):a.replace(/^\s*\d+[A-Za-z]?\s+/,'');
  const m=[...tail.matchAll(/(?<!\d)(\d{5})(?:-\d{4})?(?!\d)/g)]; return m.length?m[m.length-1][1]:null; }
function zipFor(p){ const a=primaryAddress(p); if(!a) return null; const s=String(a.zip||'').trim().slice(0,5); return /^\d{5}$/.test(s)?s:zipOf(a.street.trim()); }
const located = p => (p.lat!=null && p.lng!=null && p.geocodedFor===addrText(p) && addrText(p)) ? [p.lat,p.lng] : null;
const isRouteActive = p => p.status==='Active' && isActiveList(p);
const forMaps = (street, zip) => { const a=String(street||'').replace(/\n/g,', ').trim(); const z=String(zip||'').trim().slice(0,5); return a&&!zipOf(a)&&/^\d{5}$/.test(z)?`${a} ${z}`:a; };
function eligibility(p){ const a=addrText(p); if(!a) return {skip:{name:cardName(p),reason:'no street address'}};
  const loc=located(p); return {stop:{name:listName(p), id:p.id, address:forMaps(a,zipFor(p)), lat:loc?.[0]??null, lng:loc?.[1]??null}}; }
const distinctStops = ss => { const seen=new Set(); return ss.filter(s=>{ const k=s.address.toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; }); };
function routeFor(people, zip){ const stops=[], skipped=[]; for(const p of people){ if(!isRouteActive(p)||zipFor(p)!==zip) continue; const e=eligibility(p); e.stop?stops.push(e.stop):skipped.push(e.skip); } return {stops:distinctStops(stops), skipped}; }
function activeZips(people){ const m={}; people.filter(p=>isRouteActive(p)&&eligibility(p).stop).forEach(p=>{ const z=zipFor(p); if(z) m[z]=(m[z]||0)+1; });
  return Object.entries(m).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])); }
const pinnedStops = people => distinctStops(people.filter(isRouteActive).map(p=>{ const loc=located(p); return loc?{name:listName(p),id:p.id,address:forMaps(addrText(p),zipFor(p)),lat:loc[0],lng:loc[1]}:null; }).filter(Boolean));
function orderStops(stops){ const mapped=stops.filter(s=>s.lat!=null), un=stops.filter(s=>s.lat==null); if(mapped.length<=2) return [...mapped,...un];
  const d=(a,b,c,e)=>{ const dl=a-c, dg=(b-e)*Math.cos((a+c)/2*Math.PI/180); return dl*dl+dg*dg; };
  const cLat=mapped.reduce((s,x)=>s+x.lat,0)/mapped.length, cLng=mapped.reduce((s,x)=>s+x.lng,0)/mapped.length;
  const left=[...mapped]; let cur=left.reduce((m,x)=>d(x.lat,x.lng,cLat,cLng)>d(m.lat,m.lng,cLat,cLng)?x:m); const out=[];
  for(;;){ out.push(cur); left.splice(left.indexOf(cur),1); if(!left.length) break; const f=cur; cur=left.reduce((m,x)=>d(f.lat,f.lng,x.lat,x.lng)<d(f.lat,f.lng,m.lat,m.lng)?x:m); }
  return [...out,...un]; }
const STOPS_PER_PART = 10;
const parts = ordered => { const o=[]; for(let i=0;i<ordered.length;i+=STOPS_PER_PART) o.push(ordered.slice(i,i+STOPS_PER_PART)); return o; };
const segment = a => encodeURIComponent(a.replace(/\n/g,',').replace(/\s*,\s*/g,', ').replace(/\s+/g,' ').trim().replace(/^,|,$/g,'').trim()).replace(/%20/g,'+');
const mapsPathUrl = part => 'https://www.google.com/maps/dir//' + part.map(s=>segment(s.address)).join('/');
const googleDirections = a => 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(a.replace(/\s+/g,' ').trim());
const appleDirections = a => `https://maps.apple.com/?daddr=${encodeURIComponent(a.replace(/\s+/g,' ').trim())}&dirflg=d`;

/* Route selected: name matching (RoutePick.kt) */
const nrm = s => String(s||'').toLowerCase().replace(/[^\p{L}-]/gu,'');
function lev(a,b){ const dp=[...Array(b.length+1).keys()]; for(let i=1;i<=a.length;i++){ let prev=dp[0]; dp[0]=i; for(let j=1;j<=b.length;j++){ const t=dp[j]; dp[j]=Math.min(dp[j]+1,dp[j-1]+1,prev+(a[i-1]===b[j-1]?0:1)); prev=t; } } return dp[b.length]; }
function filterNames(list,q){ q=nrm(q); if(!q) return list; return list.filter(p=>[p.lastName,p.firstName,cardName(p),p.firstName+p.lastName].some(x=>nrm(x).includes(q))); }
function parseNames(text){ const out=[]; for(const line of text.split(/[\n;]/)){ const ps=line.split(',').map(s=>s.trim()).filter(Boolean); const merged=[];
  for(const part of ps){ if(merged.length&&/^[A-Za-z]\.?$/.test(part)&&!merged[merged.length-1].includes(' ')) merged[merged.length-1]+=' '+part; else merged.push(part); }
  for(const m of merged){ const words=m.split(/\s+/).map(w=>w.replace(/^[.\s]+|[.\s]+$/g,'')).filter(w=>/\p{L}/u.test(w)); const long=words.filter(w=>w.length>1); const single=words.find(w=>w.length===1);
    if(long.length) out.push({raw:m.trim(), last:long.join(' '), initial:single?single[0].toUpperCase():null}); } } return out; }
function scoreName(e,p){ const last=nrm(p.lastName), first=nrm(p.firstName); if(!last) return null; const words=e.last.split(' ').map(nrm).filter(Boolean);
  let best=-1, idx=-1; words.forEach((w,i)=>{ const s= w===last?3 : (last.includes('-')&&last.split('-').includes(w))?2 : (w.length>=4&&last.length>=4&&lev(w,last)<=(last.length>=8?2:1))?1 : -1; if(s>best){best=s;idx=i;} });
  if(best<0) return null; const other=words.filter((_,i)=>i!==idx)[0]; const ini=e.initial||(other?other[0].toUpperCase():null); let sc=best*10;
  if(ini){ const fi=first[0]?.toUpperCase(); if(!fi||fi!==ini) return null; sc+=5; if(other&&other.length>1&&first===other) sc+=2; } return sc; }
function matchNames(entries, people){ const matched=[], ambiguous=[], unmatched=[]; for(const e of entries){ const sc=people.map(p=>[p,scoreName(e,p)]).filter(x=>x[1]!=null);
  const best=Math.max(...sc.map(x=>x[1])); const top=sc.filter(x=>x[1]===best).map(x=>x[0]); if(!top.length) unmatched.push(e.raw); else if(top.length===1) matched.push([e.raw,top[0]]); else ambiguous.push([e.raw,top]); } return {matched,ambiguous,unmatched}; }

/* Daily Run (DailyRun.kt) */
const WINDOW_MS = 12*3600e3;
const dayWindow = d => { const s=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(); return [s, new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime()-1]; };
const allRuns = people => people.flatMap(p=>p.runHistory.map(r=>({...r, personId:p.id})));
function visitsIn(people, [a,b]){ const byId=new Map(people.map(p=>[p.id,p])); return allRuns(people).filter(r=>r.at>=a&&r.at<=b).sort((x,y)=>x.at-y.at||x.id-y.id).map((r,i)=>({number:i+1, run:r, person:byId.get(r.personId), point:located(byId.get(r.personId))})); }
function spots(visits){ const m=new Map(); visits.filter(v=>v.point).forEach(v=>{ if(!m.has(v.person.id)) m.set(v.person.id,{person:v.person,numbers:[],point:v.point}); m.get(v.person.id).numbers.push(v.number); }); return [...m.values()]; }
function startView(people, now=Date.now()){ const runs=allRuns(people); if(runs.some(r=>r.at>=now-WINDOW_MS&&r.at<=now)) return {kind:'12h'};
  if(runs.length){ const last=Math.max(...runs.map(r=>r.at)); const d=new Date(last); d.setHours(0,0,0,0); return {kind:'day',day:d}; } return {kind:'none'}; }
function nearestEarlierDay(people, beforeMs){ const ts=allRuns(people).map(r=>r.at).filter(t=>t<beforeMs); if(!ts.length) return null; const d=new Date(Math.max(...ts)); d.setHours(0,0,0,0); return d; }
function nearestLaterDay(people, afterMs){ const ts=allRuns(people).map(r=>r.at).filter(t=>t>afterMs); if(!ts.length) return null; const d=new Date(Math.min(...ts)); d.setHours(0,0,0,0); return d; }
const friendlyDay = d => { const t=today0(); return +d===+t?'today': +d===+addDays(t,-1)?'yesterday': dayLabel(d); };
const ranTodayIds = people => { const [a,b]=dayWindow(today0()); return new Set(people.filter(p=>p.runHistory.some(r=>r.at>=a&&r.at<=b)).map(p=>p.id)); };

/* Same-person matching (ScanMatch.kt), used on add/edit */
const SUFFIX = new Set(['jr','sr','ii','iii','iv']);
const nameTokens = raw => String(raw||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z' \-]/g,' ').split(/[ \-]/).filter(t=>t&&!SUFFIX.has(t));
const ABBR = {STREET:'ST',STR:'ST',AVENUE:'AVE',AV:'AVE',ROAD:'RD',DRIVE:'DR',LANE:'LN',COURT:'CT',BOULEVARD:'BLVD',PLACE:'PL',CIRCLE:'CIR',PARKWAY:'PKWY',HIGHWAY:'HWY',TERRACE:'TER',TRAIL:'TRL',NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W',NORTHEAST:'NE',NORTHWEST:'NW',SOUTHEAST:'SE',SOUTHWEST:'SW'};
const addrKey = s => String(s||'').split(/[,\n]/)[0].toUpperCase().replace(/[.#]/g,' ').split(/\s+/).filter(Boolean).map(w=>ABBR[w]||w).join(' ');
function findSame(people, draft){
  const hits=[]; const dl=nameTokens(draft.lastName), df=nameTokens(draft.firstName);
  const dPhones=new Set(draft.phones.map(x=>digits(x.number)).filter(d=>d.length>=10)); const dAddr=new Set(draft.addresses.map(a=>addrKey(a.street)).filter(k=>/^\d+\s+\S/.test(k)));
  for(const p of people){ if(p.id===draft.id) continue; const reasons=[]; let nameMatch=false;
    const pl=nameTokens(p.lastName), pf=nameTokens(p.firstName);
    if(dl.length&&pl.join(' ')===dl.join(' ')){ if(df.join(' ')===pf.join(' ')&&df.length){ reasons.push('same name'); nameMatch=true; } else if(df[0]&&pf[0]&&(df[0]===pf[0]||df[0].startsWith(pf[0])||pf[0].startsWith(df[0]))){ reasons.push('similar name'); nameMatch=true; } }
    p.phones.forEach(x=>{ const d=digits(x.number); if(dPhones.has(d)){ const s=fmtPhone(d); if(!reasons.some(r=>r.endsWith(s))) reasons.push('same phone '+s); } });
    p.addresses.forEach(a=>{ if(dAddr.has(addrKey(a.street))&&!reasons.some(r=>r.startsWith('same address'))) reasons.push('same address '+a.street.split(/[,\n]/)[0].trim()); });
    if(reasons.length) hits.push({person:p,reasons,nameMatch}); }
  return hits.sort((a,b)=>(b.reasons.includes('same name')-a.reasons.includes('same name'))||b.reasons.length-a.reasons.length||isResolved(a.person)-isResolved(b.person)||a.person.id-b.person.id);
}
const whyLine = h => { const s=h.reasons.join(', '); return s[0].toUpperCase()+s.slice(1); };
function statusLine(p){ const b=[]; if(isResolved(p)) b.push('Resolved'); else if(isActiveList(p)) b.push('Active · '+daysLabel(p)); else if(listedIn(p,'previous')) b.push('Previous month charge off'); else b.push('Charged off');
  if(p.status!=='Active') b.push(p.status); return b.join(' · '); }

/* ZIP lookup (ZipLookup.kt): typed ZIP, else Census (JSONP, no CORS), else OSM. Defaults to MI. */
const US_STATES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');
function stateOf(a){ const m=String(a).replace(/\n/g,',').trim().match(/(?:,|\s)\s*([A-Za-z]{2}|Michigan)\.?\s*(?:\d{5}(?:-\d{4})?)?\s*$/i); if(!m) return null; const r=m[1].toUpperCase(); const c=r==='MICHIGAN'?'MI':r; return US_STATES.includes(c)?c:null; }
const lookupable = a => { a=String(a).replace(/\n/g,',').trim(); if(!/^\d+[A-Za-z]?\s+[A-Za-z0-9]/.test(a)) return false; const i=a.indexOf(','); return i>=0&&/[A-Za-z]/.test(a.slice(i+1)); };
const geoQuery = a => { a=String(a).replace(/\n/g,',').replace(/\s*,\s*/g,', ').trim().replace(/,$/,''); return stateOf(a)?a:`${a}, MI`; };
const fits = (z,st) => { z=String(z||'').trim().slice(0,5); if(!/^\d{5}$/.test(z)) return null; if(st==='MI'&&!/^4[89]/.test(z)) return null; return z; };
let _jp=0;
function jsonp(url, ms=12000){ return new Promise((res,rej)=>{ const cb='__ct_jp'+(++_jp); const s=document.createElement('script'); const t=setTimeout(()=>{done();rej(new Error('timeout'));},ms);
  const done=()=>{ clearTimeout(t); delete window[cb]; s.remove(); }; window[cb]=d=>{done();res(d);}; s.onerror=()=>{done();rej(new Error('jsonp'));}; s.src=url+'&callback='+cb; document.head.appendChild(s); }); }
async function census(q){ const d=await jsonp('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=jsonp&address='+encodeURIComponent(q)); return d?.result?.addressMatches||[]; }
async function osm(q, limit=5){ const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=${limit}&addressdetails=1&countrycodes=us&q=${encodeURIComponent(q)}`); return r.json(); }
function pickOsm(results, typed){ if(!results.length) return null; const top=results[0].address||{}; const topZip=top.postcode||null; if(top.house_number) return topZip;
  const city=a=>(a.city||a.town||a.village||'').toLowerCase(); const road=(top.road||'').toLowerCase(), c=city(top); if(!road||!c||!typed.toLowerCase().includes(c)) return null;
  const zs=results.map(r=>r.address||{}).filter(a=>(a.road||'').toLowerCase()===road&&city(a)===c&&a.postcode).map(a=>a.postcode.slice(0,5)); return zs.length>=2&&new Set(zs).size===1?zs[0]:null; }
async function lookupZip(address){ const typed=zipOf(address); if(typed) return typed; if(!lookupable(address)) return null; const q=geoQuery(address), st=stateOf(q)||'MI';
  try{ const ms=await census(q); const zs=[...new Set(ms.map(m=>m.addressComponents?.zip).filter(Boolean))]; if(zs.length===1){ const z=fits(zs[0],st); if(z) return z; } }catch{}
  try{ return fits(pickOsm(await osm(q),address),st); }catch{ return null; } }
async function geocodeAddress(address){ const q=geoQuery(address);
  try{ const ms=await census(q); if(ms.length) return [ms[0].coordinates.y, ms[0].coordinates.x]; }catch{}
  try{ const r=await osm(q,1); if(r[0]) return [+r[0].lat,+r[0].lon]; }catch{} return null; }
