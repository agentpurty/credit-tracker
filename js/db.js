'use strict';
/* IndexedDB: people (profiles) and files (photos per profile). */
let _dbp;
function db(){ return _dbp ||= new Promise((res,rej)=>{ const r=indexedDB.open('credit-tracker',2);
  r.onupgradeneeded=()=>{ const d=r.result;
    if(!d.objectStoreNames.contains('people')) d.createObjectStore('people',{keyPath:'id'});
    if(!d.objectStoreNames.contains('files')){ const f=d.createObjectStore('files',{keyPath:'id'}); f.createIndex('person','personId'); } };
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function tx(store, mode, fn){ const d=await db(); return new Promise((res,rej)=>{ const t=d.transaction(store,mode); const req=fn(t.objectStore(store)); t.oncomplete=()=>res(req&&'result' in req?req.result:undefined); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error); }); }
const DB = {
  all: () => tx('people','readonly',s=>s.getAll()),
  put: p => tx('people','readwrite',s=>s.put(p)),
  del: async id => { await tx('people','readwrite',s=>s.delete(id)); const fs=await DB.files(id); for(const f of fs) await DB.delFile(f.id); },
  clear: async () => { await tx('people','readwrite',s=>s.clear()); await tx('files','readwrite',s=>s.clear()); },
  files: personId => tx('files','readonly',s=>s.index('person').getAll(personId)),
  allFiles: () => tx('files','readonly',s=>s.getAll()),
  putFile: f => tx('files','readwrite',s=>s.put(f)),
  delFile: id => tx('files','readwrite',s=>s.delete(id)),
};
