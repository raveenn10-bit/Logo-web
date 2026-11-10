"use client";
import {useCallback, useEffect, useState} from "react";
import type {User} from "@supabase/supabase-js";
import "../../components/studio.css";
import PaymentModal from "../../components/PaymentModal";
import {browserDb, defaultEntitlements, isGuest, loadEntitlements, oauthRedirect, takeReturn, whatsappLink, type Entitlements} from "../../lib/client";

type Payment = {id: string; order_id: string; status: string; amount_lkr: number; receipt_path: string | null; created_at: string; rejection_reason: string | null; credits_granted?: number | null};
const statusLabel: Record<string, string> = {pending: "Awaiting receipt", receipt_submitted: "Verifying", approved: "Approved", rejected: "Rejected"};

export default function Payments() {
  const db = browserDb();
  const [user, setUser] = useState<User | null>(null), [ready, setReady] = useState(false), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState(""), [linkConflict, setLinkConflict] = useState(false);
  const [ent, setEnt] = useState<Entitlements>(defaultEntitlements(false)), [orders, setOrders] = useState<Payment[]>([]), [admin, setAdmin] = useState(false), [buyOpen, setBuyOpen] = useState(false);

  const refresh = useCallback(async (u: User) => {
    if (!db) return;
    const [e, p, a] = await Promise.all([loadEntitlements(db, u), db.from("payment_requests").select("*").eq("user_id", u.id).order("created_at", {ascending: false}), db.rpc("is_logo_admin")]);
    setEnt(e); setOrders((p.data || []) as Payment[]); setAdmin(a.data === true);
  }, [db]);

  useEffect(() => {
    if (!db) { setReady(true); return; }
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code"), oauthError = params.get("oauth_error");
    if (oauthError) {
      const message = decodeURIComponent(oauthError);
      if (/already|exists|linked/i.test(message)) { setLinkConflict(true); setError("This Google account already has a LOGOVA account. Sign in to it to continue — your guest logo stays on this device's guest session."); }
      else setError(message);
      window.history.replaceState({}, "", window.location.pathname);
    }
    void (async () => {
      if (code) {
        setBusy(true);
        const exchanged = await db.auth.exchangeCodeForSession(code);
        window.history.replaceState({}, "", window.location.pathname);
        setBusy(false);
        if (exchanged.error) setError(exchanged.error.message);
        else { const next = takeReturn(); if (next && next !== "/payments") { window.location.replace(next); return; } }
      }
      const {data: {session}} = await db.auth.getSession();
      if (!active) return;
      setUser(session?.user || null);
      if (session?.user) await refresh(session.user);
      setReady(true);
    })();
    const {data: {subscription}} = db.auth.onAuthStateChange((_e, s) => { if (!active) return; setUser(s?.user || null); if (s?.user) void refresh(s.user); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [db, refresh]);

  async function emailAuth(signup: boolean) {
    if (!db) return;
    const clean = email.trim().toLowerCase(); setError(""); setNote("");
    if (!/^\S+@\S+\.\S+$/.test(clean)) { setError("Enter a valid email address."); return; }
    if (password.length < 8) { setError("Use a password with at least 8 characters."); return; }
    setBusy(true);
    try {
      const r = signup ? await db.auth.signUp({email: clean, password, options: {emailRedirectTo: window.location.origin + "/payments"}}) : await db.auth.signInWithPassword({email: clean, password});
      if (r.error) setError(r.error.message); else if (signup) setNote("Account created. Check your inbox to confirm your email, then sign in.");
    } finally { setBusy(false); }
  }
  async function google(forceSignIn = false) {
    if (!db) return;
    setBusy(true); setError(""); setNote("");
    const options = {redirectTo: oauthRedirect(), queryParams: {prompt: "select_account"}};
    const r = isGuest(user) && !forceSignIn ? await db.auth.linkIdentity({provider: "google", options}) : await db.auth.signInWithOAuth({provider: "google", options});
    if (r.error) { setError(r.error.message); setBusy(false); }
  }
  async function upload(p: Payment, file?: File) {
    if (!db || !user || !file) return;
    if (file.size > 5_000_000 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) { setError("Choose a JPG, PNG, WebP or PDF under 5 MB."); return; }
    setBusy(true); setError("");
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/${p.id}/${crypto.randomUUID()}.${ext}`;
    const s = await db.storage.from("payment-receipts").upload(path, file, {contentType: file.type, upsert: false});
    if (s.error) setError(s.error.message);
    else {
      const x = await db.rpc("submit_payment_receipt", {p_payment: p.id, p_path: path});
      if (x.error || !x.data) setError(x.error?.message || "Receipt could not be submitted.");
      else { setNote("Receipt submitted. We'll verify it and add your credits shortly."); await refresh(user); }
    }
    setBusy(false);
  }

  if (!db) return <main className="lv-shell"><p className="lv-panel">Payment setup unavailable.</p></main>;
  const signedIn = user && !isGuest(user);
  return <main className="lv-shell">
    <header className="lv-top"><a href="/" className="lv-brand" aria-label="LOGOVA home"><span aria-hidden="true">✦</span> LOGO<b>VA</b></a>
      <div className="lv-top-right"><a className="lv-btn lv-btn-ghost lv-sm" href="/studio">Open studio</a>{signedIn && <a className="lv-btn lv-btn-ghost lv-sm" href="/dashboard">Workspace</a>}</div></header>
    <div className="lv-page">
      <div className="lv-page-head"><p className="lv-kicker">ACCOUNT &amp; CREDITS</p><h1>{signedIn ? "Your logo credits" : "Sign in to LOGOVA"}</h1>
        <p>Your first logo is free as a guest. Sign in with Google for one more free logo; after that, LKR {ent.price_lkr} unlocks {ent.credits_per_payment} more.</p></div>
      {error && <p className="lv-error" role="alert">{error}</p>}
      {note && <p className="lv-note" role="status">{note}</p>}
      {!ready ? <section className="lv-panel lv-pad"><p>Loading your account…</p></section> : !signedIn ? <section className="lv-panel lv-pad lv-auth">
        <h2>{isGuest(user) ? "Save your guest logo" : "Welcome"}</h2>
        <p className="lv-muted">{isGuest(user) ? "Continue with Google to keep your free guest logo on a permanent account." : "Your logos, credits and payments are tied securely to your account."}</p>
        <button type="button" className="lv-btn lv-btn-google lv-wide" disabled={busy} onClick={() => google(false)}><span aria-hidden="true">G</span> Continue with Google</button>
        {linkConflict && <button type="button" className="lv-btn lv-btn-dark lv-wide" disabled={busy} onClick={() => google(true)}>Sign in to my existing Google account</button>}
        {!user && <>
          <div className="lv-divider"><span>or use email</span></div>
          <form className="lv-form" onSubmit={e => { e.preventDefault(); void emailAuth(false); }}>
            <label htmlFor="email">Email</label><input id="email" required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/>
            <label htmlFor="password">Password</label><input id="password" required minLength={8} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"/>
            <div className="lv-actions"><button className="lv-btn lv-btn-primary" disabled={busy} type="submit">{busy ? "Please wait…" : "Sign in"}</button><button disabled={busy} type="button" className="lv-btn lv-btn-ghost" onClick={() => emailAuth(true)}>Create account</button></div>
          </form></>}
        <p className="lv-fine" lang="si">Google account එකෙන් continue කළාම free logo එකත් ඒ account එකටම ආරක්ෂිතව save වෙනවා.</p>
      </section> : <>
        <div className="lv-stats">
          <article><small>FREE REMAINING</small><b>{ent.free_remaining}</b><span>of {ent.free_limit} included</span></article>
          <article><small>PAID CREDITS</small><b>{ent.paid_credits}</b><span>ready to use</span></article>
          <article><small>LOGO PACK</small><b>LKR {ent.price_lkr}</b><span>{ent.credits_per_payment} generations</span></article>
        </div>
        <section className="lv-panel lv-pad lv-buy"><div><h2>Unlock {ent.credits_per_payment} more logos</h2><p className="lv-muted">Get a payment reference, message us on WhatsApp, then upload your receipt below. Credits are added after verification.</p></div>
          <button className="lv-btn lv-btn-whatsapp" onClick={() => setBuyOpen(true)}>Pay via WhatsApp · LKR {ent.price_lkr}</button></section>
        <section className="lv-panel lv-pad"><h2>My payments</h2>
          {orders.length === 0 ? <p className="lv-muted">No payments yet.</p> : <div className="lv-orders">{orders.map(p => <article key={p.id} className="lv-order">
            <div><code>{p.order_id}</code><span className={"lv-status lv-status-" + p.status}>{statusLabel[p.status] || p.status}</span>
              <p className="lv-muted">LKR {p.amount_lkr} · {new Date(p.created_at).toLocaleDateString()}{p.credits_granted ? ` · ${p.credits_granted} credits added` : ""}</p>
              {p.status === "rejected" && p.rejection_reason && <p className="lv-error">Rejected: {p.rejection_reason}</p>}</div>
            <div className="lv-order-actions">
              {p.status === "pending" && <a className="lv-btn lv-btn-ghost lv-sm" href={whatsappLink(p.order_id, ent.credits_per_payment, p.amount_lkr)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
              {(p.status === "pending" || p.status === "rejected") && <label className="lv-btn lv-btn-dark lv-sm lv-upload">Upload receipt<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={e => upload(p, e.target.files?.[0])}/></label>}
            </div></article>)}</div>}
        </section>
        <div className="lv-actions">{admin && <a className="lv-btn lv-btn-dark" href="/chamilka">Open admin dashboard →</a>}<button className="lv-btn lv-btn-ghost" onClick={() => db.auth.signOut()}>Sign out</button></div>
      </>}
    </div>
    <PaymentModal open={buyOpen} onClose={() => { setBuyOpen(false); if (user) void refresh(user); }} credits={ent.credits_per_payment} price={ent.price_lkr} title="Buy a logo pack"/>
  </main>;
}
