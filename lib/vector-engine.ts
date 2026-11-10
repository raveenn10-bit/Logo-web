/**
 * Deterministic, editable vector directions used when the AI provider is slow,
 * unavailable or returns an invalid design. Every style has several variants;
 * the request seed picks one so "Regenerate" produces a different result.
 */
import {contrastRatio, initials, shade, type LogoSpec} from "./logo";
import {styleById, type LogoStyleId} from "./styles";

export type EngineBrief = {brand: string; tagline: string; industry: string; style: LogoStyleId; colors: string[]; details: string};
type Path = LogoSpec["paths"][number];
const line = (d: string, stroke: string, strokeWidth = 10): Path => ({d, fill: "none", stroke, strokeWidth});
const solid = (d: string, fill: string): Path => ({d, fill, stroke: "none", strokeWidth: 0});
const circle = (cx: number, cy: number, r: number) => `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

function paletteFromWords(brief: EngineBrief) {
  const words = (brief.details + " " + brief.industry).toLowerCase();
  if (/gold|luxury|premium|jewel/.test(words)) return ["#171A24", "#C9A45C", "#FBF7EE"];
  if (/red|food|restaurant|spice|café|cafe|bakery/.test(words)) return ["#7A2E1F", "#E39B2D", "#FFF8EE"];
  if (/green|eco|nature|farm|wellness|organic|agricultur/.test(words)) return ["#1F5A45", "#C2A15E", "#F4F1E8"];
  if (/blue|tech|finance|software|digital|consult/.test(words)) return ["#123B5D", "#2E8BC0", "#F4F8FA"];
  if (/pink|beauty|fashion|salon|spa/.test(words)) return ["#7B2D52", "#D99A84", "#FFF7F4"];
  if (/travel|tour|ocean|villa|hotel|hospitality/.test(words)) return ["#0F4C5C", "#E3A857", "#F7F4EC"];
  return ["#19263B", "#FF7A00", "#F8F6F0"];
}
/** Primary (ink), accent and canvas colours honouring the customer's chosen palette. */
export function resolvePalette(brief: EngineBrief): [string, string, string] {
  const base = paletteFromWords(brief);
  const chosen = brief.colors.map(c => c.toUpperCase());
  let canvas = chosen[2] || base[2];
  let primary = chosen[0] || base[0];
  const accent = chosen[1] || (chosen[0] ? shade(chosen[0], .45) : base[1]);
  if (contrastRatio(primary, canvas) < 3) {
    // A light primary needs a dark canvas to stay legible.
    canvas = contrastRatio(primary, "#111827") >= 4.5 ? "#111827" : "#FFFFFF";
    if (contrastRatio(primary, canvas) < 3) primary = "#111827";
  }
  return [primary, accent, canvas];
}

function hash(value: string) { let h = 2166136261; for (const ch of value) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); } return h >>> 0; }

type Variant = {paths: (p: string, a: string) => Path[]; layout?: LogoSpec["layout"]; font?: string; weight?: number; spacing?: number; size?: number; uppercase?: boolean; mark?: boolean; idea: string};

function sectorMark(subject: string, primary: string, accent: string): Path[] | null {
  if (/villa|hotel|resort|stay|architecture|real estate|construction/.test(subject)) return [
    line("M 279 213 L 400 91 L 521 213", primary, 13), line("M 308 208 V 293 H 492 V 208", primary, 11),
    line("M 370 293 V 223 Q 370 193 400 193 Q 430 193 430 223 V 293", accent, 11), line("M 280 313 H 520", accent, 5)];
  if (/fashion|apparel|clothing|couture|tailor|boutique/.test(subject)) return [
    line("M 326 278 C 366 239 376 166 400 101 C 424 166 434 239 474 278", primary, 11), line("M 326 278 C 370 258 430 258 474 278", primary, 8),
    line("M 342 248 Q 400 215 458 248", accent, 6), solid("M 389 95 Q 400 70 411 95 L 400 121 Z", accent)];
  if (/tech|digital|software|circuit|electronics|\bai\b|computer/.test(subject)) return [
    line("M 338 95 V 223 Q 338 255 370 255 H 430 Q 462 255 462 223 V 95", primary, 11), line("M 370 95 V 193 Q 370 222 400 222 Q 430 222 430 193 V 95", accent, 9),
    line("M 400 255 V 297 M 308 194 H 338 M 462 194 H 492", primary, 7), solid("M 326 84 H 350 V 108 H 326 Z M 418 84 H 442 V 108 H 418 Z M 450 84 H 474 V 108 H 450 Z M 388 288 H 412 V 312 H 388 Z", accent)];
  if (/coffee|cafe|café|food|restaurant|bakery|roast/.test(subject)) return [
    line("M 326 192 C 326 265 367 297 413 297 C 459 297 489 262 489 204", primary, 10), line("M 489 209 C 545 192 535 260 486 260", accent, 9),
    line("M 360 160 C 341 138 372 125 359 97 M 404 160 C 385 138 416 125 403 97 M 448 160 C 429 138 460 125 447 97", primary, 6), line("M 314 312 H 498", accent, 6)];
  if (/eco|nature|plant|farm|garden|wellness|organic|agricultur/.test(subject)) return [
    solid("M 402 294 C 294 251 302 151 394 106 C 486 63 520 102 500 181 C 483 247 445 280 402 294 Z", primary),
    line("M 354 245 C 390 204 429 167 477 130", accent, 9), line("M 389 204 L 367 156 M 420 176 L 468 197", accent, 6)];
  return null;
}

const variants: Record<LogoStyleId, Variant[]> = {
  minimalist: [
    {idea: "A single ring holding a balanced diamond: one calm, precise idea.", paths: (p, a) => [line(circle(400, 165, 100), p, 12), solid("M 344 165 L 400 109 L 456 165 L 400 221 Z", a)]},
    {idea: "A half-filled circle suggesting balance between craft and clarity.", paths: (p, a) => [line(circle(400, 165, 95), p, 10), solid("M 400 70 A 95 95 0 0 1 400 260 Z", a)]},
    {idea: "One open arc and a point: momentum reduced to its essence.", paths: (p, a) => [line("M 318 220 A 100 100 0 1 1 482 220", p, 14), solid(circle(400, 190, 20), a)]},
  ],
  luxury: [
    {idea: "A fine four-point star over a hairline rule: restraint and quiet confidence.", font: "Georgia", weight: 500, spacing: 9, uppercase: true, size: 54,
      paths: (p, a) => [solid("M 400 74 L 414 148 L 488 162 L 414 176 L 400 250 L 386 176 L 312 162 L 386 148 Z", a), line("M 330 288 H 470", p, 2)]},
    {idea: "A double-ring crest framing the initials, in the manner of a maison seal.", font: "Times New Roman", weight: 500, spacing: 8, uppercase: true, size: 56, mark: true,
      paths: (p, a) => [line(circle(400, 160, 100), a, 3), line(circle(400, 160, 88), a, 1.5)]},
  ],
  modern: [
    {idea: "Two interlocking forms in motion: collaboration and forward energy.", font: "Trebuchet MS", weight: 800, spacing: -1, size: 66,
      paths: (p, a) => [solid("M 315 245 C 315 150 370 88 470 88 C 430 118 409 150 409 193 C 409 237 372 270 315 245 Z", p), solid("M 367 260 C 429 260 468 226 480 166 C 513 236 476 310 397 310 C 365 310 338 293 322 269 Z", a)]},
    {idea: "A forward chevron built from two weights: progress with clarity.", layout: "horizontal", font: "Arial", weight: 800, spacing: 0, size: 64,
      paths: (p, a) => [solid("M 70 140 L 150 220 L 70 300 L 110 300 L 190 220 L 110 140 Z", p), solid("M 140 140 L 220 220 L 140 300 L 175 300 L 255 220 L 175 140 Z", a)]},
  ],
  typography: [
    {idea: "Spacious editorial capitals with a short accent rule.", layout: "wordmark", font: "Georgia", weight: 600, spacing: 10, uppercase: true, size: 76, paths: (_p, a) => [line("M 370 312 H 430", a, 5)]},
    {idea: "A heavy, tightly-set lowercase wordmark with a signature dot.", layout: "wordmark", font: "Trebuchet MS", weight: 800, spacing: -1.5, size: 92, paths: (_p, a) => [solid(circle(400, 330, 9), a)]},
    {idea: "Classic serif capitals between fine rules: established and trustworthy.", layout: "wordmark", font: "Times New Roman", weight: 600, spacing: 7, uppercase: true, size: 78, paths: (p) => [line("M 230 180 H 570", p, 1.5), line("M 230 332 H 570", p, 1.5)]},
  ],
  monogram: [
    {idea: "Initials set within a perfect circle: personal, crafted and memorable.", font: "Georgia", weight: 600, spacing: 4, uppercase: true, size: 56, mark: true, paths: (p, a) => [line(circle(400, 160, 95), p, 8), line(circle(400, 160, 80), a, 2)]},
    {idea: "Initials inside a softened square: modern craftsmanship.", font: "Arial", weight: 700, spacing: 3, uppercase: true, size: 58, mark: true, paths: (p, a) => [line("M 330 70 H 470 Q 490 70 490 90 V 230 Q 490 250 470 250 H 330 Q 310 250 310 230 V 90 Q 310 70 330 70 Z", p, 8), line("M 350 272 H 450", a, 5)]},
    {idea: "Initials guarded by a shield: protection and heritage.", font: "Times New Roman", weight: 600, spacing: 5, uppercase: true, size: 56, mark: true, paths: (p, a) => [line("M 400 58 L 488 88 V 160 C 488 214 452 248 400 268 C 348 248 312 214 312 160 V 88 Z", p, 8), line("M 340 104 L 400 84 L 460 104", a, 3)]},
  ],
  abstract: [
    {idea: "A sweeping crescent and a guiding stroke: growth with intention.", paths: (p, a) => [solid("M 310 118 C 345 86 389 78 430 94 C 471 110 498 148 498 191 C 498 258 447 310 380 310 C 326 310 284 276 272 228 C 314 251 356 247 385 217 C 416 185 411 143 390 112 Z", p), line("M 316 201 C 346 170 375 156 423 158", a, 12)]},
    {idea: "Three flowing petals turning around a shared centre: harmony and community.", paths: (p, a) => [solid("M 400 165 C 360 120 360 70 400 60 C 440 70 440 120 400 165 Z", p), solid("M 400 165 C 460 150 500 180 490 220 C 470 250 430 230 400 165 Z", a), solid("M 400 165 C 370 220 330 250 305 220 C 295 180 340 160 400 165 Z", shade(p, .35))]},
  ],
  geometric: [
    {idea: "A hexagonal frame with folded inner lines: structure and precision.", paths: (p, a) => [line("M 345 70 L 455 70 L 510 165 L 455 260 L 345 260 L 290 165 Z", p, 12), line("M 345 70 L 400 165 L 345 260 M 455 70 L 400 165 L 455 260", a, 10)]},
    {idea: "A triangle resting on a circle: stability supporting ambition.", paths: (p, a) => [solid(circle(400, 200, 62), a), solid("M 400 66 L 490 226 L 310 226 Z", p)]},
    {idea: "Nested squares rotated in rhythm: order, method and growth.", paths: (p, a) => [line("M 310 75 H 490 V 255 H 310 Z", p, 10), line("M 400 90 L 475 165 L 400 240 L 325 165 Z", a, 10), solid("M 375 140 H 425 V 190 H 375 Z", p)]},
  ],
  mascot: [
    {idea: "A friendly bear-like face: approachable, warm and easy to remember.", font: "Trebuchet MS", weight: 800, spacing: 0, size: 64,
      paths: (p, a) => [solid(circle(330, 92, 30), p), solid(circle(470, 92, 30), p), solid(circle(400, 165, 95), p), solid(circle(365, 150, 16), "#FFFFFF"), solid(circle(435, 150, 16), "#FFFFFF"), solid(circle(369, 153, 7), "#111111"), solid(circle(439, 153, 7), "#111111"), solid("M 380 185 Q 400 175 420 185 Q 400 205 380 185 Z", a), line("M 372 212 Q 400 232 428 212", "#FFFFFF", 6)]},
    {idea: "A cheerful round bird with a bright beak: optimism and agility.", font: "Trebuchet MS", weight: 800, spacing: 0, size: 64,
      paths: (p, a) => [solid(circle(395, 170, 92), p), solid("M 470 160 L 530 176 L 470 192 Z", a), solid(circle(430, 145, 18), "#FFFFFF"), solid(circle(435, 147, 8), "#111111"), solid("M 330 180 C 350 150 390 160 395 200 C 370 220 340 210 330 180 Z", shade(p, .3))]},
  ],
  "3d": [
    {idea: "An isometric cube in three tones: solid, dependable and built to last.", font: "Arial", weight: 800, spacing: 1, size: 62,
      paths: p => [solid("M 400 60 L 490 112 L 400 164 L 310 112 Z", shade(p, .45)), solid("M 310 112 L 400 164 L 400 268 L 310 216 Z", p), solid("M 490 112 L 400 164 L 400 268 L 490 216 Z", shade(p, -.35))]},
    {idea: "A folded ribbon prism: depth and transformation from a flat form.", font: "Trebuchet MS", weight: 800, spacing: 0, size: 62,
      paths: (p, a) => [solid("M 320 250 L 400 70 L 440 160 L 380 250 Z", p), solid("M 440 160 L 480 250 L 380 250 Z", shade(p, -.35)), solid("M 400 70 L 440 160 L 470 110 Z", a)]},
  ],
  emblem: [
    {idea: "A circular seal with a central star: heritage, quality and trust.", font: "Georgia", weight: 700, spacing: 5, uppercase: true, size: 56,
      paths: (p, a) => [solid(circle(400, 160, 104), p), line(circle(400, 160, 90), a, 3), line(circle(400, 160, 64), a, 1.5), solid("M 400 118 L 411 149 L 444 149 L 417 168 L 427 200 L 400 181 L 373 200 L 383 168 L 356 149 L 389 149 Z", a)]},
    {idea: "A shield badge carrying the initials: proud, established and protective.", font: "Times New Roman", weight: 700, spacing: 5, uppercase: true, size: 56, mark: true,
      paths: (p, a) => [solid("M 400 56 L 492 86 V 158 C 492 216 454 250 400 270 C 346 250 308 216 308 158 V 86 Z", p), line("M 400 74 L 476 98 V 158 C 476 205 446 233 400 251 C 354 233 324 205 324 158 V 98 Z", a, 3)]},
  ],
};

/** Bounding box of absolute, arc-free paths (null when a path cannot be measured simply). */
function bounds(paths: Path[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths) {
    if (/[a-zA]/.test(p.d.replace(/[MLHVCQZ]/g, ""))) return null;
    const tokens = p.d.match(/[MLHVCQZ]|-?\d*\.?\d+/g) || [];
    let cmd = "", axis = 0;
    for (const t of tokens) {
      if (/[A-Z]/.test(t)) { cmd = t; axis = 0; continue; }
      const n = Number(t), pad = p.strokeWidth / 2;
      const isX = cmd === "H" || (cmd !== "V" && axis % 2 === 0);
      if (isX) { minX = Math.min(minX, n - pad); maxX = Math.max(maxX, n + pad); } else { minY = Math.min(minY, n - pad); maxY = Math.max(maxY, n + pad); }
      axis++;
    }
  }
  return Number.isFinite(minX) && Number.isFinite(minY) ? {minX, minY, maxX, maxY} : null;
}
/** Uniformly scale absolute, arc-free paths so the mark sits inside the stacked mark zone (clear of the lettering). */
export function fitMark(paths: Path[], zone = {minX: 285, minY: 55, maxX: 515, maxY: 282}): Path[] {
  const b = bounds(paths);
  if (!b || (b.minX >= zone.minX && b.maxX <= zone.maxX && b.minY >= zone.minY && b.maxY <= zone.maxY)) return paths;
  const k = Math.min(1, (zone.maxX - zone.minX) / (b.maxX - b.minX), (zone.maxY - zone.minY) / (b.maxY - b.minY));
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2, tx = (zone.minX + zone.maxX) / 2, ty = (zone.minY + zone.maxY) / 2;
  const r = (n: number) => String(Math.round(n * 10) / 10);
  return paths.map(p => {
    let cmd = "", axis = 0;
    const d = p.d.replace(/[MLHVCQZ]|-?\d*\.?\d+/g, t => {
      if (/[A-Z]/.test(t)) { cmd = t; axis = 0; return t; }
      const isX = cmd === "H" || (cmd !== "V" && axis++ % 2 === 0);
      return isX ? r(tx + (Number(t) - cx) * k) : r(ty + (Number(t) - cy) * k);
    });
    return {...p, d, strokeWidth: Math.round(p.strokeWidth * Math.max(.7, k) * 10) / 10};
  });
}

export function localConcept(brief: EngineBrief, seed = ""): {spec: LogoSpec; model: string; tokens: number} {
  const [primary, accent, canvas] = resolvePalette(brief);
  const list = variants[brief.style];
  const pick = list[hash(seed + brief.brand + brief.style) % list.length];
  const style = styleById(brief.style);
  const sector = brief.style === "modern" && pick.layout !== "horizontal" ? sectorMark((brief.industry + " " + brief.details).toLowerCase(), primary, accent) : null;
  const markOnAccent = brief.style === "emblem";
  const spec: LogoSpec = {
    name: style.name + " direction",
    explanation: `${pick.idea} Built for ${brief.brand} with a balanced composition that stays legible from favicon to signage.`,
    symbolRationale: sector ? "The symbol abstracts a familiar cue from the industry into custom, scalable geometry." : pick.idea,
    typography: pick.font === "Georgia" || pick.font === "Times New Roman" ? "Serif lettering with measured spacing for an established, premium voice." : "Clean sans-serif lettering with confident weight for clarity at every size.",
    palette: [primary, accent, canvas], background: canvas, foreground: primary,
    layout: pick.layout || "stacked", font: pick.font || "Arial", fontWeight: pick.weight || 700, fontSize: pick.size || 62, letterSpacing: pick.spacing ?? 1.5,
    paths: (pick.layout || "stacked") === "stacked" ? fitMark(sector || pick.paths(primary, accent)) : sector || pick.paths(primary, accent),
    ...(pick.mark ? {markText: initials(brief.brand).slice(0, 2), markColor: markOnAccent ? accent : primary} : {}),
    ...(pick.uppercase ? {uppercase: true} : {}),
  };
  return {spec, model: "local-vector-engine", tokens: 0};
}
