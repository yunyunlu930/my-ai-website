// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "yun-genai-440.firebaseapp.com",
  projectId: "yun-genai-440",
  storageBucket: "yun-genai-440.firebasestorage.app",
  messagingSenderId: "356049012845",
  appId: "1:356049012845:web:bde4744bbd0ebb16479764"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
export { db };