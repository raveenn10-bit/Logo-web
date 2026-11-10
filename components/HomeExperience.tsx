"use client";
import {useState} from "react";
import Image from "next/image";
import VantaNetBackground from "./VantaNetBackground";
import StyleGlyph from "./StyleGlyph";
import {logoStyles, type LogoStyleId} from "../lib/styles";

export type Sample = {id: LogoStyleId; brand: string; svg: string};

function startStudio(brand: string, industry: string, style: LogoStyleId) {
  window.location.href = `/studio?brand=${encodeURIComponent(brand.trim())}&industry=${encodeURIComponent(industry.trim())}&style=${style}`;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return <header className="home-header">
    <a href="/" className="logo" aria-label="LOGOVA AI Logo Builder home"><span aria-hidden="true">✦</span> LOGO<span>VA</span><small>AI LOGO BUILDER</small></a>
    <nav aria-label="Main navigation" className={open ? "is-open" : ""} id="main-nav">
      <a href="#styles" onClick={() => setOpen(false)}>Logo styles</a><a href="#how" onClick={() => setOpen(false)}>How it works</a><a href="#pricing" onClick={() => setOpen(false)}>Pricing</a><a href="#faq" onClick={() => setOpen(false)}>FAQ</a><a href="/dashboard">My workspace</a>
    </nav>
    <div className="home-header-cta"><a className="signin" href="/payments">Sign in</a><a className="home-start" href="/studio">Start free</a>
      <button type="button" className="home-burger" aria-expanded={open} aria-controls="main-nav" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(o => !o)}><i/><i/><i/></button></div>
  </header>;
}

export function Hero() {
  const [brand, setBrand] = useState(""), [industry, setIndustry] = useState("");
  return <section className="hero">
    <VantaNetBackground />
    <div className="copy">
      <p className="eyebrow">BUILT BY HARSH APEX DIGITAL SOLUTIONS</p>
      <h1>Professional logo design<br/>that <em>fits your brand.</em></h1>
      <p className="intro">Describe your business, pick from ten design styles and get an original, editable vector logo in seconds — then refine it in the studio and download SVG or PNG.</p>
      <div className="pill"><i/> First logo free — no sign-up <b>· 5 more for LKR 300</b></div>
      <form className="brief" id="create" onSubmit={e => { e.preventDefault(); startStudio(brand, industry, "minimalist"); }}>
        <label>Brand name<input value={brand} maxLength={45} onChange={e => setBrand(e.target.value)} placeholder="Your brand name" autoComplete="organization"/></label>
        <label>Industry<input value={industry} maxLength={80} onChange={e => setIndustry(e.target.value)} placeholder="Hospitality, technology, fashion…"/></label>
        <button type="submit">Create my logo <span aria-hidden="true">↗</span></button>
      </form>
      <p className="trust">Original vector artwork · Readable typography · Yours to download</p>
    </div>
    <div className="character" aria-hidden="true"><div className="orb orbit-one"/><div className="orb orbit-two"/><div className="designer-photo"><Image src="/real-designer.webp" alt="" fill priority sizes="(max-width: 650px) 90vw, 44vw"/></div><div className="spark one">✦</div><div className="spark two">✧</div></div>
  </section>;
}

export function StyleShowcase({samples}: {samples: Sample[]}) {
  const [chosen, setChosen] = useState<LogoStyleId>("minimalist");
  const selected = logoStyles.find(s => s.id === chosen)!;
  return <section className="style-section" id="styles" aria-labelledby="styles-title">
    <div className="section-heading"><p className="eyebrow">TEN WAYS TO MAKE YOUR MARK</p><h2 id="styles-title">Find your <em>logo style.</em></h2><p>Every preview below was drawn by the LOGOVA engine for a fictional brand. Choose a style to start with it.</p></div>
    <div className="home-styles" role="radiogroup" aria-label="Logo style">
      {samples.map((s, i) => {
        const meta = logoStyles.find(x => x.id === s.id)!;
        return <button type="button" role="radio" aria-checked={chosen === s.id} key={s.id} className={"home-style" + (chosen === s.id ? " is-active" : "")} onClick={() => setChosen(s.id)}>
          <span className="home-style-art"><img src={"data:image/svg+xml," + encodeURIComponent(s.svg)} alt={`${meta.name} logo example for the fictional brand ${s.brand}`} loading={i < 4 ? "eager" : "lazy"} width={400} height={250}/></span>
          <span className="home-style-copy"><small><StyleGlyph id={s.id}/>{String(i + 1).padStart(2, "0")}</small><b>{meta.name}</b><span>{meta.short}</span></span>
        </button>;
      })}
    </div>
    <div className="style-continue"><p>Selected: <strong>{selected.name}</strong></p><button onClick={() => startStudio("", "", chosen)}>Create {/^[aeiou]/i.test(selected.name) ? "an" : "a"} {selected.name.toLowerCase()} logo ↗</button></div>
  </section>;
}
