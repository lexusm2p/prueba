
//export const firebaseConfig = window.FB_CONFIG || {
//  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
 // authDomain: "seven-de-burgers.firebaseapp.com",
//  projectId: "seven-de-burgers",
 // storageBucket: "seven-de-burgers.firebasestorage.app",
//  messagingSenderId: "34089845279",
//  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
//}; 
// shared/firebase.js
// Firebase para GitHub Pages (imports por CDN, sin bundler).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ⚠️ Reemplaza con tu configuración real:
const firebaseConfig = {
  apiKey: "TAIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.firebasestorage.app",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Login anónimo (para que Firestore permita leer/escribir).
signInAnonymously(auth).catch(err => console.error("Auth error:", err));

export { app, db, auth };
