import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import SpriteText from "three-spritetext";

// 3D view of the relationship map (loaded on demand). Drag rotates, scroll zooms, right-drag pans.
let glowTex;
const glow = () => {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.3, "rgba(255,255,255,.4)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return (glowTex = new THREE.CanvasTexture(c));
};
// the logo's centre emblem (concentric rings), used for the seed node
let ringTex;
const emblem = () => {
  if (ringTex) return ringTex;
  const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d"), ring = (r, col, w, dash = []) => { x.beginPath(); x.arc(128, 128, r, 0, 7); x.strokeStyle = col; x.lineWidth = w; x.setLineDash(dash); x.stroke(); };
  ring(122, "#3f0a19", 2.5, [2, 7]); ring(104, "#94ba65", 9, [22, 12]); ring(92, "#3f0a19", 4, [7, 16]); ring(78, "#e9ecef", 10);
  return (ringTex = new THREE.CanvasTexture(c));
};
const geo = {};
const solid = (kind, shapes) => {
  const k = shapes ? kind : "pub";
  return geo[k] ||= k === "tag" ? new THREE.BoxGeometry(1.7, 1.7, 1.7) : k === "category" ? new THREE.OctahedronGeometry(1.3) : k === "author" ? new THREE.ConeGeometry(1.15, 2.2, 4) : k === "collection" ? new THREE.BoxGeometry(2.4, 1.6, 0.6) : new THREE.SphereGeometry(1, 24, 16);
};

// rings: nodes on spherical shells by steps from the seed
function shells(nodes, links, seed) {
  const depth = new Map([[seed, 0]]), q = [seed];
  while (q.length) { const c = q.shift(); links.forEach((l) => { for (const [p, o] of [[l.source, l.target], [l.target, l.source]]) if (p === c && !depth.has(o)) { depth.set(o, depth.get(c) + 1); q.push(o); } }); }
  const by = new Map(); nodes.forEach((n) => { const d = depth.get(n.id) ?? 3; by.set(d, [...(by.get(d) || []), n]); });
  by.forEach((arr, d) => arr.forEach((n, i) => {
    if (!d) { n.fx = n.fy = n.fz = 0; return; }
    const y = 1 - (2 * (i + 0.5)) / arr.length, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    n.fx = Math.cos(a) * r * d * 60; n.fy = y * d * 60; n.fz = Math.sin(a) * r * d * 60;
  }));
}

