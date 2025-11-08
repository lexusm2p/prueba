// shared/firebase.js · Seven V2
// Inicializa Firebase solo una vez y expone helpers compartidos.
// Compatible con:
//  - Kiosko V2 (ensureAuth desde aquí)
//  - Cocina V2 (ensureAuth)
//  - shared/db.js (usa window.FIREBASE_DB para decidir Firestore vs SIM)
//  - Código legacy que importa { db, collection, doc, ... } directo de este módulo.

import {
  initializeApp,
  getApps,
  getApp,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';

import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

// Config oficial del proyecto Seven de Burgers
const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.appspot.com",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY",
  databaseURL: "https://seven-de-burgers-default-rtdb.firebaseio.com"
};

/* ======================= Init único ======================= */

function initApp() {
  try {
    const hasConfig = !!firebaseConfig && !!firebaseConfig.projectId;
    if (!hasConfig) throw new Error('Sin firebaseConfig');

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Exponer para módulos que dependen del objeto global
    // (shared/db.js mira estas propiedades para decidir si hay DB real)
    window.FIREBASE_APP = app;
    window.FIREBASE_DB  = db;
    // Alias legacy por si algo viejo los usa:
    window.firebaseDb = db;
    window.db = db;

    console.info('[firebase] inicializado OK:', firebaseConfig.projectId);
    return { app, auth, db };
  } catch (e) {
    console.warn('[firebase] no inicializado, se usará modo SIM/localStorage', e);
    return { app: null, auth: null, db: null };
  }
}

const { app, auth, db } = initApp();

/* ======================= Auth anónima ======================= */

/**
 * Intenta garantizar que haya un usuario anónimo.
 * - Si todo va bien, devuelve el user.
 * - Si algo falla (offline, bloqueos, etc.), NO rompe la app:
 *   simplemente retorna null y el resto puede seguir en modo SIM.
 */
export async function ensureAuth() {
  if (!auth) {
    console.warn('[firebase] ensureAuth: sin auth (modo SIM)');
    return null;
  }

  // Si ya hay usuario, listo
  if (auth.currentUser) return auth.currentUser;

  try {
    // Intento directo
    const cred = await signInAnonymously(auth);
    return cred.user || auth.currentUser || null;
  } catch (e) {
    console.warn('[firebase] signInAnonymously falló, sigo en SIM', e);
    // No lanzamos error para no bloquear kiosko/cocina
    return auth.currentUser || null;
  }
}

// Auto-intento silencioso: si no hay usuario, tratamos de hacer login anónimo.
// Si falla, no pasa nada; shared/db.js caerá a SIM.
if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      signInAnonymously(auth).catch(() => {
        console.warn('[firebase] auto signIn anónimo rechazado; usando SIM si es necesario');
      });
    }
  });
}

/* ======================= Exports ======================= */

// Exportar instancias para quien las necesite directamente
export { app, auth, db };

// Re-exportar helpers de Firestore para código existente
export {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
  Timestamp,
};
