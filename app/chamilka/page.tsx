"use client";
import {useCallback, useEffect, useMemo, useState} from "react";
import type {User} from "@supabase/supabase-js";
import "../../components/studio.css";
import "../../components/admin.css";
import {browserDb, oauthRedirect, rememberReturn, svgDataUri} from "../../lib/client";

type Tab = "overview" | "payments" | "users" | "generations" | "audit" | "settings";
type Overview = Record<string, number>;
type Payment = {id: string; order_id: string; email: string; amount_lkr: number; status: string; receipt_path: string | null; created_at: string; reviewed_at?: string | null; credits_granted?: number | null; rejection_reason?: string | null};
type AdminUser = {id: string; email: string; provider: string; is_guest: boolean; created_at: string; last_sign_in_at: string | null; free_used: number; paid_credits: number; logos: number; approved_payments: number; is_admin: boolean};
type Job = {id: string; created_at: string; completed_at: string | null; status: string; provider: string | null; owner_email: string; is_guest: boolean; brand: string; style: string; concept_id: string | null; svg: string | null};
type Audit = {created_at: string; category: string; action: string; admin_email: string; target: string; detail: string};
type Day = {day: string; generations: number; completed: number; failed: number; new_users: number; revenue_lkr: number};
type Settings = {credits_per_payment: number; free_generations: number; guest_free_generations: number; guest_daily_limit_per_network: number; generation_enabled: boolean; announcement: string | null; updated_at?: string};
const nav: [Tab, string][] = [["overview", "Overview"], ["payments", "Payments"], ["users", "Users & credits"], ["generations", "Generations"], ["audit", "Audit log"], ["settings", "Settings"]];
const MIGRATION_HINT = "This section needs the database migration supabase/migrations/20261111_logova_v2_entitlements_admin.sql.";
const missing = (e: {code?: string; message?: string} | null) => !!e && (e.code === "PGRST202" || /could not find the function/i.test(e.message || ""));
const when = (v: string | null | undefined) => v ? new Date(v).toLocaleString() : "—";

