"use client";
import {useEffect, useRef, useState} from "react";
import {browserDb, WHATSAPP_DISPLAY, whatsappLink} from "../lib/client";

type Props = {open: boolean; onClose: () => void; credits: number; price: number; title?: string};

/**
 * Premium paywall: creates (or reuses) a unique payment reference server-side and
 * hands the customer to WhatsApp. Credits are only added after an administrator
 * verifies the payment — nothing here unlocks generations automatically.
 */
export default function PaymentModal({open, onClose, credits, price, title = "Your free logos are used"}: Props) {
  const [order, setOrder] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("button,a")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialog.current) {
        const items = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]),a[href]"));
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = ""; previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  async function createReference() {
    const db = browserDb(); if (!db) return;
    setBusy(true); setError("");
    const r = await db.rpc("create_logo_payment_request");
    setBusy(false);
    if (r.error) { setError(r.error.message); return; }
    setOrder((r.data as {order_id: string}).order_id);
  }
  async function copy() { if (!order) return; try { await navigator.clipboard.writeText(order); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {} }
  return <div className="lv-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={dialog} className="lv-modal lv-paywall" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
      <button className="lv-close" onClick={onClose} aria-label="Close payment dialog">×</button>
      <p className="lv-kicker">KEEP CREATING</p>
      <h2 id="paywall-title">{title}</h2>
      <div className="lv-price"><b>LKR {price}</b><span>unlocks {credits} more logo generation{credits === 1 ? "" : "s"}</span></div>
      <ol className="lv-steps">
        <li><b>Get your payment reference</b><span>A unique code that links your payment to this account.</span></li>
        <li><b>Message us on WhatsApp</b><span>{WHATSAPP_DISPLAY} — we reply with payment details.</span></li>
        <li><b>Upload your receipt</b><span>Under My payments. Credits are added after we verify it.</span></li>
      </ol>
      {error && <p className="lv-error" role="alert">{error}</p>}
      {!order ? <button className="lv-btn lv-btn-primary lv-wide" disabled={busy} onClick={createReference}>{busy ? "Creating reference…" : "Get payment reference"}</button> : <>
        <div className="lv-reference"><div><small>PAYMENT REFERENCE</small><code>{order}</code></div><button className="lv-btn lv-btn-ghost" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button></div>
        <a className="lv-btn lv-btn-whatsapp lv-wide" href={whatsappLink(order, credits, price)} target="_blank" rel="noopener noreferrer">Continue on WhatsApp</a>
        <a className="lv-btn lv-btn-ghost lv-wide" href="/payments">Upload receipt in My payments →</a>
      </>}
      <p className="lv-fine">Payments are verified manually by the LOGOVA team. You are never charged automatically.</p>
    </section>
  </div>;
}
