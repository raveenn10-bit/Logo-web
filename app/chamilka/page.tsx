"use client";

import { useEffect, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const db = url && key ? createClient(url, key) : null;

type Payment = {
  id: string;
  order_id: string;
  user_id: string;
  email: string;
  amount_lkr: number;
  status: string;
  receipt_path: string | null;
  created_at: string;
};

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState<Payment[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(account: User) {
    if (!db) return;
    setLoading(true);
    const role = await db.rpc("is_logo_admin");
    if (role.error || role.data !== true) {
      setAuthorized(false);
      setOrders([]);
      setLoading(false);
      return;
    }
    setAuthorized(true);
    const result = await db.rpc("list_logo_payments_admin");
    if (result.error) setError(result.error.message);
    else setOrders((result.data || []) as Payment[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    db.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) void load(data.user);
      else setLoading(false);
    });
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, session) => {
      const account = session?.user || null;
      setUser(account);
      if (account) void load(account);
      else { setAuthorized(false); setOrders([]); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return;
    setBusy(true); setError("");
    const result = await db.auth.signInWithPassword({ email, password });
    if (result.error) setError(result.error.message);
    setBusy(false);
  }

  async function viewReceipt(payment: Payment) {
    if (!db || !payment.receipt_path) return;
    setError("");
    const result = await db.storage.from("payment-receipts").createSignedUrl(payment.receipt_path, 60);
    if (result.error) setError(result.error.message);
    else if (result.data) window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function review(payment: Payment, approve: boolean) {
    if (!db || !user) return;
    if (approve && !verified[payment.id]) { setError("Confirm the actual bank transaction first."); return; }
    if (!approve && (reason[payment.id] || "").trim().length < 5) { setError("Enter a rejection reason (at least 5 characters)."); return; }
    setBusy(true); setError(""); setNotice("");
    const result = await db.rpc("review_logo_payment", {
      p_payment: payment.id,
      p_approve: approve,
      p_reason: approve ? null : reason[payment.id].trim(),
    });
    if (result.error) setError(result.error.message);
    else { setNotice(result.data ? "Review saved. Account credits updated." : "This order was already reviewed."); await load(user); }
    setBusy(false);
  }

  const visible = orders.filter(p =>
    (filter === "all" || p.status === filter) &&
    (p.order_id.toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase()))
  );
  const count = (status: string) => orders.filter(p => p.status === status).length;
  const revenue = orders.filter(p => p.status === "approved").reduce((sum, p) => sum + p.amount_lkr, 0);

  return <main className="pay-shell admin-shell">
    <div className="admin-top"><a href="/" className="pay-back">← LOGOVA</a><span>ADMIN WORKSPACE / CHAMILKA</span></div>
    <div className="pay-hero"><span>PRIVATE PAYMENT OPERATIONS</span><h1>Payment review</h1><p>Verify each transfer with your bank before issuing a logo credit.</p></div>
    {error && <div className="pay-error" role="alert">{error}</div>}
    {notice && <div className="pay-note" role="status">{notice}</div>}
    {!db ? <section className="pay-panel"><p>Supabase configuration is unavailable.</p></section> :
      loading ? <section className="pay-panel"><p role="status">Checking administrator access…</p></section> :
      !user ? <section className="pay-panel admin-login"><h2>Admin sign in</h2><p>Only approved administrators can review customer payments.</p><form onSubmit={signIn}><label>Email<input required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}/></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label><button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button></form></section> :
      !authorized ? <section className="pay-panel"><h2>Access denied</h2><p>This account does not have permission to manage payments.</p><button className="pay-outline" onClick={() => db.auth.signOut()}>Sign out</button></section> :
      <>
        <div className="pay-stats admin-stats"><article><small>PENDING RECEIPTS</small><b>{count("receipt_submitted")}</b></article><article><small>APPROVED ORDERS</small><b>{count("approved")}</b></article><article><small>VERIFIED REVENUE*</small><b>Rs. {revenue.toLocaleString()}</b></article></div>
        <p className="admin-footnote">* Totals reflect the 100 most recent orders shown below.</p>
        <section className="pay-panel"><div className="admin-heading"><div><h2>Payment requests</h2><p>Search, inspect a receipt, then approve or reject.</p></div><button className="pay-outline" disabled={busy} onClick={() => load(user)}>Refresh</button></div>
          <div className="pay-filters"><input aria-label="Search by order ID or email" placeholder="Order ID or customer email" value={search} onChange={e => setSearch(e.target.value)}/><select aria-label="Filter payment status" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option><option value="receipt_submitted">Pending verification</option><option value="pending">Awaiting receipt</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>
          {orders.length === 0 ? <p>No payment requests yet.</p> : visible.length === 0 ? <p>No matching orders.</p> :
            <div className="admin-orders">{visible.map(p => <article key={p.id} className="admin-order"><div className="admin-order-main"><div><strong>{p.order_id}</strong><span className={"pay-status " + p.status}>{p.status.replaceAll("_", " ")}</span><p>{p.email}</p><small>{new Date(p.created_at).toLocaleString()} · LKR {p.amount_lkr}</small></div>{p.receipt_path && <button className="pay-outline" onClick={() => viewReceipt(p)}>View receipt ↗</button>}</div>{p.status === "receipt_submitted" && <div className="admin-review"><label><input type="checkbox" checked={!!verified[p.id]} onChange={e => setVerified({ ...verified, [p.id]: e.target.checked })}/> I verified this bank transaction</label><div className="admin-review-actions"><button disabled={busy || !verified[p.id]} onClick={() => review(p, true)}>Approve · +1 credit</button><input aria-label={"Rejection reason for " + p.order_id} placeholder="Reason for rejection" value={reason[p.id] || ""} onChange={e => setReason({ ...reason, [p.id]: e.target.value })}/><button disabled={busy} className="pay-outline" onClick={() => review(p, false)}>Reject</button></div></div>}</article>)}</div>}
        </section><button className="pay-outline" onClick={() => db.auth.signOut()}>Sign out</button>
      </>}
  </main>;
}