export default function AdminPage() {
  const db = browserDb();
  const [user, setUser] = useState<User | null>(null), [authorized, setAuthorized] = useState(false), [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [tab, setTab] = useState<Tab>("overview"), [menuOpen, setMenuOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<Overview | null>(null), [days, setDays] = useState<Day[]>([]), [payments, setPayments] = useState<Payment[]>([]), [users, setUsers] = useState<AdminUser[]>([]), [jobs, setJobs] = useState<Job[]>([]), [audit, setAudit] = useState<Audit[]>([]), [settings, setSettings] = useState<Settings | null>(null);
  const [needsMigration, setNeedsMigration] = useState<Record<string, boolean>>({});
  const [paySearch, setPaySearch] = useState(""), [payFilter, setPayFilter] = useState("receipt_submitted"), [verified, setVerified] = useState<Record<string, boolean>>({}), [reason, setReason] = useState<Record<string, string>>({});
  const [userSearch, setUserSearch] = useState(""), [adjust, setAdjust] = useState<{id: string; email: string} | null>(null), [delta, setDelta] = useState(5), [adjustReason, setAdjustReason] = useState(""), [jobFilter, setJobFilter] = useState("all"), [preview, setPreview] = useState<Job | null>(null);

  const flag = (k: string, v: boolean) => setNeedsMigration(m => ({...m, [k]: v}));
  const loadTab = useCallback(async (which: Tab) => {
    if (!db) return;
    setError("");
    if (which === "overview") {
      const [o, d] = await Promise.all([db.rpc("logo_admin_overview"), db.rpc("logo_admin_daily", {p_days: 14})]);
      if (o.error) setError(o.error.message); else setSummary(o.data as Overview);
      flag("daily", missing(d.error)); setDays((d.data || []) as Day[]);
    }
    if (which === "payments") {
      let r = await db.rpc("logo_admin_payments", {p_status: payFilter, p_search: paySearch.trim() || null, p_limit: 200});
      if (missing(r.error)) r = await db.rpc("list_logo_payments_admin");
      if (r.error) setError(r.error.message); else setPayments((r.data || []) as Payment[]);
      const st = await db.rpc("logo_admin_get_settings"); if (!st.error && st.data) setSettings(st.data as Settings);
    }
    if (which === "users") { const r = await db.rpc("logo_admin_users", {p_search: userSearch.trim() || null, p_limit: 200}); flag("users", missing(r.error)); if (r.error && !missing(r.error)) setError(r.error.message); setUsers((r.data || []) as AdminUser[]); }
    if (which === "generations") { const r = await db.rpc("logo_admin_generations", {p_status: jobFilter, p_limit: 60}); flag("generations", missing(r.error)); if (r.error && !missing(r.error)) setError(r.error.message); setJobs((r.data || []) as Job[]); }
    if (which === "audit") { const r = await db.rpc("logo_admin_audit", {p_limit: 200}); flag("audit", missing(r.error)); if (r.error && !missing(r.error)) setError(r.error.message); setAudit((r.data || []) as Audit[]); }
    if (which === "settings") { setSettings(null); const r = await db.rpc("logo_admin_get_settings"); flag("settings", missing(r.error)); if (r.error && !missing(r.error)) setError(r.error.message); setSettings((r.data || null) as Settings | null); }
  }, [db, payFilter, paySearch, userSearch, jobFilter]);

  const checkAccess = useCallback(async (u: User | null) => {
    if (!db) return;
    setUser(u);
    if (!u) { setAuthorized(false); setLoading(false); return; }
    const role = await db.rpc("is_logo_admin");
    setAuthorized(role.data === true); setLoading(false);
  }, [db]);
  useEffect(() => {
    if (!db) { setLoading(false); return; }
    void db.auth.getSession().then(({data}) => checkAccess(data.session?.user || null));
    const {data: {subscription}} = db.auth.onAuthStateChange((_e, s) => { void checkAccess(s?.user || null); });
    return () => subscription.unsubscribe();
  }, [db, checkAccess]);
  useEffect(() => { if (authorized) void loadTab(tab); }, [authorized, tab, loadTab]);
  useEffect(() => { if (authorized && db) void db.rpc("logo_admin_overview").then(o => { if (!o.error) setSummary(o.data as Overview); }); }, [authorized, db]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", close); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = ""; };
  }, [menuOpen]);

  async function signIn(e: React.FormEvent) { e.preventDefault(); if (!db) return; setBusy(true); setError(""); const r = await db.auth.signInWithPassword({email, password}); if (r.error) setError(r.error.message); setBusy(false); }
  async function google() { if (!db) return; rememberReturn("/chamilka"); const r = await db.auth.signInWithOAuth({provider: "google", options: {redirectTo: oauthRedirect(), queryParams: {prompt: "select_account"}}}); if (r.error) setError(r.error.message); }
  async function viewReceipt(p: Payment) { if (!db || !p.receipt_path) return; const r = await db.storage.from("payment-receipts").createSignedUrl(p.receipt_path, 60); if (r.error) setError(r.error.message); else window.open(r.data.signedUrl, "_blank", "noopener,noreferrer"); }
  async function review(p: Payment, approve: boolean) {
    if (!db) return;
    if (approve && !verified[p.id]) { setError("Confirm the actual bank transaction first."); return; }
    if (!approve && (reason[p.id] || "").trim().length < 5) { setError("Enter a rejection reason (at least 5 characters)."); return; }
    if (approve && !window.confirm(`Approve ${p.order_id} for ${p.email}? This adds ${settings?.credits_per_payment ?? "the configured"} credits and cannot be undone.`)) return;
    setBusy(true); setError("");
    const r = await db.rpc("review_logo_payment", {p_payment: p.id, p_approve: approve, p_reason: approve ? null : reason[p.id].trim()});
    if (r.error) setError(r.error.message); else setNotice(r.data ? (approve ? `${p.order_id} approved — credits added.` : `${p.order_id} rejected.`) : "This request was already reviewed. No credits were added.");
    await loadTab("payments"); const o = await db.rpc("logo_admin_overview"); if (!o.error) setSummary(o.data as Overview); setBusy(false);
  }
  async function saveAdjust(e: React.FormEvent) {
    e.preventDefault(); if (!db || !adjust) return;
    setBusy(true); setError("");
    const r = await db.rpc("logo_admin_adjust_credits", {p_user: adjust.id, p_delta: delta, p_reason: adjustReason.trim()});
    if (r.error) setError(r.error.message); else { setNotice(`Credits updated for ${adjust.email || "user"}: balance ${(r.data as {paid_credits: number}).paid_credits}.`); setAdjust(null); setAdjustReason(""); await loadTab("users"); }
    setBusy(false);
  }
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault(); if (!db || !settings) return;
    setBusy(true); setError("");
    const r = await db.rpc("logo_admin_update_settings", {p_settings: settings});
    if (r.error) setError(r.error.message); else { setSettings(r.data as Settings); setNotice("Settings saved and recorded in the audit log."); }
    setBusy(false);
  }
  const select = (t: Tab) => { setTab(t); setMenuOpen(false); setNotice(""); };
  const maxDay = useMemo(() => Math.max(1, ...days.map(d => d.completed)), [days]);

  if (!db) return <main className="lv-shell"><p className="lv-panel lv-pad">Supabase configuration unavailable.</p></main>;
  if (loading) return <main className="lv-shell"><p className="lv-panel lv-pad" role="status">Checking administrator access…</p></main>;
  if (!user || !authorized) return <main className="lv-shell"><header className="lv-top"><a href="/" className="lv-brand"><span aria-hidden="true">✦</span> LOGO<b>VA</b></a></header>
    <section className="lv-panel lv-pad lv-auth lv-admin-gate"><p className="lv-kicker">PRIVATE ADMIN</p>
      {!user ? <><h1>Administrator sign in</h1><p className="lv-muted">Only approved LOGOVA administrators can access this area. Access is verified by the database on every request.</p>
        {error && <p className="lv-error" role="alert">{error}</p>}
        <button className="lv-btn lv-btn-google lv-wide" onClick={google}><span aria-hidden="true">G</span> Continue with Google</button>
        <div className="lv-divider"><span>or</span></div>
        <form className="lv-form" onSubmit={signIn}><label htmlFor="a-email">Email</label><input id="a-email" required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}/><label htmlFor="a-pass">Password</label><input id="a-pass" required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/><button className="lv-btn lv-btn-dark" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form>
      </> : <><h1>Access denied</h1><p className="lv-muted">This account is not an approved LOGOVA administrator.</p><button className="lv-btn lv-btn-ghost" onClick={() => db.auth.signOut()}>Sign out</button></>}
    </section></main>;

  return <main className="lv-shell lv-admin">
    <header className="lv-top"><a href="/" className="lv-brand" aria-label="LOGOVA home"><span aria-hidden="true">✦</span> LOGO<b>VA</b></a>
      <div className="lv-top-right"><span className="lv-meter lv-admin-who">{user.email}</span>
        <button className="lv-burger" aria-label={menuOpen ? "Close admin menu" : "Open admin menu"} aria-expanded={menuOpen} aria-controls="admin-nav" onClick={() => setMenuOpen(o => !o)}><i/><i/><i/></button></div></header>
    <div className="lv-admin-layout">
      {menuOpen && <button className="lv-admin-scrim" aria-label="Close admin menu" onClick={() => setMenuOpen(false)}/>}
      <nav id="admin-nav" className={"lv-admin-nav" + (menuOpen ? " is-open" : "")} aria-label="Admin sections">
        <p className="lv-kicker">CONTROL CENTRE</p>
        {nav.map(([id, label]) => <button key={id} aria-current={tab === id ? "page" : undefined} className={tab === id ? "is-active" : ""} onClick={() => select(id)}>{label}{id === "payments" && !!summary?.awaiting_review && <span className="lv-badge">{summary.awaiting_review}</span>}</button>)}
        <button className="lv-admin-signout" onClick={() => db.auth.signOut()}>Sign out</button>
      </nav>
      <section className="lv-admin-main" aria-live="polite">
        <div className="lv-admin-head"><div><p className="lv-kicker">ADMIN / {tab.toUpperCase()}</p><h1>{nav.find(n => n[0] === tab)![1]}</h1></div><button className="lv-btn lv-btn-ghost lv-sm" onClick={() => loadTab(tab)}>Refresh</button></div>
        {error && <p className="lv-error" role="alert">{error}</p>}
        {notice && <p className="lv-note" role="status">{notice}</p>}

        {tab === "overview" && summary && <>
          <div className="lv-kpis">{[["Registered users", summary.registered_users ?? summary.users], ["Guest sessions", summary.guest_users ?? "—"], ["Logos created", summary.logos], ["Generations today", summary.generations_today ?? "—"], ["Verified revenue", "LKR " + Number(summary.revenue_lkr || 0).toLocaleString()], ["Awaiting review", summary.awaiting_review ?? summary.pending_payments], ["Paid / free generations", `${summary.paid_generations} / ${summary.free_generations}`], ["Failed jobs", summary.failed_jobs], ["Unused paid credits", summary.outstanding_credits ?? "—"], ["Gemini tokens", Number(summary.ai_tokens || 0).toLocaleString()]].map(([k, v]) => <article key={k as string}><small>{k}</small><b>{v}</b></article>)}</div>
          <section className="lv-panel lv-pad"><h2>Completed logos · last 14 days</h2>
            {needsMigration.daily ? <p className="lv-muted">{MIGRATION_HINT}</p> : <>
              <div className="lv-chart" role="img" aria-label={"Completed logos per day: " + days.map(d => `${d.day} ${d.completed}`).join(", ")}>
                {days.map(d => <div key={d.day} className="lv-bar-col" tabIndex={0}><span className="lv-bar" style={{height: `${(d.completed / maxDay) * 100}%`}}/><span className="lv-tip" role="tooltip">{new Date(d.day).toLocaleDateString(undefined, {month: "short", day: "numeric"})}: {d.completed} completed · {d.failed} failed · {d.new_users} new users · LKR {d.revenue_lkr}</span><small>{new Date(d.day).getDate()}</small></div>)}
              </div>
              <details className="lv-table-toggle"><summary>View as table</summary><div className="lv-table-wrap"><table><thead><tr><th>Day</th><th>Started</th><th>Completed</th><th>Failed</th><th>New users</th><th>Revenue (LKR)</th></tr></thead><tbody>{days.map(d => <tr key={d.day}><td>{d.day}</td><td>{d.generations}</td><td>{d.completed}</td><td>{d.failed}</td><td>{d.new_users}</td><td>{d.revenue_lkr}</td></tr>)}</tbody></table></div></details>
            </>}
          </section>
        </>}

        {tab === "payments" && <section className="lv-panel lv-pad">
          <p className="lv-muted">Check the actual bank transaction before approving. Each approval adds the configured credit pack exactly once.</p>
          <form className="lv-filters" onSubmit={e => { e.preventDefault(); void loadTab("payments"); }}><label className="lv-sr" htmlFor="p-search">Search payments</label><input id="p-search" placeholder="Order ID or customer email" value={paySearch} onChange={e => setPaySearch(e.target.value)}/>
            <label className="lv-sr" htmlFor="p-filter">Status</label><select id="p-filter" value={payFilter} onChange={e => setPayFilter(e.target.value)}><option value="all">All statuses</option><option value="receipt_submitted">Awaiting verification</option><option value="pending">Awaiting receipt</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select><button className="lv-btn lv-btn-dark lv-sm">Search</button></form>
          <div className="lv-orders">{payments.filter(p => payFilter === "all" || p.status === payFilter).map(p => <article key={p.id} className="lv-order lv-admin-order">
            <div><code>{p.order_id}</code><span className={"lv-status lv-status-" + p.status}>{p.status.replaceAll("_", " ")}</span><p className="lv-muted">{p.email} · LKR {p.amount_lkr} · {when(p.created_at)}{p.credits_granted ? ` · ${p.credits_granted} credits granted` : ""}</p>{p.rejection_reason && <p className="lv-muted">Reason: {p.rejection_reason}</p>}</div>
            <div className="lv-order-actions">{p.receipt_path && <button className="lv-btn lv-btn-ghost lv-sm" onClick={() => viewReceipt(p)}>View receipt ↗</button>}</div>
            {p.status === "receipt_submitted" && <div className="lv-review"><label><input type="checkbox" checked={!!verified[p.id]} onChange={e => setVerified({...verified, [p.id]: e.target.checked})}/> I verified this bank transaction</label>
              <div className="lv-review-actions"><button className="lv-btn lv-btn-primary lv-sm" disabled={busy || !verified[p.id]} onClick={() => review(p, true)}>Approve</button>
                <label className="lv-sr" htmlFor={"r-" + p.id}>Rejection reason</label><input id={"r-" + p.id} placeholder="Reason for rejection" value={reason[p.id] || ""} onChange={e => setReason({...reason, [p.id]: e.target.value})}/>
                <button className="lv-btn lv-btn-ghost lv-sm" disabled={busy} onClick={() => review(p, false)}>Reject</button></div></div>}
          </article>)}{!payments.length && <p className="lv-muted">No matching payment requests.</p>}</div>
        </section>}

        {tab === "users" && <section className="lv-panel lv-pad">{needsMigration.users ? <p className="lv-muted">{MIGRATION_HINT}</p> : <>
          <form className="lv-filters" onSubmit={e => { e.preventDefault(); void loadTab("users"); }}><label className="lv-sr" htmlFor="u-search">Search users</label><input id="u-search" placeholder="Email or user ID" value={userSearch} onChange={e => setUserSearch(e.target.value)}/><button className="lv-btn lv-btn-dark lv-sm">Search</button></form>
          <div className="lv-table-wrap"><table className="lv-table"><thead><tr><th>User</th><th>Joined</th><th>Free used</th><th>Paid credits</th><th>Logos</th><th>Paid orders</th><th><span className="lv-sr">Actions</span></th></tr></thead><tbody>
            {users.map(u => <tr key={u.id}><td><b>{u.email || (u.is_guest ? "Guest session" : "No email")}</b><small>{u.provider}{u.is_admin ? " · admin" : ""}</small></td><td>{new Date(u.created_at).toLocaleDateString()}</td><td>{u.free_used}</td><td>{u.paid_credits}</td><td>{u.logos}</td><td>{u.approved_payments}</td>
              <td>{!u.is_guest && <button className="lv-btn lv-btn-ghost lv-sm" onClick={() => { setAdjust({id: u.id, email: u.email}); setDelta(5); setAdjustReason(""); }}>Adjust credits</button>}</td></tr>)}
          </tbody></table></div>{!users.length && <p className="lv-muted">No users found.</p>}</>}
        </section>}

        {tab === "generations" && <section className="lv-panel lv-pad">{needsMigration.generations ? <p className="lv-muted">{MIGRATION_HINT}</p> : <>
          <div className="lv-filters"><label className="lv-sr" htmlFor="g-filter">Status</label><select id="g-filter" value={jobFilter} onChange={e => setJobFilter(e.target.value)}><option value="all">All jobs</option><option value="completed">Completed</option><option value="processing">Processing</option><option value="failed">Failed</option></select></div>
          <div className="lv-gen-grid">{jobs.map(j => <article key={j.id} className="lv-gen">
            {j.svg ? <button className="lv-gen-art" onClick={() => setPreview(j)} aria-label={"Preview logo for " + j.brand}><img src={svgDataUri(j.svg)} alt="" loading="lazy"/></button> : <div className="lv-gen-art lv-gen-empty">{j.status}</div>}
            <div><b>{j.brand || "Untitled"}</b><span className={"lv-status lv-status-" + j.status}>{j.status}</span></div>
            <small>{j.owner_email}{j.is_guest ? " (guest)" : ""} · {j.style || "—"}</small><small>{j.provider || "—"} · {when(j.created_at)}</small>
          </article>)}</div>{!jobs.length && <p className="lv-muted">No generation jobs yet.</p>}</>}
        </section>}

        {tab === "audit" && <section className="lv-panel lv-pad">{needsMigration.audit ? <p className="lv-muted">{MIGRATION_HINT}</p> : <>
          <p className="lv-muted">Every payment review, credit adjustment and settings change, with the administrator who made it.</p>
          <div className="lv-table-wrap"><table className="lv-table"><thead><tr><th>When</th><th>Type</th><th>Action</th><th>Admin</th><th>Target</th><th>Detail</th></tr></thead><tbody>
            {audit.map((a, i) => <tr key={i}><td>{when(a.created_at)}</td><td><span className="lv-status">{a.category}</span></td><td>{a.action.replaceAll("_", " ")}</td><td>{a.admin_email}</td><td>{a.target}</td><td className="lv-detail">{a.detail}</td></tr>)}
          </tbody></table></div>{!audit.length && <p className="lv-muted">No audit events yet.</p>}</>}
        </section>}

        {tab === "settings" && <section className="lv-panel lv-pad">{needsMigration.settings || !settings ? <p className="lv-muted">{needsMigration.settings ? MIGRATION_HINT : "Loading settings…"}</p> :
          <form className="lv-settings" onSubmit={saveSettings}>
            <label><span>Credits per approved LKR 300 payment</span><input type="number" min={1} max={50} value={settings.credits_per_payment} onChange={e => setSettings({...settings, credits_per_payment: Number(e.target.value)})}/></label>
            <label><span>Free logos per registered account (incl. guest logo)</span><input type="number" min={0} max={2} value={settings.free_generations} onChange={e => setSettings({...settings, free_generations: Number(e.target.value)})}/></label>
            <label><span>Free logos before sign-in (guest)</span><input type="number" min={0} max={2} value={settings.guest_free_generations} onChange={e => setSettings({...settings, guest_free_generations: Number(e.target.value)})}/></label>
            <label><span>Guest logos per network per day</span><input type="number" min={0} max={50} value={settings.guest_daily_limit_per_network} onChange={e => setSettings({...settings, guest_daily_limit_per_network: Number(e.target.value)})}/></label>
            <label className="lv-check"><input type="checkbox" checked={settings.generation_enabled} onChange={e => setSettings({...settings, generation_enabled: e.target.checked})}/> Logo generation enabled</label>
            <label className="lv-span"><span>Announcement banner (shown in the studio; empty to hide)</span><input maxLength={280} value={settings.announcement || ""} onChange={e => setSettings({...settings, announcement: e.target.value})}/></label>
            <div className="lv-span lv-actions"><button className="lv-btn lv-btn-primary" disabled={busy}>Save settings</button><small className="lv-muted">Last updated {when(settings.updated_at)}</small></div>
          </form>}
        </section>}
      </section>
    </div>

    {adjust && <div className="lv-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setAdjust(null); }}><form className="lv-modal" role="dialog" aria-modal="true" aria-labelledby="adj-title" onSubmit={saveAdjust} onKeyDown={e => { if (e.key === "Escape") setAdjust(null); }}>
      <button type="button" className="lv-close" onClick={() => setAdjust(null)} aria-label="Close">×</button>
      <p className="lv-kicker">CREDIT MANAGEMENT</p><h2 id="adj-title">Adjust paid credits</h2><p>{adjust.email}</p>
      <label htmlFor="adj-delta">Change (use a negative number to remove)</label><input id="adj-delta" type="number" min={-100} max={100} required value={delta} onChange={e => setDelta(Number(e.target.value))} autoFocus/>
      <label htmlFor="adj-reason">Reason (recorded in the audit log)</label><input id="adj-reason" required minLength={5} maxLength={300} value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="e.g. Refund for failed order LOG-…"/>
      <button className="lv-btn lv-btn-primary lv-wide" disabled={busy || !delta || adjustReason.trim().length < 5}>Save change</button>
    </form></div>}
    {preview?.svg && <div className="lv-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setPreview(null); }}><section className="lv-modal lv-preview" role="dialog" aria-modal="true" aria-label={"Logo for " + preview.brand} onKeyDown={e => { if (e.key === "Escape") setPreview(null); }}>
      <button className="lv-close" onClick={() => setPreview(null)} aria-label="Close" autoFocus>×</button><img src={svgDataUri(preview.svg)} alt={"Logo for " + preview.brand}/><p><b>{preview.brand}</b> · {preview.style} · {preview.owner_email}</p></section></div>}
  </main>;
}
