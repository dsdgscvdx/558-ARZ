/* Шасси МиГ-29: основные опоры (амортстойка, шлиц-шарниры, складной боковой подкос,
   передний подкос, цилиндр уборки, створка на стойке, колесо КТ-150 с тормозом)
   и носовая опора (спарка колёс, грязезащитный щиток, фары, фигурные створки). */
import * as THREE from "three";
import { gridSurface, range, mergeAll, mirrorZ, tube, cyl, box, rbox, place, sePoint } from "./geo.js";
import { CORE, GEAR, HOLES } from "./mig29dims.js";
import { streamer } from "./details.js";

const TAU = Math.PI * 2;
/* тело вращения вокруг вертикали (профиль [r, y]) */
const latheY = (prof, seg = 24) => new THREE.LatheGeometry(prof.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y)), seg);   // профиль задаётся сверху вниз
/* тело вращения вокруг оси Z (профиль [r, z]) */
const latheZ = (prof, seg = 32) => { const g = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), seg); g.rotateX(Math.PI / 2); return g; };
/* стержень между точками */
function rod(a, b, r, seg = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(A.x, A.y, A.z);
  return g;
}
/* плоское звено (серьга) между точками, толщина по Z */
function link(a, b, w, t) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = rbox(w, len + w, t, Math.min(w, t) * 0.45); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(A.x, A.y, A.z);
  return g;
}
const pin = (p, r, len) => cyl(r, r, len, "z", p[0], p[1], p[2], 10);

/* шина: скруглённые боковины, протектор по окружности */
export function tireGeo(R, W) {
  const rIn = R * 0.58;
  const pts = [[rIn, -W * 0.46], [R * 0.7, -W * 0.5], [R * 0.86, -W * 0.49], [R * 0.95, -W * 0.43], [R * 0.99, -W * 0.33], [R, -W * 0.2], [R, W * 0.2], [R * 0.99, W * 0.33], [R * 0.95, W * 0.43], [R * 0.86, W * 0.49], [R * 0.7, W * 0.5], [rIn, W * 0.46]];
  const g = latheZ(pts, 56);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i));
  return g;
}
/* колёсный диск: обод, спицы на наружной стороне (face = ±1 по Z), ступица с колпаком */
export function wheelHub(R, W, face, spokes = 6) {
  const Rr = R * 0.58, hw = W * 0.47;
  const rim = latheZ([[Rr - 0.016, -hw], [Rr + 0.012, -hw], [Rr + 0.012, -hw * 0.9], [Rr, -hw * 0.86], [Rr, hw * 0.86], [Rr + 0.012, hw * 0.9], [Rr + 0.012, hw], [Rr - 0.016, hw]], 48);
  const z0 = hw * 0.55, parts = [rim];
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * TAU, len = Rr - 0.075;
    const sp = new THREE.BoxGeometry(R * 0.11, len, 0.024); sp.translate(0, 0.07 + len / 2, 0); sp.rotateZ(a); sp.translate(0, 0, z0);
    parts.push(sp);
  }
  parts.push(new THREE.TorusGeometry(Rr - 0.012, 0.012, 6, 40).translate(0, 0, z0));
  parts.push(latheZ([[R * 0.2, 0], [R * 0.2, hw * 0.55], [R * 0.14, hw * 0.8], [R * 0.1, hw * 0.95], [0.001, hw * 0.95]], 24));
  const dark = new THREE.CircleGeometry(Rr - 0.004, 40).translate(0, 0, hw * 0.2);
  const bolts = [];
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; bolts.push(cyl(0.008, 0.008, 0.016, "z", Math.cos(a) * R * 0.155, Math.sin(a) * R * 0.155, hw * 0.62, 6)); }
  bolts.push(cyl(R * 0.07, R * 0.07, 0.02, "z", 0, 0, hw * 0.95, 16));
  const out = { rim: mergeAll(parts), dark, bolts: mergeAll(bolts) };
  if (face < 0) for (const k in out) out[k] = mirrorZ(out[k]);
  return out;
}

