/* Кабина МиГ-29БМ. Ванна кабины со шпангоутами и обшивкой, приборная доска из центральной
   секции, двух крыльев и боковых щитков, противобликовый козырёк с ИЛС-31, боковые пульты,
   вертикальные щитки (АЗС), РУС, РУД, педали, зеркала заднего вида.
   Панели рисуются в общий атлас: каждая панель задаёт раскладку органов управления,
   по которой и рисуются надписи/шкалы, и строятся объёмные тумблеры, галетники и приборы. */
import * as THREE from "three";
import { box, rbox, cyl, torus, tube, mergeAll, place, gridSurface, range, sePoint } from "./geo.js";
import { CORE, canopyTop, CANOPY, canopyPt, canopyYAt } from "./mig29dims.js";
import { canvas, texFromCanvas, mulberry32, TEX } from "./tex.js";
import * as ART from "./cockpitArt.js";

const D = Math.PI / 180;
export const FLOOR = 1.98, CONY = 2.40;
export const EYE = new THREE.Vector3(3.17, 3.0, 0);
const INSET = 0.035;

/* полуширина внутреннего контура кабины на высоте y */
export function wallZ(x, y) {
  const p = CORE(x), up = y >= p.cy, h = (up ? p.ht : p.hb) - INSET, n = up ? p.nt : p.nb, w = p.w - INSET;
  const k = Math.min(1, Math.abs(y - p.cy) / h);
  return w * Math.pow(Math.max(0, 1 - Math.pow(k, n)), 1 / n);
}
const sill = (x) => sePoint(CORE(x), 50 * D);          // [y, z] кромки выреза кабины
/* внутренняя поверхность остекления (для проверки зазоров) */
const glassY = (x, z) => canopyYAt(x, z) - 0.02;

/* ═══════════ панель: плоский щиток с локальной системой (u вправо, v вверх, n к лётчику) ═══════════ */
class Panel {
  constructor(name, o, U, V, w, h, bg = "#4d9092") {
    this.name = name; this.o = o.clone(); this.U = U.clone().normalize(); this.V = V.clone().normalize();
    this.N = new THREE.Vector3().crossVectors(this.U, this.V).normalize();
    this.w = w; this.h = h; this.bg = bg; this.art = []; this.b3 = [];
  }
  p(u, v, n = 0) { return this.o.clone().addScaledVector(this.U, u).addScaledVector(this.V, v).addScaledVector(this.N, n); }
  basis() { return new THREE.Matrix4().makeBasis(this.U, this.V, this.N); }
  quat() { return new THREE.Quaternion().setFromRotationMatrix(this.basis()); }
  /* перенос геометрии из локальной системы органа управления (ось z — нормаль панели) */
  put(geo, u, v, n = 0, rz = 0) {
    const m = this.basis(); m.setPosition(this.p(u, v, n));
    if (rz) m.multiply(new THREE.Matrix4().makeRotationZ(rz));
    geo.applyMatrix4(m); return geo;
  }
}

/* рисование панели в атласе в метрах: v — вверх */
function painter(g, gE, px, py, K, h) {
  const X = (u) => px + u * K, Y = (v) => py + (h - v) * K;
  const ctx = (e) => (e ? gE : g);
  return {
    K, X, Y,
    rect(u0, v0, u1, v1, col, e) { const c = ctx(e); c.fillStyle = col; c.fillRect(X(u0), Y(v1), (u1 - u0) * K, (v1 - v0) * K); },
    frame(u0, v0, u1, v1, col, lw) { g.strokeStyle = col; g.lineWidth = lw * K; g.strokeRect(X(u0), Y(v1), (u1 - u0) * K, (v1 - v0) * K); },
    circle(u, v, r, col, e) { const c = ctx(e); c.fillStyle = col; c.beginPath(); c.arc(X(u), Y(v), r * K, 0, Math.PI * 2); c.fill(); },
    ring(u, v, r, col, lw) { g.strokeStyle = col; g.lineWidth = lw * K; g.beginPath(); g.arc(X(u), Y(v), r * K, 0, Math.PI * 2); g.stroke(); },
    line(u0, v0, u1, v1, col, lw, e) { const c = ctx(e); c.strokeStyle = col; c.lineWidth = lw * K; c.beginPath(); c.moveTo(X(u0), Y(v0)); c.lineTo(X(u1), Y(v1)); c.stroke(); },
    text(s, u, v, size, col = "#f1f0e8", weight = 600, align = "center", e) {
      const c = ctx(e); c.fillStyle = col; c.font = `${weight} ${Math.max(4, size * K)}px ${ART.FONT}`; c.textAlign = align; c.textBaseline = "middle"; c.fillText(s, X(u), Y(v));
    },
  };
}
function screwDraw(pp, u, v, r = 0.0026) {
  pp.circle(u, v, r * 1.25, "rgba(0,0,0,0.35)"); pp.circle(u, v, r, "#b8bdb8"); pp.line(u - r * 0.8, v - r * 0.3, u + r * 0.8, v + r * 0.3, "#3b403e", r * 0.45);
}

/* ═══════════ органы управления: локальная геометрия (z — от панели) ═══════════ */
const G = {
  nut: () => place(new THREE.CylinderGeometry(0.0046, 0.0046, 0.0032, 6).rotateX(Math.PI / 2), 0, 0, 0.0016),
  washer: (r = 0.0062) => place(new THREE.CylinderGeometry(r, r, 0.0008, 16).rotateX(Math.PI / 2), 0, 0, 0.0004),
  bat(up = 1, len = 0.016) {
    const s = new THREE.CylinderGeometry(0.0011, 0.0019, len, 8); s.translate(0, len / 2, 0); s.rotateX(Math.PI / 2 - up * 0.42);
    const tip = new THREE.SphereGeometry(0.0021, 8, 6); tip.translate(0, len, 0); tip.rotateX(Math.PI / 2 - up * 0.42);
    return place(mergeAll([s, tip]), 0, 0, 0.003);
  },
  flatLever(up = 1) { const g = new THREE.BoxGeometry(0.0045, 0.013, 0.0022); g.translate(0, 0.0065, 0); g.rotateX(Math.PI / 2 - up * 0.5); return place(g, 0, 0, 0.002); },
  guard: () => { const g = new THREE.BoxGeometry(0.013, 0.027, 0.013); g.translate(0, 0.002, 0.0068); return g; },
  knob(r = 0.0072, h = 0.012, seg = 18) {
    const skirt = new THREE.CylinderGeometry(r * 1.35, r * 1.4, 0.0025, seg).rotateX(Math.PI / 2).translate(0, 0, 0.00125);
    const body = new THREE.CylinderGeometry(r * 0.92, r, h, seg).rotateX(Math.PI / 2).translate(0, 0, 0.0025 + h / 2);
    return mergeAll([skirt, body]);
  },
  pointer: (r = 0.0072, h = 0.012) => new THREE.BoxGeometry(0.0014, r * 0.9, 0.0006).translate(0, r * 0.45, 0.0025 + h + 0.0003),
  beak(h = 0.012) {
    const b = new THREE.BoxGeometry(0.0075, 0.024, h).translate(0, 0.004, 0.0025 + h / 2);
    const c = new THREE.CylinderGeometry(0.0078, 0.0082, h, 16).rotateX(Math.PI / 2).translate(0, 0, 0.0025 + h / 2);
    const sk = new THREE.CylinderGeometry(0.0115, 0.012, 0.0025, 20).rotateX(Math.PI / 2).translate(0, 0, 0.00125);
    return mergeAll([b, c, sk]);
  },
  cap: (w = 0.0105, h = 0.0105, d = 0.005) => rbox(w, h, d, 0.0012, 0, 0, d / 2 + 0.0012),
  capBase: (w = 0.015, h = 0.015) => rbox(w, h, 0.0024, 0.001, 0, 0, 0.0012),
  lens: (r = 0.0047) => new THREE.CylinderGeometry(r, r, 0.0045, 14).rotateX(Math.PI / 2).translate(0, 0, 0.0035),
  lensRing: (r = 0.0047) => new THREE.TorusGeometry(r + 0.0006, 0.0011, 5, 16).translate(0, 0, 0.0024),
  screw: (r = 0.0024) => new THREE.CylinderGeometry(r, r, 0.0012, 10).rotateX(Math.PI / 2).translate(0, 0, 0.0006),
};

/* стрелка прибора: вдоль +y, с хвостовиком */
function needleGeo(len, w, tail = 0.25) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -len * tail); s.lineTo(w / 2, -len * tail); s.lineTo(w * 0.38, len * 0.82); s.lineTo(0, len); s.lineTo(-w * 0.38, len * 0.82); s.closePath();
  return new THREE.ShapeGeometry(s);
}
function uvToTile(g, t) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, t.u + uv.getX(i) * t.s, t.v + uv.getY(i) * t.s);
  return g;
}

