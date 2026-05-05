import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCyOxKMZ6ghaDX_RaVEQs-C4GOknBc2bGU",
  authDomain: "heyball-training.firebaseapp.com",
  projectId: "heyball-training",
  storageBucket: "heyball-training.firebasestorage.app",
  messagingSenderId: "309037091504",
  appId: "1:309037091504:web:a591c4be683b43445a8975",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const DEMO_USER_ID = "demo-user";
export const auth = getAuth(app);