/* ═══════════ основная опора: s = +1 правая, −1 левая ═══════════ */
export function buildMainGear(s, { part, air, L, colliders, anchors, V, bayMat, flagMat, redCloth }) {
  const S = s > 0 ? "R" : "L", mg = GEAR.main, gx = mg.x, lz = mg.legZ, wz = mg.z, r = mg.r, W = mg.w;
  const mz = (g) => (s > 0 ? g : mirrorZ(g));
  const LX = gx + 0.02, TOP = 2.08;

  // колесо КТ-150: шина + диск (спицами к оси самолёта)
  const hub = wheelHub(r, W, -1);
  const at = (g) => g.translate(gx, r, wz);
  part("wheel_" + S, [[mz(at(tireGeo(r, W))), L.tire], [mz(at(hub.rim)), L.aluDark], [mz(at(hub.dark)), L.black], [mz(at(hub.bolts)), L.steel]], V(0, 0, 1.3 * s));

  // тормоз: пакет дисков в ободе, корпус с поршнями со стороны стойки
  const bz = wz + W * 0.5;
  const pack = mergeAll([cyl(r * 0.5, r * 0.5, W * 0.62, "z", gx, r, wz + W * 0.12, 32), ...Array.from({ length: 7 }, (_, k) => cyl(r * 0.52, r * 0.52, 0.007, "z", gx, r, wz - W * 0.16 + k * W * 0.08, 32))]);
  const housing = mergeAll([cyl(r * 0.46, r * 0.46, 0.05, "z", gx, r, bz + 0.012, 32), cyl(r * 0.16, r * 0.2, 0.06, "z", gx, r, bz + 0.05, 20),
    ...Array.from({ length: 10 }, (_, k) => { const a = (k / 10) * TAU; return cyl(0.022, 0.022, 0.03, "z", gx + Math.cos(a) * r * 0.36, r + Math.sin(a) * r * 0.36, bz + 0.045, 10); })]);
  const fit = mergeAll([box(0.06, 0.04, 0.05, gx + r * 0.3, r + r * 0.3, bz + 0.06), cyl(0.012, 0.012, 0.06, "y", gx + r * 0.3, r + r * 0.3 + 0.045, bz + 0.06, 8)]);
  part("brakes_" + S, [[mz(pack), L.burnt], [mz(housing), L.gearPaint], [mz(fit), L.brass]], V(0, 0, 0.8 * s));

  // амортстойка
  const cylProf = [[0.001, TOP + 0.04], [0.1, TOP + 0.04], [0.1, TOP - 0.05], [0.083, TOP - 0.07], [0.083, 1.22], [0.094, 1.2], [0.094, 1.13], [0.068, 1.12]];
  const barrel = latheY(cylProf, 28).translate(LX, 0, lz);
  const trunnion = mergeAll([cyl(0.058, 0.058, 0.4, "z", LX, TOP - 0.02, lz - 0.08, 18), box(0.16, 0.12, 0.08, LX, TOP - 0.02, lz - 0.2), box(0.16, 0.12, 0.08, LX, TOP - 0.02, lz + 0.08)]);
  const piston = cyl(0.058, 0.058, 0.62, "y", LX, 0.83, lz, 22);
  const yoke = mergeAll([rbox(0.17, 0.26, 0.14, 0.03, LX - 0.01, 0.5, lz), cyl(0.05, 0.05, lz - wz + 0.02, "z", gx, r, (lz + wz) / 2 + 0.01, 16),
    cyl(0.07, 0.07, 0.03, "z", gx, r, lz + 0.075, 16)]);
  // шлиц-шарниры спереди
  const k0 = [LX + 0.085, 1.14, lz], kn = [LX + 0.22, 0.88, lz], k1 = [LX + 0.085, 0.6, lz];
  const scissors = mergeAll([link(k0, kn, 0.05, 0.03), link(kn, k1, 0.05, 0.03), pin(k0, 0.016, 0.07), pin(kn, 0.016, 0.07), pin(k1, 0.016, 0.07),
    box(0.06, 0.05, 0.08, LX + 0.07, 1.14, lz), box(0.06, 0.05, 0.08, LX + 0.07, 0.6, lz)]);
  // складной боковой подкос к узлу на мотогондоле, передний подкос, цилиндр уборки
  const sa = [LX, 1.52, lz - 0.05], sk = [LX + 0.03, 1.86, lz - 0.33], sb = [LX + 0.05, TOP, lz - 0.62];
  const side = mergeAll([rod(sa, sk, 0.03), rod(sk, sb, 0.03), cyl(0.04, 0.04, 0.09, "x", sk[0], sk[1], sk[2], 12), box(0.08, 0.06, 0.1, sa[0], sa[1], sa[2] + 0.02), box(0.1, 0.05, 0.1, sb[0], sb[1] + 0.02, sb[2])]);
  const da = [LX + 0.05, 1.72, lz - 0.02], db = [gx + 0.9, TOP, lz - 0.12];
  const drag = mergeAll([rod(da, db, 0.036, 12), box(0.1, 0.08, 0.12, da[0], da[1], da[2]), box(0.12, 0.05, 0.12, db[0], db[1] + 0.02, db[2])]);
  const ja = [gx + 1.02, TOP - 0.03, lz - 0.34], jb = [LX + 0.06, 1.9, lz - 0.1], jm = ja.map((v, i) => v + (jb[i] - v) * 0.58);
  const jackBarrel = mergeAll([rod(ja, jm, 0.04, 14), cyl(0.05, 0.05, 0.03, "x", ja[0], ja[1], ja[2], 12)]);
  const jackRod = rod(jm, jb, 0.022, 12);
  // створка на стойке (снаружи) с кронштейнами и фарой
  const dz0 = lz + 0.13;
  const door = gridSurface((x, y) => [x, y, dz0 + 0.035 * (1 - Math.pow((x - (LX + 0.01)) / 0.3, 2))], range(LX - 0.29, LX + 0.31, 12), range(1.2, TOP + 0.02, 10));
  const doorIn = gridSurface((x, y) => [x, y, dz0 - 0.008 + 0.035 * (1 - Math.pow((x - (LX + 0.01)) / 0.3, 2))], range(LX - 0.29, LX + 0.31, 12), range(1.2, TOP + 0.02, 10), { flip: true });
  const doorRib = mergeAll([box(0.56, 0.02, 0.02, LX + 0.01, 1.45, dz0 - 0.004), box(0.56, 0.02, 0.02, LX + 0.01, 1.85, dz0 - 0.004), box(0.02, 0.8, 0.02, LX + 0.2, 1.64, dz0 - 0.004)]);
  const brackets = mergeAll([box(0.05, 0.04, 0.05, LX, 1.4, lz + 0.1), box(0.05, 0.04, 0.05, LX, 1.95, lz + 0.1)]);
  const lamp = mergeAll([cyl(0.05, 0.056, 0.08, "x", LX + 0.29, 1.32, dz0 + 0.02, 16)]);
  part("strut_" + S, [[mz(mergeAll([barrel, trunnion, yoke, scissors, side, drag, jackBarrel, brackets])), L.gearPaint], [mz(mergeAll([piston, jackRod])), L.chrome],
    [mz(mergeAll([door, doorRib])), L.paintDouble], [mz(doorIn), L.primerGrey], [mz(lamp), L.chrome], [mz(cyl(0.046, 0.046, 0.004, "x", LX + 0.332, 1.32, dz0 + 0.02, 16)), L.lens],
    // замок-упор на складном подкосе с красной лентой
    [mz(mergeAll([box(0.06, 0.05, 0.11, sk[0], sk[1], sk[2]), cyl(0.008, 0.008, 0.07, "y", sk[0] + 0.035, sk[1] - 0.05, sk[2], 6)])), redCloth],
    [mz(streamer([sk[0] + 0.035, sk[1] - 0.08, sk[2]], 0.3, 0.034, Math.PI / 2 - 0.3)), flagMat]], V(0, -0.4, 0.9 * s));

  // ниша: тёмный проём под корнем крыла и открытая внутренняя створка
  air(mz(place(new THREE.PlaneGeometry(1.25, 0.42), gx + 0.35, TOP + 0.005, lz - 0.3, Math.PI / 2, 0, 0)), bayMat);
  const inDoor = gridSurface((x, y) => [x, y, lz - 0.58 - (TOP - y) * 0.12], range(gx - 0.2, gx + 0.95, 10), range(1.72, TOP, 4));
  air(mz(inDoor), L.paintDouble);
  air(mz(mergeAll([box(0.03, 0.12, 0.03, gx + 0.1, TOP - 0.05, lz - 0.6), box(0.03, 0.12, 0.03, gx + 0.7, TOP - 0.05, lz - 0.6)])), L.gearPaint);

  colliders.push(mz(cyl(0.45, 0.45, 1.2, "y", gx, 0.6, (lz + wz) / 2, 12)));
  anchors["wheel" + S] = V(gx, r, wz * s);
}

