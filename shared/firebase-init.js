// Rellena con tus credenciales reales de Firebase (App Web)
export const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.firebasestorage.app",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY"
  rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{doc=**} { allow read, write: if request.auth != null; }
  }
}
};
