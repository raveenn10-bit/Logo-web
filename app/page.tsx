"use client";

import { useState } from "react";
import Image from "next/image";

const siteUrl = "https://logo.harshapex.com.lk";
const concepts = [
  { name: "Minimalist Mark", desc: "A precise geometric symbol that works at any size.", brand: "NORTHLINE", image: "minimal.svg", alt: "Northline geometric logo on stationery" },
  { name: "Brand Identity Concepts", desc: "One identity explored across color, type and applications.", brand: "NEXORA", image: "identity.svg", alt: "Nexora brand identity applications" },
  { name: "Premium Luxury Identity", desc: "Quiet, considered detail for a more refined presence.", brand: "MAISON VELA", image: "luxury.svg", alt: "Maison Vela luxury monogram stationery" },
  { name: "Wordmark-Only Logo", desc: "Expressive lettering that makes the name the centerpiece.", brand: "nouvelle", image: "wordmark.svg", alt: "Nouvelle editorial wordmark packaging" },
  { name: "Symbol + Wordmark System", desc: "A flexible lockup built for every brand touchpoint.", brand: "VALERIUS", image: "system.svg", alt: "Valerius logo system applications" },
  { name: "Concept-Driven Logo", desc: "A visual idea drawn from your brand story.", brand: "TERRA FORM", image: "concept.svg", alt: "Terra Form landscape-inspired logo concept" },
  { name: "Complete Brand Brief Builder", desc: "The strategy behind the mark, from audience to palette.", brand: "CEDAR & CO.", image: "brief.svg", alt: "Cedar and Co brand strategy board" },
];

const faqs = [
  { question: "Is LOGOVA free to use?", answer: "Yes. Every registered user receives two free completed logo concepts. After those credits are used, each additional successful logo concept costs LKR 300." },
  { question: "Can I edit and download my logo?", answer: "Yes. LOGOVA creates vector-based logo artwork that can be refined in the logo editor and downloaded as genuine SVG or PNG artwork." },
  { question: "What information should I provide for a better logo?", answer: "Add your brand name, industry, audience, personality, preferred colors and meaningful symbols. A clear brand brief helps produce a more relevant creative direction." },
  { question: "Who created LOGOVA?", answer: "LOGOVA is designed and developed by Harsh Apex Digital Solutions in Galle, Sri Lanka, for businesses that need an accessible professional brand identity workflow." },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Harsh Apex Digital Solutions",
      url: "https://harshapex.com.lk",
      logo: `${siteUrl}/icon.svg`,
      telephone: "+94770663154",
      address: { "@type": "PostalAddress", addressLocality: "Galle", addressCountry: "LK" },
      knowsAbout: ["Logo Design", "Brand Identity", "Web Design", "Artificial Intelligence"],
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "LOGOVA AI Logo Builder",
      description: "Professional editable AI logo and brand identity builder.",
      publisher: { "@id": `${siteUrl}/#organization` },
      inLanguage: "en-LK",
    },
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#application`,
      name: "LOGOVA AI Logo Builder",
      url: siteUrl,
      applicationCategory: "DesignApplication",
      applicationSubCategory: "Logo maker and brand identity software",
      operatingSystem: "Any web browser",
      browserRequirements: "Requires JavaScript and a modern web browser",
      description: "Create, edit, save and export professional vector logo concepts from a structured brand brief.",
      creator: { "@id": `${siteUrl}/#organization` },
      featureList: ["AI-assisted brand analysis", "Seven logo directions", "Editable vector logos", "SVG and PNG export", "Brand project storage"],
      offers: [
        { "@type": "Offer", name: "First two completed logo concepts", price: "0", priceCurrency: "LKR" },
        { "@type": "Offer", name: "One additional completed logo concept", price: "300", priceCurrency: "LKR" },
      ],
    },
    {
      "@type": "Service",
      "@id": `${siteUrl}/#service`,
      name: "AI Logo and Brand Identity Creation",
      provider: { "@id": `${siteUrl}/#organization` },
      areaServed: [{ "@type": "Country", name: "Sri Lanka" }, { "@type": "Place", name: "Worldwide" }],
      serviceType: "Professional logo and brand identity design",
      url: siteUrl,
    },
    {
      "@type": "FAQPage",
      "@id": `${siteUrl}/#faq`,
      mainEntity: faqs.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ],
};

