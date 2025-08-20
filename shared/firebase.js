
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-analytics.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
try{ getAnalytics(app); }catch(e){}

export const auth = getAuth(app);
export const db = getFirestore(app);

export async function ensureAuth(){
  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(user) return resolve(user);
      try{ const cred = await signInAnonymously(auth); resolve(cred.user); }
      catch(e){ console.error(e); resolve(null); }
    });
  });
}

export {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp,
  query, where, orderBy
};