/* ═══════════ сборка кабины ═══════════ */
export function buildCockpit({ plane, air, part, L, anchors, pickables, detail = 1 }) {
  const rnd = mulberry32(558);
  const atlas = ART.gaugeAtlas();
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const tubMat = L.cockpit.clone(); tubMat.color.set("#5e9ea0"); tubMat.side = THREE.DoubleSide;
  const M = {
    tub: tubMat,
    floor: S({ color: "#2f4c4e", roughness: 0.85, metalness: 0.2, normalMap: L.cockpit.normalMap, side: THREE.DoubleSide }),
    body: S({ color: "#3e7577", roughness: 0.7, metalness: 0.15 }),
    black: S({ color: "#17191b", roughness: 0.55, metalness: 0.25 }),
    knob: S({ color: "#0f1011", roughness: 0.36, metalness: 0.05 }),
    steel: S({ color: "#d3d7da", roughness: 0.22, metalness: 1 }),
    steelDark: S({ color: "#6d7378", roughness: 0.35, metalness: 1 }),
    red: S({ color: "#a8231c", roughness: 0.42 }),
    white: S({ color: "#ecebe2", roughness: 0.45 }),
    rubber: S({ color: "#1a1b1b", roughness: 0.92, metalness: 0 }),
    glare: S({ color: "#222627", roughness: 0.93, metalness: 0.05, side: THREE.DoubleSide }),
    glass: S({ color: "#000000", roughness: 0.05, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 1.6 }),
    face: S({ map: atlas.tex, roughness: 0.5, metalness: 0 }),
    needle: S({ color: "#f3f1e6", emissive: "#fff4d6", emissiveIntensity: 0.1, roughness: 0.5, side: THREE.DoubleSide }),
    needleY: S({ color: "#f0b429", emissive: "#f0b429", emissiveIntensity: 0.08, roughness: 0.5, side: THREE.DoubleSide }),
    needleR: S({ color: "#e0452c", roughness: 0.5, side: THREE.DoubleSide }),
    mirror: S({ color: "#e6eaee", roughness: 0.02, metalness: 1 }),
    grip: S({ color: "#1b1917", roughness: 0.48, metalness: 0.05 }),
    orange: S({ color: "#ff8a1c", emissive: "#ff8a1c", emissiveIntensity: 0.15, roughness: 0.5 }),
  };
  const dyn = { needles: [], lamps: {}, screens: {}, adi: null, hsi: null, throttle: {}, hud: null };
  const addDyn = (mesh, shadow = false) => { mesh.castShadow = shadow; mesh.receiveShadow = true; plane.add(mesh); pickables.push(mesh); return mesh; };
  const A = (geo, mat, shadow = false) => air(geo, mat, { noShadow: !shadow });

  /* ─────────── ванна: борта, пол, задняя перегородка, шпангоуты, окантовка ─────────── */
  const XR = 2.725, XF = 4.32;
  {
    const xs = range(XF, XR, 24), vs = range(0, 1, 14);
    const wallR = gridSurface((x, v) => { const y = FLOOR + v * (sill(x)[0] - 0.012 - FLOOR); return [x, y, wallZ(x, y)]; }, xs, vs);
    const wallL = gridSurface((x, v) => { const y = FLOOR + v * (sill(x)[0] - 0.012 - FLOOR); return [x, y, -wallZ(x, y)]; }, xs, vs, { flip: true });
    A(wallR, M.tub); A(wallL, M.tub);
    // пол с рифлёными накладками
    A(gridSurface((x, s) => [x, FLOOR, s * wallZ(x, FLOOR)], range(XR, XF, 8), range(-1, 1, 8)), M.floor);
    for (const z of [-0.2, 0.2]) A(box(0.9, 0.012, 0.012, 3.55, FLOOR + 0.006, z), M.steelDark);
    // задняя перегородка по внутреннему контуру фюзеляжа
    const sh = new THREE.Shape(), pr = CORE(XR), yTop = pr.cy + pr.ht - INSET - 0.002, n = 28;
    for (let i = 0; i <= n; i++) { const y = FLOOR + ((yTop - FLOOR) * i) / n; const z = wallZ(XR, y); i ? sh.lineTo(z, y) : sh.moveTo(z, y); }
    for (let i = n; i >= 0; i--) { const y = FLOOR + ((yTop - FLOOR) * i) / n; sh.lineTo(-wallZ(XR, y), y); }
    const bh = new THREE.ShapeGeometry(sh); bh.rotateY(Math.PI / 2); bh.translate(XR, 0, 0);
    A(bh, M.tub);
    // направляющие кресла на перегородке
    for (const z of [-0.12, 0.12]) A(place(new THREE.BoxGeometry(0.03, 0.9, 0.04), XR + 0.02, 2.45, z, 0, 0, 0), M.steelDark);
    // шпангоуты: полка + стенка по контуру
    for (const xf of [2.8, 3.66, 3.96, 4.18]) {
      const vs2 = range(0, 1, 12);
      for (const s of [1, -1]) {
        const web = gridSurface((v, k) => { const y = FLOOR + v * (sill(xf)[0] - 0.02 - FLOOR); const z = wallZ(xf, y) - k * 0.028; return [xf, y, s * z]; }, vs2, [0, 1]);
        const flange = gridSurface((v, k) => { const y = FLOOR + v * (sill(xf)[0] - 0.02 - FLOOR); const z = wallZ(xf, y) - 0.028; return [xf - 0.015 + k * 0.03, y, s * z]; }, vs2, [0, 1]);
        A(mergeAll([web, flange]), M.tub);
      }
    }
    // окантовка выреза кабины (борт под фонарём)
    for (const s of [1, -1]) {
      const pts = range(XR, 4.94, 20).map((x) => { const [y, z] = sill(x); return [x, y - 0.014, s * (z - 0.018)]; });
      A(tube(pts, 0.019, 40, 8), M.tub);
    }
    // трубопроводы и жгуты по бортам над пультами
    for (const s of [1, -1]) {
      const run = (y, dz, r) => range(2.78, 3.66, 10).map((x) => [x, y, s * (wallZ(x, y) - dz - r)]);
      A(tube(run(2.585, 0.004, 0.006), 0.006, 30, 6), M.steelDark);
      A(tube(run(2.605, 0.004, 0.0045), 0.0045, 30, 6), s > 0 ? M.black : M.steelDark);
      for (const x of [2.9, 3.2, 3.5]) A(place(new THREE.BoxGeometry(0.012, 0.045, 0.012), x, 2.595, s * (wallZ(x, 2.595) - 0.012)), M.black);
    }
  }

  /* ─────────── приборная доска ─────────── */
  const TILT = 12 * D;
  const Vv = new THREE.Vector3(Math.sin(TILT), Math.cos(TILT), 0), Uc = new THREE.Vector3(0, 0, 1);
  const PB = new THREE.Vector3(3.93, 2.38, 0);
  const rotU = (deg) => Uc.clone().applyAxisAngle(Vv, deg * D);
  const WC = 0.34, HC = 0.44, WW = 0.25, HW = 0.42, WF = 0.15, HF = 0.25;
  const P = {};
  P.mainC = new Panel("mainC", PB.clone().addScaledVector(Uc, -WC / 2), Uc, Vv, WC, HC);
  const UR = rotU(-28), UL = rotU(28), UFR = rotU(-62), UFL = rotU(62);
  const oR = PB.clone().addScaledVector(Uc, WC / 2);
  P.mainR = new Panel("mainR", oR, UR, Vv, WW, HW);
  P.mainL = new Panel("mainL", PB.clone().addScaledVector(Uc, -WC / 2).addScaledVector(UL, -WW), UL, Vv, WW, HW);
  P.fvR = new Panel("fvR", oR.clone().addScaledVector(UR, WW), UFR, Vv, WF, HF);
  P.fvL = new Panel("fvL", P.mainL.o.clone().addScaledVector(UFL, -WF), UFL, Vv, WF, HF);
  // пульты: u — поперёк (к правому борту), v — вперёд, нормаль вверх
  const CX0 = 2.95, CX1 = 3.72, CZI = 0.29, CZO = 0.585;
  P.conL = new Panel("conL", new THREE.Vector3(CX0, CONY + 0.001, -CZO), Uc, new THREE.Vector3(1, 0, 0), CZO - CZI, CX1 - CX0);
  P.conR = new Panel("conR", new THREE.Vector3(CX0, CONY + 0.001, CZI), Uc, new THREE.Vector3(1, 0, 0), CZO - CZI, CX1 - CX0);
  // вертикальные щитки на бортах
  P.wallL = new Panel("wallL", new THREE.Vector3(3.02, 2.415, -0.548), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 0.6, 0.165);
  P.wallR = new Panel("wallR", new THREE.Vector3(3.62, 2.415, 0.548), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), 0.6, 0.165);
  // пульт управления ИЛС на лицевой стороне блока
  P.hud = new Panel("hud", new THREE.Vector3(4.008, 2.832, -0.075), Uc, new THREE.Vector3(0, 1, 0), 0.15, 0.045, "#1b1e20");

  /* ---------- раскладка ---------- */
  const lampList = [];
  const plate = (pn, u0, v0, u1, v1, title) => pn.art.push((pp) => {
    pp.rect(u0, v0, u1, v1, "rgba(255,255,255,0.035)");
    pp.frame(u0, v0, u1, v1, "rgba(10,25,26,0.75)", 0.0014);
    const d = 0.0055; for (const [u, v] of [[u0 + d, v0 + d], [u1 - d, v0 + d], [u0 + d, v1 - d], [u1 - d, v1 - d]]) screwDraw(pp, u, v);
    if (title) pp.text(title, (u0 + u1) / 2, v1 - 0.0075, 0.0052, "#f4f3ea", 600);
  });
  const label = (pn, s, u, v, size = 0.0042, col) => pn.art.push((pp) => pp.text(s, u, v, size, col));
  const tg = (pn, u, v, lab, o = {}) => {
    pn.art.push((pp) => { if (lab) pp.text(lab, u, v + 0.0145, 0.0038); if (o.pos !== false) { pp.text("▲", u + 0.009, v + 0.004, 0.0028, "#dfe"); } });
    pn.b3.push(() => {
      if (o.guard) { A(pn.put(G.guard(), u, v), M.red); A(pn.put(G.nut(), u, v - 0.012), M.steelDark); return; }
      A(pn.put(G.washer(), u, v), M.black); A(pn.put(G.nut(), u, v), M.steelDark);
      A(pn.put(o.flat ? G.flatLever(o.up ?? (rnd() > 0.4 ? 1 : -1)) : G.bat(o.up ?? (rnd() > 0.4 ? 1 : -1)), u, v), o.flat ? M.black : M.steel);
    });
  };
  const rot = (pn, u, v, lab, o = {}) => {
    const n = o.n || 6, big = o.big;
    pn.art.push((pp) => {
      const rr = big ? 0.017 : 0.013;
      for (let i = 0; i < n; i++) { const a = (-70 + (140 * i) / Math.max(1, n - 1)) * D; pp.line(u + Math.sin(a) * rr, v + Math.cos(a) * rr, u + Math.sin(a) * (rr + 0.004), v + Math.cos(a) * (rr + 0.004), "#eef", 0.0009); }
      if (lab) pp.text(lab, u, v + rr + 0.009, 0.0038);
    });
    pn.b3.push(() => {
      const a = (-70 + 140 * Math.floor(rnd() * n) / Math.max(1, n - 1)) * D;
      if (big) { A(pn.put(G.beak(), u, v, 0, -a), M.knob); A(pn.put(new THREE.BoxGeometry(0.0014, 0.012, 0.0006).translate(0, 0.009, 0.0148), u, v, 0, -a), M.white); }
      else { A(pn.put(G.knob(), u, v, 0, -a), M.knob); A(pn.put(G.pointer(), u, v, 0, -a), M.white); }
    });
  };
  const knob = (pn, u, v, lab, r = 0.0068) => {
    pn.art.push((pp) => { if (lab) pp.text(lab, u, v + r + 0.0095, 0.0038); for (let i = 0; i < 9; i++) { const a = (-135 + i * 33.75) * D; pp.line(u + Math.sin(a) * (r * 1.6), v + Math.cos(a) * (r * 1.6), u + Math.sin(a) * (r * 1.6 + 0.003), v + Math.cos(a) * (r * 1.6 + 0.003), "#eef", 0.0007); } });
    pn.b3.push(() => { const a = rnd() * 3 - 1.5; A(pn.put(G.knob(r, 0.011), u, v, 0, a), M.knob); A(pn.put(G.pointer(r, 0.011), u, v, 0, a), M.white); });
  };
  const btn = (pn, u, v, lab, mat = M.knob, w = 0.0105, h = 0.0105) => {
    if (lab) pn.art.push((pp) => pp.text(lab, u, v + h / 2 + 0.008, 0.0036));
    pn.b3.push(() => { A(pn.put(G.capBase(w + 0.0045, h + 0.0045), u, v), M.black); A(pn.put(G.cap(w, h), u, v), mat); });
  };
  const lamp = (pn, u, v, color, key, lab, r = 0.0047) => {
    if (lab) pn.art.push((pp) => pp.text(lab, u, v - r - 0.0065, 0.0034));
    pn.b3.push(() => { A(pn.put(G.lensRing(r), u, v), M.steel); lampList.push({ geo: pn.put(G.lens(r), u, v), color, key }); });
  };
  /* прямоугольный светосигнализатор с надписью (ОПАСНО / ВНИМАНИЕ) */
  const lampRect = (pn, u, v, w, h, color, key, txt) => {
    pn.art.push((pp) => { pp.rect(u - w / 2, v - h / 2, u + w / 2, v + h / 2, "#111"); });
    pn.b3.push(() => {
      A(pn.put(rbox(w + 0.006, h + 0.006, 0.004, 0.0015, 0, 0, 0.002), u, v), M.black);
      lampList.push({ geo: pn.put(new THREE.BoxGeometry(w, h, 0.004).translate(0, 0, 0.005), u, v), color, key, txt, w, h });
    });
  };
  /* прибор: r — радиус циферблата; needles — [{g: шкала, val(st), len, w, mat, tail}] */
  const gauge = (pn, u, v, r, face, needles = [], o = {}) => {
    pn.b3.push(() => {
      const fr = r + 0.007;
      A(pn.put(rbox(fr * 2, fr * 2, 0.003, 0.004, 0, 0, 0.0015), u, v), M.black);
      for (const [du, dv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) A(pn.put(G.screw(), u + du * (fr - 0.0042), v + dv * (fr - 0.0042), 0.003), M.steelDark);
      const bez = new THREE.LatheGeometry([[r + 0.0035, 0.003], [r + 0.0038, 0.0085], [r + 0.0012, 0.0108], [r - 0.0002, 0.0102], [r - 0.0005, 0.004]].map(([a, b]) => new THREE.Vector2(a, b)), 36);
      bez.rotateX(Math.PI / 2); A(pn.put(bez, u, v), M.black);
      if (face) { const fg = uvToTile(new THREE.CircleGeometry(r, 40), atlas.tiles[face]); fg.translate(0, 0, 0.0042); A(pn.put(fg, u, v), M.face); }
      const gl = new THREE.CircleGeometry(r + 0.0004, 32).translate(0, 0, 0.0098); A(pn.put(gl, u, v), M.glass);
      if (!needles.length) return;
      const grp = new THREE.Group(); grp.position.copy(pn.p(u, v)); grp.quaternion.copy(pn.quat()); plane.add(grp);
      let z = 0.0056;
      for (const nd of needles) {
        const m = new THREE.Mesh(needleGeo(nd.len * r, nd.w * r, nd.tail ?? 0.22), nd.mat || M.needle); m.position.z = z; z += 0.0006;
        m.castShadow = false; grp.add(m); dyn.needles.push({ m, g: nd.g, val: nd.val, cur: null, rate: nd.rate ?? 4 });
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.09, r * 0.09, 0.0024, 12).rotateX(Math.PI / 2), M.black); hub.position.z = z + 0.0008; grp.add(hub);
      if (o.flag) { const f = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.35, r * 0.22), M.red); f.position.set(r * 0.42, -r * 0.45, 0.0053); grp.add(f); dyn.needles.push({ flag: f, val: o.flag }); }
    });
  };
  const disp = (pn, u, v, w, h, txt) => {
    pn.art.push((pp) => { pp.rect(u - w / 2, v - h / 2, u + w / 2, v + h / 2, "#060707"); pp.rect(u - w / 2, v - h / 2, u + w / 2, v + h / 2, "#050a06", true); pp.text(txt, u, v, h * 0.7, "#ffb347", 600, "center", true); });
    pn.b3.push(() => A(pn.put(rbox(w + 0.008, h + 0.008, 0.004, 0.0015, 0, 0, 0.002).translate(0, 0, 0), u, v), M.black));
  };
  const thumbwheels = (pn, u, v, n, lab) => {
    pn.art.push((pp) => { pp.rect(u - n * 0.0055 - 0.002, v - 0.009, u + n * 0.0055 + 0.002, v + 0.009, "#0b0c0d"); if (lab) pp.text(lab, u, v + 0.017, 0.0038); });
    pn.b3.push(() => { for (let i = 0; i < n; i++) A(pn.put(new THREE.CylinderGeometry(0.0075, 0.0075, 0.007, 14).rotateZ(Math.PI / 2).translate(0, 0, 0.001), u + (i - (n - 1) / 2) * 0.011, v), M.knob); });
  };

  const W = (fn) => (st) => fn(st);
  const eng = (st, side) => (st.E && st.E.side === side ? st.E : null);
  const V0 = (x) => () => x;

  /* центральная секция: пилотажно-навигационные приборы */
  {
    const p = P.mainC;
    plate(p, 0.004, 0.004, 0.106, 0.384); plate(p, 0.106, 0.004, 0.234, 0.384); plate(p, 0.234, 0.004, 0.336, 0.384); plate(p, 0.004, 0.386, 0.336, 0.436);
    gauge(p, 0.055, 0.332, 0.041, "kus", [{ g: "kus", val: V0(0), len: 0.86, w: 0.1 }, { g: "kus", val: V0(0), len: 0.74, w: 0.05, mat: M.needleY }]);
    gauge(p, 0.055, 0.224, 0.041, "alt", [{ g: "altKm", val: V0(0.19), len: 0.55, w: 0.14 }, { g: "alt", val: V0(190), len: 0.88, w: 0.07 }]);
    gauge(p, 0.055, 0.124, 0.034, "mach", [{ g: "mach", val: V0(0.5), len: 0.84, w: 0.1 }]);
    gauge(p, 0.055, 0.042, 0.031, "clock", [
      { g: "clockH", val: (st) => st.clock.h, len: 0.55, w: 0.13, tail: 0.1, rate: 0 },
      { g: "clockM", val: (st) => st.clock.m, len: 0.82, w: 0.09, tail: 0.1, rate: 0 },
      { g: "clockM", val: (st) => st.clock.s, len: 0.88, w: 0.035, mat: M.needleR, tail: 0.25, rate: 0 }]);
    gauge(p, 0.285, 0.332, 0.041, "vvi", [{ g: "vvi", val: V0(0), len: 0.86, w: 0.1 }]);
    gauge(p, 0.285, 0.224, 0.038, "radalt", [{ g: "radalt", val: (st) => (st.power ? 0 : -30), len: 0.84, w: 0.1 }], { flag: (st) => !st.power });
    gauge(p, 0.285, 0.124, 0.038, "aoa", [{ g: "aoa", val: (st) => (st.power ? 0 : -12), len: 0.86, w: 0.1 }, { g: "g", val: V0(1), len: 0.52, w: 0.07, mat: M.needleR }]);
    // ОПАСНО / ВНИМАНИЕ
    lampRect(p, 0.105, 0.411, 0.052, 0.02, "#ff3a2a", "master", "ОПАСНО");
    lampRect(p, 0.235, 0.411, 0.052, 0.02, "#ffbf33", "caution", "ВНИМАНИЕ");
    label(p, "ЗК", 0.232, 0.058, 0.004); knob(p, 0.232, 0.042, null, 0.0062);
    label(p, "АРРЕТИР", 0.108, 0.058, 0.0035); btn(p, 0.108, 0.042, null, M.knob, 0.009, 0.009);
    // авиагоризонт КПП: шар за маской
    p.b3.push(() => {
      const u = 0.17, v = 0.287, r = 0.061, rb = 0.043;
      A(p.put(rbox(0.142, 0.142, 0.003, 0.006, 0, 0, 0.0015), u, v), M.black);
      for (const [du, dv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) A(p.put(G.screw(), u + du * 0.064, v + dv * 0.064, 0.003), M.steelDark);
      const bez = new THREE.LatheGeometry([[r + 0.004, 0.003], [r + 0.0045, 0.022], [r + 0.001, 0.026], [r - 0.002, 0.025], [r - 0.003, 0.016]].map(([a, b]) => new THREE.Vector2(a, b)), 48);
      bez.rotateX(Math.PI / 2); A(p.put(bez, u, v), M.black);
      const ring = uvToRing(new THREE.RingGeometry(rb, r, 48, 1), atlas.tiles.adiRing, r); ring.translate(0, 0, 0.016); A(p.put(ring, u, v), M.face);
      A(p.put(new THREE.CircleGeometry(r, 36).translate(0, 0, 0.0245), u, v), M.glass);
      const grp = new THREE.Group(); grp.position.copy(p.p(u, v)); grp.quaternion.copy(p.quat()); plane.add(grp);
      const Rb = 0.045, ball = new THREE.Mesh(new THREE.SphereGeometry(Rb, 40, 24), S({ map: ART.adiBallTexture(), roughness: 0.35, metalness: 0 }));
      ball.position.z = 0.016 - 0.0385; ball.rotation.order = "ZXY"; grp.add(ball);
      // силуэт самолёта (неподвижный), флажок отказа
      const wing = mergeAll([new THREE.BoxGeometry(0.03, 0.0035, 0.002).translate(-0.024, 0, 0), new THREE.BoxGeometry(0.03, 0.0035, 0.002).translate(0.024, 0, 0),
        new THREE.BoxGeometry(0.0035, 0.008, 0.002).translate(-0.0105, -0.004, 0), new THREE.BoxGeometry(0.0035, 0.008, 0.002).translate(0.0105, -0.004, 0), new THREE.CircleGeometry(0.0028, 12)]);
      const sym = new THREE.Mesh(wing, M.orange); sym.position.z = 0.0228; grp.add(sym);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.011), M.red); flag.position.set(0.026, 0.026, 0.0215); grp.add(flag);
      dyn.adi = { ball, flag, pitch: -0.07, bank: 0.21, erect: 0 };
    });
    // ПНП: вращающаяся картушка
    p.b3.push(() => {
      const u = 0.17, v = 0.122, r = 0.054, rc = 0.043;
      A(p.put(rbox(0.126, 0.126, 0.003, 0.006, 0, 0, 0.0015), u, v), M.black);
      for (const [du, dv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) A(p.put(G.screw(), u + du * 0.057, v + dv * 0.057, 0.003), M.steelDark);
      const bez = new THREE.LatheGeometry([[r + 0.004, 0.003], [r + 0.0042, 0.012], [r + 0.001, 0.0145], [r - 0.002, 0.0138], [r - 0.003, 0.006]].map(([a, b]) => new THREE.Vector2(a, b)), 44);
      bez.rotateX(Math.PI / 2); A(p.put(bez, u, v), M.black);
      const ring = uvToRing(new THREE.RingGeometry(rc, r, 44, 1), atlas.tiles.hsiRing, r); ring.translate(0, 0, 0.0075); A(p.put(ring, u, v), M.face);
      A(p.put(new THREE.CircleGeometry(r, 32).translate(0, 0, 0.0135), u, v), M.glass);
      const grp = new THREE.Group(); grp.position.copy(p.p(u, v)); grp.quaternion.copy(p.quat()); plane.add(grp);
      const card = new THREE.Mesh(uvToTile(new THREE.CircleGeometry(rc, 44), atlas.tiles.hsiCard), M.face); card.position.z = 0.005; grp.add(card);
      const acf = new THREE.Mesh(mergeAll([new THREE.BoxGeometry(0.003, 0.03, 0.001), new THREE.BoxGeometry(0.022, 0.003, 0.001).translate(0, 0.004, 0), new THREE.BoxGeometry(0.01, 0.0025, 0.001).translate(0, -0.012, 0)]), M.orange);
      acf.position.z = 0.0085; grp.add(acf);
      dyn.hsi = { card };
    });
  }
  /* левое крыло: вооружение и общесамолётные приборы */
  {
    const p = P.mainL;
    plate(p, 0.004, 0.296, 0.246, 0.416, "ВООРУЖЕНИЕ");
    for (let i = 0; i < 6; i++) lamp(p, 0.03 + i * 0.038, 0.378, i < 2 ? "#6dff8a" : "#fff2c8", null, ["1", "2", "3", "4", "5", "6"][i], 0.004);
    tg(p, 0.045, 0.318, "ГЛАВН.", { guard: true }); tg(p, 0.1, 0.318, "ПУСК"); tg(p, 0.15, 0.318, "СБРОС"); btn(p, 0.205, 0.318, "КОНТР", M.knob);
    plate(p, 0.004, 0.004, 0.246, 0.294);
    gauge(p, 0.068, 0.232, 0.036, "brake", [{ g: "brake", val: V0(96), len: 0.84, w: 0.09 }, { g: "brake", val: V0(92), len: 0.72, w: 0.07, mat: M.needleY }]);
    gauge(p, 0.182, 0.232, 0.036, "cabin", [{ g: "cabin", val: V0(0.2), len: 0.84, w: 0.1 }]);
    gauge(p, 0.068, 0.132, 0.032, "oxy", [{ g: "oxy", val: V0(148), len: 0.84, w: 0.1 }]);
    gauge(p, 0.182, 0.132, 0.032, "volt", [{ g: "volt", val: (st) => (st.power ? (st.E && st.E.N > 55 ? 28.2 : 25.6) : 0), len: 0.84, w: 0.1 }]);
    tg(p, 0.035, 0.045, "ПВД"); tg(p, 0.075, 0.045, "ФАРА"); tg(p, 0.115, 0.045, "АНО"); tg(p, 0.155, 0.045, "МАЯК"); knob(p, 0.205, 0.045, "ЯРКОСТЬ");
  }
  /* правое крыло: ИПВ и приборы двигателей */
  {
    const p = P.mainR;
    plate(p, 0.004, 0.004, 0.246, 0.262);
    plate(p, 0.004, 0.264, 0.246, 0.416);
    const N = (id, side) => (st) => { const e = eng(st, side); return e ? e[id] : null; };
    gauge(p, 0.066, 0.19, 0.043, "rpm", [{ g: "rpm", val: (st) => N("N", "L")(st) ?? 0, len: 0.86, w: 0.1 }, { g: "rpm", val: (st) => N("N", "R")(st) ?? 0, len: 0.7, w: 0.08, mat: M.needleY }]);
    gauge(p, 0.182, 0.19, 0.043, "egt", [{ g: "egt", val: (st) => N("egt", "L")(st) ?? 20, len: 0.86, w: 0.1 }, { g: "egt", val: (st) => N("egt", "R")(st) ?? 20, len: 0.7, w: 0.08, mat: M.needleY }]);
    gauge(p, 0.066, 0.074, 0.038, "fuel", [{ g: "fuel", val: (st) => (st.power ? 3380 : -200), len: 0.84, w: 0.1, rate: 1.2 }]);
    gauge(p, 0.182, 0.074, 0.038, "hyd", [{ g: "hyd", val: (st) => (st.E ? st.E.hyd : 0), len: 0.86, w: 0.1 }, { g: "hyd", val: (st) => (st.E ? st.E.hyd * 0.97 : 0), len: 0.7, w: 0.08, mat: M.needleY }]);
    label(p, "ИПВ", 0.02, 0.405, 0.0045);
  }
  /* левый боковой щиток: шасси и закрылки */
  {
    const p = P.fvL;
    plate(p, 0.004, 0.004, 0.146, 0.246, "ШАССИ");
    p.art.push((pp) => { pp.rect(0.08, 0.05, 0.094, 0.16, "#0c0d0d"); pp.text("УБР", 0.1, 0.152, 0.004, "#f1f0e8", 600, "left"); pp.text("ВЫП", 0.1, 0.058, 0.004, "#f1f0e8", 600, "left"); });
    lamp(p, 0.04, 0.215, "#56ff7e", "gear", null, 0.0045); lamp(p, 0.025, 0.19, "#56ff7e", "gear", null, 0.0045); lamp(p, 0.055, 0.19, "#56ff7e", "gear", null, 0.0045);
    lamp(p, 0.115, 0.215, "#ff3a2a", null, null, 0.0042); label(p, "УБРАНО", 0.115, 0.2, 0.003);
    p.b3.push(() => {
      // рычаг крана шасси (в положении «выпущено»)
      const u = 0.087, v = 0.066;
      A(p.put(new THREE.BoxGeometry(0.008, 0.012, 0.03).translate(0, 0, 0.015), u, v), M.steel);
      A(p.put(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 10).rotateX(Math.PI / 2).rotateX(-0.25).translate(0, 0.006, 0.05), u, v), M.steel);
      A(p.put(new THREE.TorusGeometry(0.011, 0.0045, 8, 18).translate(0, 0.012, 0.075), u, v), M.white);
      A(p.put(new THREE.CylinderGeometry(0.011, 0.011, 0.006, 18).rotateX(Math.PI / 2).translate(0, 0.012, 0.075), u, v), M.white);
      // аварийный выпуск — красная Т-образная ручка
      A(p.put(mergeAll([new THREE.CylinderGeometry(0.004, 0.004, 0.02, 8).rotateX(Math.PI / 2).translate(0, 0, 0.01), new THREE.BoxGeometry(0.03, 0.009, 0.009).translate(0, 0, 0.022)]), 0.035, 0.03), M.red);
    });
    label(p, "АВАР.", 0.035, 0.052, 0.0035);
    tg(p, 0.125, 0.03, "ЗАКР.");
  }
  /* правый боковой щиток: табло, «Экран», давление масла */
  {
    const p = P.fvR;
    plate(p, 0.004, 0.004, 0.146, 0.246);
    const tablo = new ART.Screen(512, 384, ART.drawTablo), ek = new ART.Screen(512, 224, ART.drawEkran);
    dyn.screens.tablo = tablo; dyn.screens.ekran = ek;
    const scr = (u, v, w, h, sc, glow) => {
      p.b3.push(() => {
        A(p.put(rbox(w + 0.012, h + 0.012, 0.006, 0.002, 0, 0, 0.003), u, v), M.black);
        const m = new THREE.Mesh(p.put(new THREE.PlaneGeometry(w, h).translate(0, 0, 0.0062), u, v), S({ color: "#000", emissive: "#ffffff", emissiveMap: sc.tex, emissiveIntensity: glow, roughness: 0.25, metalness: 0 }));
        addDyn(m); A(p.put(new THREE.PlaneGeometry(w, h).translate(0, 0, 0.0068), u, v), M.glass);
      });
    };
    scr(0.075, 0.19, 0.118, 0.085, tablo, 1.6); scr(0.052, 0.098, 0.074, 0.042, ek, 1.4);
    label(p, "ЭКРАН", 0.052, 0.07, 0.0033);
    gauge(p, 0.052, 0.035, 0.026, "oil", [{ g: "oil", val: (st) => (eng(st, "L") ? st.E.oil : 0), len: 0.86, w: 0.1 }, { g: "oil", val: (st) => (eng(st, "R") ? st.E.oil : 0), len: 0.7, w: 0.08, mat: M.needleY }]);
    btn(p, 0.118, 0.098, "КОНТР.", M.knob, 0.009, 0.009); btn(p, 0.118, 0.045, "СБРОС", M.knob, 0.009, 0.009);
  }
  /* левый пульт: РУД, запуск, радиостанция, АРК, кислород */
  {
    const p = P.conL;
    plate(p, 0.155, 0.4, 0.291, 0.766, "РУД");
    p.art.push((pp) => {
      // прорези рычагов: положение рычага на уровне пульта x = 3.53 + 0.16·tg(угла)
      for (const u of [0.209, 0.241]) { pp.rect(u - 0.0045, 0.475, u + 0.0045, 0.675, "#070808"); }
      const vAt = (deg) => 3.53 + 0.16 * Math.tan(deg * D) - CX0;
      const marks = [["СТОП", -22], ["МГ", -14], ["МАКС", 6], ["Ф", 18]];
      for (const [t, a] of marks) { const v = vAt(a); pp.line(0.19, v, 0.198, v, "#eef", 0.0012); pp.text(t, 0.186, v, 0.0042, "#f1f0e8", 600, "right"); }
      pp.line(0.252, vAt(6), 0.262, vAt(6), "#e33", 0.002);
    });
    knob(p, 0.268, 0.44, "ТОРМ.", 0.0075);
    plate(p, 0.004, 0.4, 0.153, 0.766, "ЗАПУСК");
    tg(p, 0.04, 0.705, "ЛЕВ", { guard: true }); tg(p, 0.11, 0.705, "ПРАВ", { guard: true });
    tg(p, 0.04, 0.63, "ХОЛОД."); tg(p, 0.11, 0.63, "ГТДЭ");
    btn(p, 0.075, 0.55, "ЗАПУСК", M.red, 0.013, 0.013);
    tg(p, 0.035, 0.46, "НАСОС Л"); tg(p, 0.075, 0.46, "ПЕРЕК."); tg(p, 0.115, 0.46, "НАСОС П");
    plate(p, 0.004, 0.2, 0.291, 0.398, "Р-862");
    rot(p, 0.06, 0.29, "КАНАЛ", { big: true, n: 10 });
    disp(p, 0.15, 0.335, 0.034, 0.016, "12");
    knob(p, 0.235, 0.29, "ГРОМК.", 0.0075); tg(p, 0.14, 0.262, "ШП"); tg(p, 0.185, 0.262, "КОМП.");
    tg(p, 0.14, 0.222, "ПРМ"); btn(p, 0.245, 0.228, "ТЛФ");
    plate(p, 0.004, 0.004, 0.146, 0.198, "АРК");
    rot(p, 0.045, 0.11, "РЕЖИМ", { n: 4 }); knob(p, 0.105, 0.11, "НАСТР.");
    tg(p, 0.045, 0.035, "ПРИВ."); tg(p, 0.105, 0.035, "ДАЛЬН.");
    plate(p, 0.149, 0.004, 0.291, 0.198, "КИСЛОРОД");
    lamp(p, 0.185, 0.12, "#fff2c8", null, "ИК"); tg(p, 0.245, 0.12, "ПОДАЧА"); knob(p, 0.185, 0.045, "СМЕСЬ"); btn(p, 0.245, 0.045, "АВАР.", M.red);
  }
  /* правый пульт: РЛС/ОЛС, навигация, освещение, кондиционирование */
  {
    const p = P.conR;
    plate(p, 0.004, 0.48, 0.291, 0.766, "РЛС · ОЛС");
    rot(p, 0.055, 0.665, "РЕЖИМ", { big: true, n: 6 }); rot(p, 0.145, 0.665, "ДАЛЬН.", { n: 5 }); rot(p, 0.235, 0.665, "ЦЕЛЬ", { n: 4 });
    tg(p, 0.045, 0.56, "ИЗЛУЧ.", { guard: true }); tg(p, 0.11, 0.56, "ОЛС"); tg(p, 0.165, 0.56, "ЛД"); tg(p, 0.22, 0.56, "СОПР."); btn(p, 0.265, 0.56, "ТЕСТ");
    lamp(p, 0.265, 0.72, "#6dff8a", "radar", "ГОТОВ", 0.0042);
    plate(p, 0.004, 0.27, 0.291, 0.478, "НАВИГАЦИЯ");
    thumbwheels(p, 0.1, 0.405, 4, "КОД ПРМ"); rot(p, 0.23, 0.405, "ПРМ", { n: 5 });
    disp(p, 0.1, 0.36, 0.05, 0.015, "0247");
    tg(p, 0.05, 0.3, "РСБН"); tg(p, 0.1, 0.3, "ПОСАД."); tg(p, 0.15, 0.3, "КОРР."); btn(p, 0.23, 0.3, "ОПОЗН.");
    plate(p, 0.004, 0.1, 0.291, 0.268, "ОСВЕЩЕНИЕ");
    knob(p, 0.05, 0.17, "ПРИБ."); knob(p, 0.115, 0.17, "ПУЛЬТ"); knob(p, 0.18, 0.17, "ТАБЛО"); tg(p, 0.245, 0.17, "КРАСН.");
    plate(p, 0.004, 0.004, 0.291, 0.098, "КОНДИЦ.");
    rot(p, 0.06, 0.045, "ТЕМП.", { n: 5 }); tg(p, 0.14, 0.045, "НАДДУВ"); tg(p, 0.2, 0.045, "ОБДУВ");
  }
  /* левый борт: топливная система, ручка фонаря */
  {
    const p = P.wallL;
    plate(p, 0.01, 0.006, 0.33, 0.159, "ТОПЛИВНАЯ СИСТЕМА");
    for (let i = 0; i < 5; i++) { tg(p, 0.04 + i * 0.06, 0.1, ["ПОДК.1", "ПОДК.2", "ПЕРЕК.", "ДРЕН.", "ИЗМ."][i], { guard: i === 2 }); tg(p, 0.04 + i * 0.06, 0.04, ["Б1", "Б2", "Б3", "ПТБ", "КРЫЛ."][i]); }
    plate(p, 0.335, 0.006, 0.595, 0.159, "ФОНАРЬ");
    p.b3.push(() => {
      A(p.put(rbox(0.06, 0.03, 0.02, 0.006, 0, 0, 0.01), 0.43, 0.09), M.steelDark);
      A(p.put(mergeAll([new THREE.CylinderGeometry(0.006, 0.006, 0.09, 10).rotateZ(Math.PI / 2).translate(0.03, 0, 0.026), rbox(0.05, 0.022, 0.022, 0.008, 0.085, 0, 0.026)]), 0.43, 0.09), M.grip);
      A(p.put(mergeAll([new THREE.CylinderGeometry(0.005, 0.005, 0.03, 8).rotateX(Math.PI / 2).translate(0, 0, 0.015), new THREE.TorusGeometry(0.014, 0.0045, 6, 16).translate(0, 0.012, 0.03)]), 0.55, 0.06), M.red);
    });
    label(p, "СБРОС", 0.55, 0.035, 0.0038); label(p, "ОТКР — ЗАКР", 0.45, 0.045, 0.0038);
  }
  /* правый борт: автоматы защиты сети */
  {
    const p = P.wallR;
    plate(p, 0.008, 0.006, 0.592, 0.159, "АЗС");
    const names = ["ПИТ.РЛС", "ОЛС", "ИЛС", "САУ", "РСБН", "АРК", "Р-862", "СРО", "ПВД", "ФАРА", "АНО", "ТОПЛ.", "ЗАПУСК", "ГТДЭ", "ПОЖАР", "КОНД.", "ИНС", "АВИАГ.", "ТАБЛО", "ЭКРАН", "ОБОГР.", "КИСЛ.", "ОСВ.", "РЕЗЕРВ"];
    for (let i = 0; i < 24; i++) { const r = Math.floor(i / 12), c = i % 12; tg(p, 0.04 + c * 0.047, 0.105 - r * 0.06, names[i], { flat: true, up: 1, pos: false }); }
    p.b3.push(() => { A(p.put(new THREE.BoxGeometry(0.56, 0.006, 0.006).translate(0.3, 0.13, 0.02), 0, 0), M.red); });
  }
  /* пульт ИЛС */
  {
    const p = P.hud;
    knob(p, 0.03, 0.02, null, 0.006); knob(p, 0.075, 0.02, null, 0.006); btn(p, 0.12, 0.02, null, M.knob, 0.008, 0.008);
    p.art.push((pp) => { pp.text("ЯРК", 0.03, 0.038, 0.0045); pp.text("ФОН", 0.075, 0.038, 0.0045); pp.text("СЕТКА", 0.12, 0.038, 0.0045); });
  }

  /* ---------- атлас панелей: упаковка по полкам и отрисовка ---------- */
  const panels = Object.values(P);
  const AS = Math.round(2048 * Math.min(1, TEX.scale)), sc = AS / 2048;
  let K = 1900, layout;
  for (; K > 400; K -= 50) {
    layout = []; let x = 0, y = 0, rowH = 0, ok = true;
    for (const pn of [...panels].sort((a, b) => b.h - a.h)) {
      const w = Math.ceil(pn.w * K) + 4, h = Math.ceil(pn.h * K) + 4;
      if (x + w > 2048) { x = 0; y += rowH; rowH = 0; }
      if (w > 2048 || y + h > 2048) { ok = false; break; }
      layout.push({ pn, x: x + 2, y: y + 2 }); x += w; rowH = Math.max(rowH, h);
    }
    if (ok) break;
  }
  const cv = canvas(AS, AS), g = cv.getContext("2d"), cvE = canvas(AS, AS), gE = cvE.getContext("2d");
  g.scale(sc, sc); gE.scale(sc, sc);
  g.fillStyle = "#3d6f71"; g.fillRect(0, 0, 2048, 2048); gE.fillStyle = "#000"; gE.fillRect(0, 0, 2048, 2048);
  for (const { pn, x, y } of layout) {
    const wpx = pn.w * K, hpx = pn.h * K;
    g.fillStyle = pn.bg; g.fillRect(x, y, wpx, hpx);
    // лёгкая неоднородность краски, потёртости по краям
    for (let i = 0; i < wpx * hpx / 900; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? "255,255,255" : "0,0,0"},${rnd() * 0.035})`; g.fillRect(x + rnd() * wpx, y + rnd() * hpx, 2 + rnd() * 5, 2 + rnd() * 5); }
    const gr = g.createLinearGradient(0, y, 0, y + hpx); gr.addColorStop(0, "rgba(255,255,255,0.05)"); gr.addColorStop(1, "rgba(0,0,0,0.08)"); g.fillStyle = gr; g.fillRect(x, y, wpx, hpx);
    const pp = painter(g, gE, x, y, K, pn.h);
    for (const a of pn.art) a(pp);
    pn.uv = { u: x * sc / AS, v: 1 - (y + hpx) * sc / AS, du: wpx * sc / AS, dv: hpx * sc / AS };
  }
  const panelTex = texFromCanvas(cv, { clamp: true }), panelEmis = texFromCanvas(cvE, { clamp: true });
  const panelMat = S({ map: panelTex, emissiveMap: panelEmis, emissive: "#ffffff", emissiveIntensity: 0, roughness: 0.66, metalness: 0.12, normalMap: L.cockpit.normalMap, normalScale: new THREE.Vector2(0.25, 0.25) });
  dyn.panelMat = panelMat;
  {
    const faces = [];
    for (const pn of panels) {
      const pg = new THREE.PlaneGeometry(pn.w, pn.h); pg.translate(pn.w / 2, pn.h / 2, 0);
      const uv = pg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, pn.uv.u + uv.getX(i) * pn.uv.du, pn.uv.v + uv.getY(i) * pn.uv.dv);
      faces.push(pn.put(pg, 0, 0, 0.0005));
      if (pn.name !== "hud") A(pn.put(box(pn.w, pn.h, 0.014, pn.w / 2, pn.h / 2, -0.0068), 0, 0), pn.name.startsWith("con") ? M.body : M.tub);
    }
    addDyn(new THREE.Mesh(mergeAll(faces), panelMat));
    for (const pn of panels) for (const b of pn.b3) b();
  }
  /* сигнальные лампы: по группе на ключ */
  {
    const groups = new Map();
    for (const l of lampList) { const k = l.key + "|" + l.color; if (!groups.has(k)) groups.set(k, { ...l, geos: [] }); groups.get(k).geos.push(l.geo); }
    for (const [, gdef] of groups) {
      const col = new THREE.Color(gdef.color);
      const mat = S({ color: col.clone().multiplyScalar(0.28), emissive: col, emissiveIntensity: 0, roughness: 0.2, metalness: 0 });
      addDyn(new THREE.Mesh(mergeAll(gdef.geos), mat));
      if (gdef.key) (dyn.lamps[gdef.key] = dyn.lamps[gdef.key] || []).push(mat);
    }
  }

  /* ─────────── корпуса пультов, щёчки, ниша ног ─────────── */
  for (const s of [1, -1]) {
    A(box(CX1 - CX0, CONY - FLOOR, 0.33, (CX0 + CX1) / 2, (CONY + FLOOR) / 2 - 0.0075, s * (CZI + 0.165)), M.body);
    A(box(0.012, CONY - FLOOR - 0.02, 0.29, CX1 + 0.006, (CONY + FLOOR) / 2 - 0.01, s * (CZI + 0.145)), M.tub);
    // щёчка между боковым щитком и бортом
    const fv = s > 0 ? P.fvR : P.fvL, e = fv.p(s > 0 ? WF : 0, 0), et = fv.p(s > 0 ? WF : 0, HF);
    const q = [e, new THREE.Vector3(e.x, e.y, s * wallZ(e.x, e.y)), new THREE.Vector3(et.x, et.y, s * wallZ(et.x, et.y)), et];
    const cheek = new THREE.BufferGeometry().setFromPoints([q[0], q[1], q[2], q[0], q[2], q[3]]); cheek.computeVertexNormals();
    A(cheek, M.tub);
  }
  // ниша ног: перегородка под доской и нижние кромки секций
  A(box(0.012, 0.4, 0.62, 4.16, FLOOR + 0.2, 0), M.floor);
  for (const pn of [P.mainC, P.mainL, P.mainR, P.fvL, P.fvR]) A(pn.put(box(pn.w, 0.012, 0.09, pn.w / 2, -0.006, -0.04), 0, 0), M.tub);

  /* ─────────── противобликовый козырёк и приборная палуба под козырьком фонаря ─────────── */
  {
    const hoods = [];
    for (const pn of [P.mainC, P.mainL, P.mainR, P.fvL, P.fvR]) {
      const Uh = pn.U.clone().setY(0).normalize(), Nh = new THREE.Vector3().crossVectors(Uh, new THREE.Vector3(0, 1, 0));
      const top = pn.p(pn.w / 2, pn.h);
      const m = new THREE.Matrix4().makeBasis(Uh, new THREE.Vector3(0, 1, 0), Nh.clone().negate()); m.setPosition(top.clone().addScaledVector(Nh, -0.035).add(new THREE.Vector3(0, 0.016, 0)));
      const fvh = pn.name.startsWith("fv"), dep = fvh ? 0.05 : 0.12;
      m.setPosition(top.clone().addScaledVector(Nh, -(dep / 2 - 0.02)).add(new THREE.Vector3(0, 0.014, 0)));
      hoods.push(rbox(pn.w + 0.012, 0.03, dep, 0.01).applyMatrix4(m));
    }
    A(mergeAll(hoods), M.glare, true);
    const X0 = (s) => (Math.abs(s) < 0.32 ? 3.95 : 3.95 - Math.min(1, (Math.abs(s) - 0.32) / 0.55) * 0.26);
    const deck = gridSurface((a, s) => {
      const x = X0(s) + a * (4.93 - X0(s)), [ysl, zsl] = sill(x), zs = zsl - 0.006, z = s * zs;
      const yc = 2.835 - (x - 3.95) * 0.1;
      let y = ysl + (yc - ysl) * Math.cbrt(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(s)), 3)));
      y = Math.min(y, glassY(x, z) - 0.014);
      return [x, y, z];
    }, range(0, 1, 16), range(-1, 1, 30));
    A(deck, M.glare, true);
  }

  /* ─────────── ИЛС-31: блок, коллиматор, пульт ─────────── */
  {
    const HY = 2.885;                                   // верх блока ИЛС
    A(rbox(0.24, 0.12, 0.17, 0.018, 4.13, HY - 0.06, 0), M.black, true);
    A(cyl(0.044, 0.046, 0.006, "y", 4.11, HY + 0.002, 0, 28), M.knob);
    A(cyl(0.038, 0.038, 0.002, "y", 4.11, HY + 0.006, 0, 28), M.glass);
    const lean = -24 * D, h = 0.14;
    const post = (z) => place(new THREE.BoxGeometry(0.009, h, 0.012), 4.07 - Math.sin(-lean) * h / 2, HY + Math.cos(lean) * h / 2, z, 0, 0, lean);
    A(mergeAll([post(0.074), post(-0.074), place(new THREE.BoxGeometry(0.014, 0.012, 0.16), 4.07 - Math.sin(-lean) * h, HY + Math.cos(lean) * h, 0, 0, 0, lean)]), M.black, true);
    const hudGeo = new THREE.PlaneGeometry(0.142, 0.122); hudGeo.rotateY(-Math.PI / 2); hudGeo.rotateZ(lean);
    hudGeo.translate(4.068 - Math.sin(-lean) * h * 0.52, HY + Math.cos(lean) * h * 0.52, 0);
    A(hudGeo.clone(), M.glass);
    const hudMat = new THREE.MeshBasicMaterial({ map: ART.hudTexture(), color: "#000000", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const hm = new THREE.Mesh(hudGeo, hudMat); hm.renderOrder = 3; addDyn(hm); dyn.hud = hudMat;
    // бленда ИПВ
    const p = P.mainR, u = 0.126, v = 0.338, w = 0.158, hh = 0.112;
    A(p.put(mergeAll([box(w + 0.02, 0.008, 0.04, 0, hh / 2 + 0.006, 0.02), box(0.008, hh + 0.02, 0.034, -w / 2 - 0.006, 0, 0.017), box(0.008, hh + 0.02, 0.034, w / 2 + 0.006, 0, 0.017)]), u, v), M.black, true);
    const ipv = new ART.Screen(512, 384, ART.drawIpv); dyn.screens.ipv = ipv;
    addDyn(new THREE.Mesh(p.put(new THREE.PlaneGeometry(w, hh).translate(0, 0, 0.004), u, v), S({ color: "#050807", emissive: "#ffffff", emissiveMap: ipv.tex, emissiveIntensity: 1.3, roughness: 0.3 })));
    A(p.put(new THREE.PlaneGeometry(w, hh).translate(0, 0, 0.006), u, v), M.glass);
  }

  /* ─────────── ручка управления (РУС) ─────────── */
  {
    const X = 3.52;
    const boot = []; for (let i = 0; i <= 12; i++) boot.push(new THREE.Vector2(0.062 - i * 0.0036 + (i % 2 ? 0.006 : 0), i * 0.013));
    A(new THREE.LatheGeometry(boot, 20).translate(X, FLOOR + 0.004, 0), M.rubber);
    A(cyl(0.075, 0.075, 0.008, "y", X, FLOOR + 0.004, 0, 24), M.black);
    A(cyl(0.012, 0.013, 0.28, "y", X + 0.01, 2.27, 0, 12), M.black, true);
    A(cyl(0.017, 0.017, 0.02, "y", X + 0.02, 2.41, 0, 14), M.steel);
    const gs = new THREE.Shape();
    [[-0.022, 0], [0.02, 0], [0.026, 0.045], [0.022, 0.095], [0.031, 0.128], [0.02, 0.152], [-0.018, 0.156], [-0.03, 0.125], [-0.026, 0.06]].forEach(([x, y], i) => (i ? gs.lineTo(x, y) : gs.moveTo(x, y)));
    const grip = new THREE.ExtrudeGeometry(gs, { depth: 0.026, bevelEnabled: true, bevelSize: 0.007, bevelThickness: 0.008, bevelSegments: 3, curveSegments: 8 });
    grip.translate(0, 0, -0.013); grip.rotateZ(-8 * D); grip.translate(X + 0.02, 2.42, 0);
    A(grip, M.grip, true);
    const top = (dx, dy) => [X + 0.02 + dx + dy * Math.sin(8 * D), 2.42 + dy];
    const [bx, by] = top(-0.008, 0.162);
    A(cyl(0.0075, 0.0075, 0.008, "y", bx, by, 0.006, 14), M.red);
    A(box(0.02, 0.003, 0.02, bx - 0.004, by + 0.006, 0.006, 0, 0, -0.5), M.steel);
    const [tx, ty] = top(-0.022, 0.13); A(mergeAll([cyl(0.006, 0.006, 0.008, "x", tx - 0.01, ty, -0.008, 10), box(0.004, 0.012, 0.004, tx - 0.014, ty, -0.008), box(0.004, 0.004, 0.012, tx - 0.014, ty, -0.008)]), M.knob);
    const [fx, fy] = top(0.036, 0.085); A(place(new THREE.BoxGeometry(0.012, 0.028, 0.012), fx, fy, 0, 0, 0, 0.2), M.steelDark);
    const [lx, ly] = top(0.046, 0.05); A(place(new THREE.BoxGeometry(0.006, 0.1, 0.014), lx, ly, 0, 0, 0, -0.1), M.steel, true);
  }

  /* ─────────── РУД: два рычага, поворотных на оси под пультом ─────────── */
  {
    const pivot = new THREE.Vector3(3.53, 2.24, 0);
    for (const [side, dz] of [["L", -0.376], ["R", -0.344]]) {
      const grp = new THREE.Group(); grp.position.set(pivot.x, pivot.y, dz); plane.add(grp);
      const lever = new THREE.Mesh(mergeAll([box(0.012, 0.3, 0.008, 0, 0.15, 0), cyl(0.012, 0.012, 0.012, "z", 0, 0, 0, 12)]), M.steelDark);
      const g = rbox(0.064, 0.1, 0.03, 0.012, 0.012, 0.33, side === "L" ? -0.012 : 0.012, 0, 0, -0.12);
      const gripM = new THREE.Mesh(g, M.grip);
      const btns = new THREE.Mesh(mergeAll(side === "L"
        ? [cyl(0.006, 0.006, 0.006, "z", 0.02, 0.37, -0.03, 10), cyl(0.005, 0.005, 0.006, "z", -0.005, 0.36, -0.03, 10), box(0.012, 0.018, 0.006, 0.03, 0.3, -0.029)]
        : [cyl(0.006, 0.006, 0.01, "y", 0.005, 0.385, 0.012, 10), box(0.02, 0.006, 0.006, 0.026, 0.37, 0.01)]), M.knob);
      for (const m of [lever, gripM, btns]) { m.castShadow = true; m.receiveShadow = true; grp.add(m); pickables.push(m); }
      dyn.throttle[side] = { grp, cur: -0.3 };
    }
  }

  /* ─────────── педали ─────────── */
  for (const s of [1, -1]) {
    const z = s * 0.135, x = 4.02, y = 2.13;
    A(place(rbox(0.09, 0.19, 0.02, 0.008, 0, 0, 0), x, y, z, 0, Math.PI / 2, 0).rotateZ(0), M.black);
    const pl = rbox(0.1, 0.2, 0.018, 0.008, 0, 0, 0); pl.rotateY(Math.PI / 2); pl.rotateZ(-15 * D); pl.translate(x, y, z); A(pl, M.steelDark, true);
    const strap = rbox(0.108, 0.03, 0.03, 0.01, 0, 0, 0); strap.rotateY(Math.PI / 2); strap.rotateZ(-15 * D); strap.translate(x - 0.018, y + 0.03, z); A(strap, M.black);
    A(tube([[x + 0.01, y - 0.05, z], [x + 0.08, FLOOR + 0.06, z], [4.14, FLOOR + 0.04, z]], 0.011, 10, 8), M.steelDark);
    A(tube([[x + 0.01, y + 0.07, z], [x + 0.08, y + 0.12, z], [4.14, y + 0.12, z]], 0.009, 10, 8), M.steelDark);
  }
  A(cyl(0.014, 0.014, 0.44, "z", 4.14, FLOOR + 0.04, 0, 12), M.steelDark);

  /* ─────────── зеркала заднего вида на дуге козырька ─────────── */
  {
    const xm = CANOPY.xw + 0.016, ys = sill(xm)[0];
    const arc = (phi) => { const p = canopyPt(xm, phi); return [p[1], p[2]]; };
    for (const phi of [0, 0.56, -0.56]) {
      const [ya, za] = arc(phi), k = 0.9;
      const y = ys + (ya - ys) * k + (phi ? 0 : -0.02) - 0.035, z = za * k;
      const roll = -phi * 1.0, yaw = phi * 0.35;
      const e = new THREE.Euler(0, yaw, roll, "YXZ");
      const frame = rbox(0.15, 0.052, 0.014, 0.01, 0, 0, 0); frame.rotateY(-Math.PI / 2); frame.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e)); frame.translate(xm - 0.012, y, z);
      A(frame, M.black);
      const mir = new THREE.PlaneGeometry(0.14, 0.043); mir.rotateY(-Math.PI / 2); mir.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e)); mir.translate(xm - 0.02, y, z);
      A(mir, M.mirror);
      A(tube([[xm - 0.005, y + 0.02 * Math.cos(roll), z + 0.02 * Math.sin(-roll)], [xm + 0.005, ys + (ya - ys) * 0.985, za * 0.985]], 0.005, 4, 6), M.black);
    }
  }

  anchors.pilotEye = EYE.clone();
  anchors.seat = new THREE.Vector3(3.15, 2.3, 0);
  return { dyn, M, update: (st) => updateCockpit(dyn, st), panels: P };
}

/* кольцевая шкала: UV как у диска радиуса R, в плитку атласа */
function uvToRing(g, t, R) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, t.u + (p.getX(i) / R * 0.5 + 0.5) * t.s, t.v + (p.getY(i) / R * 0.5 + 0.5) * t.s);
  return g;
}

/* ═══════════ оживление приборов ═══════════ */
const TABLO_KEYS = (st) => {
  const lit = [];
  if (!st.power) return lit;
  const run = st.E && st.E.N > 55 ? st.E.side : null;
  if (run !== "L") lit.push("genL", "oilL"); if (run !== "R") lit.push("genR", "oilR");
  if (!run) lit.push("hydO", "hydB");
  if (st.canopy > 0.05) lit.push("canopy");
  lit.push("brake");
  if (st.E && st.E.phase === "dead") lit.push(st.E.side === "L" ? "fireL" : "fireR");
  return lit;
};
function updateCockpit(dyn, st) {
  const dt = Math.min(0.1, st.dt || 0.016);
  for (const n of dyn.needles) {
    if (n.flag) { n.flag.visible = !!n.val(st); continue; }
    let v = n.val(st); if (v === null || v === undefined) v = 0;
    const a = ART.needleAngle(n.g, v);
    if (n.cur === null || !n.rate) n.cur = a; else n.cur += (a - n.cur) * Math.min(1, dt * n.rate);
    n.m.rotation.z = -n.cur;
  }
  const on = !!st.power;
  if (dyn.adi) {
    const a = dyn.adi; a.erect += ((on ? 1 : 0) - a.erect) * Math.min(1, dt * (on ? 0.35 : 0.05));
    const k = a.erect;
    a.ball.rotation.x = a.pitch * (1 - k); a.ball.rotation.z = a.bank * (1 - k); a.ball.rotation.y = (st.heading || 0) * 0;
    a.flag.visible = k < 0.6;
  }
  if (dyn.hsi && st.heading !== undefined) dyn.hsi.card.rotation.z = on ? st.heading : dyn.hsi.card.rotation.z;
  dyn.panelMat.emissiveIntensity = on ? 1.2 : 0;
  if (dyn.hud) dyn.hud.color.setScalar(on ? 0.85 : 0);
  const lamp = (key, v) => { for (const m of dyn.lamps[key] || []) m.emissiveIntensity = v; };
  lamp("gear", on ? 2.2 : 0); lamp("master", 0); lamp("caution", on && !(st.E && st.E.N > 55) ? 2 : 0); lamp("radar", on ? 1.8 : 0);
  dyn.screens.tablo.set({ lit: TABLO_KEYS(st) });
  const E = st.E;
  dyn.screens.ekran.set({ on, lines: !on ? [] : E && E.N > 55 ? [`ДВИГ.${E.side === "L" ? "ЛЕВ" : "ПРАВ"} РАБОТА`, "ГЕНЕРАТОР ПОДКЛ.", E.stage >= 3 ? "ФОРСАЖ" : ""] : ["ГЕНЕРАТОРЫ ОТКЛ.", "ДАВЛ. МАСЛА ЛЕВ", "ДАВЛ. МАСЛА ПРАВ", "ГИДРОСИСТ. ОТКАЗ"] });
  dyn.screens.ipv.set({ on, mode: "РЛС  ОБЗОР", msg: st.radarOk === false ? "ОТКАЗ" : "ГОТОВ" });
  // РУД: СТОП −22°, МГ −14°, режимы — вперёд
  for (const side of ["L", "R"]) {
    const t = dyn.throttle[side]; if (!t) continue;
    let ang = -22 * D;
    if (E && E.side === side && E.phase !== "dead") ang = (E.phase === "run" ? [-14, -4, 6, 18][E.stage] || -14 : -14) * D;
    t.cur += (ang - t.cur) * Math.min(1, dt * 3);
    t.grp.rotation.z = -t.cur;
  }
}

/* ═══════════ катапультное кресло К-36ДМ (съёмный узел «пиропатроны кресла») ═══════════ */
export function buildSeat(part, L) {
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const fab = L.seatGreen.normalMap;
  const M = {
    frame: S({ color: "#2e3336", roughness: 0.55, metalness: 0.45 }),
    box: S({ color: "#3b4347", roughness: 0.6, metalness: 0.3, normalMap: L.cockpit.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) }),
    naz: S({ color: "#4b5140", roughness: 0.75, metalness: 0.15 }),
    cushion: S({ color: "#4f6152", roughness: 0.9, metalness: 0, normalMap: fab, normalScale: new THREE.Vector2(1.2, 1.2) }),
    pad: S({ color: "#5c6e5d", roughness: 0.9, metalness: 0, normalMap: fab }),
    strap: S({ color: "#8b8a73", roughness: 0.85, metalness: 0, normalMap: fab, normalScale: new THREE.Vector2(1.5, 1.5), side: THREE.DoubleSide }),
    steel: S({ color: "#c7cbce", roughness: 0.25, metalness: 1 }),
    steelDark: S({ color: "#5d6368", roughness: 0.35, metalness: 1 }),
    handle: S({ map: ART.stripeTexture(), roughness: 0.45, metalness: 0.1 }),
    hose: S({ color: "#3d4a3b", roughness: 0.7, metalness: 0, normalMap: fab, normalScale: new THREE.Vector2(2, 2) }),
    flag: S({ map: flagTex(), roughness: 0.85, side: THREE.DoubleSide }),
  };
  M.handle.map.repeat.set(3, 1);
  const SRP = new THREE.Vector3(3.08, 2.29, 0), Z = new THREE.Vector3(0, 0, 1);
  const a = 14 * D, dB = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0), nB = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
  const b = 6 * D, dP = new THREE.Vector3(Math.cos(b), Math.sin(b), 0), nP = new THREE.Vector3(-Math.sin(b), Math.cos(b), 0);
  const back = (s, n, z = 0) => SRP.clone().addScaledVector(dB, s).addScaledVector(nB, n).setZ(z);
  const pan = (t, n, z = 0) => SRP.clone().addScaledVector(dP, t).addScaledVector(nP, n).setZ(z);
  const toB = (g, s, n, z = 0) => { const m = new THREE.Matrix4().makeBasis(nB, dB, Z); m.setPosition(back(s, n, z)); return g.applyMatrix4(m); };
  const toP = (g, t, n, z = 0) => { const m = new THREE.Matrix4().makeBasis(dP, nP, Z); m.setPosition(pan(t, n, z)); return g.applyMatrix4(m); };
  /* плоская лента вдоль точек: normals — нормаль поверхности, на которой она лежит */
  const ribbon = (pts, normals, w) => {
    const T = pts.map((p, i) => pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize());
    return gridSurface((i, k) => { const side = new THREE.Vector3().crossVectors(T[i], normals[i]).normalize(); const p = pts[i].clone().addScaledVector(side, (k - 0.5) * w).addScaledVector(normals[i], 0.002); return [p.x, p.y, p.z]; }, pts.map((_, i) => i), [0, 1]);
  };
  const L_ = [];
  const add = (g, m) => L_.push([g, m]);
  // силовой каркас: спинка, направляющие, телескопические штанги
  add(mergeAll([toB(rbox(0.03, 0.66, 0.42, 0.008), 0.3, -0.045), toB(rbox(0.06, 0.9, 0.045, 0.01), 0.3, -0.02, 0.212), toB(rbox(0.06, 0.9, 0.045, 0.01), 0.3, -0.02, -0.212),
    toP(box(0.4, 0.26, 0.012, 0, 0, 0), 0.2, -0.07, 0.229), toP(box(0.4, 0.26, 0.012, 0, 0, 0), 0.2, -0.07, -0.229),
    toP(box(0.2, 0.1, 0.008, 0, 0, 0), 0.27, 0.1, 0.236), toP(box(0.2, 0.1, 0.008, 0, 0, 0), 0.27, 0.1, -0.236)]), M.frame);
  add(mergeAll([toB(new THREE.CylinderGeometry(0.019, 0.019, 0.3, 12), 0.69, -0.125, 0.215), toB(new THREE.CylinderGeometry(0.019, 0.019, 0.3, 12), 0.69, -0.125, -0.215),
    toB(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 12), 0.54, -0.125, 0.215), toB(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 12), 0.54, -0.125, -0.215)]), M.steelDark);
  // заголовник с парашютным контейнером
  {
    const hs = new THREE.Shape(), pts = [[-0.175, 0.54], [0.175, 0.54], [0.2, 0.62], [0.212, 0.74], [0.2, 0.8], [0.15, 0.835], [-0.15, 0.835], [-0.2, 0.8], [-0.212, 0.74], [-0.2, 0.62]];
    pts.forEach(([x, y], i) => (i ? hs.lineTo(x, y) : hs.moveTo(x, y)));
    const hb = new THREE.ExtrudeGeometry(hs, { depth: 0.15, bevelEnabled: true, bevelSize: 0.014, bevelThickness: 0.016, bevelSegments: 3, curveSegments: 6 });
    const m = new THREE.Matrix4().makeBasis(Z, dB, nB.clone().negate()); m.setPosition(back(0, 0.014)); hb.applyMatrix4(m);
    add(mergeAll([hb, toB(rbox(0.05, 0.13, 0.05, 0.014), 0.73, 0.035, 0.175), toB(rbox(0.05, 0.13, 0.05, 0.014), 0.73, 0.035, -0.175)]), M.box);
  }
  add(toB(rbox(0.045, 0.17, 0.24, 0.018), 0.7, 0.045), M.pad);
  // подушки: спинка и чашка, НАЗ
  add(toB(rbox(0.05, 0.53, 0.37, 0.02), 0.285, 0.0), M.cushion);
  add(toP(rbox(0.4, 0.045, 0.38, 0.018), 0.215, -0.022), M.cushion);
  add(toP(rbox(0.42, 0.15, 0.42, 0.02), 0.21, -0.12), M.naz);
  // ручки катапультирования
  const hdl = (z) => { const g = new THREE.TorusGeometry(0.042, 0.0105, 8, 20, Math.PI); return toP(g, 0.395, 0.005, z); };
  add(mergeAll([hdl(0.155), hdl(-0.155)]), M.handle);
  // привязная система: плечевые, поясные, ножные ремни, замок
  const straps = [];
  for (const s of [1, -1]) {
    const pts = [back(0.56, 0.03, s * 0.075), back(0.4, 0.028, s * 0.078), back(0.2, 0.028, s * 0.08), back(0.06, 0.028, s * 0.075), pan(0.04, 0.004, s * 0.07), pan(0.13, 0.004, s * 0.055), pan(0.2, 0.004, s * 0.035)];
    straps.push(ribbon(pts, [nB, nB, nB, nB, nP, nP, nP], 0.045));
    const lap = [pan(0.07, 0.01, s * 0.205), pan(0.12, 0.006, s * 0.14), pan(0.2, 0.004, s * 0.05)];
    straps.push(ribbon(lap, [nP, nP, nP], 0.04));
    const leg = [pan(0.41, -0.005, s * 0.08), pan(0.425, -0.08, s * 0.085), pan(0.42, -0.2, s * 0.09)];
    straps.push(ribbon(leg, [dP, dP, dP], 0.03));
  }
  add(mergeAll(straps), M.strap);
  add(mergeAll([toP(rbox(0.07, 0.012, 0.065, 0.005), 0.215, 0.012), toP(box(0.03, 0.02, 0.04, 0, 0, 0), 0.075, 0.012, 0.205), toP(box(0.03, 0.02, 0.04, 0, 0, 0), 0.075, 0.012, -0.205),
    toB(box(0.012, 0.04, 0.05, 0, 0, 0), 0.56, 0.035, 0.075), toB(box(0.012, 0.04, 0.05, 0, 0, 0), 0.56, 0.035, -0.075)]), M.steel);
  // шланг КШУ к правому борту
  const hp = [pan(0.14, -0.08, 0.232), new THREE.Vector3(3.2, 2.17, 0.27), new THREE.Vector3(3.36, 2.08, 0.27), new THREE.Vector3(3.5, 2.03, 0.28)].map((v) => [v.x, v.y, v.z]);
  add(tube(hp, 0.014, 24, 8), M.hose);
  // чека механизма с красным флажком «снять перед полётом»
  const pin = back(0.8, -0.02, 0.212);
  add(mergeAll([cyl(0.004, 0.004, 0.05, "z", pin.x, pin.y, pin.z + 0.01, 8), torus(0.012, 0.0025, "x", pin.x, pin.y - 0.012, pin.z + 0.035, 5, 14)]), M.steel);
  const fl = new THREE.PlaneGeometry(0.034, 0.23); fl.translate(pin.x, pin.y - 0.14, pin.z + 0.04);
  add(fl, M.flag);
  return L_;
}
function flagTex() {
  const c = canvas(64, 512), g = c.getContext("2d");
  g.fillStyle = "#c21d18"; g.fillRect(0, 0, 64, 512);
  g.fillStyle = "rgba(0,0,0,0.12)"; for (let y = 0; y < 512; y += 6) g.fillRect(0, y, 64, 2);
  g.save(); g.translate(32, 256); g.rotate(-Math.PI / 2); g.fillStyle = "#f4efe6"; g.font = `700 30px ${ART.FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("СНЯТЬ ПЕРЕД ПОЛЁТОМ", 0, 0); g.restore();
  return texFromCanvas(c, { clamp: true });
}
