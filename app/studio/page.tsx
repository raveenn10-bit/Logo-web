"use client";

import {useEffect,useState} from "react";
import {createClient,type User} from "@supabase/supabase-js";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
const db=url&&key?createClient(url,key):null;
const styles=["Minimalist Mark","Brand Identity","Luxury Identity","Wordmark","Symbol + Wordmark","Concept Driven","Complete Brief"];
type Concept={id:string;project_id:string;brand:string;style:string;svg:string;source:string;spec?:{explanation:string;symbolRationale:string;typography:string;palette:string[]}};
const isGuest=(u:User|null)=>Boolean(u?.is_anonymous||u?.app_metadata?.provider==="anonymous");

export default function Studio(){
 const [user,setUser]=useState<User|null>(null),[authReady,setAuthReady]=useState(false),[brand,setBrand]=useState(""),[industry,setIndustry]=useState(""),[style,setStyle]=useState(0),[items,setItems]=useState<Concept[]>([]),[current,setCurrent]=useState<Concept|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[paywall,setPaywall]=useState(false),[loginRequired,setLoginRequired]=useState(false),[details,setDetails]=useState(""),[elapsed,setElapsed]=useState(0),[credits,setCredits]=useState({free_used:0,paid_credits:0});

 async function refresh(u:User){
  if(!db)return;
  const [c,p]=await Promise.all([
   db.from("user_credits").select("free_used,paid_credits").eq("user_id",u.id).maybeSingle(),
   db.from("projects").select("id,name,logo_concepts(id,direction,svg_markup,specification)").eq("owner_id",u.id).order("created_at",{ascending:false}).limit(30)
  ]);
  if(c.data)setCredits(c.data);
  if(p.error)setError(p.error.message);
  else setItems((p.data||[]).flatMap((project:any)=>(project.logo_concepts||[]).map((logo:any)=>({id:logo.id,project_id:project.id,brand:project.name,style:logo.direction,svg:logo.svg_markup,source:"saved",spec:logo.specification}))));
 }

 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  setBrand(params.get("brand")||"");setIndustry(params.get("industry")||"");setStyle(Math.min(6,Math.max(0,Number(params.get("style")||0))));
  if(!db){setAuthReady(true);return;}
  let alive=true;
  void (async()=>{
   const existing=await db.auth.getUser();
   let next=existing.data.user;
   if(!next){
    const anonymous=await db.auth.signInAnonymously();
    if(anonymous.error){if(alive)setError("Free guest access is temporarily unavailable. Please sign in to continue.");}
    else next=anonymous.data.user;
   }
   if(alive){setUser(next);setAuthReady(true);if(next)void refresh(next);}
  })();
  const {data:{subscription}}=db.auth.onAuthStateChange((_event,session)=>{if(!alive)return;setUser(session?.user||null);if(session?.user)void refresh(session.user);});
  return()=>{alive=false;subscription.unsubscribe();};
 },[]);

 useEffect(()=>{if(!busy){setElapsed(0);return;}const timer=setInterval(()=>setElapsed(v=>v+1),1000);return()=>clearInterval(timer);},[busy]);

 async function generate(){
  if(!db||!user)return;
  if(isGuest(user)&&credits.free_used>=1){setLoginRequired(true);return;}
  setError("");
  if(brand.trim().length<2){setError("Enter a brand name with at least 2 characters.");return;}
  setBusy(true);
  try{
   const {data:{session}}=await db.auth.getSession();
   if(!session)throw new Error("Your secure session expired. Please refresh and try again.");
   const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},body:JSON.stringify({brand:brand.trim(),industry:industry.trim(),style,details,requestId:crypto.randomUUID()}),signal:AbortSignal.timeout(25000)});
   const r=await response.json();
   if(r.payment_required){isGuest(user)?setLoginRequired(true):setPaywall(true);return;}
   if(!response.ok)throw new Error(r.error||"Generation failed.");
   setCurrent(r as Concept);await refresh(user);if(isGuest(user))setLoginRequired(true);
  }catch(e){setError(e instanceof Error?e.message:"Could not create the logo.");}
  finally{setBusy(false);}
 }

 function download(item:Concept,kind:"svg"|"png"|"transparent-png"){
  if(kind==="svg"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([item.svg],{type:"image/svg+xml"}));a.download=item.brand.replace(/[^a-z0-9-]/gi,"-")+".svg";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return;}
  const artwork=kind==="transparent-png"?item.svg.replace(/<rect[^>]*fill=["'][^"']*["'][^>]*\/>/i,""):item.svg;
  const img=new Image();img.onload=()=>{const canvas=document.createElement("canvas");canvas.width=1600;canvas.height=1000;const ctx=canvas.getContext("2d");if(ctx){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,1600,1000);canvas.toBlob(blob=>{if(!blob)return;const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=item.brand.replace(/[^a-z0-9-]/gi,"-")+(kind==="transparent-png"?"-transparent":"")+".png";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);},"image/png");}URL.revokeObjectURL(img.src);};img.src=URL.createObjectURL(new Blob([artwork],{type:"image/svg+xml"}));
 }

 if(!authReady)return <main className="pay-shell studio"><div className="pay-panel"><h2>Preparing your free studio…</h2><p>Creating a secure guest workspace.</p></div></main>;
 return <main className="pay-shell studio">
  <a href="/" className="pay-back">← Logova Studio</a>
  <div className="pay-hero"><span>CREATE YOUR MARK</span><h1>Logo studio</h1><p>Create your first editable logo without signing in. Sign in only when you want to continue.</p></div>
  {error&&<div className="pay-error" role="alert">{error}</div>}
  {!user?<section className="pay-panel"><h2>Continue securely</h2><p>Guest access could not be started. Sign in to use the studio.</p><a className="pay-cta" href="/payments">Sign in or create an account →</a></section>:<>
   <div className="pay-stats"><article><small>FREE TRIAL</small><b>{Math.max(0,1-credits.free_used)}</b><span>logo remaining</span></article><article><small>PAID CREDITS</small><b>{credits.paid_credits}</b></article><article><small>NEXT FIVE LOGOS</small><b>Rs. 300</b></article></div>
   <section className="pay-panel"><h2>Your brief</h2><div className="studio-fields"><label>Brand name<input maxLength={45} value={brand} onChange={e=>setBrand(e.target.value)} placeholder="Your brand name"/></label><label>Industry<input maxLength={80} value={industry} onChange={e=>setIndustry(e.target.value)} placeholder="Your industry"/></label></div><label>Brand personality and design notes<textarea rows={3} maxLength={1000} value={details} onChange={e=>setDetails(e.target.value)} placeholder="Audience, preferred colors, symbols, mood or refinements…"/></label><div className="studio-style" role="group" aria-label="Logo direction">{styles.map((s,i)=><button key={s} className={style===i?"active":""} aria-pressed={style===i} onClick={()=>setStyle(i)}>{s}</button>)}</div><p>Your first completed logo is free. Failed requests never use a credit.</p><button disabled={busy} onClick={generate}>{busy?"Designing your logo…":isGuest(user)?"Create my free logo →":"Generate logo →"}</button>{busy&&<p role="status" aria-live="polite">Building your editable vector concept · {elapsed}s</p>}</section>
   {current&&<section className="pay-panel studio-result"><small className="studio-kicker">PREMIUM VECTOR PREVIEW</small><h2>Created: {current.style}</h2><div className="studio-result-grid"><div className="studio-artboard"><img className="studio-preview" alt={"Logo for "+current.brand} src={"data:image/svg+xml,"+encodeURIComponent(current.svg)}/></div><div className="studio-result-info">{current.spec?.explanation&&<div className="concept-notes"><p>{current.spec.explanation}</p><p><strong>Symbol:</strong> {current.spec.symbolRationale}</p><p><strong>Typography:</strong> {current.spec.typography}</p><div className="concept-palette">{current.spec.palette?.map(color=><span key={color} style={{borderTopColor:color}}>{color}</span>)}</div></div>}<div className="pay-actions"><a className="pay-cta" href={"/editor/"+current.id}>Refine in editor →</a><button onClick={()=>download(current,"svg")}>Download SVG</button><button className="pay-outline" onClick={()=>download(current,"png")}>PNG</button><button className="pay-outline" onClick={()=>download(current,"transparent-png")}>Transparent PNG</button></div></div></div></section>}
   <section className="pay-panel"><h2>My logos</h2>{items.length===0?<p>No saved logos yet.</p>:<div className="studio-grid">{items.map(item=><article key={item.id}><img className="studio-preview" alt={"Logo for "+item.brand} src={"data:image/svg+xml,"+encodeURIComponent(item.svg)}/><h3>{item.brand}</h3><p>{item.style}</p><a className="pay-cta" href={"/editor/"+item.id}>Edit</a><button onClick={()=>download(item,"svg")}>SVG</button><button className="pay-outline" onClick={()=>download(item,"png")}>PNG</button><button className="pay-outline" onClick={()=>download(item,"transparent-png")}>Transparent PNG</button></article>)}</div>}</section>
  </>}
  {loginRequired&&<div className="pay-modal-backdrop" role="presentation"><section className="pay-modal" role="dialog" aria-modal="true" aria-labelledby="login-title"><button className="pay-modal-close" onClick={()=>setLoginRequired(false)} aria-label="Close dialog">×</button><small>FREE LOGO COMPLETE</small><h2 id="login-title">Love your first direction?</h2><p>Sign in with Google to keep this logo, edit it, and unlock additional generations with a five-logo pack for Rs. 300.</p><a className="pay-cta" href="/payments">Continue with Google →</a><button className="pay-outline" onClick={()=>setLoginRequired(false)}>View my free logo</button></section></div>}
  {paywall&&<div className="pay-modal-backdrop" role="presentation"><section className="pay-modal" role="dialog" aria-modal="true" aria-labelledby="paywall-title"><button className="pay-modal-close" onClick={()=>setPaywall(false)} aria-label="Close payment dialog">×</button><small>KEEP CREATING</small><h2 id="paywall-title">Your Free Logo Is Used</h2><p>Unlock five more logo concepts for just Rs. 300.</p><strong>LKR 300 / 5 Logo Generations</strong><a className="pay-cta whatsapp" href="/payments">Pay via WhatsApp</a><button className="pay-outline" onClick={()=>{setPaywall(false);document.querySelector(".studio-grid")?.scrollIntoView({behavior:"smooth"});}}>View My Logos</button></section></div>}
 </main>;
}
