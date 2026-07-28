"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Loader2, ShieldCheck, Lock, AlertCircle } from "lucide-react";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export default function SignInGate() {
  const { signInWithGoogle, clientError } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      await signInWithGoogle();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Sign-in could not be started. Check your Supabase configuration.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [signInWithGoogle]);

  return (
    <div className="relative flex items-center justify-center min-h-screen w-full bg-background overflow-hidden px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[420px] h-[420px] rounded-full bg-accent/15 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-accent/10 blur-3xl animate-pulse" style={{ animationDelay: "600ms" }} />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="bg-background-secondary/60 backdrop-blur-xl border border-border rounded-3xl shadow-2xl p-8 sm:p-10">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="relative mb-5">
              <div className="w-16 h-16 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center">
                <Lock className="w-7 h-7 text-accent" strokeWidth={1.8} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background-secondary border border-border flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-green-400" strokeWidth={2.2} />
              </div>
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">
              Obsidian
            </h1>
            <p className="text-foreground-muted text-[15px] max-w-sm">
              Fearlessly intelligent. Unmistakably direct. Sign in below to unlock the conversation.
            </p>
          </div>

          {(clientError || error) && (
            <div className="mb-6 flex items-start gap-2 px-3.5 py-3 rounded-xl border border-red-500/30 bg-red-500/5 text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed break-words whitespace-pre-wrap">
                {clientError
                  ? `Supabase configuration missing:\n${clientError}`
                  : error}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleSignIn}
            disabled={loading || !!clientError}
            className="group relative w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-2xl bg-white text-[#1f1f1f] font-semibold text-[15px] shadow-lg shadow-black/30 hover:bg-gray-50 hover:shadow-xl hover:shadow-black/40 active:scale-[0.99] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg disabled:hover:shadow-black/30 disabled:hover:bg-white focus:outline-none focus:ring-2 focus:ring-accent/70 focus:ring-offset-2 focus:ring-offset-background-secondary"
          >
            <span className="flex items-center justify-center w-5 h-5 flex-shrink-0">
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#1f1f1f]" />
              ) : (
                <GoogleIcon className="w-5 h-5" />
              )}
            </span>
            <span>
              {loading ? "Redirecting to Google…" : "Continue with Google"}
            </span>
          </button>

          <div className="mt-8 pt-6 border-t border-border/70">
            <p className="text-[12px] leading-relaxed text-foreground-muted/80 text-center">
              By signing in you agree that all prompts and responses may be
              logged server-side for review by the workspace owner. This is
              an audit layer only — other users cannot see your chats.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
