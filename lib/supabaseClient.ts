"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SupabaseClientBrowser = SupabaseClient;

let singletonBrowserClient: SupabaseClientBrowser | null = null;

export function createClient(): SupabaseClientBrowser {
  if (singletonBrowserClient) return singletonBrowserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
  }

  singletonBrowserClient = createBrowserClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return singletonBrowserClient;
}

export function getClientSafe(): {
  ok: true;
  client: SupabaseClientBrowser;
} | {
  ok: false;
  error: string;
} {
  try {
    return { ok: true, client: createClient() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
