/* compat.js — polyfills mínimos para Safari/iOS viejitos (ES5) */

/* ----- Helpers DOM ----- */
window.$  = function (sel, root)  { return (root||document).querySelector(sel); };
window.$$ = function (sel, root)  { return Array.prototype.slice.call((root||document).querySelectorAll(sel)); };

/* ----- Polyfills suaves ----- */
(function(){
  // console.* seguro
  if (!window.console) window.console = {};
  var m = ['log','warn','error','info']; for (var i=0;i<m.length;i++){ if(!console[m[i]]) console[m[i]] = function(){}; }

  // Object.assign
  if (!Object.assign) {
    Object.assign = function(target){
      if (target == null) throw new TypeError('Cannot convert undefined or null to object');
      var to = Object(target);
      for (var i=1;i<arguments.length;i++){
        var src = arguments[i]; if (src==null) continue;
        for (var key in src){ if (Object.prototype.hasOwnProperty.call(src,key)) to[key]=src[key]; }
      }
      return to;
    };
  }

  // Array.from
  if (!Array.from) {
    Array.from = function(a){ return Array.prototype.slice.call(a); };
  }

  // NodeList.forEach
  if (window.NodeList && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = function(cb,thisArg){ for (var i=0;i<this.length;i++) cb.call(thisArg,this[i],i,this); };
  }

  // String.includes
  if (!String.prototype.includes) {
    String.prototype.includes = function(search, start) {
      if (typeof start !== 'number') start = 0;
      if (start + search.length > this.length) return false;
      return this.indexOf(search, start) !== -1;
    };
  }

  // Number.isFinite
  if (!Number.isFinite) Number.isFinite = function(v){ return typeof v === 'number' && isFinite(v); };

  // Date.toISOString (viejitos bug)
  if (!Date.prototype.toISOString) {
    Date.prototype.toISOString = function(){
      function p(n){ return (n<10?'0':'')+n; }
      return this.getUTCFullYear() + '-' + p(this.getUTCMonth()+1) + '-' + p(this.getUTCDate()) +
             'T' + p(this.getUTCHours()) + ':' + p(this.getUTCMinutes()) + ':' + p(this.getUTCSeconds()) + '.000Z';
    };
  }

  // fetch muy básico usando XHR si no existe (solo GET/POST simple)
  if (!window.fetch) {
    window.fetch = function(url, opts){
      opts = opts || {};
      return new Promise(function(resolve,reject){
        var xhr = new XMLHttpRequest();
        xhr.open((opts.method||'GET').toUpperCase(), url, true);
        for (var h in (opts.headers||{})) xhr.setRequestHeader(h, opts.headers[h]);
        xhr.onload  = function(){ resolve({ ok:(xhr.status>=200 && xhr.status<300), status:xhr.status, text:function(){return Promise.resolve(xhr.responseText);}, json:function(){return Promise.resolve(JSON.parse(xhr.responseText));} }); };
        xhr.onerror = reject;
        xhr.send(opts.body||null);
      });
    };
  }

  // Promise (muy mini) – si no está, usa una versión compacta
  if (!window.Promise) {
    // Mini-Promise muy simple (suficiente para este admin)
    function MP(executor){
      var self=this; self._cbs=[]; self._state=0; self._value=undefined;
      function resolve(v){ if(self._state) return; self._state=1; self._value=v; setTimeout(function(){ self._cbs.forEach(function(c){ if(c.onF) return; try{ var r=c.onR?c.onR(v):v; c.next && c.next.resolve(r);}catch(e){ c.next && c.next.reject(e);} }); }); }
      function reject(e){ if(self._state) return; self._state=2; self._value=e; setTimeout(function(){ self._cbs.forEach(function(c){ try{ if(c.onF){ var r=c.onF(e); c.next && c.next.resolve(r);} else { c.next && c.next.reject(e);} }catch(err){ c.next && c.next.reject(err);} }); }); }
      self.then = function(onR, onF){ var n = new MP(function(){}); self._cbs.push({onR:onR,onF:onF,next:n}); if(self._state===1) setTimeout(function(){ n.resolve(self._value); }); if(self._state===2) setTimeout(function(){ n.reject(self._value); }); return n; };
      self.catch = function(onF){ return self.then(null,onF); };
      self.resolve = resolve; self.reject = reject;
      try{ executor(resolve,reject); }catch(e){ reject(e); }
    }
    window.Promise = MP;
  }
})();