// circuit: the logo's circuit board in 3D. Seed in the middle, neighbours in columns left and right, one row each,
// every kind on its own board (z); traces run straight with one 45-degree bend
const BOARD = { pub: 0, tag: 36, category: -36, author: 72, collection: -72 };
function circuit(nodes, links, seed) {
  const depth = new Map([[seed, 0]]), q = [seed];
  while (q.length) { const c = q.shift(); links.forEach((l) => { for (const [p, o] of [[l.source, l.target], [l.target, l.source]]) if (p === c && !depth.has(o)) { depth.set(o, depth.get(c) + 1); q.push(o); } }); }
  const by = new Map(); nodes.forEach((n) => { const d = depth.get(n.id) ?? 3; by.set(d, [...(by.get(d) || []), n]); });
  by.forEach((arr, d) => [0, 1].forEach((s) => { const col = d ? arr.filter((_, i) => i % 2 === s) : s ? [] : arr; col.forEach((n, i) => { n.fx = d ? (s ? 1 : -1) * d * 80 : 0; n.fy = d ? (i - (col.length - 1) / 2) * 26 : 0; n.fz = d ? BOARD[n.kind] ?? 0 : 0; }); }));
}
const trace3 = (a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, ax = Math.abs(dx), ay = Math.abs(dy), sx = Math.sign(dx), sy = Math.sign(dy), P = (x, y, z) => [x, y, z];
  if (!dx) return [P(a.x, a.y, a.z), P(a.x + 14, a.y, a.z), P(a.x + 14, b.y, b.z), P(b.x, b.y, b.z)];
  if (ax >= ay) { const h = (ax - ay) / 2; return [P(a.x, a.y, a.z), P(a.x + sx * h, a.y, a.z), P(a.x + sx * (h + ay), b.y, b.z), P(b.x, b.y, b.z)]; }
  return [P(a.x, a.y, a.z), P(b.x, a.y + sy * ax, b.z), P(b.x, b.y, b.z)];
};
const Graph3D = forwardRef(function Graph3D({ nodes: all, links: allLinks, seed, colors, mode, shapes, focus, sel, marked, onSelect, onHover, height, low }, ref) {
  // performance guard: at most CAP nodes (seed first, the rest in build order) and only links between kept nodes
  const CAP = low ? 120 : 300, keep = all.length > CAP ? new Set([seed, ...all.map((n) => n.id)].slice(0, CAP)) : null;
  const nodes = useMemo(() => keep ? all.filter((n) => keep.has(n.id)) : all, [all, CAP]), links = useMemo(() => keep ? allLinks.filter((l) => keep.has(l.source.id) && keep.has(l.target.id)) : allLinks, [allLinks, CAP]);
  const box = useRef(null), fg = useRef(null), st = useRef({}), [gen, setGen] = useState(0), [lost, setLost] = useState(false);
  st.current = { focus, sel, marked, colors, shapes, onSelect, onHover, low };
  useImperativeHandle(ref, () => ({
    png() { const f = fg.current; f.renderer().render(f.scene(), f.camera()); return f.renderer().domElement.toDataURL("image/png"); },
    reset() { fg.current?.zoomToFit(600, 40); },
  }));
  const lit = () => { const { focus: f } = st.current; if (!f) return null; const s = new Set([f]); fg.current.graphData().links.forEach((l) => { if (l.source.id === f) s.add(l.target.id); if (l.target.id === f) s.add(l.source.id); }); return s; };
  const make = (n) => {
    const { colors: C, shapes: sh, sel: sl, marked: mk } = st.current, L = lit(), dim = L && !L.has(n.id), col = C[n.kind], r = (n.kind === "pub" ? 4 : 4 + Math.min(4, Math.sqrt(n.n))) * (n.id === seed ? 1.5 : 1);
    const g = new THREE.Group(), o = dim ? 0.15 : 1;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: col, transparent: true, opacity: 0.45 * o, depthWrite: false }));
    halo.scale.setScalar(r * 4.5); halo.raycast = () => {}; if (!st.current.low) g.add(halo);
    const body = new THREE.Mesh(solid(n.kind, sh), new THREE.MeshLambertMaterial({ color: n.id === sl ? "#000000" : col, emissive: col, emissiveIntensity: 0.35, transparent: true, opacity: 0.95 * o }));
    body.scale.setScalar(r); g.add(body);
    if (n.id === seed) { const em = new THREE.Sprite(new THREE.SpriteMaterial({ map: emblem(), transparent: true, depthWrite: false })); em.scale.setScalar(r * 5); em.raycast = () => {}; g.add(em); }
    if (mk(n)) { const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: "#f2b705", transparent: true, opacity: 0.9 * o, depthWrite: false })); ring.scale.setScalar(r * 3); ring.raycast = () => {}; g.add(ring); }
    if (n.id === seed || !L || L.has(n.id) || n.kind !== "pub") {
      const t = new SpriteText(n.label.length > 30 ? n.label.slice(0, 29) + "…" : n.label, n.id === seed ? 7 : 5.2, "#3f0a19");
      t.fontFace = "Lato, sans-serif"; t.fontSize = 220; t.fontWeight = n.id === seed ? "700" : "400"; t.backgroundColor = "rgba(255,255,255,.95)"; t.padding = [2, 1]; t.borderRadius = 3;
      t.material.depthWrite = false; t.material.opacity = Math.max(o, 0.6); t.position.y = -(r + 7); t.raycast = () => {}; g.add(t);
    }
    return g;
  };
  const circ = useRef(false);
  const mkLink = (l) => {
    const t = touch(l), dimmed = st.current.focus && !t, m = new THREE.LineBasicMaterial({ color: "#94ba65", transparent: true, opacity: t ? 1 : dimmed ? 0.12 : 0.7 }), grp = new THREE.Group();
    grp.add(new THREE.Line(new THREE.BufferGeometry(), m));
    if (l.rel) { const s = new SpriteText(l.rel.length > 28 ? l.rel.slice(0, 27) + "…" : l.rel, 3.4, "#5b6480"); s.fontFace = "Lato, sans-serif"; s.fontSize = 200; s.backgroundColor = "rgba(255,255,255,.85)"; s.padding = [1, 0.5]; s.material.depthWrite = false; s.material.opacity = dimmed ? 0.15 : 1; s.raycast = () => {}; grp.add(s); }
    return grp;
  };
  const place = (obj, { start, end }) => {
    const pts = trace3(start, end), mid = pts.length === 4 ? [(pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2, (pts[1][2] + pts[2][2]) / 2] : pts[1];
    obj.children[0].geometry.setFromPoints(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))); obj.children[1]?.position.set(...mid); return true;
  };
  const refresh = () => { const f = fg.current; if (!f) return; f.nodeThreeObject(make); f.linkWidth(width).linkColor(linkCol); if (circ.current) f.linkThreeObject(mkLink); };
  const touch = (l) => { const { focus: f } = st.current; return f && (l.source.id === f || l.target.id === f); };
  const width = (l) => (touch(l) ? 2.2 : l.weak ? 0.25 : 0.6);
  const linkCol = (l) => (touch(l) ? "#94ba65" : st.current.focus ? "rgba(148,186,101,.12)" : "rgba(148,186,101,.6)");

  useEffect(() => {
    const f = ForceGraph3D()(box.current).backgroundColor("#f7f8fb").showNavInfo(false).nodeLabel((n) => `${n.kind}: ${n.label}`).linkLabel((l) => `${l.source.label} → ${l.rel || "linked"} → ${l.target.label}`)
      .linkDirectionalParticles(0).onNodeClick((n) => st.current.onSelect(n.id)).onBackgroundClick(() => st.current.onSelect(null)).onNodeHover((n) => st.current.onHover(n ? n.id : null));
    f.scene().add(new THREE.AmbientLight(0xffffff, 1.6));
    fg.current = f;
    const vis = () => (document.hidden ? f.pauseAnimation() : f.resumeAnimation()); document.addEventListener("visibilitychange", vis);
    // GPU reset or driver crash: keep the canvas, wait for the browser to restore the context, then rebuild the graph
    const cv = f.renderer().domElement, lost = (e) => { e.preventDefault(); f.pauseAnimation(); setLost(true); }, back = () => { setLost(false); setGen((n) => n + 1); };
    cv.addEventListener("webglcontextlost", lost); cv.addEventListener("webglcontextrestored", back);
    return () => { cv.removeEventListener("webglcontextlost", lost); cv.removeEventListener("webglcontextrestored", back); document.removeEventListener("visibilitychange", vis); f._destructor?.(); box.current && (box.current.innerHTML = ""); fg.current = null; };
  }, [gen]);
  useEffect(() => {
    const f = fg.current, el = box.current; if (!f) return;
    f.width(el.clientWidth).height(height);
    const ro = new ResizeObserver(() => f.width(el.clientWidth)); ro.observe(el);
    return () => ro.disconnect();
  }, [height, gen]);
  useEffect(() => {
    const f = fg.current; if (!f) return;
    const ns = nodes.map((n) => ({ ...n })), ls = links.map((l) => ({ source: l.source.id, target: l.target.id, rel: l.rel }));
    if (mode === "rings") shells(ns, ls, seed);
    circ.current = mode === "circuit";
    if (circ.current) { circuit(ns, ls, seed); f.linkThreeObject(mkLink).linkPositionUpdate(place); } else { f.linkThreeObject(undefined).linkPositionUpdate(undefined); }
    f.nodeThreeObject(make).linkWidth(width).linkColor(linkCol).linkOpacity(0.8).graphData({ nodes: ns, links: ls });
    f.d3Force("charge")?.strength(-90); f.d3Force("link")?.distance(38);
    const t = [setTimeout(() => f.zoomToFit(600, 40), 900), setTimeout(() => f.zoomToFit(500, 30), 2800)];
    return () => t.forEach(clearTimeout);
  }, [nodes, links, mode, seed, gen]);
  useEffect(() => { const f = fg.current; if (!f) return; f.cooldownTime(low ? 3000 : 15000); f.renderer().setPixelRatio(low ? 1 : Math.min(2, devicePixelRatio)); refresh(); }, [low, gen]);
  useEffect(refresh, [focus, sel, shapes, marked]);
  return <>{lost && <p role="status" className="px-3 py-1 text-xs text-ink-3">The graphics were reset; the 3D map comes back when the browser restores them.</p>}{keep && <p className="px-3 py-1 text-xs text-ink-3">Showing {CAP} of {all.length} nodes in 3D (performance guard); the 2D map shows all.</p>}<div ref={box} style={{ height }} className="w-full" /></>;
});
export default Graph3D;
