import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { apiFetch, setApiAuthToken } from '../lib/api.ts';
import { AuthUser } from '../types/bloodlink.ts';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  authError: string | null;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function checkExistingSession() {
      try {
        const res = await apiFetch<{ user: AuthUser | null }>('/api/auth/session');
        if (active && res.user) {
          setUser(res.user);
        }
      } catch {
        // Ignore session check failure
      } finally {
        if (active) setLoading(false);
      }
    }

    checkExistingSession();

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!active) return;
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          setApiAuthToken(idToken);
          const res = await apiFetch<{ user: AuthUser }>('/api/auth/firebase', {
            method: 'POST',
          });
          if (active) setUser(res.user);
        } catch (err) {
          console.error('Firebase session sync error:', err);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const loginWithCredentials = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setApiAuthToken(res.token);
    setUser(res.user);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    const credential = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await credential.user.getIdToken();
    setApiAuthToken(idToken);
    const res = await apiFetch<{ user: AuthUser }>('/api/auth/firebase', {
      method: 'POST',
    });
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout network error
    }
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch {
      // Ignore Firebase signOut error
    }
    setApiAuthToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        loginWithCredentials,
        loginWithGoogle,
        logout,
        clearError: () => setAuthError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
