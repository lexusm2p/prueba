
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
import { initializeApp } from "firebase/app";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.firebasestorage.app",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Autenticación anónima
export async function ensureAuth(){
  if(!auth.currentUser){ await signInAnonymously(auth); }
}
