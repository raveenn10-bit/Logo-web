import {Hero, SiteHeader, StyleShowcase, type Sample} from "../components/HomeExperience";
import {renderLogo} from "../lib/logo";
import {localConcept} from "../lib/vector-engine";
import {logoStyles} from "../lib/styles";

const siteUrl = "https://logo.harshapex.com.lk";

// Fictional brands, rendered at build time by the same engine customers use.
const sampleBriefs: Record<string, [string, string, string, string[]]> = {
  minimalist: ["Northline", "Software studio", "Technology", []],
  luxury: ["Maison Vela", "Boutique stays", "Hospitality", ["#15161B", "#C9A45C", "#FBF7EE"]],
  modern: ["Kinetic", "Mobility labs", "Technology", ["#123B5D", "#2E9CCA", "#F4F8FA"]],
  typography: ["nouvelle", "Editorial studio", "Creative agency", ["#1A1A1A", "#E1573A", "#FFF8F0"]],
  monogram: ["Ashford Rowe", "Legal counsel", "Finance & consulting", ["#1E2B4A", "#B08D57", "#F7F4EE"]],
  abstract: ["Terra Form", "Landscape design", "Agriculture & organic", []],
  geometric: ["Valerius", "Architecture", "Real estate", ["#222831", "#E07A3F", "#F5F2EC"]],
  mascot: ["Kiri Café", "Since 2024", "Food, café & restaurant", ["#5B3A29", "#F2A93B", "#FFF8EE"]],
  "3d": ["Blockwise", "Build smarter", "Construction", ["#2D4B8E", "#F4B740", "#F5F7FB"]],
  emblem: ["Cedar & Co.", "Organic pantry", "Agriculture & organic", ["#1F5A45", "#C2A15E", "#F4F1E8"]],
};
const samples: Sample[] = logoStyles.map(style => {
  const [brand, tagline, industry, colors] = sampleBriefs[style.id];
  const {spec} = localConcept({brand, tagline, industry, style: style.id, colors, details: ""}, "home");
  return {id: style.id, brand, svg: renderLogo(brand, spec, tagline)};
});

const faqs = [
  { question: "Is LOGOVA free to use?", answer: "Yes. Your first logo is free without signing up. Continue with Google for one more free logo. After that, LKR 300 unlocks five additional logo generations, paid via WhatsApp and verified by our team." },
  { question: "Which logo styles can I choose?", answer: "Minimalist, Luxury, Modern, Typography, Monogram, Abstract, Geometric, Mascot, 3D-inspired and Emblem. You can also add a tagline, choose brand colours and describe your audience." },
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
      featureList: ["AI-assisted brand analysis", "Ten logo styles", "Editable vector logos", "SVG and PNG export", "Brand project storage"],
      offers: [
        { "@type": "Offer", name: "First logo (guest) and one more with Google sign-in", price: "0", priceCurrency: "LKR" },
        { "@type": "Offer", name: "Five additional logo generations", price: "300", priceCurrency: "LKR" },
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
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <SiteHeader />
      <Hero />
      <StyleShowcase samples={samples} />

      <section className="how" id="how" aria-labelledby="how-title">
        <h2 id="how-title" className="home-sr">How LOGOVA works</h2>
        <div><small>01 — BRIEF</small><h3>Describe your brand</h3><p>Name, tagline, industry, colours and the personality you want people to feel.</p></div>
        <div><small>02 — DESIGN</small><h3>Generate and refine</h3><p>Pick one of ten styles. Regenerate for a fresh idea or ask for a refinement in plain words.</p></div>
        <div><small>03 — OWN IT</small><h3>Edit and download</h3><p>Fine-tune layers in the vector editor, then export SVG, PNG or transparent PNG.</p></div>
      </section>

      <section className="home-pricing" id="pricing" aria-labelledby="pricing-title">
        <div className="section-heading"><p className="eyebrow">SIMPLE, FAIR PRICING</p><h2 id="pricing-title">Start free. <em>Pay only for more.</em></h2></div>
        <div className="home-price-grid">
          <article><small>GUEST</small><b>Free</b><p>Your first logo, no sign-up needed.</p><ul><li>1 logo generation</li><li>SVG &amp; PNG downloads</li><li>Vector editor</li></ul></article>
          <article><small>GOOGLE ACCOUNT</small><b>Free</b><p>Save your work and get one more logo.</p><ul><li>2 free logos in total</li><li>Saved history &amp; workspace</li><li>Brand kit starter</li></ul></article>
          <article className="is-featured"><small>LOGO PACK</small><b>LKR 300</b><p>Five more generations whenever you need them.</p><ul><li>5 logo generations</li><li>Pay easily via WhatsApp</li><li>Credits never expire</li></ul><a href="/studio">Start designing ↗</a></article>
        </div>
      </section>

      <section className="seo-intro" aria-labelledby="why-logova">
        <p className="eyebrow">LOGO DESIGN FOR REAL BUSINESSES</p>
        <h2 id="why-logova">An AI logo maker with a professional brand workflow.</h2>
        <p>LOGOVA combines brand strategy, creative direction and editable vector artwork. It is built for startups, small businesses, hotels, villas, shops, creators and digital brands in Sri Lanka and worldwide.</p>
        <div><span>Editable SVG artwork</span><span>PNG &amp; transparent PNG</span><span>Ten logo styles</span><span>Secure project storage</span></div>
      </section>

      <section className="faq-section" id="faq" aria-labelledby="faq-title">
        <div className="section-heading"><p className="eyebrow">ANSWERS BEFORE YOU START</p><h2 id="faq-title">LOGOVA <em>frequently asked questions.</em></h2></div>
        <div className="faq-grid">{faqs.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>
      </section>

      <footer>© 2026 Harsh Apex Digital Solutions <span>·</span> Galle, Sri Lanka <span>·</span> WhatsApp <a href="https://wa.me/94770663154">+94 77 066 3154</a></footer>
    </main>
  );
}
