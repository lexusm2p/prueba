//apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
 //   authDomain: "seven-de-burgers.firebaseapp.com",
   // projectId: "seven-de-burgers",
    //storageBucket: "seven-de-burgers.firebasestorage.app",
    //messagingSenderId: "34089845279",
    //appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  //  measurementId: "G-Q8YQJGL2XY
 // /shared/firebase.js
// Inicializa Firebase (App, Auth anónima y Firestore) usando el SDK modular por CDN.
// ⚠️ Este archivo debe contener SOLO JavaScript (sin <script> ni HTML).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ⬇️ CONFIG DE TU PROYECTO
// Nota: el storageBucket correcto suele terminar en ".appspot.com"
const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.firebasestorage.app", // ← corrige si usabas firebasestorage.app
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  // messagingSenderId: "34089845279",
  // measurementId: "G-Q8YQJGL2XY"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Asegura sesión anónima antes de usar Firestore en cualquier módulo
export async function ensureAnonAuth(){
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      try {
        if (user) return resolve(user);
        await signInAnonymously(auth);
        // onAuthStateChanged se disparará de nuevo y resolverá
      } catch (e) {
        reject(e);
      }
    });
  });
}
