import { createContext, useState, useContext, useEffect } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, deleteUser } from 'firebase/auth';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Listen for Firebase Auth state changes
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            if (firebaseUser) {
                // User is signed in
                setUser({
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    username: firebaseUser.displayName || firebaseUser.email.split('@')[0] // Fallback to email prefix
                });
            } else {
                // User is signed out
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const login = async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
    };

    const signup = async (email, password) => {
        await createUserWithEmailAndPassword(auth, email, password);
    };

    const logout = async () => {
        await signOut(auth);
    };

    const updateUserProfile = async (displayName) => {
        const currentUser = auth.currentUser;
        if (currentUser) {
            await updateProfile(currentUser, { displayName });
            // Update local state
            setUser(prev => ({ ...prev, username: displayName }));
        }
    };

    const deleteUserAccount = async () => {
        const currentUser = auth.currentUser;
        if (currentUser) {
            await deleteUser(currentUser);
            // User state will be updated automatically via onAuthStateChanged
        }
    };

    return (
        <UserContext.Provider value={{ user, login, signup, logout, updateUserProfile, deleteUserAccount, loading }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => useContext(UserContext);

