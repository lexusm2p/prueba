
/*export const firebaseConfig = {
//  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  //authDomain: "seven-de-burgers.firebaseapp.com",
  //projectId: "seven-de-burgers",
  //storageBucket: "seven-de-burgers.firebasestorage.app",
  //messagingSenderId: "34089845279",
  //appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
 // measurementId: "G-Q8YQJGL2XY"
//};*/
// Configuración de Firebase
// 🔑 Sustituye por tus credenciales de Firebase
// shared/firebase.js
// Firebase por CDN (válido para GitHub Pages, sin bundlers).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ⚠️ Usa estos valores (ajustados):
const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.appspot.com",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// Iniciar sesión anónima para permitir reglas con request.auth != null
signInAnonymously(auth).catch(err => console.error("Auth error:", err));

// (Opcional) Esperar a que exista un usuario antes de operar con Firestore
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  // console.log("Anon user:", user.uid);
});

export { app, db, auth };
