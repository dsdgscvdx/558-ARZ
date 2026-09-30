/* Геометрические параметры МиГ-29 (система координат самолёта: +X — нос, +Y — вверх, +Z — правый борт,
   Y=0 — бетон при стоянке на колёсах). Размеры близки к реальным: длина 17,3 м с ПВД, размах 11,36 м. */
import { makeInterp, sePoint } from "./geo.js";

export const DEG = Math.PI / 180;

/* фюзеляж (центральное тело): сечения-суперэллипсы */
export const CORE = makeInterp([
  { x: 6.30, cy: 2.06, w: 0.52, ht: 0.52, hb: 0.52, nt: 2.0, nb: 2.0 },
  { x: 5.70, cy: 2.09, w: 0.57, ht: 0.58, hb: 0.56, nt: 2.1, nb: 2.2 },
  { x: 5.05, cy: 2.13, w: 0.61, ht: 0.64, hb: 0.60, nt: 2.35, nb: 2.4 },
  { x: 4.20, cy: 2.16, w: 0.63, ht: 0.645, hb: 0.62, nt: 2.6, nb: 2.7 },
  { x: 3.20, cy: 2.18, w: 0.64, ht: 0.645, hb: 0.63, nt: 2.7, nb: 2.8 },
  { x: 2.62, cy: 2.20, w: 0.63, ht: 0.84, hb: 0.62, nt: 2.25, nb: 2.9 },
  { x: 1.60, cy: 2.22, w: 0.60, ht: 0.74, hb: 0.60, nt: 2.25, nb: 3.0 },
  { x: 0.00, cy: 2.25, w: 0.57, ht: 0.52, hb: 0.60, nt: 2.3, nb: 3.0 },
  { x: -2.0, cy: 2.25, w: 0.57, ht: 0.38, hb: 0.52, nt: 2.4, nb: 3.0 },
  { x: -4.0, cy: 2.25, w: 0.57, ht: 0.28, hb: 0.42, nt: 2.4, nb: 2.8 },
  { x: -5.5, cy: 2.23, w: 0.57, ht: 0.20, hb: 0.30, nt: 2.6, nb: 2.8 },
  { x: -6.8, cy: 2.20, w: 0.55, ht: 0.12, hb: 0.20, nt: 2.8, nb: 2.8 },
  { x: -7.62, cy: 2.18, w: 0.40, ht: 0.06, hb: 0.08, nt: 2.8, nb: 2.8 },
  { x: -7.82, cy: 2.18, w: 0.12, ht: 0.02, hb: 0.03, nt: 2.6, nb: 2.6 },
]);
export const CORE_X0 = 6.30, CORE_X1 = -7.82;

/* мотогондолы (правая; левая — зеркально). cz — центр по Z */
export const NAC = makeInterp([
  { x: 2.40, cy: 1.64, cz: 0.95, w: 0.34, ht: 0.52, hb: 0.52, nt: 4.2, nb: 4.2, ns: 4.2 },
  { x: 1.50, cy: 1.61, cz: 0.955, w: 0.38, ht: 0.56, hb: 0.53, nt: 3.8, nb: 3.8, ns: 3.8 },
  { x: 0.00, cy: 1.58, cz: 0.97, w: 0.45, ht: 0.62, hb: 0.52, nt: 3.2, nb: 3.1, ns: 3.1 },
  { x: -2.0, cy: 1.56, cz: 1.00, w: 0.49, ht: 0.64, hb: 0.51, nt: 2.9, nb: 2.6, ns: 2.6 },
  { x: -4.5, cy: 1.56, cz: 1.04, w: 0.50, ht: 0.64, hb: 0.50, nt: 2.8, nb: 2.3, ns: 2.3 },
  { x: -5.9, cy: 1.56, cz: 1.07, w: 0.49, ht: 0.56, hb: 0.49, nt: 2.3, nb: 2.1, ns: 2.1 },
  { x: -6.45, cy: 1.56, cz: 1.08, w: 0.475, ht: 0.475, hb: 0.475, nt: 2.0, nb: 2.0, ns: 2.0 },
]);
export const NAC_X0 = 2.40, NAC_X1 = -6.45;
export const INTAKE_SLOPE = 0.5;    // скос входа: верхняя кромка (клин торможения) выдвинута вперёд, ~27°

/* наплыв + крыло: сечения вдоль размаха (правое), le/te — X кромок, y — плоскость хорд, t — толщина */
const ANH = Math.tan(2.5 * DEG);
export const WING_SECTIONS = (() => {
  const raw = [
    [0.54, 4.90, -6.40, 0.030], [0.62, 4.62, -6.40, 0.030], [0.72, 4.20, -6.40, 0.030], [0.90, 3.40, -6.40, 0.031],
    [1.12, 2.60, -6.40, 0.032], [1.40, 1.80, -6.40, 0.034], [1.55, 1.45, -6.36, 0.036], [1.68, 1.20, -5.55, 0.040],
    [1.80, 0.97, -4.85, 0.045], [1.95, 0.75, -4.45, 0.050],
  ];
  const tipZ = 5.68, tipLE = -2.85, tipTE = -4.15;
  for (const z of [2.4, 3.0, 3.6, 4.2, 4.8, 5.3, 5.68]) {
    const k = (z - 1.95) / (tipZ - 1.95);
    raw.push([z, 0.75 + (tipLE - 0.75) * k, -4.45 + (tipTE + 4.45) * k, 0.05 - 0.008 * k]);
  }
  return raw.map(([s, le, te, t]) => ({ s, le, c: le - te, t, off: 2.22 - Math.max(0, s - 1.95) * ANH }));
})();
export const WING_TIP_Z = 5.68;
export const wingY = (z) => 2.22 - Math.max(0, z - 1.95) * ANH;

