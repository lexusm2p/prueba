<!-- Este archivo es JS ESModule; usa imports por CDN (compatibles con GitHub Pages) -->
<script type="module">
  // Este script existe solo para evitar que el navegador trate de parsear accidentalmente
  // si abres el archivo directo. No se ejecuta porque lo importamos como módulo real.
</script>
// /shared/firebase.js
// Inicializa Firebase (App, Auth anónima y Firestore) usando el SDK modular por CDN.
// IMPORTANTE: Sustituye firebaseConfig por los datos de tu proyecto.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ⬇⬇⬇ REEMPLAZA ESTO CON TU CONFIG REAL ⬇⬇⬇
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "XXXXXX",
  appId: "1:XXXXXX:web:XXXXXX",
};
// ⬆⬆⬆ REEMPLAZA ESTO CON TU CONFIG REAL ⬆⬆⬆

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Asegura sesión anónima antes de usar Firestore.
async function ensureAnon() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) await signInAnonymously(auth);
        resolve(auth.currentUser);
      } catch (e) { reject(e); }
    });
  });
}

export { app, auth, db, serverTimestamp, ensureAnon };
