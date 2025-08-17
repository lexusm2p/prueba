
// Firebase + Firestore
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, doc, updateDoc, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.firebasestorage.app",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY"
};

export const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);
export { collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, doc, updateDoc, deleteDoc, getDoc, setDoc };

export { where, Timestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
