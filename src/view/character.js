/* Процедурная модель авиатехника: цельное тело на скелете (скиннинг), лицо, пальцы, комбинезон
   с молнией, швами, карманами, наколенниками и светоотражающими полосами, ремень с подсумком,
   ботинки с подошвой и шнурками, кепка. Анимация — процедурная: ходьба/бег по фазе шага, присед,
   работа инструментом (свой для каждого вида работ), дыхание, подъём по лестнице.
   Поза покоя — руки вдоль тела, все части тела вертикальны: тело «натягивается» кольцами-сечениями,
   у суставов веса вершин плавно делятся между соседними костями, поэтому локти и колени гнутся без швов. */
import * as THREE from "three";
import { canvas, texFromCanvas, dataTex, heightToNormal, canvasToFloat, ormTex, noiseField, mulberry32, TEX } from "./tex.js";
import { toolsFor } from "./tools.js";

const TAU = Math.PI * 2;
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const g2 = (a, b) => Math.exp(-(a * a + b * b));
const sz = (n) => Math.max(128, Math.round(n * TEX.scale));

/* ═══════════ кости ═══════════ */
const BONES = ["hips", "spine", "chest", "neck", "head", "shR", "upR", "foreR", "handR", "shL", "upL", "foreL", "handL", "hipR", "thighR", "kneeR", "ankleR", "hipL", "thighL", "kneeL", "ankleL"];
const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
const MIRROR = { upR: "upL", foreR: "foreL", handR: "handL", thighR: "thighL", kneeR: "kneeL", ankleR: "ankleL", shR: "shL", hipR: "hipL" };

