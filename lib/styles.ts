/** Shared catalog for logo styles, industries and colour palettes (client + server safe). */
export const logoStyles = [
  { id: "minimalist", name: "Minimalist", short: "One precise idea, generous space.", direction: "Reduce the brand to a single distinctive geometric idea with generous negative space and a calm, confident wordmark." },
  { id: "luxury", name: "Luxury", short: "Quiet, editorial and refined.", direction: "Quiet luxury: restrained palette (deep tones with a metallic-like accent), elegant serif typography, wide letter-spacing, fine strokes and an understated crest or symbol." },
  { id: "modern", name: "Modern", short: "Crisp, confident and current.", direction: "Contemporary tech-forward identity: bold clean geometry, confident sans-serif lettering, tight spacing and one strong accent colour." },
  { id: "typography", name: "Typography", short: "The name is the logo.", direction: "Wordmark only: no symbol paths. All personality comes from typeface choice, weight, case and letter-spacing." },
  { id: "monogram", name: "Monogram", short: "Initials crafted into a mark.", direction: "Monogram: the brand initials (1–3 letters, supplied as markText) sit inside a refined frame such as a circle, rounded square or shield drawn with paths." },
  { id: "abstract", name: "Abstract", short: "An ownable, expressive shape.", direction: "Abstract mark: flowing or interlocking organic shapes that suggest the brand idea without literal imagery." },
  { id: "geometric", name: "Geometric", short: "Built from pure forms.", direction: "Geometric mark: constructed from circles, triangles, squares and grids with mathematically consistent proportions." },
  { id: "mascot", name: "Mascot", short: "A friendly character mark.", direction: "Mascot: a simple, friendly, flat character or animal face built from a few bold shapes (head, eyes, one distinctive feature). Keep it iconic, not illustrative." },
  { id: "3d", name: "3D-inspired", short: "Depth through flat facets.", direction: "3D-inspired: suggest depth with flat isometric facets in three tones of one hue (light, mid, dark). No gradients, no effects." },
  { id: "emblem", name: "Emblem", short: "A badge with heritage.", direction: "Emblem/badge: a circular or shield enclosure with inner rule lines and a central symbol; brand name sits below. Feels established and trustworthy." },
] as const;

export type LogoStyleId = typeof logoStyles[number]["id"];
export const styleIds = logoStyles.map(s => s.id) as readonly LogoStyleId[];

/** Index-based styles from earlier LOGOVA versions (links and saved briefs). */
const legacyStyleMap: LogoStyleId[] = ["minimalist", "modern", "luxury", "typography", "abstract", "geometric", "modern"];

export function resolveStyle(value: unknown): LogoStyleId | null {
  if (typeof value === "string" && (styleIds as readonly string[]).includes(value)) return value as LogoStyleId;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < legacyStyleMap.length) return legacyStyleMap[value];
  if (typeof value === "string" && /^\d$/.test(value)) return resolveStyle(Number(value));
  return null;
}
export function styleById(id: LogoStyleId) { return logoStyles.find(s => s.id === id)!; }

export const industries = [
  "Technology & software", "Hospitality, hotels & villas", "Food, café & restaurant", "Fashion & apparel",
  "Beauty, salon & spa", "Health & wellness", "Real estate & construction", "Finance & consulting",
  "Education & training", "Travel & tourism", "Retail & e-commerce", "Agriculture & organic",
  "Automotive & transport", "Creative agency & media", "Sports & fitness", "Non-profit & community",
] as const;

export const palettePresets = [
  { id: "auto", name: "Let AI choose", colors: [] as string[] },
  { id: "logova", name: "Navy & orange", colors: ["#19263B", "#FF7A00", "#F8F6F0"] },
  { id: "gold", name: "Black & gold", colors: ["#15161B", "#C9A45C", "#FBF7EE"] },
  { id: "ocean", name: "Ocean blue", colors: ["#0F3D5E", "#2E9CCA", "#F3F8FB"] },
  { id: "forest", name: "Forest green", colors: ["#1F5A45", "#C2A15E", "#F4F1E8"] },
  { id: "berry", name: "Berry & blush", colors: ["#7B2D52", "#E8B4A0", "#FFF7F4"] },
  { id: "sunset", name: "Sunset", colors: ["#B83A2E", "#F2A93B", "#FFF8EE"] },
  { id: "mono", name: "Monochrome", colors: ["#111111", "#6B6B6B", "#FFFFFF"] },
] as const;

export const hexColor = /^#[0-9a-fA-F]{6}$/;