export default function Home() {
  const [brand, setBrand] = useState("");
  const [industry, setIndustry] = useState("");
  const [chosen, setChosen] = useState(0);

  function start() {
    window.location.href = `/studio?brand=${encodeURIComponent(brand)}&industry=${encodeURIComponent(industry)}&style=${chosen}`;
  }

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <header>
        <div className="logo" aria-label="LOGOVA AI Logo Builder"><span>✦</span> LOGO<span>VA</span><small>AI LOGO BUILDER</small></div>
        <nav aria-label="Main navigation"><a href="#styles">Logo styles</a><a href="#how">How it works</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a><a href="/payments">My account</a></nav>
        <a className="signin" href="/payments">Sign in</a>
      </header>

      <section className="hero">
        <div className="copy">
          <p className="eyebrow">BUILT BY HARSH APEX DIGITAL SOLUTIONS</p>
          <h1>Professional logo design<br/>that <em>fits your brand.</em></h1>
          <p className="intro">Create an editable AI-assisted logo and complete brand direction for your business. Explore seven professional design approaches, choose the right style and refine it in the vector studio.</p>
          <div className="pill"><i/> Your first 2 completed logos are free <b>· Rs. 300 after</b></div>
          <div className="brief" id="create">
            <label>Brand name<input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Your brand name"/></label>
            <label>Industry<input value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="Fashion, hospitality, technology…"/></label>
            <button onClick={start}>Start with selected style <span>↗</span></button>
          </div>
          <p className="trust">Choose a direction below · Preview examples are fictional brands</p>
        </div>
        <div className="character" aria-hidden="true"><div className="orb orbit-one"/><div className="orb orbit-two"/><div className="designer-photo"><Image src="/real-designer.webp" alt="" fill priority sizes="(max-width: 650px) 90vw, 44vw"/></div><div className="spark one">✦</div><div className="spark two">✧</div></div>
      </section>

      <section className="style-section" id="styles" aria-labelledby="styles-title">
        <div className="section-heading"><p className="eyebrow">SEVEN WAYS TO MAKE YOUR MARK</p><h2 id="styles-title">Find your <em>logo direction.</em></h2><p>Compare realistic brand applications, then choose a professional direction for your logo.</p></div>
        <div className="style-grid">{concepts.map((concept, index) => <button type="button" className={chosen === index ? "style-card active" : "style-card"} aria-pressed={chosen === index} onClick={() => setChosen(index)} key={concept.name}><div className="style-art"><Image src={`/style-previews/${concept.image}`} alt={concept.alt} fill sizes="(max-width: 650px) 90vw, (max-width: 900px) 44vw, 30vw"/></div><div className="style-copy"><small>0{index + 1} / {concept.brand}</small><b>{concept.name}</b><p>{concept.desc}</p><i>{chosen === index ? "Selected ✓" : "Choose direction →"}</i></div></button>)}</div>
        <div className="style-continue"><p>Selected: <strong>{concepts[chosen].name}</strong></p><button onClick={start}>Create with this direction ↗</button></div>
      </section>

      <section className="how" id="how" aria-label="How LOGOVA works">
        <div><small>01 — EXPLORE</small><h3>Browse visual directions</h3><p>Compare minimalist, luxury, wordmark and concept-led logo systems before committing.</p></div>
        <div><small>02 — PERSONALISE</small><h3>Build your brand brief</h3><p>Use your business, audience and personality to guide a more relevant result.</p></div>
        <div id="pricing"><small>03 — CREATE</small><h3>First two logos free</h3><p>Generate, edit and save two concepts free. Continue for Rs. 300 per successful logo concept.</p></div>
      </section>

      <section className="seo-intro" aria-labelledby="why-logova">
        <p className="eyebrow">LOGO DESIGN FOR REAL BUSINESSES</p>
        <h2 id="why-logova">An AI logo maker with a professional brand workflow.</h2>
        <p>LOGOVA combines brand strategy, creative direction and editable vector artwork. It is built for startups, small businesses, hotels, villas, shops, creators and digital brands in Sri Lanka and worldwide.</p>
        <div><span>Editable SVG artwork</span><span>PNG exports</span><span>Seven creative directions</span><span>Secure project storage</span></div>
      </section>

      <section className="faq-section" id="faq" aria-labelledby="faq-title">
        <div className="section-heading"><p className="eyebrow">ANSWERS BEFORE YOU START</p><h2 id="faq-title">LOGOVA <em>frequently asked questions.</em></h2></div>
        <div className="faq-grid">{faqs.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>
      </section>

      <footer>© 2026 Harsh Apex Digital Solutions <span>·</span> Galle, Sri Lanka <span>·</span> Made for original brands</footer>
    </main>
  );
}
