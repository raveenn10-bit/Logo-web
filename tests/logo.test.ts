import {test} from "node:test";
import assert from "node:assert/strict";
import {generateConcept, parseBrief, type Brief} from "../lib/gemini";
import {contrastRatio, initials, renderLogo, validateSpec} from "../lib/logo";
import {localConcept, resolvePalette} from "../lib/vector-engine";
import {logoStyles, resolveStyle} from "../lib/styles";

const base: Brief = {brand: "Maison Vela", tagline: "Boutique stays", industry: "Hospitality, hotels & villas", style: "luxury", colors: [], details: "", refine: ""};
const geminiReply = (spec: object, status = 200) => new Response(JSON.stringify({candidates: [{finishReason: "STOP", content: {parts: [{text: JSON.stringify(spec)}]}}], usageMetadata: {totalTokenCount: 812}}), {status});
const aiSpec = {name: "Seal", explanation: "e", symbolRationale: "s", typography: "t", palette: ["#112233", "#C9A45C", "#FFFFFF"], background: "#FFFFFF", foreground: "#112233",
  layout: "stacked", font: "Georgia", fontWeight: 600, fontSize: 60, letterSpacing: 4, paths: [{d: "M 300 100 L 500 100 L 400 250 Z", fill: "#C9A45C", stroke: "none", strokeWidth: 0}]};

test("parseBrief accepts new style ids, legacy indices and validates colours", () => {
  assert.equal(parseBrief({brand: "Acme", style: "emblem"}).style, "emblem");
  assert.equal(parseBrief({brand: "Acme", style: 3}).style, "typography");
  assert.deepEqual(parseBrief({brand: "Acme", style: "modern", colors: ["#ff7a00"]}).colors, ["#FF7A00"]);
  assert.throws(() => parseBrief({brand: "Acme", style: "modern", colors: ["red"]}), /colours/);
  assert.throws(() => parseBrief({brand: "A", style: "modern"}), /2–45/);
  assert.throws(() => parseBrief({brand: "Acme", style: "unknown"}), /style/);
  assert.throws(() => parseBrief({brand: "Acme", style: "modern", tagline: "x".repeat(61)}), /Tagline/);
  assert.equal(resolveStyle("9"), null);
});

test("renderLogo escapes text, renders tagline and monogram, never injects markup", () => {
  const svg = renderLogo('<script>"&', {...aiSpec, markText: "MV"}, "Stay <well>");
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&lt;script&gt;&quot;&amp;"));
  assert.ok(svg.includes("STAY &lt;WELL&gt;"));
  assert.ok(svg.includes(">MV</text>"));
  assert.throws(() => validateSpec({...aiSpec, markText: "<b>"}), /monogram/);
  assert.throws(() => validateSpec({...aiSpec, paths: [{d: "M 0 0 L 1 1\" onload=\"x", fill: "#000000", stroke: "none", strokeWidth: 1}]}), /Unsafe/);
});

test("long brand names are fitted inside the artboard", () => {
  const svg = renderLogo("Extraordinarily Long Brand Name Co", aiSpec);
  const size = Number(svg.match(/font-size="([\d.]+)"/g)!.pop()!.match(/[\d.]+/)![0]);
  assert.ok(size < 60 && size >= 18, "size " + size);
});

test("every style has valid offline variants with legible contrast", () => {
  for (const style of logoStyles) for (let seed = 0; seed < 6; seed++) {
    const {spec} = localConcept({...base, style: style.id}, String(seed));
    const svg = renderLogo(base.brand, spec, base.tagline);
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
    assert.ok(contrastRatio(spec.foreground, spec.background) >= 3, style.id + " contrast");
    if (style.id === "typography") assert.equal(spec.layout, "wordmark");
    if (style.id === "monogram") assert.equal(spec.markText, "MV");
  }
});

test("customer colours are honoured and a light primary gets a dark canvas", () => {
  assert.deepEqual(resolvePalette({...base, colors: ["#0F3D5E", "#2E9CCA", "#F3F8FB"]}), ["#0F3D5E", "#2E9CCA", "#F3F8FB"]);
  const [primary, , canvas] = resolvePalette({...base, colors: ["#FFE680"]});
  assert.ok(contrastRatio(primary, canvas) >= 3);
  assert.equal(initials("cedar & co."), "CC");
});

test("Gemini success returns the AI spec with token usage", async () => {
  process.env.GEMINI_API_KEY = "test";
  const r = await generateConcept(base, {fetcher: async () => geminiReply(aiSpec)});
  assert.equal(r.fallback, false); assert.equal(r.tokens, 812); assert.equal(r.spec.name, "Seal");
});

test("Gemini transient 503 is retried once, then succeeds", async () => {
  let calls = 0;
  const r = await generateConcept(base, {fetcher: async () => ++calls === 1 ? new Response("busy", {status: 503}) : geminiReply(aiSpec)});
  assert.equal(calls, 2); assert.equal(r.fallback, false);
});

test("non-retryable errors, timeouts and invalid designs fall back to the vector engine", async () => {
  let calls = 0;
  const bad = await generateConcept(base, {fetcher: async () => { calls++; return new Response("bad", {status: 400}); }});
  assert.equal(calls, 1); assert.equal(bad.fallback, true); assert.equal(bad.model, "local-vector-engine");
  const timeout = await generateConcept(base, {fetcher: async () => { throw Object.assign(new Error("t"), {name: "TimeoutError"}); }});
  assert.equal(timeout.fallback, true);
  const invalid = await generateConcept(base, {fetcher: async () => geminiReply({...aiSpec, background: "red"})});
  assert.equal(invalid.fallback, true);
  const noBudget = await generateConcept(base, {budgetMs: 1000, fetcher: async () => { throw new Error("should not be called"); }});
  assert.equal(noBudget.fallback, true);
});

test("typography style output is coerced to a wordmark without a monogram", async () => {
  const r = await generateConcept({...base, style: "typography"}, {fetcher: async () => geminiReply({...aiSpec, markText: "MV"})});
  assert.equal(r.spec.layout, "wordmark"); assert.equal(r.spec.markText, undefined);
});

test("missing API key is a configuration error, not a charge", async () => {
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(generateConcept(base), /not configured/);
});
