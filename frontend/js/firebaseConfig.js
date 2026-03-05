const firebaseConfig = {
    apiKey: "AIzaSyCs3il2v6Xvy9s7z3Utm70nIHmcvFojKKs",
    authDomain: "sentiment-analysis-a445c.firebaseapp.com",
    projectId: "sentiment-analysis-a445c",
    storageBucket: "sentiment-analysis-a445c.firebasestorage.app",
    messagingSenderId: "421737193047",
    appId: "1:421737193047:web:e9d45cfd5c2115a4538d12",
    measurementId: "G-ENP861L643"
};


import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export { auth, db, provider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile };
