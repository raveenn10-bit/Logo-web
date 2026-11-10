import type {LogoStyleId} from "../lib/styles";

/** Small illustrative glyph for each logo style (decorative). */
export default function StyleGlyph({id}: {id: LogoStyleId}) {
  const s = {fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const};
  const a = "var(--glyph-accent, #ff7a00)";
  const shapes: Record<LogoStyleId, React.ReactNode> = {
    minimalist: <><circle cx="24" cy="24" r="14" {...s}/><path d="M17 24 24 17 31 24 24 31Z" fill={a}/></>,
    luxury: <><path d="M24 8 27 21 40 24 27 27 24 40 21 27 8 24 21 21Z" fill={a}/><path d="M14 44H34" {...s} strokeWidth={1.5}/></>,
    modern: <><path d="M10 34C10 18 19 10 34 10 28 15 25 19 25 26 25 33 19 38 10 34Z" fill="currentColor"/><path d="M19 38C29 38 35 33 37 23 42 34 36 44 23 44Z" fill={a}/></>,
    typography: <><text x="24" y="31" textAnchor="middle" fontFamily="Georgia" fontWeight="700" fontSize="22" fill="currentColor">Aa</text><path d="M18 38H30" stroke={a} strokeWidth="3"/></>,
    monogram: <><circle cx="24" cy="24" r="17" {...s}/><text x="24" y="31" textAnchor="middle" fontFamily="Georgia" fontWeight="700" fontSize="19" fill="currentColor">M</text></>,
    abstract: <><path d="M24 24C18 16 18 8 24 6 30 8 30 16 24 24Z" fill="currentColor"/><path d="M24 24C33 22 39 26 37 32 34 36 28 34 24 24Z" fill={a}/><path d="M24 24C20 32 14 37 10 33 9 27 15 24 24 24Z" fill="currentColor" opacity=".55"/></>,
    geometric: <><path d="M17 8H31L38 24 31 40H17L10 24Z" {...s}/><path d="M17 8 24 24 17 40M31 8 24 24 31 40" stroke={a} strokeWidth="3" fill="none"/></>,
    mascot: <><circle cx="14" cy="12" r="5" fill="currentColor"/><circle cx="34" cy="12" r="5" fill="currentColor"/><circle cx="24" cy="25" r="15" fill="currentColor"/><circle cx="19" cy="23" r="3" fill="#fff"/><circle cx="29" cy="23" r="3" fill="#fff"/><path d="M19 31Q24 35 29 31" stroke={a} strokeWidth="2.5" fill="none"/></>,
    "3d": <><path d="M24 6 39 15 24 24 9 15Z" fill={a}/><path d="M9 15 24 24V42L9 33Z" fill="currentColor"/><path d="M39 15 24 24V42L39 33Z" fill="currentColor" opacity=".6"/></>,
    emblem: <><path d="M24 5 39 10V23C39 32 33 38 24 43 15 38 9 32 9 23V10Z" fill="currentColor"/><path d="M24 15 26.5 21H33L27.8 25 29.6 31 24 27.5 18.4 31 20.2 25 15 21H21.5Z" fill={a}/></>,
  };
  return <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" focusable="false">{shapes[id]}</svg>;
}
