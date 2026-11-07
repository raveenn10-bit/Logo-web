"use client";

import { createElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import "./logo-editor.css";

const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const dbKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const db = dbUrl && dbKey ? createClient(dbUrl, dbKey) : null;
const tags = ["path", "text", "rect", "circle", "ellipse", "polygon", "polyline", "line"] as const;
type Tag = typeof tags[number];
type Layer = { id: string; type: Tag; attrs: Record<string, string>; text: string; x: number; y: number; scale: number; hidden: boolean; background: boolean };
type Scene = { width: number; height: number; layers: Layer[] };
type Version = { id: string; created_at: string; canvas_state: unknown; svg_markup: string };
const numbers = new Set(["x", "y", "width", "height", "rx", "ry", "r", "cx", "cy", "x1", "y1", "x2", "y2", "stroke-width", "font-size", "font-weight", "letter-spacing", "opacity", "fill-opacity", "stroke-opacity"]);
const textAttrs = new Set(["fill", "stroke", "d", "points", "font-family", "text-anchor", "dominant-baseline", "stroke-linecap", "stroke-linejoin", "fill-rule", "transform"]);
const fonts = ["Arial", "Georgia", "Verdana", "Trebuchet MS", "Courier New", "Times New Roman"];
const emptyScene = (): Scene => ({ width: 800, height: 500, layers: [] });
const finite = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(-10000, Math.min(10000, Number(value))) : fallback;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const transform = (layer: Layer) => `translate(${layer.x} ${layer.y}) scale(${layer.scale})`;
const safeTransform = (value: string) => /^(\s*(translate|scale|rotate|matrix|skewX|skewY)\([\d.,eE+\s-]+\)\s*)*$/.test(value) ? value : "";
function cleanAttrs(input: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (numbers.has(key) && Number.isFinite(Number(value))) output[key] = String(finite(value));
    else if (textAttrs.has(key) && value.length <= 20000) {
      if (key === "d" && !/^[MmZzLlHhVvCcSsQqTtAa0-9.,eE+\s-]*$/.test(value)) continue;
      if (key === "points" && !/^[0-9.,eE+\s-]*$/.test(value)) continue;
      if ((key === "fill" || key === "stroke") && !/^(#[0-9a-f]{3,8}|none|transparent|[a-z]{1,24})$/i.test(value)) continue;
      if (key === "transform") { const v = safeTransform(value); if (v) output[key] = v; continue; }
      output[key] = value;
    }
  }
  return output;
}
function parseSvg(markup: string): Scene {
  if (markup.length > 500000) throw new Error("This vector file is too large for the editor.");
  const document = new DOMParser().parseFromString(markup, "image/svg+xml");
  if (document.querySelector("parsererror") || document.documentElement.tagName !== "svg") throw new Error("This saved logo is not valid SVG artwork.");
  const root = document.documentElement;
  const viewBox = (root.getAttribute("viewBox") || "0 0 800 500").trim().split(/[\s,]+/).map(Number);
  const width = Math.max(100, Math.min(3000, finite(viewBox[2], 800)));
  const height = Math.max(100, Math.min(3000, finite(viewBox[3], 500)));
  const layers: Layer[] = [];
  const walk = (parent: Element, inherited: Record<string, string>, transforms: string[]) => {
    for (const element of Array.from(parent.children)) {
      const own = cleanAttrs(Object.fromEntries(Array.from(element.attributes).map(a => [a.name, a.value])));
      const merged = { ...inherited, ...own };
      const chain = [...transforms, ...(own.transform ? [own.transform] : [])];
      if (element.tagName === "g") { const style = Object.fromEntries(Object.entries(merged).filter(([k]) => ["fill", "stroke", "stroke-width", "font-size", "font-family", "font-weight", "text-anchor", "opacity"].includes(k))); walk(element, style, chain); }
      else if ((tags as readonly string[]).includes(element.tagName)) {
        if (layers.length >= 80) throw new Error("This logo exceeds the editor's 80-layer limit.");
        if (chain.length) merged.transform = chain.join(" ");
        layers.push({ id: crypto.randomUUID(), type: element.tagName as Tag, attrs: merged, text: element.tagName === "text" ? (element.textContent || "").slice(0, 200) : "", x: -finite(viewBox[0]), y: -finite(viewBox[1]), scale: 1, hidden: false, background: element.tagName === "rect" && Number(merged.width) >= width && Number(merged.height) >= height && layers.length === 0 });
      }
    }
  };
  walk(root, cleanAttrs({ fill: root.getAttribute("fill") || "#19263b" }), []);
  if (!layers.length) throw new Error("No supported vector layers were found in this logo.");
  return { width, height, layers };
}
function validScene(value: unknown): Scene | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Scene>;
  if (!Array.isArray(candidate.layers) || candidate.layers.length > 80 || !candidate.width || !candidate.height) return null;
  try { return { width: Math.max(100, finite(candidate.width, 800)), height: Math.max(100, finite(candidate.height, 500)), layers: candidate.layers.map((layer: Layer) => {
    if (!(tags as readonly string[]).includes(layer.type) || !layer.attrs) throw new Error("Invalid layer");
    return { id: String(layer.id), type: layer.type, attrs: cleanAttrs(layer.attrs), text: String(layer.text || "").slice(0, 200), x: finite(layer.x), y: finite(layer.y), scale: Math.max(.05, Math.min(10, finite(layer.scale, 1))), hidden: !!layer.hidden, background: !!layer.background };
  }) }; } catch { return null; }
}
function escape(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
function serialize(scene: Scene): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}">${scene.layers.filter(l => !l.hidden).map(l => `<g transform="${transform(l)}"><${l.type} ${Object.entries(cleanAttrs(l.attrs)).map(([k, v]) => `${k}="${escape(v)}"`).join(" ")}>${l.type === "text" ? escape(l.text) : ""}</${l.type}></g>`).join("")}</svg>`;
}
function renderLayer(layer: Layer) {
  const props = Object.fromEntries(Object.entries(layer.attrs).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v]));
  return createElement(layer.type, props, layer.type === "text" ? layer.text : undefined);
}
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

