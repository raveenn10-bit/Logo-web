/** Logo specification validation and deterministic SVG rendering. */
export const fonts = ["Arial", "Georgia", "Verdana", "Trebuchet MS", "Times New Roman"] as const;
export type LogoSpec = {
  name: string; explanation: string; symbolRationale: string; typography: string;
  palette: string[]; background: string; foreground: string;
  layout: "stacked" | "horizontal" | "wordmark"; font: string; fontWeight: number;
  fontSize: number; letterSpacing: number;
  paths: {d: string; fill: string; stroke: string; strokeWidth: number}[];
  /** Optional initials drawn inside the mark (monogram / emblem styles). */
  markText?: string;
  markColor?: string;
  /** Render the brand name in capitals. */
  uppercase?: boolean;
};
const color = /^#[0-9a-fA-F]{6}$/;
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid concept text");
  return value.trim();
}
function numeric(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("Invalid vector geometry");
  return value;
}
export function validateSpec(input: unknown): LogoSpec {
  if (!input || typeof input !== "object") throw new Error("Invalid logo response");
  const p = input as Record<string, unknown>;
  if (!Array.isArray(p.palette) || p.palette.length < 2 || p.palette.length > 5 || !p.palette.every(c => typeof c === "string" && color.test(c))) throw new Error("Invalid palette");
  if (typeof p.background !== "string" || !color.test(p.background) || typeof p.foreground !== "string" || !color.test(p.foreground)) throw new Error("Invalid colors");
  if (!["stacked", "horizontal", "wordmark"].includes(String(p.layout)) || !fonts.includes(p.font as typeof fonts[number])) throw new Error("Invalid typography");
  if (!Array.isArray(p.paths) || p.paths.length > 12) throw new Error("Invalid paths");
  const paths = p.paths.map((path: unknown) => {
    if (!path || typeof path !== "object") throw new Error("Invalid path");
    const v = path as Record<string, unknown>;
    const d = text(v.d, 3000);
    if (!/^[Mm]/.test(d) || !/^[MmLlHhVvCcSsQqTtAaZz0-9., +\-\r\n]+$/.test(d)) throw new Error("Unsafe vector path");
    const numbers = d.match(/[-+]?(?:\d*\.)?\d+/g) || [];
    if (numbers.some(n => Math.abs(Number(n)) > 1600)) throw new Error("Vector outside canvas");
    for (const key of ["fill", "stroke"]) if (v[key] !== "none" && (typeof v[key] !== "string" || !color.test(v[key] as string))) throw new Error("Unsafe vector color");
    return {d, fill: v.fill as string, stroke: v.stroke as string, strokeWidth: numeric(v.strokeWidth, 0, 30)};
  });
  let markText: string | undefined;
  if (p.markText !== undefined && p.markText !== null && p.markText !== "") {
    if (typeof p.markText !== "string" || !/^[\p{L}\p{N}&]{1,3}$/u.test(p.markText.trim())) throw new Error("Invalid monogram");
    markText = p.markText.trim();
  }
  let markColor: string | undefined;
  if (p.markColor !== undefined && p.markColor !== null && p.markColor !== "") {
    if (typeof p.markColor !== "string" || !color.test(p.markColor)) throw new Error("Invalid monogram color");
    markColor = p.markColor;
  }
  if (p.layout !== "wordmark" && paths.length === 0 && !markText) throw new Error("Missing symbol");
  return {
    name:text(p.name,100),explanation:text(p.explanation,1200),symbolRationale:text(p.symbolRationale,800),typography:text(p.typography,500),
    palette:p.palette as string[],background:p.background,foreground:p.foreground,layout:p.layout as LogoSpec["layout"],font:p.font as string,
    fontWeight:numeric(p.fontWeight,400,900),fontSize:numeric(p.fontSize,24,100),letterSpacing:numeric(p.letterSpacing,-2,12),paths,
    ...(markText ? {markText} : {}), ...(markColor ? {markColor} : {}), ...(p.uppercase === true ? {uppercase:true} : {}),
  };
}
export function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
}
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
}
/** WCAG contrast ratio between two #RRGGBB colours. */
export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + .05) / (y + .05);
}
/** Mix a colour towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number) {
  const target = amount > 0 ? 255 : 0, t = Math.min(1, Math.abs(amount));
  return "#" + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + target * t).toString(16).padStart(2, "0")).join("").toUpperCase();
}
/** First letters of up to two words, e.g. "Maison Vela" → "MV". */
export function initials(brand: string): string {
  const words = brand.trim().split(/[\s\-_&.]+/u).filter(w => /[\p{L}\p{N}]/u.test(w));
  const letters = (words.length > 1 ? words.slice(0, 2).map(w => [...w.replace(/[^\p{L}\p{N}]/gu, "")][0] || "") : [...(words[0] || "L").replace(/[^\p{L}\p{N}]/gu, "")].slice(0, 1)).join("");
  return (letters || "L").toUpperCase();
}
/** Average advance width per em for the supported fonts (for fitting text within the artboard). */
const advance: Record<string, number> = {"Arial":.58,"Georgia":.6,"Verdana":.68,"Trebuchet MS":.56,"Times New Roman":.52};
export function fitFontSize(value: string, font: string, preferred: number, letterSpacing: number, maxWidth: number, uppercase = false) {
  const chars = Math.max(1, [...value].length);
  const per = (advance[font] || .6) * (uppercase ? 1.14 : 1);
  const fitted = (maxWidth - Math.max(0, letterSpacing) * (chars - 1)) / (chars * per);
  return Math.round(Math.max(18, Math.min(preferred, fitted)) * 10) / 10;
}
export function renderLogo(brand: string, input: unknown, tagline = ""): string {
  const p = validateSpec(input);
  const horizontal = p.layout === "horizontal";
  const wordmark = p.layout === "wordmark";
  const name = p.uppercase ? brand.toLocaleUpperCase() : brand;
  const tag = tagline.trim().slice(0, 60);
  const x = horizontal ? 290 : 400;
  const y = horizontal ? (tag ? 245 : 258) : wordmark ? (tag ? 252 : 268) : 352;
  const width = horizontal ? 470 : 700;
  const size = fitFontSize(name, p.font, p.fontSize, p.letterSpacing, width, p.uppercase);
  const anchor = horizontal ? "start" : "middle";
  const candidate = p.palette.find(c => c.toLowerCase() !== p.background.toLowerCase() && c.toLowerCase() !== p.foreground.toLowerCase());
  const accent = candidate && contrastRatio(candidate, p.background) >= 3 ? candidate : p.foreground;
  let out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500"><rect x="0" y="0" width="800" height="500" fill="'+p.background+'"/>';
  out += p.paths.map(v=>'<path d="'+v.d+'" fill="'+v.fill+'" stroke="'+v.stroke+'" stroke-width="'+v.strokeWidth+'" stroke-linejoin="round" stroke-linecap="round"/>').join("");
  if (p.markText && !wordmark) {
    const mx = horizontal ? 150 : 400, my = horizontal ? 220 : 160;
    const markSize = p.markText.length === 1 ? 112 : p.markText.length === 2 ? 86 : 64;
    const markFont = p.font === "Verdana" || p.font === "Trebuchet MS" ? "Georgia" : p.font;
    out += '<text x="'+mx+'" y="'+(my + markSize * .35)+'" text-anchor="middle" fill="'+(p.markColor || p.foreground)+'" font-family="'+markFont+'" font-weight="'+Math.min(800, Math.max(500, p.fontWeight))+'" font-size="'+markSize+'" letter-spacing="1">'+escapeXml(p.markText)+'</text>';
  }
  out += '<text x="'+x+'" y="'+y+'" text-anchor="'+anchor+'" fill="'+p.foreground+'" font-family="'+p.font+'" font-weight="'+p.fontWeight+'" font-size="'+size+'" letter-spacing="'+p.letterSpacing+'">'+escapeXml(name)+'</text>';
  if (tag) {
    const tagSize = fitFontSize(tag.toUpperCase(), "Arial", horizontal ? 17 : 19, 3.2, horizontal ? 450 : 600, true);
    const ty = y + Math.max(36, size * .62);
    out += '<text x="'+x+'" y="'+ty+'" text-anchor="'+anchor+'" fill="'+accent+'" font-family="Arial" font-weight="600" font-size="'+tagSize+'" letter-spacing="3.2">'+escapeXml(tag.toUpperCase())+'</text>';
  }
  return out + '</svg>';
}
