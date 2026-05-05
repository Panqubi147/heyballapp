"use client";

import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { auth, db } from "@/lib/firebase";

type UserRole = "user" | "coach";

type RegisterData = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

type AuthContextValue = {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadUserRole(currentUser: User | null) {
    if (!currentUser) {
      setRole(null);
      return;
    }

    const userSnapshot = await getDoc(doc(db, "users", currentUser.uid));

    if (userSnapshot.exists()) {
      const data = userSnapshot.data();
      setRole((data.role as UserRole) || "user");
      return;
    }

    await setDoc(doc(db, "users", currentUser.uid), {
      email: currentUser.email,
      firstName: "",
      lastName: "",
      displayName: currentUser.email,
      role: "user",
      createdAt: serverTimestamp(),
    });

    setRole("user");
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);

      try {
        setUser(currentUser);
        await loadUserRole(currentUser);
      } catch (error) {
        console.error(error);
        setRole(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      loading,
      login: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      register: async ({ email, password, firstName, lastName }) => {
        const result = await createUserWithEmailAndPassword(auth, email, password);

        await setDoc(doc(db, "users", result.user.uid), {
          email: result.user.email,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
          role: "user",
          createdAt: serverTimestamp(),
        });

        setUser(result.user);
        setRole("user");
      },
      logout: async () => {
        await signOut(auth);
        setUser(null);
        setRole(null);
      },
    }),
    [user, role, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}