/* кили: корень на балке, развал 6° наружу */
export const FIN = { z: 1.30, y0: 2.24, cant: 6 * DEG,
  sections: [
    { s: 0.00, le: -3.55, c: 3.35, t: 0.05 }, { s: 0.6, le: -4.15, c: 2.8, t: 0.048 }, { s: 1.3, le: -4.85, c: 2.15, t: 0.046 },
    { s: 1.95, le: -5.5, c: 1.55, t: 0.044 }, { s: 2.2, le: -5.75, c: 1.35, t: 0.043 }, { s: 2.48, le: -6.02, c: 1.12, t: 0.042 },
  ] };
/* цельноповоротный стабилизатор: ось вращения */
export const STAB = { z0: 1.60, y0: 1.74, anh: -3.5 * DEG, pivotX: -6.05,
  sections: [
    { s: 1.60, le: -5.30, c: 2.45, t: 0.042 }, { s: 2.2, le: -5.85, c: 2.05, t: 0.04 }, { s: 3.0, le: -6.6, c: 1.4, t: 0.038 },
    { s: 3.6, le: -7.0, c: 0.98, t: 0.036 }, { s: 3.89, le: -7.18, c: 0.78, t: 0.035 },
  ] };

/* фонарь */
export const CANOPY = { x0: 4.98, xw: 4.30, x1: 2.64, hingeX: 2.64, hingeY: 3.02, sillT: 50 * DEG };
export const canopyTop = makeInterp([
  { x: 4.98, top: 2.775, w: 0.52 }, { x: 4.60, top: 3.10, w: 0.53 }, { x: 4.30, top: 3.24, w: 0.535 },
  { x: 3.70, top: 3.34, w: 0.54 }, { x: 3.10, top: 3.30, w: 0.53 }, { x: 2.64, top: 3.08, w: 0.50 },
]);

/* сечение фонаря: phi ∈ [−1, 1] от левого борта до правого, grow — смещение наружу.
   Козырёк — плоское лобовое бронестекло между двумя стойками и скруглённые боковины;
   откидная часть — «пузырь», в передней части плавно переходящий в профиль козырька. */
export const WS = { zfTop: 0.15, zfBot: 0.19, pf: 0.36, blend: 0.45 };
const smooth01 = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export function canopyPt(x, phi, grow = 0) {
  const c = canopyTop(x), [ys, zs] = sePoint(CORE(x), CANOPY.sillT), hw = zs * 1.015 + grow;
  const sg = phi < 0 ? -1 : 1, ap = Math.min(1, Math.abs(phi)), a = (ap * Math.PI) / 2;
  const yb = ys + (c.top + grow - ys) * Math.pow(Math.cos(a), 0.87), zb = hw * Math.pow(Math.sin(a), 0.87);
  const f = x >= CANOPY.xw ? 1 : smooth01((x - (CANOPY.xw - WS.blend)) / WS.blend);
  if (f <= 0) return [x, yb, sg * zb];
  const k = Math.max(0, Math.min(1, (x - CANOPY.xw) / (CANOPY.x0 - CANOPY.xw)));
  const tw = canopyTop(CANOPY.xw).top, t0 = canopyTop(CANOPY.x0).top;
  const yT = (x >= CANOPY.xw ? tw + (t0 - tw) * k : c.top) + grow, zf = WS.zfTop + (WS.zfBot - WS.zfTop) * k;
  let yw, zw;
  if (ap <= WS.pf) { zw = (ap / WS.pf) * zf; yw = yT; }
  else { const b = ((ap - WS.pf) / (1 - WS.pf)) * Math.PI / 2; zw = zf + (hw - zf) * Math.pow(Math.sin(b), 0.8); yw = ys + (yT - ys) * Math.pow(Math.cos(b), 0.8); }
  return [x, yb + (yw - yb) * f, sg * (zb + (zw - zb) * f)];
}
/* высота внутренней поверхности остекления над точкой (x, z) — для проверки зазоров */
export function canopyYAt(x, z) {
  let lo = 0, hi = 1, az = Math.abs(z);
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (Math.abs(canopyPt(x, m)[2]) < az) lo = m; else hi = m; }
  return canopyPt(x, (lo + hi) / 2)[1];
}

/* вырезы и люки (углы θ: 0 — верх, 90° — правый борт, 180° — низ) */
export const HOLES = {
  cockpit: { x0: 2.72, x1: 4.95, t0: -50 * DEG, t1: 50 * DEG },
  av: { x0: 1.20, x1: 2.05, t0: -30 * DEG, t1: 30 * DEG },
  tank: { x0: -2.15, x1: -1.10, t0: -30 * DEG, t1: 30 * DEG },
  hydro: { x0: -1.20, x1: 0.20, t0: 150 * DEG, t1: 210 * DEG },
  nosegear: { x0: 2.10, x1: 3.55, t0: 155 * DEG, t1: 205 * DEG },
};
/* капоты двигателя — вырез в нижней части мотогондолы */
export const COWL = { x0: -4.40, x1: 0.00, t0: 110 * DEG, t1: 250 * DEG };

/* шасси */
export const GEAR = {
  main: { x: -0.75, z: 1.60, legZ: 1.79, r: 0.42, w: 0.26 },
  nose: { x: 2.90, r: 0.285, w: 0.14, dz: 0.125 },
};
