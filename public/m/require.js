// Tiny CommonJS loader for the iPhone app: /m/lib/<name>.js files call define(name, factory)
// with the same code the server uses (src/lib), and requireLib(name) runs them on demand.
(function () {
  var defs = {};
  var cache = {};
  window.define = function (name, factory) {
    defs[name] = factory;
  };
  window.requireLib = function requireLib(name) {
    name = String(name).replace(/^\.\//, '').replace(/\.js$/, '');
    if (cache[name]) return cache[name].exports;
    if (!defs[name]) throw new Error('Lib not loaded: ' + name);
    var module = { exports: {} };
    cache[name] = module;
    defs[name](module, module.exports, requireLib);
    return module.exports;
  };
})();
