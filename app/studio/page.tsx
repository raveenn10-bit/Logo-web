"use client";

import {useCallback, useEffect, useMemo, useState} from "react";
import type {User} from "@supabase/supabase-js";
import "../../components/studio.css";
import PaymentModal from "../../components/PaymentModal";
import StyleGlyph from "../../components/StyleGlyph";
import {browserDb, defaultEntitlements, downloadPng, downloadSvg, isGuest, loadEntitlements, loadPublicSettings, oauthRedirect, rememberReturn, requestGeneration, svgDataUri, type Entitlements, type GenerateResult} from "../../lib/client";
import {hexColor, industries, logoStyles, palettePresets, resolveStyle, type LogoStyleId} from "../../lib/styles";

type Saved = GenerateResult & {created_at?: string};
type ProjectRow = {id: string; name: string; created_at: string; logo_concepts: {id: string; direction: string; svg_markup: string; specification: Saved["spec"]; created_at: string}[] | null};
const stages = ["Reading your brief", "Exploring the brand idea", "Drawing the vector mark", "Setting typography", "Balancing composition", "Saving your editable artwork"];
const backgrounds = [{id: "canvas", label: "Original"}, {id: "light", label: "Light"}, {id: "dark", label: "Dark"}, {id: "grid", label: "Transparent"}] as const;

