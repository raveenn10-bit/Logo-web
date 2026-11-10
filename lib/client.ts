"use client";
import {createClient, type SupabaseClient, type User} from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "", key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
let client: SupabaseClient | null | undefined;
/** One browser Supabase client per tab. */
export function browserDb(): SupabaseClient | null {
  if (client === undefined) client = url && key ? createClient(url, key) : null;
  return client;
}
export const PUBLIC_SITE = "https://logo.harshapex.com.lk";
export const WHATSAPP_NUMBER = "94770663154";
export const WHATSAPP_DISPLAY = "+94 77 066 3154";
export const isGuest = (u: User | null) => Boolean(u?.is_anonymous || u?.app_metadata?.provider === "anonymous");

export type Entitlements = {is_guest: boolean; free_used: number; free_limit: number; free_remaining: number; paid_credits: number; credits_per_payment: number; price_lkr: number; generation_enabled: boolean; announcement: string | null};
export const defaultEntitlements = (guest: boolean): Entitlements => ({is_guest: guest, free_used: 0, free_limit: guest ? 1 : 2, free_remaining: guest ? 1 : 2, paid_credits: 0, credits_per_payment: 5, price_lkr: 300, generation_enabled: true, announcement: null});

/** Server-computed entitlements, with a fallback for databases without the v2 migration. */
export async function loadEntitlements(db: SupabaseClient, user: User): Promise<Entitlements> {
  const r = await db.rpc("logova_my_entitlements");
  if (!r.error && r.data) return r.data as Entitlements;
  const c = await db.from("user_credits").select("free_used,paid_credits").eq("user_id", user.id).maybeSingle();
  const base = defaultEntitlements(isGuest(user));
  const used = c.data?.free_used || 0;
  return {...base, free_used: used, free_remaining: Math.max(0, base.free_limit - used), paid_credits: c.data?.paid_credits || 0};
}
export async function loadPublicSettings(db: SupabaseClient) {
  const r = await db.rpc("logova_public_settings");
  return (r.data || {credits_per_payment: 5, price_lkr: 300, free_generations: 2, guest_free_generations: 1, generation_enabled: true, announcement: null}) as {credits_per_payment: number; price_lkr: number; free_generations: number; guest_free_generations: number; generation_enabled: boolean; announcement: string | null};
}

/** Remember where to return after Google sign-in (sessionStorage only; never trusted for authorisation). */
export function rememberReturn(path: string) { try { sessionStorage.setItem("logova:after-auth", path); } catch {} }
export function takeReturn(): string | null {
  try {
    const v = sessionStorage.getItem("logova:after-auth"); sessionStorage.removeItem("logova:after-auth");
    return v && /^\/(studio|dashboard|payments|chamilka)(\/[\w-]*)?$/.test(v) ? v : null;
  } catch { return null; }
}
export function oauthRedirect() {
  const origin = window.location.hostname === "localhost" || window.location.hostname.endsWith(".vercel.app") ? window.location.origin : PUBLIC_SITE;
  return origin + "/auth/callback";
}

export function whatsappLink(orderId: string, credits: number, price: number) {
  const message = `Hello LOGOVA team! 👋\n\nI would like to purchase ${credits} additional logo generation${credits === 1 ? "" : "s"}.\n\nPayment reference: ${orderId}\nAmount: LKR ${price}\n\nPlease send me the payment details.`;
  return "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(message);
}

const fileName = (name: string) => (name.trim() || "logova-logo").replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "logova-logo";
function save(blob: Blob, name: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
export function downloadSvg(svg: string, brand: string) { save(new Blob([svg], {type: "image/svg+xml"}), fileName(brand) + ".svg"); }
/** Rasterises the SVG at 2000px wide; transparent mode removes the full-canvas background rectangle. */
export function downloadPng(svg: string, brand: string, transparent = false): Promise<void> {
  const art = transparent ? svg.replace(/<rect[^>]*width="800"[^>]*height="500"[^>]*\/>/i, "") : svg;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas"); canvas.width = 2000; canvas.height = 1250;
      const ctx = canvas.getContext("2d"); if (!ctx) { reject(new Error("Canvas unavailable")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(img.src);
      canvas.toBlob(b => { if (b) { save(b, fileName(brand) + (transparent ? "-transparent" : "") + ".png"); resolve(); } else reject(new Error("PNG export failed")); }, "image/png");
    };
    img.onerror = () => reject(new Error("PNG export failed"));
    img.src = URL.createObjectURL(new Blob([art], {type: "image/svg+xml"}));
  });
}
export const svgDataUri = (svg: string) => "data:image/svg+xml," + encodeURIComponent(svg);

export type GenerateResult = {id: string; project_id: string; brand: string; style: string; svg: string; source: string; model?: string; fallback?: boolean; spec?: {explanation?: string; symbolRationale?: string; typography?: string; palette?: string[]; styleId?: string; tagline?: string}};
export type GenerateOutcome = {ok: true; result: GenerateResult} | {ok: false; payment?: boolean; login?: boolean; error: string};

/**
 * Calls the generation API. The request id makes the call idempotent, so network
 * failures and "still processing" answers are retried safely without double charges.
 */
export async function requestGeneration(token: string, body: Record<string, unknown>, onStatus?: (s: string) => void): Promise<GenerateOutcome> {
  const requestId = crypto.randomUUID();
  let lastError = "Could not create the logo.";
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await fetch("/api/generate", {method: "POST", headers: {"Content-Type": "application/json", Authorization: "Bearer " + token}, body: JSON.stringify({...body, requestId}), signal: AbortSignal.timeout(50000)});
      const r = await response.json().catch(() => ({error: "Unexpected server response."}));
      if (response.ok) return {ok: true, result: r as GenerateResult};
      if (r.payment_required) return {ok: false, payment: true, error: "Your free logos are used."};
      if (r.login_required) return {ok: false, login: true, error: r.error || "Sign in to continue."};
      if (response.status === 409 && r.in_progress) { onStatus?.("Still designing — finishing your vector artwork…"); await new Promise(res => setTimeout(res, 4000)); continue; }
      return {ok: false, error: r.error || "Generation failed. No credit was used."};
    } catch (e) {
      lastError = e instanceof Error && e.name === "TimeoutError" ? "The designer is taking longer than usual." : "Connection interrupted.";
      if (attempt >= 1) break;
      onStatus?.(lastError + " Reconnecting safely…");
      await new Promise(res => setTimeout(res, 1500));
    }
  }
  return {ok: false, error: lastError + " Check My logos before retrying — you are never charged twice for the same request."};
}