/* накопитель геометрии для скиннинга: позиции, UV, индексы костей и веса */
class Builder {
  constructor() { this.p = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; }
  get n() { return this.p.length / 3; }
  vert(x, y, z, u, v, w) {
    this.p.push(x, y, z); this.uv.push(u, v);
    const e = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4); let s = 0; for (const [, k] of e) s += k;
    for (let i = 0; i < 4; i++) { this.si.push(e[i] ? BI[e[i][0]] : 0); this.sw.push(e[i] ? e[i][1] / s : 0); }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx); g.computeVertexNormals(); fixSeams(g);
    return g;
  }
}
/* дубли вершин на шве UV получают общую нормаль */
function fixSeams(g) {
  const p = g.attributes.position, n = g.attributes.normal, map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`;
    if (!map.has(k)) map.set(k, []); map.get(k).push(i);
  }
  const v = new THREE.Vector3();
  for (const list of map.values()) {
    if (list.length < 2) continue;
    v.set(0, 0, 0); for (const i of list) v.x += n.getX(i), v.y += n.getY(i), v.z += n.getZ(i);
    v.normalize(); for (const i of list) n.setXYZ(i, v.x, v.y, v.z);
  }
}

/* лофт по горизонтальным сечениям-суперэллипсам (спереди и сзади своя глубина).
   st: [{y, cx, cz, rx, rzF, rzB, n, w:{кость:вес}}], сверху вниз; uv: [u0, v0, u1, v1, yMin, yMax];
   шов развёртки — на φ0 (по умолчанию π — левый/внутренний бок) */
function loftY(B, st, { seg = 28, uv, phi0 = Math.PI, bump = null, capTop = false, capBot = false, mirror = false } = {}) {
  const [u0, v0, u1, v1, yA, yB] = uv, base = B.n, ring = seg + 1;
  const mapW = (w) => (mirror ? Object.fromEntries(Object.entries(w).map(([k, x]) => [MIRROR[k] || k, x])) : w);
  for (const s of st) {
    const n = s.n || 2.4, v = v0 + ((s.y - yA) / (yB - yA)) * (v1 - v0);
    for (let k = 0; k <= seg; k++) {
      const t = k / seg, f = phi0 + t * TAU, c = Math.cos(f), sn = Math.sin(f);
      const m = bump ? bump(f, s.y) : 1;
      let x = s.cx + s.rx * m * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const z = (s.cz || 0) + (sn >= 0 ? s.rzF : s.rzB) * m * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
      if (mirror) x = -x;
      B.vert(x, s.y, z, u0 + t * (u1 - u0), v, mapW(s.w));
    }
  }
  for (let j = 0; j < st.length - 1; j++) for (let k = 0; k < seg; k++) {
    const a = base + j * ring + k, b = a + ring, c = a + 1, d = b + 1;
    if (mirror) B.idx.push(a, b, c, c, b, d); else B.idx.push(a, c, b, c, d, b);
  }
  const cap = (s, j, up) => {
    const ci = B.n, v = v0 + ((s.y - yA) / (yB - yA)) * (v1 - v0);
    B.vert(mirror ? -s.cx : s.cx, s.y + (up ? 1 : -1) * Math.min(s.rx, s.rzF) * 0.35, s.cz || 0, (u0 + u1) / 2, v, mapW(s.w));
    for (let k = 0; k < seg; k++) {
      const a = base + j * ring + k, c = a + 1;
      if (up !== mirror) B.idx.push(ci, c, a); else B.idx.push(ci, a, c);
    }
  };
  if (capTop) cap(st[0], 0, true);
  if (capBot) cap(st[st.length - 1], st.length - 1, false);
}

/* ═══════════ сечения тела (правая сторона; левая — зеркально) ═══════════ */
const S = (y, cx, cz, rx, rzF, rzB, n, w) => ({ y, cx, cz, rx, rzF, rzB, n, w });
const TORSO = [
  S(1.552, 0, -0.012, 0.076, 0.068, 0.068, 2.2, { chest: 0.5, neck: 0.5 }),
  S(1.532, 0, -0.012, 0.118, 0.084, 0.084, 2.3, { chest: 1 }),
  S(1.508, 0, -0.012, 0.152, 0.096, 0.096, 2.5, { chest: 1 }),
  S(1.485, 0, -0.01, 0.17, 0.106, 0.104, 2.8, { chest: 1 }),
  S(1.45, 0, -0.006, 0.174, 0.116, 0.108, 2.9, { chest: 1 }),
  S(1.405, 0, -0.003, 0.172, 0.124, 0.11, 2.8, { chest: 0.95, spine: 0.05 }),
  S(1.35, 0, -0.002, 0.166, 0.126, 0.108, 2.6, { chest: 0.7, spine: 0.3 }),
  S(1.28, 0, -0.003, 0.158, 0.118, 0.104, 2.5, { chest: 0.25, spine: 0.75 }),
  S(1.2, 0, -0.004, 0.151, 0.112, 0.1, 2.4, { spine: 1 }),
  S(1.105, 0, -0.004, 0.149, 0.108, 0.098, 2.4, { spine: 0.8, hips: 0.2 }),
  S(1.04, 0, -0.006, 0.159, 0.11, 0.106, 2.5, { spine: 0.35, hips: 0.65 }),
  S(0.98, 0, -0.008, 0.171, 0.11, 0.12, 2.6, { hips: 1 }),
  S(0.92, 0, -0.01, 0.17, 0.106, 0.128, 2.5, { hips: 1 }),
  S(0.87, 0, -0.01, 0.153, 0.096, 0.116, 2.3, { hips: 1 }),
  S(0.838, 0, -0.008, 0.115, 0.074, 0.084, 2.2, { hips: 1 }),
];
const torsoBump = (f, y) => {
  const fr = Math.max(0, Math.sin(f)), bk = Math.max(0, -Math.sin(f)), cx = Math.abs(Math.cos(f));
  return 1 + 0.035 * fr * fr * g2((y - 1.37) / 0.05, 0) * (1 - 0.6 * g2(Math.cos(f) / 0.2, 0))   // грудь (по бокам от молнии)
    + 0.035 * bk * bk * g2((y - 1.4) / 0.05, 0)                                                   // лопатки
    + 0.05 * bk * g2((y - 0.93) / 0.045, 0) * (1 - 0.5 * g2(Math.cos(f) / 0.18, 0)) * (1 - cx * 0.3); // ягодицы
};
const ARM = [
  S(1.506, 0.182, -0.004, 0.03, 0.03, 0.03, 2, { upR: 1 }),
  S(1.494, 0.184, -0.004, 0.05, 0.052, 0.05, 2, { upR: 1 }),
  S(1.466, 0.186, -0.002, 0.058, 0.058, 0.056, 2.1, { upR: 1 }),
  S(1.42, 0.187, 0, 0.057, 0.057, 0.055, 2.1, { upR: 1 }),
  S(1.36, 0.187, 0.002, 0.053, 0.055, 0.052, 2.1, { upR: 1 }),
  S(1.28, 0.187, 0.004, 0.05, 0.053, 0.049, 2.1, { upR: 1 }),
  S(1.215, 0.187, 0.006, 0.048, 0.049, 0.048, 2.1, { upR: 0.85, foreR: 0.15 }),
  S(1.175, 0.187, 0.008, 0.047, 0.047, 0.049, 2.1, { upR: 0.5, foreR: 0.5 }),
  S(1.135, 0.187, 0.01, 0.048, 0.049, 0.048, 2.1, { upR: 0.15, foreR: 0.85 }),
  S(1.07, 0.187, 0.012, 0.049, 0.049, 0.047, 2.1, { foreR: 1 }),
  S(0.99, 0.187, 0.012, 0.045, 0.044, 0.042, 2.1, { foreR: 1 }),
  S(0.945, 0.187, 0.012, 0.041, 0.039, 0.039, 2.1, { foreR: 1 }),
  S(0.933, 0.187, 0.012, 0.044, 0.042, 0.042, 2.1, { foreR: 1 }),
  S(0.908, 0.187, 0.012, 0.038, 0.036, 0.036, 2.1, { foreR: 1 }),
];
const LEG = [
  S(0.995, 0.1, -0.004, 0.085, 0.086, 0.09, 2.2, { thighR: 1 }),
  S(0.95, 0.102, -0.004, 0.094, 0.092, 0.098, 2.2, { thighR: 1 }),
  S(0.88, 0.1, 0, 0.09, 0.09, 0.092, 2.2, { thighR: 1 }),
  S(0.8, 0.099, 0.002, 0.083, 0.085, 0.084, 2.2, { thighR: 1 }),
  S(0.7, 0.097, 0.004, 0.075, 0.078, 0.075, 2.2, { thighR: 1 }),
  S(0.61, 0.096, 0.006, 0.067, 0.07, 0.066, 2.2, { thighR: 0.9, kneeR: 0.1 }),
  S(0.545, 0.095, 0.008, 0.063, 0.066, 0.062, 2.2, { thighR: 0.62, kneeR: 0.38 }),
  S(0.5, 0.095, 0.01, 0.062, 0.066, 0.06, 2.2, { thighR: 0.5, kneeR: 0.5 }),
  S(0.455, 0.095, 0.008, 0.061, 0.064, 0.062, 2.2, { thighR: 0.25, kneeR: 0.75 }),
  S(0.4, 0.095, 0.002, 0.06, 0.06, 0.07, 2.2, { kneeR: 1 }),
  S(0.32, 0.095, 0, 0.058, 0.058, 0.066, 2.2, { kneeR: 1 }),
  S(0.24, 0.095, 0.002, 0.054, 0.056, 0.058, 2.2, { kneeR: 1 }),
  S(0.17, 0.095, 0.006, 0.053, 0.057, 0.055, 2.2, { kneeR: 0.85, ankleR: 0.15 }),
  S(0.132, 0.095, 0.01, 0.057, 0.062, 0.06, 2.2, { kneeR: 0.7, ankleR: 0.3 }),
  S(0.108, 0.095, 0.01, 0.058, 0.064, 0.061, 2.2, { kneeR: 0.7, ankleR: 0.3 }),
];
const NECK = [
  S(1.66, 0, 0.006, 0.054, 0.056, 0.054, 2, { head: 1 }),
  S(1.625, 0, 0, 0.058, 0.058, 0.06, 2, { neck: 0.5, head: 0.5 }),
  S(1.585, 0, -0.004, 0.06, 0.06, 0.062, 2, { neck: 1 }),
  S(1.545, 0, -0.01, 0.064, 0.063, 0.066, 2, { neck: 0.5, chest: 0.5 }),
  S(1.5, 0, -0.012, 0.064, 0.062, 0.064, 2, { chest: 1 }),
];
/* воротник: наружный слой вниз и внутренний обратно вверх */
const COLLAR = [
  S(1.594, 0, -0.008, 0.073, 0.071, 0.075, 2, { neck: 0.6, chest: 0.4 }),
  S(1.566, 0, -0.012, 0.088, 0.082, 0.084, 2.1, { neck: 0.3, chest: 0.7 }),
  S(1.534, 0, -0.012, 0.114, 0.094, 0.09, 2.2, { chest: 1 }),
  S(1.538, 0, -0.012, 0.104, 0.086, 0.084, 2.2, { chest: 1 }),
  S(1.586, 0, -0.008, 0.067, 0.066, 0.07, 2, { neck: 0.6, chest: 0.4 }),
];

/* ═══════════ атлас комбинезона ═══════════ */
// области: торс u 0..0.5 v 0.5..1; рукава u 0.5..0.75 v 0.5..1; штанины u 0.75..1 v 0..1; воротник u 0.5..0.75 v 0..0.1
const UV = {
  torso: [0, 0.5, 0.5, 1, 0.838, 1.552],
  arm: [0.5, 0.5, 0.75, 1, 0.908, 1.506],
  leg: [0.75, 0, 1, 1, 0.108, 0.995],
  collar: [0.5, 0.02, 0.75, 0.1, 1.534, 1.594],
};
let ATLAS = null;
const suitCache = new Map();
/* рисование: общие высоты (карта нормалей, шероховатость) и цветной слой под конкретный цвет ткани */
function suitAtlas() {
  if (ATLAS) return ATLAS;
  const W = sz(1024), H = W;
  const hc = canvas(W, H), h = hc.getContext("2d");
  const oc = canvas(W, H), o = oc.getContext("2d");          // «вторичный» слой: 0 — ткань, >0 — детали (для цвета)
  h.fillStyle = "rgb(128,128,128)"; h.fillRect(0, 0, W, H);
  o.fillStyle = "#000"; o.fillRect(0, 0, W, H);
  // координаты: регион + (доля окружности t, высота y) → пиксели (v растёт вниз по канве — текстура без flipY)
  const P = (r, t, y) => { const [u0, v0, u1, v1, yA, yB] = UV[r]; return [(u0 + t * (u1 - u0)) * W, (v0 + ((y - yA) / (yB - yA)) * (v1 - v0)) * H]; };
  const hl = (r, t0, t1, y, w, col) => { const [a, b] = P(r, t0, y), [c] = P(r, t1, y); h.fillStyle = col; h.fillRect(a, b - w / 2, c - a, w); };
  const vl = (r, t, y0, y1, w, col) => { const [a, b] = P(r, t, y0), [, d] = P(r, t, y1); h.fillStyle = col; h.fillRect(a - w / 2, Math.min(b, d), w, Math.abs(d - b)); };
  const rect = (ctx, r, t0, t1, y0, y1, col) => { const [a, b] = P(r, t0, y0), [c, d] = P(r, t1, y1); ctx.fillStyle = col; ctx.fillRect(Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b)); };
  const stitch = (r, t0, t1, y0, y1) => {           // строчка по контуру прямоугольника
    const [a, b] = P(r, t0, y0), [c, d] = P(r, t1, y1); h.save(); h.strokeStyle = "rgb(150,150,150)"; h.lineWidth = Math.max(1, W / 700); h.setLineDash([W / 260, W / 360]);
    h.strokeRect(Math.min(a, c) + 3, Math.min(b, d) + 3, Math.abs(c - a) - 6, Math.abs(d - b) - 6); h.restore();
  };
  const seam = "rgb(92,92,92)", fold = "rgba(90,90,90,0.5)";
  const s1 = Math.max(2, W / 340), s2 = Math.max(1, W / 700);
  // ── торс: 0 — левый бок, 0.25 — спина, 0.5 — правый бок, 0.75 — грудь (молния)
  vl("torso", 0.001, 0.838, 1.552, s1, seam); vl("torso", 0.5, 0.838, 1.552, s1, seam); vl("torso", 0.999, 0.838, 1.552, s1, seam);
  // молния с планкой
  rect(h, "torso", 0.735, 0.765, 1.0, 1.535, "rgb(140,140,140)"); vl("torso", 0.735, 1.0, 1.535, s2, seam); vl("torso", 0.765, 1.0, 1.535, s2, seam);
  vl("torso", 0.75, 1.0, 1.535, s1 * 0.8, "rgb(70,70,70)");
  rect(o, "torso", 0.748, 0.752, 1.0, 1.535, "rgb(40,0,0)");
  // пояс на резинке
  rect(h, "torso", 0, 1, 1.085, 1.125, "rgb(140,140,140)"); hl("torso", 0, 1, 1.085, s1, seam); hl("torso", 0, 1, 1.125, s1, seam);
  for (let t = 0; t < 1; t += 0.006) vl("torso", t, 1.088, 1.122, s2, fold);
  // кокетка спереди и сзади
  hl("torso", 0.62, 0.88, 1.445, s1, seam); hl("torso", 0.12, 0.38, 1.43, s1, seam);
  // нагрудные карманы с клапанами и пуговицами
  for (const [t0, t1] of [[0.655, 0.72], [0.78, 0.845]]) {
    rect(h, "torso", t0, t1, 1.3, 1.395, "rgb(150,150,150)"); stitch("torso", t0, t1, 1.3, 1.395);
    rect(h, "torso", t0 - 0.004, t1 + 0.004, 1.375, 1.412, "rgb(165,165,165)"); stitch("torso", t0 - 0.004, t1 + 0.004, 1.375, 1.412);
    const [bx, by] = P("torso", (t0 + t1) / 2, 1.382); h.fillStyle = "rgb(190,190,190)"; h.beginPath(); h.arc(bx, by, W / 280, 0, 7); h.fill();
    o.fillStyle = "rgb(60,0,0)"; o.beginPath(); o.arc(bx, by, W / 280, 0, 7); o.fill();
  }
  // бирка с фамилией над левым карманом
  rect(o, "torso", 0.785, 0.84, 1.418, 1.435, "rgb(0,200,0)"); rect(h, "torso", 0.785, 0.84, 1.418, 1.435, "rgb(150,150,150)");
  // складки: талия, подмышки, пах
  for (let k = 0; k < 7; k++) { const t = 0.5 + (k - 3) * 0.012; vl("torso", t, 1.13, 1.2 + (k % 3) * 0.02, s2 * 1.5, fold); vl("torso", t - 0.5 + (t < 0.5 ? 1 : 0), 1.13, 1.19, s2 * 1.5, fold); }
  // спина: «558 АРЗ»
  {
    const [cx, cy] = P("torso", 0.25, 1.33), fs = W * 0.03;
    for (const [ctx, col] of [[h, "rgb(170,170,170)"], [o, "rgb(0,0,220)"]]) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(-1, -1); ctx.font = `800 ${fs}px 'Arial Black', Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = col; ctx.fillText("558 АРЗ", 0, 0); ctx.restore();
    }
  }
  // ── рукава (0 — внутренняя сторона, 0.25 — сзади, 0.5 — наружная, 0.75 — спереди)
  vl("arm", 0.002, 0.908, 1.506, s1, seam); vl("arm", 0.998, 0.908, 1.506, s1, seam);
  hl("arm", 0, 1, 1.455, s1, seam);
  rect(h, "arm", 0, 1, 1.29, 1.32, "rgb(175,175,175)"); rect(o, "arm", 0, 1, 1.29, 1.32, "rgb(0,0,255)");
  hl("arm", 0, 1, 1.29, s2, seam); hl("arm", 0, 1, 1.32, s2, seam);
  rect(h, "arm", 0, 1, 0.908, 0.936, "rgb(140,140,140)"); for (let t = 0; t < 1; t += 0.012) vl("arm", t, 0.91, 0.934, s2, fold);
  for (let k = 0; k < 5; k++) hl("arm", 0.62, 0.9, 1.15 + k * 0.012, s2 * 1.6, fold);
  // ── штанины (0 — внутренний шов, 0.25 — сзади, 0.5 — лампас/наружный шов, 0.75 — спереди)
  vl("leg", 0.002, 0.108, 0.995, s1, seam); vl("leg", 0.5, 0.108, 0.995, s1, seam); vl("leg", 0.998, 0.108, 0.995, s1, seam);
  // наколенник
  { const [a, b] = P("leg", 0.63, 0.43), [c, d] = P("leg", 0.87, 0.585); h.fillStyle = "rgb(165,165,165)"; h.beginPath(); h.roundRect(a, b, c - a, d - b, W / 90); h.fill();
    o.fillStyle = "rgb(70,0,0)"; o.beginPath(); o.roundRect(a, b, c - a, d - b, W / 90); o.fill(); stitch("leg", 0.63, 0.87, 0.43, 0.585); }
  // накладной карман на бедре с клапаном
  rect(h, "leg", 0.39, 0.61, 0.64, 0.8, "rgb(152,152,152)"); stitch("leg", 0.39, 0.61, 0.64, 0.8);
  rect(h, "leg", 0.385, 0.615, 0.775, 0.815, "rgb(168,168,168)"); stitch("leg", 0.385, 0.615, 0.775, 0.815);
  rect(h, "leg", 0, 1, 0.3, 0.328, "rgb(175,175,175)"); rect(o, "leg", 0, 1, 0.3, 0.328, "rgb(0,0,255)");
  hl("leg", 0, 1, 0.3, s2, seam); hl("leg", 0, 1, 0.328, s2, seam);
  hl("leg", 0, 1, 0.13, s1, seam);
  for (let k = 0; k < 4; k++) hl("leg", 0.12, 0.38, 0.47 + k * 0.014, s2 * 1.8, fold);            // под коленом
  for (let k = 0; k < 3; k++) hl("leg", 0.55, 1, 0.14 + k * 0.016, s2 * 1.6, fold);                 // «гармошка» над ботинком
  for (let k = 0; k < 4; k++) hl("leg", 0.65, 0.95, 0.9 + k * 0.02, s2 * 1.4, fold);                // пах
  // ── воротник
  rect(h, "collar", 0, 1, 1.534, 1.594, "rgb(140,140,140)"); hl("collar", 0, 1, 1.566, s2, seam);
  // шум ткани
  const nz = noiseField(W >> 2, H >> 2, 48, 3, 91), id = h.getImageData(0, 0, W, H), d = id.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, k = nz[(y >> 2) * (W >> 2) + (x >> 2)]; d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, d[i] + (k - 0.5) * 26 + ((x + y) & 1) * 3)); }
  h.putImageData(id, 0, 0);
  const Hf = canvasToFloat(hc, 0), Of = oc.getContext("2d").getImageData(0, 0, W, H).data;
  const R = new Float32Array(W * H);
  for (let i = 0; i < R.length; i++) R[i] = Of[i * 4 + 2] > 100 ? 0.42 : Of[i * 4] > 30 ? 0.55 : 0.88 + (nz[((i / W | 0) >> 2) * (W >> 2) + ((i % W) >> 2)] - 0.5) * 0.12;
  ATLAS = { W, H, hc, oc, P, normal: dataTex(heightToNormal(Hf, W, H, 2.2), W, H), orm: ormTex(R, null, W, H) };
  return ATLAS;
}
/* цветная карта ткани под цвет комбинезона: ткань, потёртости, грязь на коленях и манжетах, светоотражающие полосы */
function suitMaterial(color) {
  if (suitCache.has(color)) return suitCache.get(color);
  const A = suitAtlas(), { W, H } = A, c = canvas(W, H), g = c.getContext("2d");
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  // светотень от высот: швы темнее, складки
  g.globalCompositeOperation = "overlay"; g.globalAlpha = 0.55; g.drawImage(A.hc, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  const rnd = mulberry32(color.length * 17 + color.charCodeAt(1));
  const light = new THREE.Color(color).getHSL({}).l > 0.6;
  // грязь: колени, манжеты, низ штанин, живот
  const dirt = (r, t0, t1, y0, y1, a) => { const [x0, y0p] = A.P(r, t0, y0), [x1, y1p] = A.P(r, t1, y1);
    for (let i = 0; i < 26; i++) { const x = x0 + (x1 - x0) * rnd(), y = y0p + (y1p - y0p) * rnd(), rr = (W / 120) * (0.5 + rnd());
      const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(40,34,26,${a * (light ? 1.6 : 1)})`); gr.addColorStop(1, "rgba(40,34,26,0)"); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); } };
  dirt("leg", 0.55, 0.95, 0.42, 0.6, 0.22); dirt("leg", 0, 1, 0.108, 0.2, 0.25); dirt("arm", 0, 1, 0.908, 1.0, 0.2); dirt("torso", 0.6, 0.9, 1.0, 1.15, 0.12);
  // масляные пятна
  for (let i = 0; i < 5; i++) { const [x, y] = A.P("leg", 0.5 + rnd() * 0.45, 0.35 + rnd() * 0.5), rr = W / 200 + rnd() * W / 150; g.fillStyle = "rgba(15,14,12,0.35)"; g.beginPath(); g.ellipse(x, y, rr, rr * 0.7, rnd() * 3, 0, 7); g.fill(); }
  // детали по маске: светоотражающие полосы, бирка, надпись, пуговицы, молния
  const O = A.oc.getContext("2d").getImageData(0, 0, W, H).data, id = g.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < W * H; i++) {
    const r = O[i * 4], gg = O[i * 4 + 1], b = O[i * 4 + 2];
    if (b > 100) { const k = 0.85 + (d[i * 4] / 255) * 0.1; d[i * 4] = 205 * k; d[i * 4 + 1] = 208 * k; d[i * 4 + 2] = 200 * k; }
    else if (gg > 100) { d[i * 4] = 225; d[i * 4 + 1] = 222; d[i * 4 + 2] = 210; }
    else if (r > 50) { d[i * 4] = 70; d[i * 4 + 1] = 72; d[i * 4 + 2] = 74; }
    else if (r > 30) { d[i * 4] *= 0.7; d[i * 4 + 1] *= 0.7; d[i * 4 + 2] *= 0.7; }
  }
  g.putImageData(id, 0, 0);
  // надпись на бирке
  { const [x, y] = A.P("torso", 0.8125, 1.4265); g.save(); g.translate(x, y); g.scale(-1, -1); g.fillStyle = "#2a2a2a"; g.font = `700 ${W / 110}px Arial`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("558 АРЗ", 0, 0); g.restore(); }
  const map = texFromCanvas(c, { flipY: false });
  const m = new THREE.MeshStandardMaterial({ map, normalMap: A.normal, normalScale: new THREE.Vector2(1, 1), roughnessMap: A.orm, roughness: 1, metalness: 0 });
  suitCache.set(color, m);
  return m;
}

/* ═══════════ голова ═══════════ */
function headGeo(hairRatio, stubble) {
  const g = new THREE.SphereGeometry(1, 60, 44), p = g.attributes.position, col = new Float32Array(p.count * 3);
  const C = HEAD_C;
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i), ax = Math.abs(dx), f = Math.max(0, dz);
    let rx = 0.078, ry = 0.111, rz = 0.1;
    const low = sm(-0.1, -0.95, dy);
    rx *= 1 - 0.14 * low * (0.5 + 0.5 * f); rz *= 1 - low * (dz < 0 ? 0.22 : 0.04);
    if (dz < 0) rz *= 1 + 0.07 * sm(-0.3, 0.5, dy);
    if (dz > 0.2) rx *= 1 - 0.06 * sm(0.2, 0.9, dz) * sm(-0.3, 0.4, dy);           // лицо уже черепа
    let off = 0;
    off += 0.009 * g2(dx / 0.55, (dy - 0.3) / 0.075) * f;                                   // надбровье
    off -= 0.014 * g2((ax - 0.4) / 0.14, (dy - 0.19) / 0.09) * f;                           // глазницы
    off += 0.007 * g2((ax - 0.58) / 0.14, (dy - 0.03) / 0.12) * f;                          // скулы
    off += 0.027 * g2(dx / 0.08, 0) * sm(0.3, 0.1, dy) * sm(-0.22, -0.04, dy) * f;          // спинка носа
    off += 0.017 * g2(dx / 0.11, (dy + 0.14) / 0.065) * f;                                  // кончик носа
    off += 0.008 * g2((ax - 0.11) / 0.055, (dy + 0.16) / 0.045) * f;                        // крылья носа
    off -= 0.006 * g2(dx / 0.3, (dy + 0.34) / 0.016) * f;                                   // линия рта
    off += 0.006 * g2(dx / 0.25, (dy + 0.305) / 0.03) * f + 0.007 * g2(dx / 0.22, (dy + 0.385) / 0.032) * f;   // губы
    off -= 0.004 * g2(dx / 0.24, (dy + 0.47) / 0.04) * f;                                   // ямка под губой
    off += 0.012 * g2(dx / 0.26, (dy + 0.64) / 0.12) * f;                                   // подбородок
    off += 0.004 * g2((ax - 0.62) / 0.12, (dy + 0.55) / 0.12) * f;                          // углы челюсти
    off -= 0.005 * g2((ax - 0.62) / 0.12, (dy + 0.25) / 0.14) * f;                          // щёки под скулами
    const L = Math.hypot(dx, dy, dz);
    p.setXYZ(i, C[0] + dx * rx + (dx / L) * off, C[1] + dy * ry + (dy / L) * off, C[2] + dz * rz + (dz / L) * off);
    // цвет вершины — множитель к цвету кожи: волосы, щетина, губы, румянец
    let k = [1, 1, 1];
    const hair = (dy > 0.1 && dz < 0.25) || (dy > 0.58 && dz < 0.8) || dy > 0.74 || (dy > -0.1 && ax > 0.88 && dz > -0.05 && dz < 0.3);
    if (hair) k = hairRatio;
    else if (stubble && f > 0.15 && dy < -0.22 && g2(dx / 0.26, (dy + 0.345) / 0.075) < 0.35) k = [0.84, 0.83, 0.86];
    const lip = g2(dx / 0.24, (dy + 0.345) / 0.05) * f;
    k = [k[0] * (1 + 0.1 * lip), k[1] * (1 - 0.22 * lip), k[2] * (1 - 0.16 * lip)];
    const blush = g2((ax - 0.55) / 0.2, (dy + 0.05) / 0.18) * f * 0.08, noseR = g2(dx / 0.1, (dy + 0.14) / 0.07) * f * 0.07;
    const sock = g2((ax - 0.4) / 0.13, (dy - 0.17) / 0.08) * f * 0.12;               // тени в глазницах
    col[i * 3] = k[0] * (1 + blush + noseR - sock); col[i * 3 + 1] = k[1] * (1 - blush * 0.5 - sock); col[i * 3 + 2] = k[2] * (1 - blush * 0.5 - sock * 0.8);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
/* точка на поверхности головы (для глаз, бровей, ушей) */
const HEAD_C = [0, 1.73, 0.008];
const EYE = { x: 0.0305, y: 1.752, z: 0.08, r: 0.0112 };

/* ═══════════ перчатка с пальцами (кость кисти; пальцы вниз, ладонь внутрь, большой палец вперёд) ═══════════ */
function glove(mat, cuffMat, s) {
  const g = new THREE.Group(), fingers = [];
  const add = (geo, m, parent = g) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const cuff = new THREE.CylinderGeometry(0.036, 0.039, 0.05, 16); cuff.translate(0, 0.0, 0.004); add(cuff, cuffMat);
  const palm = new THREE.SphereGeometry(1, 18, 12); palm.scale(0.017, 0.056, 0.043); palm.translate(-s * 0.004, -0.066, 0.004); add(palm, mat);
  const back = new THREE.BoxGeometry(0.02, 0.07, 0.07); back.translate(s * 0.002, -0.07, 0.004); add(back, mat);
  const F = [[0.029, 0.042, 0.034], [0.01, 0.047, 0.037], [-0.009, 0.044, 0.035], [-0.027, 0.035, 0.029]];
  for (const [z, l1, l2] of F) {
    const k1 = new THREE.Group(); k1.position.set(-s * 0.002, -0.118, z + 0.003); g.add(k1);
    const a = new THREE.CapsuleGeometry(0.0098, l1 - 0.018, 3, 8); a.translate(0, -l1 / 2 + 0.004, 0); add(a, mat, k1);
    const k2 = new THREE.Group(); k2.position.y = -l1 + 0.006; k1.add(k2);
    const b = new THREE.CapsuleGeometry(0.0088, l2 - 0.016, 3, 8); b.translate(0, -l2 / 2 + 0.004, 0); add(b, mat, k2);
    fingers.push([k1, k2]);
  }
  const t1 = new THREE.Group(); t1.position.set(-s * 0.012, -0.04, 0.04); t1.rotation.set(0.5, 0, -s * 0.35); g.add(t1);
  const ta = new THREE.CapsuleGeometry(0.0115, 0.03, 3, 8); ta.translate(0, -0.022, 0); add(ta, mat, t1);
  const t2 = new THREE.Group(); t2.position.y = -0.044; t1.add(t2);
  const tb = new THREE.CapsuleGeometry(0.0102, 0.024, 3, 8); tb.translate(0, -0.018, 0); add(tb, mat, t2);
  /* k: 0 — расслабленная кисть, 1 — кулак на рукоятке */
  const curl = (k) => {
    for (const [a, b] of fingers) { a.rotation.z = -s * (0.25 + 1.2 * k); b.rotation.z = -s * (0.3 + 1.25 * k); }
    t1.rotation.set(0.5 + 0.35 * k, 0, -s * (0.35 + 0.55 * k)); t2.rotation.z = -s * 0.5 * k;
  };
  curl(0);
  return { group: g, curl, grip: new THREE.Vector3(-s * 0.03, -0.122, 0.004) };
}

/* ═══════════ ботинок (кость голеностопа: подошва на 0.08 ниже) ═══════════ */
function bootGeo() {
  const up = [], sole = [], seg = 22;
  const loftZ = (st, out, n) => {
    const pos = [], idx = [];
    for (const s of st) for (let k = 0; k <= seg; k++) {
      const f = (k / seg) * TAU, c = Math.cos(f), sn = Math.sin(f), cy = (s.top + s.bot) / 2, ry = (s.top - s.bot) / 2;
      pos.push(s.rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), cy + ry * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n), s.z);
    }
    const ring = seg + 1;
    for (let j = 0; j < st.length - 1; j++) for (let k = 0; k < seg; k++) { const a = j * ring + k, b = a + ring; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    for (const [j, end] of [[0, -1], [st.length - 1, 1]]) {
      const ci = pos.length / 3, s = st[j]; pos.push(0, (s.top + s.bot) / 2, s.z + end * 0.004);
      for (let k = 0; k < seg; k++) { const a = j * ring + k; if (end > 0) idx.push(ci, a, a + 1); else idx.push(ci, a + 1, a); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); out.push(g);
  };
  const Z = (z, rx, bot, top) => ({ z, rx, bot, top });
  loftZ([Z(-0.084, 0.026, -0.058, -0.004), Z(-0.072, 0.039, -0.062, 0.018), Z(-0.03, 0.045, -0.062, 0.034), Z(0.02, 0.048, -0.062, 0.03), Z(0.06, 0.051, -0.062, 0.006),
    Z(0.1, 0.053, -0.062, -0.014), Z(0.14, 0.052, -0.062, -0.024), Z(0.175, 0.047, -0.062, -0.031), Z(0.198, 0.035, -0.061, -0.037), Z(0.212, 0.016, -0.058, -0.045)], up, 2.6);
  loftZ([Z(-0.09, 0.034, -0.08, -0.056), Z(-0.078, 0.046, -0.08, -0.056), Z(-0.02, 0.05, -0.08, -0.058), Z(0.01, 0.048, -0.074, -0.058), Z(0.05, 0.054, -0.076, -0.058),
    Z(0.12, 0.059, -0.08, -0.058), Z(0.18, 0.054, -0.08, -0.058), Z(0.207, 0.04, -0.079, -0.058), Z(0.219, 0.02, -0.075, -0.058)], sole, 4);
  // голенище
  const shaft = new THREE.CylinderGeometry(1, 1, 0.13, 20, 1, true); shaft.scale(0.043, 1, 0.05); shaft.translate(0, 0.035, -0.02);
  const rim = new THREE.TorusGeometry(1, 0.08, 6, 20); rim.rotateX(Math.PI / 2); rim.scale(0.044, 1, 0.051); rim.scale(1, 0.1, 1); rim.translate(0, 0.1, -0.02);
  up.push(shaft, rim);
  const laces = [];
  for (let k = 0; k < 5; k++) { const z = 0.018 + k * 0.022, top = [0.03, 0.02, 0.008, -0.004, -0.012][k]; const b = new THREE.BoxGeometry(0.05, 0.004, 0.005); b.rotateX(-0.35); b.translate(0, top + 0.004, z); laces.push(b); }
  return { up, sole, laces };
}

/* ═══════════ кепка (кость головы): тулья из клиньев, околыш, козырёк, пуговка; сидит с наклоном назад ═══════════ */
function capGeo() {
  const crown = new THREE.SphereGeometry(1, 30, 14, 0, TAU, 0, Math.PI / 2); crown.scale(0.081, 0.068, 0.102);
  const band = new THREE.CylinderGeometry(1, 1, 0.022, 30, 1, true); band.scale(0.0815, 1, 0.1025); band.translate(0, -0.006, 0);
  const vs = new THREE.Shape();
  for (let k = 0; k <= 20; k++) { const t = (k / 20) * Math.PI; const x = 0.086 * Math.cos(t), z = 0.03 + 0.14 * Math.sin(t); k ? vs.lineTo(x, z) : vs.moveTo(x, z); }
  for (let k = 20; k >= 0; k--) { const t = (k / 20) * Math.PI; vs.lineTo(0.08 * Math.cos(t), 0.098 * Math.sin(t)); }
  const visor = new THREE.ExtrudeGeometry(vs, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1, curveSegments: 4 });
  visor.rotateX(Math.PI / 2); visor.translate(0, -0.012, 0); visor.rotateX(0.1);
  // лёгкий прогиб козырька
  { const q = visor.attributes.position; for (let i = 0; i < q.count; i++) { const x = q.getX(i); q.setY(i, q.getY(i) - 0.35 * x * x); } visor.computeVertexNormals(); }
  const button = new THREE.SphereGeometry(0.009, 10, 6); button.scale(1, 0.5, 1); button.translate(0, 0.068, 0);
  const seams = [];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; const c = new THREE.TorusGeometry(1, 0.012, 3, 16, Math.PI / 2); c.rotateY(a); c.scale(0.0815, 0.0685, 0.1025); seams.push(c); }
  const all = { crown, band, visor, button, seams };
  for (const g of [crown, band, visor, button, ...seams]) { g.rotateX(-0.16); g.translate(0, 1.793, -0.004); }
  return all;
}

/* ═══════════ сборка техника ═══════════ */
const matCache = new Map();
const cached = (key, f) => { if (!matCache.has(key)) matCache.set(key, f()); return matCache.get(key); };
function flagTex() {
  const c = canvas(64, 40), g = c.getContext("2d");
  g.fillStyle = "#c8313e"; g.fillRect(0, 0, 64, 27); g.fillStyle = "#3d8a3d"; g.fillRect(0, 27, 64, 13);
  g.fillStyle = "#fff"; g.fillRect(0, 0, 9, 40); g.fillStyle = "#c8313e"; for (let y = 2; y < 40; y += 6) { g.fillRect(2, y, 5, 2); g.fillRect(4, y + 2, 1, 2); }
  return texFromCanvas(c, { clamp: true });
}

export function buildTechnician(T, o = {}) {
  const suit = suitMaterial(o.suit || "#2e3a48");
  const skinCol = new THREE.Color(o.skin || "#c9a084"), hairCol = new THREE.Color(o.hair || "#3b2c22");
  const skin = new THREE.MeshPhysicalMaterial({ color: skinCol, roughness: 0.55, metalness: 0, vertexColors: true, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color("#ffb59a") });
  const skinPlain = new THREE.MeshPhysicalMaterial({ color: skinCol, roughness: 0.55, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color("#ffb59a") });
  const hairRatio = [hairCol.r / skinCol.r, hairCol.g / skinCol.g, hairCol.b / skinCol.b];
  const M = cached("m", () => ({
    glove: new THREE.MeshStandardMaterial({ color: "#6f5639", roughness: 0.85, normalMap: T.fabric.normal, normalScale: new THREE.Vector2(0.6, 0.6) }),
    gloveCuff: new THREE.MeshStandardMaterial({ color: "#39352f", roughness: 0.9, normalMap: T.fabric.normal }),
    boot: new THREE.MeshPhysicalMaterial({ color: "#1a1a1b", roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.5 }),
    sole: new THREE.MeshStandardMaterial({ color: "#121212", roughness: 0.92 }),
    lace: new THREE.MeshStandardMaterial({ color: "#6b5a44", roughness: 0.8 }),
    belt: new THREE.MeshStandardMaterial({ color: "#1d1e1f", roughness: 0.6, normalMap: T.fabric.normal }),
    buckle: new THREE.MeshStandardMaterial({ color: "#a9aeb1", roughness: 0.3, metalness: 1 }),
    pouch: new THREE.MeshStandardMaterial({ color: "#3b3f33", roughness: 0.85, normalMap: T.fabric.normal }),
    sclera: new THREE.MeshStandardMaterial({ color: "#d9d0c6", roughness: 0.2 }),
    iris: new THREE.MeshStandardMaterial({ color: "#4d5f68", roughness: 0.2 }),
    pupil: new THREE.MeshStandardMaterial({ color: "#0b0b0b", roughness: 0.1 }),
    flag: new THREE.MeshStandardMaterial({ map: flagTex(), roughness: 0.7 }),
  }));
  const hairM = new THREE.MeshStandardMaterial({ color: hairCol, roughness: 0.75 });
  const capM = cached("cap" + (o.cap || "#1f2a36"), () => new THREE.MeshStandardMaterial({ color: o.cap || "#1f2a36", roughness: 0.9, normalMap: T.fabric.normal, normalScale: new THREE.Vector2(0.8, 0.8) }));
  const capDark = cached("capd" + (o.cap || "#1f2a36"), () => new THREE.MeshStandardMaterial({ color: new THREE.Color(o.cap || "#1f2a36").multiplyScalar(0.7), roughness: 0.9 }));

  const root = new THREE.Group(); root.name = "technician";
  // ── скелет (позиции как у прежней модели — анимация совместима)
  const bones = {};
  const bone = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); (parent || root).add(b); bones[name] = b; return b; };
  const hips = bone("hips", null, 0, 0.98, 0), spine = bone("spine", hips, 0, 0.08, 0), chest = bone("chest", spine, 0, 0.42, 0);
  const neck = bone("neck", chest, 0, 0.07, 0), head = bone("head", neck, 0, 0.1, 0);
  const arms = {}, legs = {};
  for (const [k, s] of [["R", 1], ["L", -1]]) {
    const sh = bone("sh" + k, chest, s * 0.182, -0.02, 0), upper = bone("up" + k, sh, 0, 0, 0), fore = bone("fore" + k, upper, 0, -0.29, 0), hand = bone("hand" + k, fore, 0, -0.27, 0);
    arms[k] = { sh, upper, fore, hand };
    const hip = bone("hip" + k, hips, s * 0.1, -0.04, 0), thigh = bone("thigh" + k, hip, 0, 0, 0), knee = bone("knee" + k, thigh, 0, -0.44, 0), ankle = bone("ankle" + k, knee, 0, -0.42, 0);
    legs[k] = { hip, thigh, knee, ankle };
  }
  const skeleton = new THREE.Skeleton(BONES.map((n) => bones[n]));
  root.updateMatrixWorld(true);
  const skinned = (geo, mat) => { const m = new THREE.SkinnedMesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; root.add(m); m.bind(skeleton); return m; };
  // ── комбинезон
  const B = new Builder();
  loftY(B, TORSO, { seg: 36, uv: UV.torso, bump: torsoBump, capBot: true });
  for (const mirror of [false, true]) {
    loftY(B, ARM, { seg: 20, uv: UV.arm, capTop: true, capBot: true, mirror });
    loftY(B, LEG, { seg: 22, uv: UV.leg, capTop: true, capBot: true, mirror, bump: (f, y) => 1 + 0.06 * Math.max(0, -Math.sin(f)) * g2((y - 0.37) / 0.08, 0) });
  }
  loftY(B, COLLAR, { seg: 30, uv: UV.collar });
  skinned(B.geometry(), suit);
  // ── шея
  const N = new Builder(); loftY(N, NECK, { seg: 18, uv: [0, 0, 1, 1, 1.5, 1.66] });
  skinned(N.geometry(), skinPlain);
  // ── голова: лицо, глаза с веками, брови, уши, кепка
  const at = (parent, geo, mat, py = 0) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.position.y = py; parent.add(m); return m; };
  const hy = -1.65;                                   // из системы «ноги на полу» в систему кости головы
  at(head, headGeo(hairRatio, !o.female && o.stubble !== false), skin, hy);
  for (const s of [1, -1]) {
    const ex = s * EYE.x, ey = EYE.y, ez = EYE.z;
    const e = new THREE.SphereGeometry(EYE.r, 14, 10); e.translate(ex, ey, ez); at(head, e, M.sclera, hy);
    const ir = new THREE.SphereGeometry(0.0062, 12, 8); ir.scale(1, 1, 0.45); ir.translate(ex, ey, ez + EYE.r * 0.93); at(head, ir, M.iris, hy);
    const pu = new THREE.CircleGeometry(0.0026, 10); pu.translate(ex, ey, ez + EYE.r * 0.93 + 0.0029); at(head, pu, M.pupil, hy);
    const lid = new THREE.SphereGeometry(EYE.r + 0.0011, 14, 8, 0, TAU, 0, Math.PI * 0.41); lid.rotateX(0.1); lid.translate(ex, ey, ez); at(head, lid, skinPlain, hy);
    const low = new THREE.SphereGeometry(EYE.r + 0.0008, 14, 6, 0, TAU, Math.PI * 0.68, Math.PI * 0.32); low.rotateX(-0.08); low.translate(ex, ey, ez); at(head, low, skinPlain, hy);
    const br = new THREE.BoxGeometry(0.031, 0.0058, 0.009); br.rotateZ(s * -0.1); br.rotateY(s * -0.28); br.translate(s * 0.033, 1.7725, 0.0948); at(head, br, hairM, hy);
    const ear = new THREE.SphereGeometry(1, 14, 10); ear.scale(0.01, 0.03, 0.019); ear.rotateY(s * 0.35); ear.translate(s * 0.077, 1.735, -0.006); at(head, ear, skinPlain, hy);
    const earIn = new THREE.TorusGeometry(0.015, 0.0035, 5, 12, Math.PI * 1.4); earIn.rotateY(s * Math.PI / 2); earIn.rotateX(Math.PI * 0.8); earIn.scale(1, 1.5, 1); earIn.translate(s * 0.083, 1.737, -0.006); at(head, earIn, skinPlain, hy);
  }
  if (o.female) {                                     // собранные в пучок волосы под кепкой
    const bun = new THREE.SphereGeometry(0.036, 14, 10); bun.scale(1, 0.85, 0.9); bun.translate(0, 1.74, -0.1); at(head, bun, hairM, hy);
    const tail = new THREE.SphereGeometry(1, 16, 12); tail.scale(0.07, 0.06, 0.05); tail.translate(0, 1.745, -0.07); at(head, tail, hairM, hy);
    root.scale.setScalar(0.95);
  }
  if (o.mustache) {                                  // усы: два сужающихся к краям валика над верхней губой
    for (const s of [1, -1]) { const mu = new THREE.CapsuleGeometry(0.0042, 0.024, 3, 8); mu.rotateZ(Math.PI / 2 + s * 0.35); mu.scale(1, 0.75, 0.7); mu.translate(s * 0.0125, 1.7015, 0.1055 - 0.004 * 0); at(head, mu, hairM, hy); }
  }
  const cp = capGeo();
  for (const gg of [cp.crown, cp.visor]) at(head, gg, capM, hy);
  at(head, cp.band, capDark, hy); at(head, cp.button, capDark, hy);
  for (const s of cp.seams) at(head, s, capDark, hy);
  // ── перчатки
  const hands = {};
  for (const [k, s] of [["R", 1], ["L", -1]]) { const gl = glove(M.glove, M.gloveCuff, s); gl.group.position.set(s * 0.005, -0.004, 0.012); arms[k].hand.add(gl.group); hands[k] = gl; }
  // ── ботинки
  const bt = bootGeo();
  for (const k of ["R", "L"]) {
    const g = new THREE.Group(); g.position.set((k === "R" ? -1 : 1) * 0.005, 0, 0.01); legs[k].ankle.add(g);
    for (const u of bt.up) at(g, u, M.boot); for (const s of bt.sole) at(g, s, M.sole); for (const l of bt.laces) at(g, l, M.lace);
  }
  // ── ремень с пряжкой, подсумок, флаг на рукаве
  {
    const belt = new THREE.CylinderGeometry(1, 1, 0.042, 36, 1, true); belt.scale(0.154, 1, 0.107); belt.translate(0, 0.0, -0.004);
    at(spine, belt, M.belt, 1.105 - 1.06);
    const bk = new THREE.BoxGeometry(0.055, 0.045, 0.008); bk.translate(0, 0, 0.107); at(spine, bk, M.buckle, 1.105 - 1.06);
    const pouch = new THREE.BoxGeometry(0.05, 0.1, 0.09); pouch.translate(0.164, -0.06, -0.01); at(spine, pouch, M.pouch, 1.105 - 1.06);
    const flap = new THREE.BoxGeometry(0.054, 0.035, 0.094); flap.translate(0.166, -0.02, -0.01); at(spine, flap, M.pouch, 1.105 - 1.06);
    const fl = new THREE.BoxGeometry(0.004, 0.034, 0.052); fl.rotateY(Math.PI); fl.translate(-0.064, 0, 0.002); at(arms.L.upper, fl, M.flag, -0.075);
  }
  // ── инструмент в руках (по виду работы)
  const toolSets = {};
  let toolKind = null;
  const setTool = (kind) => {
    if (kind === toolKind) return; toolKind = kind;
    for (const s of Object.values(toolSets)) for (const t of s) if (t) t.visible = false;
    if (!kind) return;
    if (!toolSets[kind]) {
      const [r, l] = toolsFor(kind);
      for (const [t, k] of [[r, "R"], [l, "L"]]) if (t) { t.position.copy(hands[k].grip).add(hands[k].group.position); t.rotation.set(k === "R" ? 0.15 : -0.2, 0, 0); arms[k].hand.add(t); t.traverse((x) => { if (x.isMesh) x.castShadow = true; }); }
      toolSets[kind] = [r, l];
    }
    for (const t of toolSets[kind]) if (t) t.visible = true;
  };
  const st = { phase: 0, t: 0, grip: 0 };

  /* p: {speed, crouch, work, ladder, dt, lookPitch, tool} */
  function animate(p) {
    st.t += p.dt;
    const sp = p.speed || 0, run = THREE.MathUtils.clamp((sp - 2) / 2, 0, 1), walk = THREE.MathUtils.clamp(sp / 1.2, 0, 1);
    st.phase += p.dt * (sp > 0.05 ? (4.6 + run * 3.2) * Math.min(1, sp / 1.4 + 0.3) : 0);
    const ph = st.phase, c = p.crouch || 0, w = p.work || 0, lad = p.ladder || 0;
    const A = (0.45 + run * 0.35) * walk;
    for (const [k, s] of [["L", 1], ["R", -1]]) {
      const L = legs[k], a = Math.sin(ph + (s > 0 ? 0 : Math.PI));
      let thighX = -a * A, kneeX = Math.max(0, Math.sin(ph + (s > 0 ? 0 : Math.PI) + 1.2)) * (0.9 + run * 0.6) * walk;
      thighX = THREE.MathUtils.lerp(thighX, -1.35, c); kneeX = THREE.MathUtils.lerp(kneeX, 2.25, c);
      if (lad) { const la = Math.sin(st.t * 4 + (s > 0 ? 0 : Math.PI)); thighX = -0.6 - la * 0.35; kneeX = 0.9 + la * 0.3; }
      L.thigh.rotation.x = thighX; L.knee.rotation.x = kneeX; L.ankle.rotation.x = THREE.MathUtils.lerp(-kneeX * 0.35 - thighX * 0.3, -0.9, c);
      L.thigh.rotation.z = s * 0.03;
      const Ar = arms[k], b = Math.sin(ph + (s > 0 ? Math.PI : 0));
      let ux = -b * A * 0.8, fx = -0.25 - Math.max(0, b) * 0.4 * walk - run * 0.9;
      ux = THREE.MathUtils.lerp(ux, -0.3, c * 0.5);
      if (w > 0) {
        const wk = s < 0 ? Math.sin(st.t * 9) * 0.25 : Math.sin(st.t * 3) * 0.08;
        ux = THREE.MathUtils.lerp(ux, -1.2 + wk, w); fx = THREE.MathUtils.lerp(fx, -0.9 + wk * 0.5, w);
      }
      if (lad) { const la = Math.sin(st.t * 4 + (s > 0 ? Math.PI : 0)); ux = -2.2 - la * 0.3; fx = -0.5; }
      Ar.upper.rotation.x = ux; Ar.fore.rotation.x = fx; Ar.upper.rotation.z = s * (0.08 + run * 0.05);
      Ar.hand.rotation.x = w > 0 ? -0.35 * w : 0;
    }
    const breath = Math.sin(st.t * 1.6) * 0.01;
    hips.position.y = 0.98 - Math.abs(Math.sin(ph)) * 0.035 * walk + THREE.MathUtils.lerp(0, -0.42, c);
    hips.position.z = THREE.MathUtils.lerp(0, -0.12, c);
    spine.rotation.x = THREE.MathUtils.lerp(0.04 * walk + run * 0.18, 0.45, c) + w * 0.15 + breath;
    chest.rotation.y = Math.sin(ph) * 0.12 * walk;
    chest.rotation.x = breath * 0.6;
    head.rotation.x = THREE.MathUtils.clamp(-(p.lookPitch || 0) * 0.6, -0.5, 0.6) - spine.rotation.x * 0.6;
    const working = w > 0.3;
    setTool(working ? p.tool || "remove" : null);
    st.grip += ((working || lad ? 1 : 0.15) - st.grip) * Math.min(1, p.dt * 8);
    hands.R.curl(st.grip); hands.L.curl(working && p.tool === "inspect" ? 0.9 : lad ? 1 : st.grip * 0.6);
  }
  return { root, animate, parts: { head, hips, arms, legs } };
}

/* ═══════════ руки от первого лица ═══════════ */
/* рукава комбинезона (та же ткань), перчатки с пальцами, инструмент по виду работы */
/* мультиметр в левой руке: экран (+X прибора) к камере, длинная сторона вверх, верх чуть от себя */
const MM_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)))
  .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.45));
export function buildViewmodel(T) {
  const suit = suitMaterial("#2e3a48");
  const gloveM = new THREE.MeshStandardMaterial({ color: "#6a5236", roughness: 0.85, normalMap: T.fabric.normal, normalScale: new THREE.Vector2(0.6, 0.6) });
  const cuffM = new THREE.MeshStandardMaterial({ color: "#39352f", roughness: 0.9, normalMap: T.fabric.normal });
  const root = new THREE.Group(); root.visible = false;
  // рукав: предплечье из атласа (без скиннинга), повёрнуто вдоль −Z камеры
  const sleeveGeo = (() => {
    const Bd = new Builder(); loftY(Bd, ARM.slice(7).map((s) => ({ ...s, cx: 0, cz: 0, w: { foreR: 1 } })), { seg: 20, uv: UV.arm, capTop: true });
    const g = Bd.geometry(); g.deleteAttribute("skinIndex"); g.deleteAttribute("skinWeight"); g.translate(0, -0.908, 0); return g;
  })();
  const arm = (s) => {
    const g = new THREE.Group();
    const sl = new THREE.Mesh(sleeveGeo, suit); g.add(sl);
    const gl = glove(gloveM, cuffM, s); gl.group.position.y = 0.005; g.add(gl.group);
    // кисть «вниз по руке»: рука вытянута вперёд — поворачиваем так, чтобы пальцы смотрели от камеры
    g.rotation.x = Math.PI / 2;
    const holder = new THREE.Group(); holder.add(g); root.add(holder);
    return { holder, gl, g };
  };
  const R = arm(1), Lh = arm(-1);
  const sets = {};
  let cur = null;
  const setTool = (kind) => {
    if (kind === cur) return; cur = kind;
    for (const s of Object.values(sets)) for (const t of s) if (t) t.visible = false;
    if (!kind) return;
    if (!sets[kind]) {
      const [r, l] = toolsFor(kind);
      for (const [t, A] of [[r, R], [l, Lh]]) if (t) {
        t.traverse((x) => { if (x.isMesh) { x.castShadow = false; x.receiveShadow = false; x.frustumCulled = false; } });
        if (t.name === "multimeter") { root.add(t); continue; }                 // прибор держим экраном к себе
        t.position.copy(A.gl.grip).add(A.gl.group.position); t.rotation.x = 2.1; A.g.add(t);
      }
      sets[kind] = [r, l];
    }
    for (const t of sets[kind]) if (t) t.visible = true;
  };
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  let t = 0, show = 0;
  function update(dt, kind) {
    t += dt;
    show += ((kind ? 1 : 0) - show) * Math.min(1, dt * 8);
    root.visible = show > 0.02;
    if (!root.visible) return;
    setTool(kind || cur);
    const slide = (1 - show) * 0.25, k = kind === "inspect" ? 0 : 1, sw = Math.sin(t * 9);
    R.gl.curl(1); Lh.gl.curl(kind === "inspect" ? 0.9 : 0.35);
    R.holder.position.set(0.16, -0.18 - slide + sw * 0.012 * k, -0.24 + sw * 0.015 * k);
    R.holder.rotation.set(0.2 + sw * 0.18 * k, -0.25, 0.25 + sw * 0.3 * k);
    Lh.holder.position.set(-0.16, -0.19 - slide + Math.sin(t * 2.3) * 0.005, -0.24);
    Lh.holder.rotation.set(kind === "inspect" ? 0.55 : 0.15, 0.25, kind === "inspect" ? -0.5 : -0.2);
    const mm = sets.inspect && sets.inspect[1];
    if (mm && mm.visible) { mm.position.set(Lh.holder.position.x + 0.035, Lh.holder.position.y + 0.07, Lh.holder.position.z - 0.02); mm.quaternion.copy(MM_Q); }
  }
  return { root, update };
}
