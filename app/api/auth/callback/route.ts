import { NextResponse } from "next/server";
import { createServerSideClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    try {
      const supabase = createServerSideClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      console.error("[Auth] Code exchange error:", error);
    } catch (err) {
        console.error("[Auth] Code exchange exception:", err);
      }
    }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
