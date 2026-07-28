"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session, User } from "@supabase/supabase-js";
import { getClientSafe } from "@/lib/supabaseClient";

export interface AuthContextValue {
  initialized: boolean;
  session: Session | null;
  user: User | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  client: SupabaseClient | null;
  clientError: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;
    const result = getClientSafe();
    if (!result.ok) {
      setClientError(result.error);
      setInitialized(true);
      return;
    }

    const supabase = result.client;
    setClient(supabase);

    (async () => {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();
        if (mounted) {
          setSession(initialSession);
          setInitialized(true);
        }
      } catch (err) {
        console.error("[Auth] getSession failed:", err);
        if (mounted) {
          setInitialized(true);
        }
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!client) return;
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/api/auth/callback`
        : undefined;
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) {
      console.error("[Auth] Google sign-in error:", error);
      throw error;
    }
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client) return;
    await client.auth.signOut();
    setSession(null);
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized,
      session,
      user: session?.user ?? null,
      signInWithGoogle,
      signOut,
      client,
      clientError,
    }),
    [initialized, session, signInWithGoogle, signOut, client, clientError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
