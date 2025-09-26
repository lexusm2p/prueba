<script>
// --- Polyfills mínimos (muy ligeros) ---
(function(){
  // Promise
  if (typeof Promise === 'undefined') {
    // polyfill básico (si realmente necesitas uno completo, dime y te lo dejo "inline")
    alert('Tu navegador es muy antiguo. Actualízalo por favor.');
  }
  // fetch
  if (!('fetch' in window)) {
    try {
      // Carga opcional: quédate con XHR interno
      window.fetch = function(url, opts){
        return new Promise(function(resolve, reject){
          var xhr = new XMLHttpRequest();
          xhr.open((opts && opts.method) || 'GET', url, true);
          for (var k in (opts && opts.headers||{})) xhr.setRequestHeader(k, opts.headers[k]);
          xhr.onload = function(){
            resolve({
              ok: (xhr.status>=200 && xhr.status<300),
              status: xhr.status,
              json: function(){ try{ return Promise.resolve(JSON.parse(xhr.responseText)); }catch(e){ return Promise.reject(e); } },
              text: function(){ return Promise.resolve(xhr.responseText); }
            });
          };
          xhr.onerror = reject;
          xhr.send((opts && opts.body) || null);
        });
      };
    } catch (e) {}
  }
  // Object.assign
  if (!Object.assign) {
    Object.assign = function(target) {
      if (target == null) throw new TypeError('Cannot convert undefined or null to object');
      target = Object(target);
      for (var i = 1; i < arguments.length; i++) {
        var src = arguments[i]; if (src != null) {
          for (var key in src) if (Object.prototype.hasOwnProperty.call(src, key)) target[key] = src[key];
        }
      }
      return target;
    };
  }
})();

// --- Firebase compat (v9) por CDN ---
(function(){
  if (window.__compatReady) return;
  window.__compatReady = new Promise(function(resolve, reject){
    function add(src, cb){ var s=document.createElement('script'); s.src=src; s.onload=cb; s.onerror=reject; document.head.appendChild(s); }
    add('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js', function(){
      add('https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js', function(){
        add('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js', function(){
          try{
            var cfg = {
              apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
              authDomain: "seven-de-burgers.firebaseapp.com",
              projectId: "seven-de-burgers",
              storageBucket: "seven-de-burgers.appspot.com",
              messagingSenderId: "34089845279",
              appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
              measurementId: "G-Q8YQJGL2XY",
            };
            var app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
            var auth = firebase.auth(app);
            var db   = firebase.firestore(app);
            // login anónimo silencioso
            auth.onAuthStateChanged(function(u){ if(!u) auth.signInAnonymously().catch(function(){}); });
            window.__firebaseCompat = { app: app, auth: auth, db: db, firebase: firebase };
            resolve(window.__firebaseCompat);
          }catch(e){ reject(e); }
        });
      });
    });
  });
})();
</script>
