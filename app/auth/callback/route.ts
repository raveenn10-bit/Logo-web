import {NextResponse} from "next/server";

/**
 * Keep the OAuth code in the browser so the existing Supabase client can
 * exchange it and persist the session consistently on mobile and desktop.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  const canonicalOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://logo.harshapex.com.lk";
  // Local and Vercel preview deployments keep their own origin: the PKCE verifier is stored there.
  const sameOrigin = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".vercel.app");
  const destination = new URL("/payments", sameOrigin ? url.origin : canonicalOrigin);
  if (code) destination.searchParams.set("code", code);
  if (error) destination.searchParams.set("oauth_error", error);
  return NextResponse.redirect(destination);
}
