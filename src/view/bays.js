/* Технические отсеки: двигательный (под капотом), РЛС (под обтекателем), закабинный
   и гидравлический. Набор каркаса, трубопроводы, жгуты, блоки с разъёмами — то, что видит
   техник при снятых панелях. */
import * as THREE from "three";
import { gridSurface, range, mergeAll, tube, cyl, box, rbox, torus, sphere, latheX, sePoint, place } from "./geo.js";
import { NAC, COWL, CORE, HOLES } from "./mig29dims.js";
import { canvas, texFromCanvas, mulberry32 } from "./tex.js";

const TAU = Math.PI * 2;
/* прямой стержень между точками */
export function rod(a, b, r, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(A.x, A.y, A.z);
  return g;
}
/* хомуты на трубе через равные доли */
function clamps(pts, r, n = 3) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "centripetal"), out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), p = c.getPoint(t), d = c.getTangent(t);
    const g = new THREE.TorusGeometry(r * 1.35, r * 0.35, 5, 12);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d)); g.translate(p.x, p.y, p.z); out.push(g);
  }
  return out;
}
/* блок радиоэлектроники: корпус, ручки, разъёмы на лицевой стороне (лицом к +x) */
function avUnit(x, y, z, w, h, d, rnd) {
  const body = rbox(d, h, w, 0.008, x, y, z);
  const handles = [tube([[x + d / 2, y + h * 0.3, z - w * 0.3], [x + d / 2 + 0.03, y + h * 0.3, z - w * 0.3], [x + d / 2 + 0.03, y - h * 0.3, z - w * 0.3], [x + d / 2, y - h * 0.3, z - w * 0.3]], 0.005, 8, 5),
    tube([[x + d / 2, y + h * 0.3, z + w * 0.3], [x + d / 2 + 0.03, y + h * 0.3, z + w * 0.3], [x + d / 2 + 0.03, y - h * 0.3, z + w * 0.3], [x + d / 2, y - h * 0.3, z + w * 0.3]], 0.005, 8, 5)];
  const conns = [];
  const n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) conns.push(cyl(0.018, 0.018, 0.03, "x", x + d / 2 + 0.015, y + (rnd() - 0.5) * h * 0.4, z + (i - (n - 1) / 2) * w * 0.25, 12));
  return { body, handles: mergeAll(handles), conns: mergeAll(conns) };
}
/* текстура силового шпангоута с заклёпочными швами */
function bulkheadTexture() {
  const S = 512, c = canvas(S, S), g = c.getContext("2d"), rnd = mulberry32(19);
  g.fillStyle = "#8a9092"; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "0,0,0"},${rnd() * 0.05})`; g.fillRect(rnd() * S, rnd() * S, 3, 3); }
  g.strokeStyle = "rgba(40,44,46,0.8)"; g.lineWidth = 3;
  for (const r of [0.22, 0.42, 0.47]) { g.beginPath(); g.arc(S / 2, S / 2, r * S, 0, TAU); g.stroke(); }
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * 0.22 * S, S / 2 + Math.sin(a) * 0.22 * S); g.lineTo(S / 2 + Math.cos(a) * 0.47 * S, S / 2 + Math.sin(a) * 0.47 * S); g.stroke(); }
  g.fillStyle = "rgba(210,214,212,0.9)";
  for (const r of [0.2, 0.24, 0.4, 0.44, 0.455]) for (let k = 0; k < Math.round(r * 160); k++) { const a = (k / Math.round(r * 160)) * TAU; g.beginPath(); g.arc(S / 2 + Math.cos(a) * r * S, S / 2 + Math.sin(a) * r * S, 1.6, 0, TAU); g.fill(); }
  return texFromCanvas(c, { clamp: true });
}

/* ═══════════ двигательный отсек (правый; левый — зеркально) ═══════════ */
export function engineBay() {
  const t0 = COWL.t1 - 0.04, t1 = COWL.t0 + TAU + 0.04, ts = range(t0, t1, 30);
  const pt = (x, t, ins) => { const p = NAC(x); const q = { ...p, w: p.w - ins, ht: p.ht - ins, hb: p.hb - ins }; const [y, z] = sePoint(q, t); return [x, y, z]; };
  // обшивка изнутри (только верхняя часть — нижняя открыта снятым капотом)
  const liner = gridSurface((x, t) => pt(x, t, 0.02), range(COWL.x0 - 0.04, COWL.x1 + 0.04, 22), ts);
  // шпангоуты: стенка и полка
  const frames = [];
  for (const x of [-0.35, -1.25, -2.2, -3.15, -4.05]) {
    frames.push(gridSurface((t, k) => pt(x, t, 0.02 + k * 0.05), ts, [0, 1]));
    frames.push(gridSurface((t, k) => { const p = pt(x, t, 0.07); return [x - 0.02 + k * 0.04, p[1], p[2]]; }, ts, [0, 1]));
  }
  // стрингеры
  const str = [];
  for (const t of [COWL.t1 + 0.3, Math.PI * 2, COWL.t0 + TAU - 0.3]) str.push(gridSurface((x, k) => pt(x, t, 0.02 + k * 0.03), range(COWL.x0, COWL.x1, 8), [0, 1]));
  // узлы подвески двигателя
  const p0 = NAC(-1.5), cz = p0.cz, cy = p0.cy;
  const mounts = [rod([-0.4, cy + 0.38, cz], [-0.4, cy + p0.ht - 0.08, cz], 0.022), rod([-0.4, cy + 0.36, cz - 0.12], [-0.4, cy + p0.ht - 0.1, cz - 0.3], 0.018),
    rod([-3.1, cy + 0.36, cz + 0.12], [-3.1, cy + 0.2, cz + p0.w - 0.08], 0.02), rod([-3.1, cy + 0.36, cz - 0.12], [-3.1, cy + 0.2, cz - p0.w + 0.08], 0.02)];
  // жгуты и трубопроводы по стенке отсека
  const wallRun = (t, ins, x0, x1) => range(x0, x1, 8).map((x) => pt(x, t, ins));
  const harness = [tube(wallRun(COWL.t1 + 0.25, 0.08, -0.2, -4.2), 0.014, 50, 6), tube(wallRun(COWL.t0 + TAU - 0.2, 0.085, -0.2, -3.6), 0.012, 50, 6)];
  const pipes = [tube(wallRun(COWL.t1 + 0.45, 0.085, -0.3, -4.0), 0.01, 50, 6), tube(wallRun(COWL.t0 + TAU - 0.45, 0.09, -0.5, -3.9), 0.008, 50, 6)];
  const clampsG = [...clamps(wallRun(COWL.t1 + 0.25, 0.08, -0.2, -4.2), 0.014, 7), ...clamps(wallRun(COWL.t0 + TAU - 0.2, 0.085, -0.2, -3.6), 0.012, 6)];
  return { liner, frames: mergeAll([...frames, ...str]), mounts: mergeAll(mounts), harness: mergeAll(harness), pipes: mergeAll(pipes), clamps: mergeAll(clampsG) };
}
/* обвязка двигателя (входит в снимаемые узлы компрессора и турбины) */
export function engineDressing(cyE, cz) {
  const R = 0.4;
  const comp = [
    tube([[0.0, cyE + R * 0.5, cz(0) + R * 0.85], [-0.6, cyE + R * 0.7, cz(-0.6) + R * 0.8], [-1.2, cyE + R * 0.6, cz(-1.2) + R * 0.9]], 0.018, 20, 6),
    tube([[-0.2, cyE - R * 0.9, cz(0) + R * 0.3], [-0.7, cyE - R * 0.95, cz(-0.7) + R * 0.1], [-1.3, cyE - R * 0.9, cz(-1.3) - R * 0.25]], 0.014, 20, 6),
    // трубопровод отбора воздуха
    tube([[-1.15, cyE + R * 1.02, cz(-1.15)], [-1.05, cyE + R * 1.2, cz(-1.05) + 0.05], [-0.85, cyE + R * 1.3, cz(-0.85) + 0.08]], 0.032, 16, 10),
    torus(R * 1.02, 0.012, "x", -1.15, cyE, cz(-1.15), 5, 40),
  ];
  // топливный коллектор с подводами к форсункам
  const turb = [torus(0.475, 0.011, "x", -1.72, cyE, cz(-1.72), 5, 48)];
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; turb.push(rod([-1.72, cyE + Math.cos(a) * 0.475, cz(-1.72) + Math.sin(a) * 0.475], [-1.75, cyE + Math.cos(a) * 0.45, cz(-1.75) + Math.sin(a) * 0.45], 0.006, 5)); }
  turb.push(tube([[-1.72, cyE - 0.475, cz(-1.72)], [-1.3, cyE - 0.5, cz(-1.3) - 0.05], [-0.6, cyE - 0.44, cz(-0.6) - 0.1], [-0.3, cyE - 0.42, cz(-0.3) - 0.1]], 0.012, 30, 6));
  // термопары за турбиной
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + 0.2; turb.push(cyl(0.008, 0.008, 0.06, "y", -2.95, cyE + Math.cos(a) * 0.42, cz(-2.95) + Math.sin(a) * 0.42, 5)); }
  turb.push(torus(0.43, 0.007, "x", -2.95, cyE, cz(-2.95), 4, 40));
  return { comp: mergeAll(comp), turb: mergeAll(turb) };
}

/* ═══════════ отсек РЛС: антенна Кассегрена на карданном приводе, ВЧ-блок, волноводы ═══════════ */
export function radarUnits(L) {
  const cy = 2.06, R = 0.42, f = R * R / (4 * 0.14);
  const prof = []; for (let i = 0; i <= 12; i++) { const r = (R * i) / 12; prof.push([6.78 + (r * r) / (4 * f), r]); }
  const dishM = new THREE.MeshStandardMaterial({ color: "#b3b9bd", roughness: 0.5, metalness: 0.85, side: THREE.DoubleSide });
  const dish = mergeAll([latheX(prof, 48, { cy }), torus(R, 0.012, "x", 6.78 + (R * R) / (4 * f), cy, 0, 6, 48)]);
  const back = [];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; const pts = range(0.08, R - 0.02, 6).map((r) => [6.78 + (r * r) / (4 * f) - 0.03, cy + Math.cos(a) * r, Math.sin(a) * r]); back.push(tube(pts, 0.012, 8, 4)); }
  back.push(torus(0.2, 0.012, "x", 6.785, cy, 0, 5, 32), cyl(0.09, 0.1, 0.1, "x", 6.74, cy, 0, 20));
  const feed = mergeAll([cyl(0.028, 0.04, 0.12, "x", 6.86, cy, 0, 16), cyl(0.07, 0.07, 0.015, "x", 7.08, cy, 0, 24),
    ...[0, 1, 2].map((k) => { const a = (k / 3) * TAU + Math.PI / 6; return rod([6.82 + (0.38 * 0.38) / (4 * f), cy + Math.cos(a) * 0.38, Math.sin(a) * 0.38], [7.075, cy + Math.cos(a) * 0.06, Math.sin(a) * 0.06], 0.006, 5); })]);
  // привод: стойка на шпангоуте, вилка азимута, двигатели угла места
  const drive = mergeAll([cyl(0.075, 0.09, 0.28, "x", 6.5, cy, 0, 20), box(0.06, 0.5, 0.06, 6.62, cy, 0.23), box(0.06, 0.5, 0.06, 6.62, cy, -0.23), box(0.08, 0.06, 0.52, 6.6, cy - 0.25, 0),
    cyl(0.055, 0.055, 0.1, "z", 6.64, cy, 0.29, 16), cyl(0.055, 0.055, 0.1, "z", 6.64, cy, -0.29, 16), cyl(0.06, 0.06, 0.12, "y", 6.46, cy + 0.16, 0, 16), box(0.12, 0.08, 0.1, 6.42, cy - 0.14, 0.12)]);
  const cables = mergeAll([tube([[6.33, cy + 0.2, 0.2], [6.45, cy + 0.26, 0.26], [6.6, cy + 0.12, 0.3]], 0.01, 12, 6), tube([[6.33, cy + 0.15, -0.22], [6.45, cy + 0.24, -0.27], [6.6, cy + 0.1, -0.3]], 0.01, 12, 6),
    tube([[6.33, cy - 0.1, 0.05], [6.4, cy + 0.02, 0.1], [6.46, cy + 0.12, 0.05]], 0.012, 12, 6)]);
  // волновод от ВЧ-блока к облучателю: прямоугольное сечение
  const wg = [], wp = [[6.55, 1.84, -0.05], [6.6, 1.95, -0.05], [6.62, 2.0, -0.02], [6.7, cy, 0]];
  for (let i = 0; i < wp.length - 1; i++) {
    const a = new THREE.Vector3(...wp[i]), b = new THREE.Vector3(...wp[i + 1]), d = b.clone().sub(a), len = d.length();
    const g = new THREE.BoxGeometry(0.024, len + 0.012, 0.048); g.translate(0, len / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z); wg.push(g);
  }
  // ВЧ-блок: корпус, рёбра охлаждения, ручки, разъёмы
  const hfBody = mergeAll([rbox(0.34, 0.2, 0.48, 0.015, 6.44, 1.72, 0), ...range(-0.2, 0.2, 9).map((z) => box(0.3, 0.035, 0.008, 6.44, 1.838, z))]);
  const hfDet = mergeAll([tube([[6.61, 1.78, -0.16], [6.64, 1.78, -0.16], [6.64, 1.66, -0.16], [6.61, 1.66, -0.16]], 0.006, 8, 5), tube([[6.61, 1.78, 0.16], [6.64, 1.78, 0.16], [6.64, 1.66, 0.16], [6.61, 1.66, 0.16]], 0.006, 8, 5), box(0.02, 0.06, 0.12, 6.615, 1.72, 0.0)]);
  const hfConn = mergeAll([cyl(0.022, 0.022, 0.05, "x", 6.62, 1.7, 0.08, 12), cyl(0.022, 0.022, 0.05, "x", 6.62, 1.7, -0.08, 12), cyl(0.016, 0.016, 0.05, "x", 6.62, 1.76, 0.04, 10)]);
  // силовой шпангоут с заклёпками
  const bh = new THREE.CircleGeometry(0.5, 48); bh.rotateY(Math.PI / 2); bh.translate(6.302, 2.06, 0);
  const bhMat = new THREE.MeshStandardMaterial({ map: bulkheadTexture(), roughness: 0.7, metalness: 0.3 });
  const brackets = mergeAll([box(0.05, 0.12, 0.08, 6.33, 1.72, 0.18), box(0.05, 0.12, 0.08, 6.33, 1.72, -0.18), box(0.04, 0.3, 0.05, 6.32, 2.36, 0.3), box(0.06, 0.2, 0.1, 6.33, 2.35, -0.3)]);
  return {
    drive: [[dish, dishM], [mergeAll(back), L.aluDark], [feed, L.aluDark], [drive, L.unitGrey], [mergeAll(wg), L.brass]],
    hf: [[hfBody, L.unitGrey], [hfDet, L.black], [hfConn, L.brass]],
    staticGeo: { bh, bhMat, brackets, cables },
  };
}

/* ═══════════ закабинный отсек: блоки на полке, жгуты ═══════════ */
export function avBayUnits() {
  const rnd = mulberry32(77), h = HOLES.av;
  const bodies = [], handles = [], conns = [];
  for (const [x, z, w, hh, d] of [[1.9, -0.05, 0.16, 0.16, 0.22], [1.32, -0.2, 0.14, 0.13, 0.18], [1.3, 0.05, 0.1, 0.1, 0.16]]) {
    const u = avUnit(x, 2.46 + hh / 2 + 0.005, z, w, hh, d, rnd); bodies.push(u.body); handles.push(u.handles); conns.push(u.conns);
  }
  const shelf = box(h.x1 - h.x0 - 0.04, 0.01, 0.5, (h.x0 + h.x1) / 2, 2.462, 0);
  const cab = [tube([[2.0, 2.5, 0.2], [1.8, 2.55, 0.22], [1.5, 2.52, 0.24], [1.25, 2.5, 0.22]], 0.012, 20, 6), tube([[1.95, 2.52, -0.2], [1.6, 2.56, -0.24], [1.35, 2.55, -0.22]], 0.01, 16, 6)];
  return { bodies: mergeAll(bodies), handles: mergeAll(handles), conns: mergeAll(conns), shelf, cab: mergeAll(cab) };
}

/* ═══════════ гидроотсек: гидроаккумуляторы, насосная станция, трубопроводы ═══════════ */
export function hydroBayUnits() {
  const acc = mergeAll([sphere(0.09, -0.95, 1.94, 0.24, 1, 1, 1, 18, 12), cyl(0.09, 0.09, 0.12, "y", -0.95, 1.99, 0.24, 18), sphere(0.08, 0.05, 1.95, -0.25, 1, 1, 1, 16, 12), cyl(0.08, 0.08, 0.1, "y", 0.05, 2.0, -0.25, 16)]);
  const pump = mergeAll([cyl(0.07, 0.07, 0.18, "x", -0.2, 1.97, 0.26, 16), box(0.1, 0.1, 0.1, -0.05, 1.97, 0.26)]);
  const pipes = mergeAll([tube([[-0.95, 1.86, 0.24], [-0.7, 1.84, 0.2], [-0.4, 1.86, 0.25], [-0.2, 1.9, 0.26]], 0.012, 16, 6), tube([[0.05, 1.87, -0.25], [-0.2, 1.84, -0.2], [-0.5, 1.83, -0.2], [-0.8, 1.86, -0.22]], 0.012, 16, 6),
    tube([[-1.1, 1.95, 0.0], [-0.6, 2.0, 0.02], [0.1, 1.98, 0.0]], 0.01, 16, 6)]);
  return { acc, pump, pipes };
}
