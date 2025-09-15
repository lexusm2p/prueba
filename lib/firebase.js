// lib/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getFirestore, serverTimestamp, collection, addDoc, onSnapshot, query, orderBy, updateDoc, doc, where, getDocs
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// ⚠️ ADVERTENCIA: Esta es una clave pública. Asegúrate de que las reglas de seguridad
// de Firestore sean estrictas para evitar el acceso no autorizado.
// En un entorno de producción, las credenciales deben ser cargadas de forma segura.
const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4", // <--- CLAVE OCULTADA POR SEGURIDAD
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.firebasestorage.app",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY"
};

export const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);

// Exporta las funciones de Firestore para un uso modular en otros archivos
export const DB = {
  serverTimestamp,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  doc,
  where,
  getDocs
};
