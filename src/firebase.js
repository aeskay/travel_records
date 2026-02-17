import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyAtAAG3mb9FLWQ3TQXax4IiTYpPPC0PkwU",
    authDomain: "travel-records-7a2a4.firebaseapp.com",
    projectId: "travel-records-7a2a4",
    storageBucket: "travel-records-7a2a4.firebasestorage.app",
    messagingSenderId: "790195279366",
    appId: "1:790195279366:web:c81a323414b1fb9e809587",
    measurementId: "G-0YGCZGB0TD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