export default function LogoEditor({ conceptId }: { conceptId: string }) {
  const [scene, setScene] = useState<Scene>(emptyScene);
  const [past, setPast] = useState<Scene[]>([]), [future, setFuture] = useState<Scene[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100), [grid, setGrid] = useState(false), [snap, setSnap] = useState(false);
  const [loading, setLoading] = useState(true), [signedIn, setSignedIn] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [title, setTitle] = useState("Logo");
  const [versions, setVersions] = useState<Version[]>([]), [dirty, setDirty] = useState(false);
  const [bounds, setBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const svg = useRef<SVGSVGElement | null>(null), layerRefs = useRef(new Map<string, SVGGElement>());
  const drag = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; original: Scene; originalLayer: Layer; size: number } | null>(null);
  const active = scene.layers.find(l => l.id === selected);
  const commit = useCallback((next: Scene) => { setPast(p => [...p.slice(-79), copy(scene)]); setFuture([]); setScene(next); setDirty(true); setNotice(""); }, [scene]);
  const update = (attrs: Partial<Layer>) => active && commit({ ...scene, layers: scene.layers.map(l => l.id === active.id ? { ...l, ...attrs } : l) });
  const updateAttr = (key: string, value: string) => active && update({ attrs: { ...active.attrs, [key]: value } });
  const undo = useCallback(() => { if (!past.length) return; setFuture(f => [copy(scene), ...f]); setScene(past[past.length - 1]); setPast(p => p.slice(0, -1)); setDirty(true); }, [past, scene]);
  const redo = useCallback(() => { if (!future.length) return; setPast(p => [...p, copy(scene)]); setScene(future[0]); setFuture(f => f.slice(1)); setDirty(true); }, [future, scene]);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!db) { setError("Supabase configuration is unavailable."); setLoading(false); return; }
      const auth = await db.auth.getUser();
      if (!auth.data.user) { setLoading(false); return; }
      if (!alive) return; setSignedIn(true);
      const [concept, history] = await Promise.all([db.from("logo_concepts").select("id,direction,svg_markup,project_id").eq("id", conceptId).maybeSingle(), db.from("logo_versions").select("id,created_at,canvas_state,svg_markup").eq("concept_id", conceptId).order("created_at", { ascending: false }).limit(30)]);
      if (!alive) return;
      if (concept.error || !concept.data) { setError("This logo was not found or you do not have access."); setLoading(false); return; }
      try { const latest = history.data?.[0]; const state = latest ? validScene(latest.canvas_state) || parseSvg(latest.svg_markup) : parseSvg(concept.data.svg_markup); setScene(state); setTitle(concept.data.direction || "Logo"); setVersions((history.data || []) as Version[]); } catch (e) { setError(e instanceof Error ? e.message : "Could not open logo."); }
      if (history.error) setError(history.error.message);
      setLoading(false);
    }
    void load(); return () => { alive = false; };
  }, [conceptId]);
  useLayoutEffect(() => { if (!selected) { setBounds(null); return; } try { const box = layerRefs.current.get(selected)?.getBBox(); setBounds(box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null); } catch { setBounds(null); } }, [scene, selected]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  useEffect(() => { const keydown = (event: KeyboardEvent) => { if ((event.target as HTMLElement)?.matches("input, textarea, select")) return; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); } }; window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown); }, [undo, redo]);
  function point(event: React.PointerEvent<SVGSVGElement | SVGGElement | SVGRectElement>) { const matrix = svg.current?.getScreenCTM(); if (!matrix) return { x: 0, y: 0 }; return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); }
  function begin(event: React.PointerEvent<SVGGElement | SVGRectElement>, layer: Layer, mode: "move" | "resize") { event.stopPropagation(); if (layer.background) { setSelected(layer.id); return; } setSelected(layer.id); const p = point(event); drag.current = { id: layer.id, mode, startX: p.x, startY: p.y, original: copy(scene), originalLayer: copy(layer), size: Math.max(bounds?.width || 100, bounds?.height || 100) }; svg.current?.setPointerCapture(event.pointerId); }
  function move(event: React.PointerEvent<SVGSVGElement>) { const d = drag.current; if (!d) return; const p = point(event); const dx = p.x - d.startX, dy = p.y - d.startY; let next = { ...d.originalLayer }; if (d.mode === "move") { next.x += dx; next.y += dy; if (snap) { next.x = Math.round(next.x / 10) * 10; next.y = Math.round(next.y / 10) * 10; } } else next.scale = Math.max(.05, Math.min(10, d.originalLayer.scale + Math.max(dx, dy) / d.size)); setScene({ ...d.original, layers: d.original.layers.map(l => l.id === d.id ? next : l) }); }
  function end(event: React.PointerEvent<SVGSVGElement>) { const d = drag.current; if (!d) return; if (event.type === "pointercancel") setScene(d.original); else { setPast(p => [...p.slice(-79), d.original]); setFuture([]); setDirty(true); setNotice(""); } drag.current = null; if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId); }
  function reorder(direction: number) { if (!active) return; const layers = [...scene.layers]; const index = layers.findIndex(l => l.id === active.id); const target = index + direction; if (target < 0 || target >= layers.length) return; [layers[index], layers[target]] = [layers[target], layers[index]]; commit({ ...scene, layers }); }
  function align(axis: "x" | "y") { if (!active || !bounds) return; const value = axis === "x" ? scene.width / 2 - (bounds.x + bounds.width / 2) * active.scale : scene.height / 2 - (bounds.y + bounds.height / 2) * active.scale; update({ [axis]: value }); }
  function addText() { if (scene.layers.length >= 80) return; const layer: Layer = { id: crypto.randomUUID(), type: "text", attrs: { x: "400", y: "250", "text-anchor": "middle", "font-family": "Arial", "font-size": "48", "font-weight": "700", fill: "#19263b" }, text: "Your text", x: scene.width / 2 - 400, y: scene.height / 2 - 250, scale: 1, hidden: false, background: false }; commit({ ...scene, layers: [...scene.layers, layer] }); setSelected(layer.id); }
  function background(transparent: boolean) { const existing = scene.layers.find(l => l.background); if (existing) commit({ ...scene, layers: scene.layers.map(l => l.id === existing.id ? { ...l, hidden: transparent } : l) }); else if (!transparent) commit({ ...scene, layers: [{ id: crypto.randomUUID(), type: "rect", attrs: { width: String(scene.width), height: String(scene.height), fill: "#ffffff" }, text: "", x: 0, y: 0, scale: 1, hidden: false, background: true }, ...scene.layers] }); }
  async function save() { if (!db) return; setSaving(true); setError(""); try { const auth = await db.auth.getUser(); if (!auth.data.user) throw new Error("Please sign in again before saving."); const markup = serialize(scene); const result = await db.rpc("save_logo_version", { p_concept: conceptId, p_canvas: scene, p_svg: markup }); if (result.error) throw result.error; setVersions(v => [result.data as Version, ...v].slice(0, 30)); setDirty(false); setNotice("Version saved to your account."); } catch (e) { setError(e instanceof Error ? e.message : "Could not save this version."); } finally { setSaving(false); } }
  function restore(version: Version) { try { commit(validScene(version.canvas_state) || parseSvg(version.svg_markup)); setSelected(null); setNotice("Version restored. Save to keep it as the latest version."); } catch { setError("This saved version could not be opened."); } }
  async function exportPng() { setError(""); const source = URL.createObjectURL(new Blob([serialize(scene)], { type: "image/svg+xml" })); const image = new Image(); image.onload = () => { const canvas = document.createElement("canvas"); const scale = Math.min(2, 4096 / Math.max(scene.width, scene.height)); canvas.width = scene.width * scale; canvas.height = scene.height * scale; canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height); canvas.toBlob(blob => { if (blob) download(blob, "logova-logo.png"); else setError("PNG export failed."); }, "image/png"); URL.revokeObjectURL(source); }; image.onerror = () => { URL.revokeObjectURL(source); setError("PNG export failed. Try SVG export."); }; image.src = source; }

  return <main className="le-shell"><header className="le-header"><a href="/studio">← LOGOVA Studio</a><div><strong>{title}</strong><small>{dirty ? "Unsaved changes" : "Vector editor"}</small></div><button onClick={save} disabled={saving || loading || !signedIn || !scene.layers.length}>{saving ? "Saving…" : "Save version"}</button></header>
    {error && <div role="alert" className="le-alert">{error}</div>}{notice && <div role="status" className="le-notice">{notice}</div>}
    {loading ? <p role="status" className="le-empty">Opening your logo…</p> : !signedIn ? <section className="le-empty"><h1>Sign in to edit your logos</h1><a href="/payments">Sign in →</a></section> : !scene.layers.length ? <section className="le-empty"><h1>No editable artwork</h1><a href="/studio">Back to your logos</a></section> : <>
      <div className="le-toolbar"><button disabled={!past.length} onClick={undo}>↶ Undo</button><button disabled={!future.length} onClick={redo}>↷ Redo</button><button onClick={addText}>+ Text</button><label><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)}/> Grid</label><label><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)}/> Snap 10px</label><label>Zoom <select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[50, 75, 100, 125, 150, 200].map(n => <option value={n} key={n}>{n}%</option>)}</select></label><button onClick={() => download(new Blob([serialize(scene)], { type: "image/svg+xml" }), "logova-logo.svg")}>SVG ↓</button><button onClick={exportPng}>PNG ↓</button></div>
      <div className="le-layout"><aside className="le-panel le-layers"><h2>Layers</h2><p>Top layer is in front.</p><div className="le-layer-list">{[...scene.layers].reverse().map(layer => <button key={layer.id} className={selected === layer.id ? "selected" : ""} onClick={() => setSelected(layer.id)} aria-pressed={selected === layer.id}><span>{layer.type === "text" ? "T" : "◇"}</span><strong>{layer.background ? "Background" : layer.type === "text" ? layer.text || "Text" : layer.type}</strong>{layer.hidden && <small>Hidden</small>}</button>)}</div><label className="le-toggle"><input type="checkbox" checked={!scene.layers.some(l => l.background && !l.hidden)} onChange={e => background(e.target.checked)}/> Transparent background</label></aside>
      <section className="le-stage" aria-label="Logo canvas"><div className="le-canvas" style={{ width: `${zoom}%`, minWidth: `${zoom * 3}px` }}><svg ref={svg} viewBox={`0 0 ${scene.width} ${scene.height}`} role="img" aria-label="Editable logo canvas. Select layers and use the properties panel for keyboard editing." onPointerDown={() => setSelected(null)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        {grid && <><defs><pattern id="le-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#9aa6b4" strokeWidth=".5"/></pattern></defs></>}
        {scene.layers.filter(l => !l.hidden).map(layer => <g key={layer.id} transform={transform(layer)} onPointerDown={e => begin(e, layer, "move")} style={{ cursor: layer.background ? "default" : "move" }}><g ref={node => { if (node) layerRefs.current.set(layer.id, node); else layerRefs.current.delete(layer.id); }}>{renderLayer(layer)}</g></g>)}
        {grid && <rect width={scene.width} height={scene.height} fill="url(#le-grid)" opacity=".4" pointerEvents="none"/>}
        {grid && <g pointerEvents="none" stroke="#ff7a00" strokeDasharray="5 7" strokeWidth="1" opacity=".55"><path d={`M${scene.width / 2} 0V${scene.height}M0 ${scene.height / 2}H${scene.width}`}/></g>}
        {active && !active.hidden && bounds && <g transform={transform(active)}><rect x={bounds.x - 4} y={bounds.y - 4} width={bounds.width + 8} height={bounds.height + 8} fill="none" stroke="#ff7a00" strokeWidth={2 / active.scale} pointerEvents="none"/>{!active.background && <rect x={bounds.x + bounds.width - 5} y={bounds.y + bounds.height - 5} width={12 / active.scale} height={12 / active.scale} fill="#ff7a00" stroke="white" strokeWidth="2" style={{ cursor: "nwse-resize" }} onPointerDown={e => begin(e, active, "resize")}/>}</g>}
      </svg></div><p className="le-stage-note">Drag an object to move it. Use its orange corner to resize.</p></section>
      <aside className="le-panel le-properties"><h2>Properties</h2>{!active ? <p>Select a layer to edit its appearance and position.</p> : <><label>Name / content{active.type === "text" ? <input maxLength={200} value={active.text} onChange={e => update({ text: e.target.value })}/> : <input value={active.type} readOnly/>}</label>{active.type === "text" && <><label>Font<select value={fonts.includes(active.attrs["font-family"]) ? active.attrs["font-family"] : "Arial"} onChange={e => updateAttr("font-family", e.target.value)}>{fonts.map(font => <option key={font}>{font}</option>)}</select></label><div className="le-fields"><label>Text size<input type="number" min="8" max="300" value={active.attrs["font-size"] || 48} onChange={e => updateAttr("font-size", String(Math.max(8, Math.min(300, Number(e.target.value)))))}/></label><label>Weight<select value={active.attrs["font-weight"] || "400"} onChange={e => updateAttr("font-weight", e.target.value)}><option value="400">Regular</option><option value="700">Bold</option></select></label></div></>}
      <div className="le-fields"><label>Fill<input aria-label="Fill color" type="color" value={/^#[0-9a-f]{6}$/i.test(active.attrs.fill || "") ? active.attrs.fill : "#19263b"} onChange={e => updateAttr("fill", e.target.value)}/></label><label>Stroke<input aria-label="Stroke color" type="color" value={/^#[0-9a-f]{6}$/i.test(active.attrs.stroke || "") ? active.attrs.stroke : "#19263b"} onChange={e => updateAttr("stroke", e.target.value)}/></label></div><label><input type="checkbox" checked={active.attrs.fill === "none"} onChange={e => updateAttr("fill", e.target.checked ? "none" : "#19263b")}/> No fill</label><label>Stroke width<input type="number" min="0" max="40" value={active.attrs["stroke-width"] || 0} onChange={e => updateAttr("stroke-width", String(Math.max(0, Math.min(40, Number(e.target.value)))))}/></label>
      <div className="le-fields"><label>X offset<input type="number" value={Math.round(active.x)} onChange={e => update({ x: finite(e.target.value) })}/></label><label>Y offset<input type="number" value={Math.round(active.y)} onChange={e => update({ y: finite(e.target.value) })}/></label></div><label>Scale %<input type="number" min="5" max="1000" value={Math.round(active.scale * 100)} onChange={e => update({ scale: Math.max(.05, Math.min(10, Number(e.target.value) / 100)) })}/></label><div className="le-actions"><button onClick={() => align("x")}>Center X</button><button onClick={() => align("y")}>Center Y</button><button onClick={() => reorder(1)}>Forward ↑</button><button onClick={() => reorder(-1)}>Backward ↓</button><button onClick={() => update({ hidden: !active.hidden })}>{active.hidden ? "Show" : "Hide"}</button><button disabled={scene.layers.length <= 1} onClick={() => { commit({ ...scene, layers: scene.layers.filter(l => l.id !== active.id) }); setSelected(null); }}>Delete layer</button></div></>}
      <details className="le-history"><summary>Version history ({versions.length})</summary>{versions.length ? versions.map(version => <button key={version.id} onClick={() => restore(version)}>{new Date(version.created_at).toLocaleString()}<span>Restore →</span></button>) : <p>Save your first version to begin a history.</p>}</details></aside></div>
    </>}
  </main>;
}
