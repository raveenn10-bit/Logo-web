export const styles = ["Minimalist Mark", "Brand Identity", "Luxury Identity", "Wordmark", "Symbol + Wordmark", "Concept Driven", "Complete Brief"] as const;
export const fonts = ["Arial", "Georgia", "Verdana", "Trebuchet MS", "Times New Roman"] as const;
export type LogoSpec = {
  name: string; explanation: string; symbolRationale: string; typography: string;
  palette: string[]; background: string; foreground: string;
  layout: "stacked" | "horizontal" | "wordmark"; font: string; fontWeight: number;
  fontSize: number; letterSpacing: number;
  paths: {d: string; fill: string; stroke: string; strokeWidth: number}[];
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
  if (p.layout !== "wordmark" && paths.length === 0) throw new Error("Missing symbol");
  return {name:text(p.name,100),explanation:text(p.explanation,1200),symbolRationale:text(p.symbolRationale,800),typography:text(p.typography,500),palette:p.palette as string[],background:p.background,foreground:p.foreground,layout:p.layout as LogoSpec["layout"],font:p.font as string,fontWeight:numeric(p.fontWeight,400,900),fontSize:numeric(p.fontSize,24,100),letterSpacing:numeric(p.letterSpacing,-2,12),paths};
}
export function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
}
export function renderLogo(brand: string, input: unknown): string {
  const p = validateSpec(input);
  const horizontal = p.layout === "horizontal";
  const x = horizontal ? 290 : 400;
  const y = horizontal ? 260 : p.layout === "wordmark" ? 270 : 350;
  const width = horizontal ? 450 : 700;
  const size = Math.max(18, Math.min(p.fontSize, width / Math.max(1, brand.length * .65)));
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500"><rect x="0" y="0" width="800" height="500" fill="'+p.background+'"/>'+p.paths.map(v=>'<path d="'+v.d+'" fill="'+v.fill+'" stroke="'+v.stroke+'" stroke-width="'+v.strokeWidth+'" stroke-linejoin="round" stroke-linecap="round"/>').join("")+'<text x="'+x+'" y="'+y+'" text-anchor="'+(horizontal?"start":"middle")+'" fill="'+p.foreground+'" font-family="'+p.font+'" font-weight="'+p.fontWeight+'" font-size="'+size+'" letter-spacing="'+p.letterSpacing+'">'+escapeXml(brand)+'</text></svg>';
}
