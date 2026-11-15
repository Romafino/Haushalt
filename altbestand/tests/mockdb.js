window.__store = window.__seed || {};
(function(){
  const store = window.__store, subs = [];
  let n = 0;
  const colOf = p => (store[p] = store[p] || {});
  const snapCol = p => ({ metadata:{fromCache:false}, docs: Object.keys(colOf(p)).sort().map(id => ({ id, data: () => JSON.parse(JSON.stringify(colOf(p)[id])) })) });
  const fire = p => setTimeout(() => subs.filter(s => s.p === p).forEach(s => s.cb(snapCol(p))), 0);
  const docRef = (p, id) => ({ id,
    set: async d => { colOf(p)[id] = JSON.parse(JSON.stringify(d)); fire(p); },
    update: async d => { if (!colOf(p)[id]) throw {code:'invalid_argument'}; Object.assign(colOf(p)[id], JSON.parse(JSON.stringify(d))); fire(p); },
    get: async () => ({ exists: !!colOf(p)[id], data: () => colOf(p)[id] }),
    collection: c => col(p + '/' + id + '/' + c),
    onSnapshot: cb => { setTimeout(() => cb({ exists: !!colOf(p)[id], data: () => colOf(p)[id] }), 0); return () => {}; } });
  const col = p => ({ onSnapshot: cb => { subs.push({ p, cb }); fire(p); return () => {}; }, doc: id => docRef(p, id || ('n' + (++n))), add: async d => { const r = docRef(p, 'n' + (++n)); await r.set(d); return r; }, get: async () => snapCol(p) });
  const db = { collection: col, doc: p => { const i = p.lastIndexOf('/'); return docRef(p.slice(0, i), p.slice(i + 1)); } };
  window.__db = db;
  window.claude = { use: async k => k === 'db' ? db : (window.__caps || {})[k] || null };
})();