/* ═══════════ носовая опора ═══════════ */
export function buildNoseGear({ air, L, colliders, flagMat, redCloth }) {
  const h = HOLES.nosegear, gx = GEAR.nose.x, r = GEAR.nose.r, w = GEAR.nose.w, dz = GEAR.nose.dz;
  const LX = gx + 0.03, TOP = 1.96;
  // стойка: цапфа, механизм разворота, цилиндр, шток, траверса колёс
  const barrel = latheY([[0.001, TOP], [0.07, TOP], [0.07, 1.78], [0.09, 1.76], [0.09, 1.6], [0.064, 1.58], [0.064, 1.02], [0.074, 1.0], [0.074, 0.95], [0.05, 0.94]], 26).translate(LX, 0, 0);
  const trun = mergeAll([cyl(0.045, 0.045, 0.34, "z", LX, TOP - 0.04, 0, 14), box(0.1, 0.08, 0.06, LX, TOP - 0.04, 0.14), box(0.1, 0.08, 0.06, LX, TOP - 0.04, -0.14)]);
  const steer = mergeAll([cyl(0.028, 0.028, 0.22, "x", LX - 0.05, 1.69, 0.1, 12), box(0.06, 0.06, 0.06, LX + 0.07, 1.69, 0.1)]);
  const carrier = mergeAll([rbox(0.12, 0.26, 0.1, 0.025, LX - 0.01, 0.42, 0), cyl(0.03, 0.03, 2 * dz + w * 0.5, "z", gx, r, 0, 14)]);
  const k0 = [LX + 0.07, 0.96, 0], kn = [LX + 0.18, 0.76, 0], k1 = [LX + 0.07, 0.55, 0];
  const scis = mergeAll([link(k0, kn, 0.04, 0.026), link(kn, k1, 0.04, 0.026), pin(k0, 0.013, 0.06), pin(kn, 0.013, 0.06), pin(k1, 0.013, 0.06)]);
  const dragA = [LX - 0.02, 1.42, 0], dragK = [LX - 0.32, 1.72, 0], dragB = [LX - 0.62, TOP - 0.02, 0];
  const drag = mergeAll([rod(dragA, dragK, 0.03), rod(dragK, dragB, 0.03), cyl(0.038, 0.038, 0.12, "z", dragK[0], dragK[1], 0, 12), box(0.1, 0.05, 0.14, dragB[0], dragB[1], 0)]);
  // фары на стойке
  const lamps = mergeAll([cyl(0.052, 0.058, 0.08, "x", LX + 0.12, 1.14, 0.06, 16), cyl(0.046, 0.05, 0.07, "x", LX + 0.12, 1.3, -0.05, 16),
    box(0.1, 0.03, 0.05, LX + 0.07, 1.14, 0.06), box(0.1, 0.03, 0.05, LX + 0.07, 1.3, -0.05)]);
  const lens = mergeAll([place(new THREE.CircleGeometry(0.048, 16), LX + 0.161, 1.14, 0.06, 0, Math.PI / 2, 0), place(new THREE.CircleGeometry(0.042, 16), LX + 0.156, 1.3, -0.05, 0, Math.PI / 2, 0)]);
  air(mergeAll([barrel, trun, steer, carrier, scis, drag]), L.gearPaint, { collide: true });
  if (flagMat) { air(box(0.07, 0.05, 0.1, dragK[0], dragK[1] - 0.02, 0), redCloth); air(streamer([dragK[0], dragK[1] - 0.05, 0.05], 0.28, 0.034, 0.2), flagMat, { noShadow: true }); }
  air(cyl(0.046, 0.046, 0.44, "y", LX, 0.73, 0, 18), L.chrome);
  air(lamps, L.chrome); air(lens, L.lens || L.chrome);
  // грязезащитный щиток за колёсами: изогнутый лист с бортиками и кронштейном
  const R0 = 0.36, sw = 0.25;
  const arcA = range(-0.35, 1.25, 14);
  const guard = gridSurface((a, zz) => [gx - 0.1 - Math.sin(a) * R0, r + Math.cos(a) * R0, zz], arcA, [-sw, sw]);
  const guardIn = gridSurface((a, zz) => [gx - 0.1 - Math.sin(a) * (R0 - 0.01), r + Math.cos(a) * (R0 - 0.01), zz], arcA, [-sw, sw], { flip: true });
  const lip = [-sw, sw].map((zz) => gridSurface((a, k) => [gx - 0.1 - Math.sin(a) * (R0 - k * 0.05), r + Math.cos(a) * (R0 - k * 0.05), zz], arcA, [0, 1]));
  const gBr = mergeAll([rod([LX - 0.02, 0.5, 0], [gx - 0.1 - Math.sin(0.5) * R0, r + Math.cos(0.5) * R0, 0], 0.018), box(0.06, 0.05, 0.08, LX - 0.03, 0.5, 0)]);
  air(mergeAll([guard, guardIn, ...lip, gBr]), L.gearPaint);
  for (const s of [1, -1]) {
    const hub = wheelHub(r, w, s, 5), at = (g) => g.translate(gx, r, s * dz);
    air(at(tireGeo(r, w)), L.tire); air(at(hub.rim), L.aluDark); air(at(hub.dark), L.black); air(at(hub.bolts), L.steel);
  }
  // створки ниши: открыты вниз, с наборами жёсткости изнутри
  for (const s of [1, -1]) {
    const [ye, ze] = sePoint(CORE((h.x0 + h.x1) / 2), Math.PI - 25 * Math.PI / 180);
    const Dh = 0.42, sp = 0.14;
    const outer = gridSurface((x, v) => [x, ye - v * Dh, s * (ze + 0.012 + v * Dh * sp + 0.03 * Math.sin(v * Math.PI))], range(h.x0 + 0.05, h.x1 - 0.05, 10), range(0, 1, 6), { flip: s > 0 });
    const inner = gridSurface((x, v) => [x, ye - v * Dh, s * (ze + 0.002 + v * Dh * sp + 0.03 * Math.sin(v * Math.PI))], range(h.x0 + 0.05, h.x1 - 0.05, 10), range(0, 1, 6), { flip: s < 0 });
    air(outer, L.paintDouble); air(inner, L.primerGrey);
    const ribs = [];
    for (const x of range(h.x0 + 0.15, h.x1 - 0.15, 4)) ribs.push(box(0.02, Dh * 0.9, 0.02, x, ye - Dh * 0.47, s * (ze - 0.006 + Dh * 0.5 * sp + 0.03)));
    ribs.push(box(0.03, 0.05, 0.05, h.x0 + 0.2, ye + 0.005, s * ze), box(0.03, 0.05, 0.05, h.x1 - 0.2, ye + 0.005, s * ze));
    air(mergeAll(ribs), L.primerGrey);
  }
  colliders.push(cyl(0.3, 0.3, 0.7, "y", gx, 0.35, 0, 10));
}
