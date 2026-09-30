/* Зализы — плавные переходы между фюзеляжем, наплывами, крылом и мотогондолами.
   Без них планер выглядит как труба с приклеенными пластинами; у МиГ-29 гаргрот за кабиной
   широкой дугой стекает на наплывы, а мотогондолы сливаются с нижней поверхностью крыла.
   Каждый зализ — кубическая кривая Безье в плоскости сечения (y, z), касательная к обеим
   поверхностям; вдоль X она протягивается по станциям. Кривая лежит в треугольнике между
   касательными, поэтому всегда снаружи обоих тел и не мерцает с ними. */
import { gridSurface, range, sePoint, makeInterp, mergeAll, mirrorZ } from "./geo.js";
import { CORE, NAC, WING_SECTIONS, DEG } from "./mig29dims.js";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DEG45 = 45 * DEG;

/* сечение крыла на полуразмахе z (линейно между заданными сечениями) */
function sec(z) {
  const S = WING_SECTIONS; let i = 0; while (i < S.length - 2 && S[i + 1].s < z) i++;
  const a = S[i], b = S[i + 1], k = clamp((z - a.s) / (b.s - a.s), 0, 1);
  const L = (n) => a[n] + (b[n] - a[n]) * k;
  return { le: L("le"), c: L("c"), t: L("t"), off: L("off") };
}
const naca = (xc, t) => 5 * t * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1036 * xc ** 4);
export function wingSurfY(x, z, side = 1) {
  const s = sec(z), xc = clamp((s.le - x) / s.c, 0.001, 1);
  return s.off + side * naca(xc, s.t) * s.c;
}
/* полуразмах передней кромки наплыва на станции x */
export function lerxSpan(x) {
  const S = WING_SECTIONS;
  if (x >= S[0].le) return S[0].s;
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i], b = S[i + 1];
    if (x <= a.le && x >= b.le) return a.s + ((b.s - a.s) * (a.le - x)) / (a.le - b.le);
  }
  return S[S.length - 1].s;
}

/* кубическая Безье через угол касательных */
function bez(P0, T0, P1, T1, a = 0.58, b = 0.58) {
  const dx = P1[0] - P0[0], dy = P1[1] - P0[1], det = T0[0] * -T1[1] - T0[1] * -T1[0];
  let t = 0, s = 0;
  if (Math.abs(det) > 1e-6) { t = (dx * -T1[1] - dy * -T1[0]) / det; s = (T0[0] * dy - T0[1] * dx) / det; }
  if (!(t > 0 && s > 0)) { const L = Math.hypot(dx, dy) / 3; t = s = L; a = b = 1; }
  const Q1 = [P0[0] + T0[0] * t * a, P0[1] + T0[1] * t * a], Q2 = [P1[0] - T1[0] * s * b, P1[1] - T1[1] * s * b];
  return (u) => {
    const v = 1 - u, A = v * v * v, B = 3 * v * v * u, C = 3 * v * u * u, D = u * u * u;
    return [A * P0[0] + B * Q1[0] + C * Q2[0] + D * P1[0], A * P0[1] + B * Q1[1] + C * Q2[1] + D * P1[1]];
  };
}
const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
/* касательная к сечению-суперэллипсу по возрастанию угла */
function secTan(p, th) { const e = 1e-4, a = sePoint(p, th - e), b = sePoint(p, th + e); return norm([b[0] - a[0], b[1] - a[1]]); }
/* угол, где сечение пересекает поверхность f(z) (y сечения > f при th=lo) */
function crossAngle(p, f, lo, hi) {
  const g = (th) => { const [y, z] = sePoint(p, th); return y - f(z); };
  if (g(lo) <= 0 || g(hi) >= 0) return null;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/* размер зализа гаргрот → наплыв/крыло по станциям: мал у кабины и пушки, велик над центропланом */
const UPPER = makeInterp([
  { x: 4.55, d: 0.0 }, { x: 4.1, d: 0.035 }, { x: 3.0, d: 0.05 }, { x: 2.35, d: 0.09 }, { x: 1.5, d: 0.2 },
  { x: 0.6, d: 0.34 }, { x: -1.2, d: 0.42 }, { x: -3.0, d: 0.42 }, { x: -4.4, d: 0.36 }, { x: -5.5, d: 0.2 }, { x: -6.25, d: 0.0 },
]);
export const UPPER_X0 = 4.55, UPPER_X1 = -6.25;

/* кривая сечения верхнего зализа на станции x (правый борт) или null */
export function upperCurve(x) {
  if (x > UPPER_X0 || x < UPPER_X1) return null;
  const d = UPPER(x).d; if (d < 0.004) return null;
  const p = CORE(x), top = (z) => wingSurfY(x, z, 1);
  const thj = crossAngle(p, top, 5 * DEG, 175 * DEG); if (thj == null) return null;
  const [yj, zj] = sePoint(p, thj);
  const span = lerxSpan(x);
  const z1 = Math.min(zj + d, zj + (span - zj) * 0.6);
  if (z1 - zj < 0.004) return null;
  // точка схода с фюзеляжа: выше линии стыка, но ниже люков гаргрота (±30°) и выреза кабины (±50°)
  const thMin = x > 2.6 ? 60 * DEG : DEG45;
  const thd = Math.max(thMin, thj - ((z1 - zj) / p.w) * 1.6);
  const P0 = sePoint(p, thd), T0 = secTan(p, thd);
  const e = 1e-3, P1 = [top(z1), z1], T1 = norm([(top(z1 + e) - top(z1 - e)) / (2 * e), 1]);
  void yj;
  return bez(P0, T0, P1, T1);
}
/* высота верхней поверхности планера (с учётом зализа) над точкой (x, |z|) */
export function upperY(x, z) {
  const w = wingSurfY(x, z, 1), c = upperCurve(x);
  if (!c) return w;
  const a = c(0), b = c(1);
  if (z < a[1] || z > b[1]) return w;
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (c(m)[1] < z) lo = m; else hi = m; }
  return Math.max(w, c((lo + hi) / 2)[0]);
}

