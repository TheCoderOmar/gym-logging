// Key-value storage on the phone (IndexedDB). Everything the app knows lives here:
// 'snapshot' (last data from the PC), 'pending' (logged offline, not synced yet),
// 'live' (the workout in progress) and 'lastSync'.
window.Store = (function () {
  var dbp = null;
  function open() {
    if (!dbp) {
      dbp = new Promise(function (resolve, reject) {
        var req = indexedDB.open('gymlog', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return dbp;
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction('kv', mode);
        var out = fn(t.objectStore('kv'));
        t.oncomplete = function () { resolve(out && 'result' in out ? out.result : undefined); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }
  return {
    get: function (key) { return tx('readonly', function (s) { return s.get(key); }); },
    set: function (key, value) { return tx('readwrite', function (s) { s.put(value, key); }); },
    del: function (key) { return tx('readwrite', function (s) { s.delete(key); }); },
  };
})();
