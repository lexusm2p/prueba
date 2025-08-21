
  //<script type="module">
  // Este script existe solo para evitar que el navegador trate de parsear accidentalmente
  // si abres el archivo directo. No se ejecuta porque lo importamos como módulo real.

  //</script>
// /shared/firebase.js
// Inicializa Firebase (App, Auth anónima y Firestore) usando el SDK modular por CDN.
// IMPORTANTE: Sustituye firebaseConfig por los datos de tu proyecto.

/*import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ⬇⬇⬇ REEMPLAZA ESTO CON TU CONFIG REAL ⬇⬇⬇

//  apiKey: "TU_API_KEY",
  //authDomain: "TU_PROYECTO.firebaseapp.com",
 // projectId: "TU_PROYECTO",
 // storageBucket: "TU_PROYECTO.appspot.com",
 // messagingSenderId: "XXXXXX",
 // appId: "1:XXXXXX:web:XXXXXX",

const firebaseConfig = {
apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
    authDomain: "seven-de-burgers.firebaseapp.com",
    projectId: "seven-de-burgers",
    storageBucket: "seven-de-burgers.firebasestorage.app",
    messagingSenderId: "34089845279",
    appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  //  measurementId: "G-Q8YQJGL2XY
      };
// ⬆⬆⬆ REEMPLAZA ESTO CON TU CONFIG REAL ⬆⬆⬆

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Asegura sesión anónima antes de usar Firestore.
async function ensureAnon() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => { */
      //try {
        //if (!user) await signInAnonymously(auth);
       // resolve(auth.currentUser);
     // } catch (e) { reject(e); }
    //});
  //});
//}

//export { app, auth, db, serverTimestamp, ensureAnon };
//Aqui inicia el nuevo 20/Ago/2025 version 8

<!-- /shared/firebase.js -->
<script type="module">
// Carga SDKs desde CDN (funciona en GitHub Pages)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const firebaseConfig = {
apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
    authDomain: "seven-de-burgers.firebaseapp.com",
    projectId: "seven-de-burgers",
};

export const app = initializeApp(firebaseConfig);
export const dbAuth = getAuth(app);
export const db = getFirestore(app);

// Autenticación anónima para permitir reglas
signInAnonymously(dbAuth).catch(console.error);
</script>