/* поверхность по станциям: каждая станция даёт кривую (u → [y, z]) */
function sweep(xs, curveAt, n = 10, flip = false) {
  const cache = xs.map((x) => curveAt(x));
  // пустые станции (нулевой размер) — вырожденная кривая в точке соседней
  const us = range(0, 1, n);
  let run = [], out = [];
  const flush = () => {
    if (run.length >= 2) out.push(gridSurface((i, u) => { const [y, z] = cache[i](u); return [xs[i], y, z]; }, run, us, { flip }));
    run = [];
  };
  xs.forEach((x, i) => { if (cache[i]) run.push(i); else flush(); });
  flush();
  return out.length ? mergeAll(out) : null;
}

export function upperFillets(detail = 1) {
  const xs = range(UPPER_X0 - 0.01, UPPER_X1 + 0.01, Math.round(110 * detail));
  const g = sweep(xs, upperCurve, Math.max(6, Math.round(12 * detail)), false);
  return g ? mergeAll([g, mirrorZ(g)]) : null;
}

/* зализ внешнего борта мотогондолы с нижней поверхностью крыла */
const LOWER = makeInterp([
  { x: 1.3, d: 0.0 }, { x: 0.9, d: 0.06 }, { x: 0.3, d: 0.08 }, { x: -0.2, d: 0.05 }, { x: -1.3, d: 0.05 },
  { x: -1.9, d: 0.1 }, { x: -3.6, d: 0.12 }, { x: -4.6, d: 0.1 }, { x: -5.6, d: 0.05 }, { x: -6.1, d: 0.0 },
]);
export function nacelleCurve(x) {
  if (x > 1.3 || x < -6.1) return null;
  const d = LOWER(x).d; if (d < 0.004) return null;
  const p = NAC(x), bot = (z) => wingSurfY(x, z, -1);
  // от верха гондолы (th=0, внутри крыла) к внешнему борту (th=90°): где борт выходит из-под крыла
  const thj = crossAngle(p, bot, 0, 100 * DEG);
  if (thj == null) return null;
  const [, zj] = sePoint(p, thj);
  const thd = Math.min(100 * DEG, thj + d * 2.2);
  const P0 = sePoint(p, thd), t = secTan(p, thd), T0 = [-t[0], -t[1]];       // вверх по борту
  const z1 = Math.max(zj + d, P0[1] + d * 0.7);
  const e = 1e-3, P1 = [bot(z1), z1], T1 = norm([(bot(z1 + e) - bot(z1 - e)) / (2 * e), 1]);
  return bez(P0, T0, P1, T1);
}
export function nacelleFillets(detail = 1) {
  const xs = range(1.29, -6.09, Math.round(80 * detail));
  const g = sweep(xs, nacelleCurve, Math.max(5, Math.round(8 * detail)), true);
  return g ? mergeAll([g, mirrorZ(g)]) : null;
}