export default function Studio() {
  const db = browserDb();
  const [user, setUser] = useState<User | null>(null), [ready, setReady] = useState(false);
  const [brand, setBrand] = useState(""), [tagline, setTagline] = useState(""), [industry, setIndustry] = useState(""), [style, setStyle] = useState<LogoStyleId>("minimalist");
  const [palette, setPalette] = useState<string>("auto"), [colors, setColors] = useState<string[]>([]), [details, setDetails] = useState(""), [refine, setRefine] = useState("");
  const [items, setItems] = useState<Saved[]>([]), [current, setCurrent] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false), [elapsed, setElapsed] = useState(0), [status, setStatus] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [ent, setEnt] = useState<Entitlements>(defaultEntitlements(true)), [paywall, setPaywall] = useState(false), [login, setLogin] = useState<string | null>(null), [bg, setBg] = useState<typeof backgrounds[number]["id"]>("canvas");

  const refresh = useCallback(async (u: User) => {
    if (!db) return;
    const [e, p] = await Promise.all([loadEntitlements(db, u), db.from("projects").select("id,name,created_at,logo_concepts(id,direction,svg_markup,specification,created_at)").eq("owner_id", u.id).order("created_at", {ascending: false}).limit(40)]);
    setEnt(e);
    if (p.error) setError("Could not load your saved logos. Refresh to try again.");
    else setItems(((p.data || []) as ProjectRow[]).flatMap(project => (project.logo_concepts || []).map(logo => ({id: logo.id, project_id: project.id, brand: project.name, style: logo.direction, svg: logo.svg_markup, source: "saved", spec: logo.specification || undefined, created_at: logo.created_at || project.created_at}))));
  }, [db]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBrand((params.get("brand") || "").slice(0, 45)); setIndustry((params.get("industry") || "").slice(0, 80));
    const s = resolveStyle(params.get("style")); if (s) setStyle(s);
    if (!db) { setReady(true); return; }
    let alive = true;
    void (async () => {
      const {data: {session}} = await db.auth.getSession();
      if (!alive) return;
      setUser(session?.user || null);
      if (session?.user) await refresh(session.user);
      else { const pub = await loadPublicSettings(db); if (alive) setEnt({...defaultEntitlements(true), free_limit: pub.guest_free_generations, free_remaining: pub.guest_free_generations, credits_per_payment: pub.credits_per_payment, generation_enabled: pub.generation_enabled, announcement: pub.announcement}); }
      if (alive) setReady(true);
    })();
    const {data: {subscription}} = db.auth.onAuthStateChange((_e, session) => { if (!alive) return; setUser(session?.user || null); if (session?.user) void refresh(session.user); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [db, refresh]);

  useEffect(() => { if (!busy) { setElapsed(0); return; } const t = setInterval(() => setElapsed(v => v + 1), 1000); return () => clearInterval(t); }, [busy]);

  const guest = !user || isGuest(user);
  const totalLeft = ent.free_remaining + (guest ? 0 : ent.paid_credits);
  const stage = stages[Math.min(stages.length - 1, Math.floor(elapsed / 3))];
  const progress = Math.min(94, Math.round(100 * (1 - Math.exp(-elapsed / 9))));

  function choosePreset(id: string) { setPalette(id); setColors([...(palettePresets.find(p => p.id === id)?.colors || [])]); }
  function setColor(i: number, value: string) { const next = [...colors]; while (next.length <= i) next.push("#19263B"); next[i] = value.toUpperCase(); setColors(next.slice(0, 3)); setPalette("custom"); }

  async function googleSignIn() {
    if (!db) return;
    rememberReturn("/studio");
    const options = {redirectTo: oauthRedirect(), queryParams: {prompt: "select_account"}};
    const r = guest && user ? await db.auth.linkIdentity({provider: "google", options}) : await db.auth.signInWithOAuth({provider: "google", options});
    if (r.error) setError(r.error.message);
  }

  async function generate(mode: "new" | "regenerate" | "refine" = "new") {
    if (!db) return;
    setError(""); setNotice("");
    if (brand.trim().length < 2) { setError("Enter a brand name with at least 2 characters."); document.getElementById("brand")?.focus(); return; }
    if (!ent.generation_enabled) { setError(ent.announcement || "Logo generation is paused for maintenance. Please try again soon."); return; }
    if (user && totalLeft < 1) { if (guest) setLogin("Your free guest logo is ready. Sign in with Google to unlock one more free logo."); else setPaywall(true); return; }
    setBusy(true); setStatus("");
    try {
      let session = (await db.auth.getSession()).data.session;
      if (!session) {
        const anon = await db.auth.signInAnonymously();
        if (anon.error || !anon.data.session) { setLogin("Guest access is unavailable right now. Sign in with Google to create your logo."); return; }
        session = anon.data.session;
      }
      const outcome = await requestGeneration(session.access_token, {brand: brand.trim(), tagline: tagline.trim(), industry: industry.trim(), style, colors: colors.filter(c => hexColor.test(c)), details: details.trim(), refine: mode === "refine" ? refine.trim() : ""}, setStatus);
      if (!outcome.ok) {
        if (outcome.payment) setPaywall(true);
        else if (outcome.login) setLogin(outcome.error);
        else setError(outcome.error);
        return;
      }
      setCurrent(outcome.result); setBg("canvas"); setRefine("");
      if (outcome.result.fallback) setNotice("Our AI designer was busy, so this concept was crafted by the LOGOVA vector engine. It is fully editable.");
      await refresh(session.user);
      if (isGuest(session.user)) setLogin("Your free logo is ready! Sign in with Google to save it to your account and unlock one more free logo.");
      requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({behavior: "smooth", block: "start"}));
    } finally { setBusy(false); setStatus(""); }
  }

  function openSaved(item: Saved) {
    setCurrent(item); setBg("canvas");
    setBrand(item.brand); if (item.spec?.tagline) setTagline(item.spec.tagline);
    const s = resolveStyle(item.spec?.styleId); if (s) setStyle(s);
    document.getElementById("result")?.scrollIntoView({behavior: "smooth", block: "start"});
  }
  async function exportPng(transparent: boolean) { if (!current) return; try { await downloadPng(current.svg, current.brand, transparent); } catch { setError("PNG export failed in this browser. Download the SVG instead."); } }
  const meter = useMemo(() => guest ? `${ent.free_remaining} free guest logo${ent.free_remaining === 1 ? "" : "s"}` : `${ent.free_remaining} free · ${ent.paid_credits} paid`, [guest, ent]);

  if (!db) return <main className="lv-shell"><p className="lv-panel">Studio configuration is unavailable.</p></main>;
  return <main className="lv-shell">
    <header className="lv-top">
      <a href="/" className="lv-brand" aria-label="LOGOVA home"><span aria-hidden="true">✦</span> LOGO<b>VA</b></a>
      <div className="lv-top-right">
        {ready && <span className="lv-meter" title="Generations available"><i aria-hidden="true"/>{meter}</span>}
        {guest ? <button className="lv-btn lv-btn-ghost lv-sm" onClick={googleSignIn}>Sign in with Google</button> : <a className="lv-btn lv-btn-ghost lv-sm" href="/dashboard">My workspace</a>}
      </div>
    </header>
    {ent.announcement && <p className="lv-banner" role="status">{ent.announcement}</p>}

    <div className="lv-studio">
      <form className="lv-brief" onSubmit={e => { e.preventDefault(); void generate("new"); }} aria-labelledby="brief-title">
        <div className="lv-brief-head"><p className="lv-kicker">LOGO STUDIO</p><h1 id="brief-title">Design your logo</h1><p>Tell us about your brand. Your first logo is free — no sign-up needed.</p></div>
        <fieldset className="lv-step"><legend><span>1</span> Brand</legend>
          <label htmlFor="brand">Business name <em>required</em></label>
          <input id="brand" maxLength={45} value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Maison Vela" autoComplete="organization" required/>
          <label htmlFor="tagline">Tagline <em>optional</em></label>
          <input id="tagline" maxLength={60} value={tagline} onChange={e => setTagline(e.target.value)} placeholder="e.g. Boutique stays in Galle"/>
          <label htmlFor="industry">Industry</label>
          <input id="industry" list="industries" maxLength={80} value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Choose or type your industry"/>
          <datalist id="industries">{industries.map(i => <option key={i} value={i}/>)}</datalist>
        </fieldset>
        <fieldset className="lv-step"><legend><span>2</span> Logo style</legend>
          <div className="lv-styles" role="radiogroup" aria-label="Logo style">
            {logoStyles.map(s => <button type="button" role="radio" aria-checked={style === s.id} key={s.id} className={"lv-style" + (style === s.id ? " is-active" : "")} onClick={() => setStyle(s.id)}><StyleGlyph id={s.id}/><b>{s.name}</b><small>{s.short}</small></button>)}
          </div>
        </fieldset>
        <fieldset className="lv-step"><legend><span>3</span> Brand colours</legend>
          <div className="lv-palettes" role="radiogroup" aria-label="Colour palette">
            {palettePresets.map(p => <button type="button" role="radio" aria-checked={palette === p.id} key={p.id} className={"lv-palette" + (palette === p.id ? " is-active" : "")} onClick={() => choosePreset(p.id)}>
              <span className="lv-swatches" aria-hidden="true">{p.colors.length ? p.colors.map(c => <i key={c} style={{background: c}}/>) : <i className="lv-auto">AI</i>}</span>{p.name}</button>)}
          </div>
          <div className="lv-custom-colors">{[0, 1, 2].map(i => <label key={i}><span className="lv-sr">{["Primary", "Accent", "Background"][i]} colour</span><input type="color" value={colors[i] || ["#19263B", "#FF7A00", "#F8F6F0"][i]} onChange={e => setColor(i, e.target.value)}/><small>{["Primary", "Accent", "Background"][i]}</small></label>)}</div>
        </fieldset>
        <fieldset className="lv-step"><legend><span>4</span> Direction <em>optional</em></legend>
          <label htmlFor="details" className="lv-sr">Design notes</label>
          <textarea id="details" rows={3} maxLength={1000} value={details} onChange={e => setDetails(e.target.value)} placeholder="Audience, personality, symbols you love or want to avoid…"/>
        </fieldset>
        {error && <p className="lv-error" role="alert">{error}</p>}
        <button className="lv-btn lv-btn-primary lv-wide lv-generate" disabled={busy || !ready} aria-describedby="generate-help">{busy ? "Designing…" : !user ? "Create my free logo" : totalLeft > 0 ? "Generate logo" : guest ? "Sign in to continue" : "Unlock more logos"}<span aria-hidden="true">→</span></button>
        <p id="generate-help" className="lv-fine">Each completed logo uses one generation. Failed attempts are never charged.</p>
      </form>

      <section className="lv-stage" id="result" aria-label="Logo preview" aria-busy={busy}>
        {busy ? <div className="lv-loading" role="status" aria-live="polite">
          <div className="lv-loader" aria-hidden="true"><span/><span/><span/></div>
          <h2>{status || stage}…</h2>
          <div className="lv-progress" aria-hidden="true"><i style={{width: progress + "%"}}/></div>
          <p>{elapsed}s · Most logos are ready in under 20 seconds.</p>
        </div> : current ? <div className="lv-result">
          <div className="lv-result-head"><div><p className="lv-kicker">{current.source === "saved" ? "SAVED CONCEPT" : "NEW CONCEPT"}</p><h2>{current.brand}</h2><p>{current.style}</p></div>
            <div className="lv-bg-toggle" role="group" aria-label="Preview background">{backgrounds.map(b => <button key={b.id} aria-pressed={bg === b.id} onClick={() => setBg(b.id)}>{b.label}</button>)}</div></div>
          <div className={"lv-artboard lv-bg-" + bg}><img src={svgDataUri(bg === "canvas" ? current.svg : current.svg.replace(/<rect[^>]*width="800"[^>]*height="500"[^>]*\/>/i, ""))} alt={"Logo concept for " + current.brand}/></div>
          {notice && <p className="lv-note" role="status">{notice}</p>}
          <div className="lv-sizes" aria-label="Small size preview"><span>Small sizes</span>{[96, 56, 32].map(w => <img key={w} width={w} src={svgDataUri(current.svg)} alt="" />)}</div>
          <div className="lv-actions">
            <a className="lv-btn lv-btn-primary" href={"/editor/" + current.id}>Refine in editor</a>
            <button className="lv-btn lv-btn-dark" onClick={() => downloadSvg(current.svg, current.brand)}>Download SVG</button>
            <button className="lv-btn lv-btn-ghost" onClick={() => exportPng(false)}>PNG</button>
            <button className="lv-btn lv-btn-ghost" onClick={() => exportPng(true)}>Transparent PNG</button>
          </div>
          {current.spec?.explanation && <div className="lv-rationale"><p>{current.spec.explanation}</p>{current.spec.symbolRationale && <p><b>Symbol</b>{current.spec.symbolRationale}</p>}{current.spec.typography && <p><b>Typography</b>{current.spec.typography}</p>}
            {!!current.spec.palette?.length && <div className="lv-chips">{current.spec.palette.map(c => <span key={c}><i style={{background: c}}/>{c}</span>)}</div>}</div>}
          <div className="lv-iterate">
            <label htmlFor="refine">Refine this direction</label>
            <div><input id="refine" maxLength={300} value={refine} onChange={e => setRefine(e.target.value)} placeholder="e.g. bolder lettering, softer shapes, more premium"/>
              <button className="lv-btn lv-btn-dark" disabled={busy || refine.trim().length < 3} onClick={() => generate("refine")}>Refine</button>
              <button className="lv-btn lv-btn-ghost" disabled={busy} onClick={() => generate("regenerate")}>Regenerate</button></div>
            <small>Refining or regenerating creates a new concept and uses one generation. Free edits are unlimited in the editor.</small>
          </div>
        </div> : <div className="lv-empty">
          <div className="lv-empty-art" aria-hidden="true">{logoStyles.slice(0, 6).map(s => <span key={s.id}><StyleGlyph id={s.id}/></span>)}</div>
          <h2>Your logo will appear here</h2><p>Every concept is a real, editable vector — download SVG or PNG, or fine-tune it in the editor.</p>
        </div>}
      </section>
    </div>

    <section className="lv-history" aria-labelledby="history-title">
      <div className="lv-history-head"><h2 id="history-title">My logos</h2>{!guest && <a href="/dashboard/projects">Open workspace →</a>}</div>
      {items.length === 0 ? <p className="lv-muted">Your generated logos are saved here automatically.</p> :
        <div className="lv-history-grid">{items.map(item => <button key={item.id} className={"lv-thumb" + (current?.id === item.id ? " is-active" : "")} onClick={() => openSaved(item)}><img src={svgDataUri(item.svg)} alt="" loading="lazy"/><b>{item.brand}</b><small>{item.style}</small></button>)}</div>}
    </section>

    {login && <div className="lv-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setLogin(null); }}><section className="lv-modal" role="dialog" aria-modal="true" aria-labelledby="login-title" onKeyDown={e => { if (e.key === "Escape") setLogin(null); }}>
      <button className="lv-close" onClick={() => setLogin(null)} aria-label="Close dialog">×</button>
      <p className="lv-kicker">SAVE YOUR WORK</p><h2 id="login-title">Continue with Google</h2><p>{login}</p>
      <button className="lv-btn lv-btn-google lv-wide" onClick={googleSignIn} autoFocus><span aria-hidden="true">G</span> Continue with Google</button>
      <button className="lv-btn lv-btn-ghost lv-wide" onClick={() => setLogin(null)}>Not now</button>
      <p className="lv-fine">Your guest logo is kept on the same account when you continue.</p>
    </section></div>}
    <PaymentModal open={paywall} onClose={() => setPaywall(false)} credits={ent.credits_per_payment} price={ent.price_lkr}/>
  </main>;
}
