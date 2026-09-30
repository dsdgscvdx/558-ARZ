/* Наземное оборудование цеха: гидроподъёмники, колодки, аэродромный источник питания (прицеп),
   гидроустановка, КПА РЛС, тележка с азотом, инструментальные тумбы, верстаки, тягач «Беларус»,
   транспортная тележка двигателя, огнетушитель ОП-100, заглушки воздухозаборников.
   Каждая функция возвращает список [геометрия, материал, опции] в локальных координатах. */
import * as THREE from "three";
import { box, rbox, cyl, torus, tube, sphere, place, mergeAll, latheX, range, gridSurface } from "./geo.js";
import { tireGeo } from "./gear.js";
import * as T from "./tex.js";

const TAU = Math.PI * 2;
const latheY = (prof, seg = 24) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
export function rodG(a, b, r, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(A.x, A.y, A.z);
  return g;
}
/* колесо с шиной и стальным диском; ось — Z */
function wheel(L, R, W, x, y, z, rimMat) {
  const tire = tireGeo(R, W).translate(x, y, z);
  const Rr = R * 0.58;
  const rim = latheY([[0.001, W * 0.36], [Rr * 0.35, W * 0.36], [Rr * 0.45, W * 0.3], [Rr, W * 0.3], [Rr + 0.01, W * 0.45], [Rr + 0.01, -W * 0.45], [Rr, -W * 0.3], [Rr * 0.45, -W * 0.3], [0.001, -W * 0.3]].reverse(), 24);
  rim.rotateX(Math.PI / 2); rim.translate(x, y, z);
  const nuts = []; for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; nuts.push(cyl(0.012, 0.012, 0.02, "z", x + Math.cos(a) * Rr * 0.28, y + Math.sin(a) * Rr * 0.28, z + W * 0.37, 6), cyl(0.012, 0.012, 0.02, "z", x + Math.cos(a) * Rr * 0.28, y + Math.sin(a) * Rr * 0.28, z - W * 0.32, 6)); }
  return [[tire, L.tire], [rim, rimMat || L.greyProp], [mergeAll(nuts), L.steelDark]];
}
/* поворотное колёсико тележки */
function caster(L, x, z, r = 0.06, h = 0.16) {
  return [[mergeAll([box(0.1, 0.012, 0.1, x, h, z), box(0.012, h - r, 0.06, x - 0.03, (h + r) / 2 - 0.01, z), box(0.012, h - r, 0.06, x + 0.03, (h + r) / 2 - 0.01, z)]), L.steelDark],
    [cyl(r, r, 0.04, "x", x, r, z, 14), L.rubber], [cyl(r * 0.45, r * 0.45, 0.045, "x", x, r, z, 10), L.greyProp]];
}
/* плоская табличка с надписью */
function plateMat(lines, { w = 512, h = 256, bg = "#e8e4d8", fg = "#1a1a1a", border = "#1a1a1a" } = {}) {
  const c = T.canvas(w, h), g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  lines.forEach(([t, px], i) => { g.font = `bold ${px}px Arial`; g.fillText(t, w / 2, h * (0.5 + (i - (lines.length - 1) / 2) * 0.34)); });
  return new THREE.MeshStandardMaterial({ map: T.texFromCanvas(c), roughness: 0.6 });
}
/* лицевая панель прибора: циферблаты, лампы, тумблеры (текстура) */
function instrumentPanel(title, { dials = 3, lamps = 6, bg = "#262d31" } = {}) {
  const w = 512, h = 320, c = T.canvas(w, h), g = c.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = "#8a959a"; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12);
  for (let i = 0; i < dials; i++) {
    const x = 90 + i * (340 / Math.max(1, dials - 1)), y = 120;
    g.fillStyle = "#0f1214"; g.beginPath(); g.arc(x, y, 56, 0, 7); g.fill(); g.strokeStyle = "#c9cdcf"; g.lineWidth = 4; g.stroke();
    g.fillStyle = "#e9e6dc"; g.beginPath(); g.arc(x, y, 48, 0, 7); g.fill();
    g.strokeStyle = "#1a1a1a"; g.lineWidth = 2;
    for (let k = 0; k <= 10; k++) { const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5; g.beginPath(); g.moveTo(x + Math.cos(a) * 34, y + Math.sin(a) * 34); g.lineTo(x + Math.cos(a) * 44, y + Math.sin(a) * 44); g.stroke(); }
    g.strokeStyle = "#c62828"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 40, Math.PI * 1.95, Math.PI * 2.25); g.stroke();
    const a = Math.PI * (1.0 + 0.4 * i); g.strokeStyle = "#111"; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 38, y + Math.sin(a) * 38); g.stroke();
  }
  for (let i = 0; i < lamps; i++) { g.fillStyle = ["#2e7d32", "#c62828", "#e0a020"][i % 3]; g.beginPath(); g.arc(70 + i * 44, 225, 11, 0, 7); g.fill(); g.strokeStyle = "#999"; g.lineWidth = 2; g.stroke(); }
  for (let i = 0; i < 5; i++) { g.fillStyle = "#1a1a1a"; g.fillRect(330 + i * 32, 212, 16, 26); g.fillStyle = "#ddd"; g.fillRect(335 + i * 32, 214, 6, 12); }
  g.fillStyle = "#e8e2c8"; g.font = "bold 26px Arial"; g.textAlign = "left"; g.fillText(title, 24, 290);
  return new THREE.MeshStandardMaterial({ map: T.texFromCanvas(c), roughness: 0.5 });
}
/* жалюзи: ряд наклонных пластин в прямоугольнике (плоскость XY, нормаль +Z) */
function louvers(w, h, n, x, y, z, ry = 0) {
  const out = [box(w + 0.03, 0.02, 0.03, 0, h / 2, 0), box(w + 0.03, 0.02, 0.03, 0, -h / 2, 0), box(0.02, h, 0.03, -w / 2, 0, 0), box(0.02, h, 0.03, w / 2, 0, 0)];
  for (let i = 0; i < n; i++) out.push(box(w, 0.01, h / n * 1.1, 0, -h / 2 + (i + 0.5) * (h / n), 0.01, -0.9, 0, 0));
  const g = mergeAll(out); g.rotateY(ry); g.translate(x, y, z); return g;
}

/* ═══════════ гидроподъёмник-тренога ═══════════ */
export function jackGSE(L, topY) {
  const g = [];
  const baseY = 0.34, housH = Math.min(1.05, topY * 0.52);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.3, ca = Math.cos(a), sa = Math.sin(a);
    g.push([rodG([ca * 0.12, baseY, sa * 0.12], [ca * 0.88, 0.1, sa * 0.88], 0.04, 10), L.red]);
    g.push([rodG([ca * 0.12, baseY + 0.3, sa * 0.12], [ca * 0.55, 0.22, sa * 0.55], 0.022, 8), L.red]);
    g.push(...caster(L, ca * 0.92, sa * 0.92, 0.06, 0.12));
    const b2 = (k + 1) % 3, cb = Math.cos((b2 / 3) * TAU + 0.3), sb = Math.sin((b2 / 3) * TAU + 0.3);
    g.push([rodG([ca * 0.55, 0.22, sa * 0.55], [cb * 0.55, 0.22, sb * 0.55], 0.015, 6), L.redDark]);
  }
  g.push([latheY([[0.17, baseY - 0.06], [0.17, baseY + 0.02], [0.14, baseY + 0.04], [0.14, housH], [0.16, housH + 0.01], [0.16, housH + 0.06], [0.09, housH + 0.07]], 24), L.red, { collide: true }]);
  const ramTop = topY - 0.16;
  g.push([cyl(0.075, 0.075, ramTop - housH, "y", 0, (ramTop + housH) / 2 + 0.03, 0, 20), L.chrome]);
  g.push([latheY([[0.11, ramTop - 0.12], [0.11, ramTop - 0.06], [0.08, ramTop - 0.05]], 16), L.black]);
  g.push([cyl(0.045, 0.045, 0.12, "y", 0, topY - 0.1, 0, 14), L.steelDark]);
  g.push([latheY([[0.03, topY - 0.05], [0.1, topY - 0.04], [0.1, topY], [0.07, topY + 0.005]], 16), L.darkProp]);
  // насос с рычагом и манометр
  g.push([rbox(0.2, 0.16, 0.14, 0.02, 0.28, 0.42, 0), L.redDark], [cyl(0.012, 0.012, 0.75, "y", 0.34, 0.8, 0.0, 6), L.chrome], [cyl(0.022, 0.022, 0.12, "y", 0.34, 1.18, 0, 8), L.black]);
  g.push([cyl(0.05, 0.05, 0.03, "z", 0.24, 0.55, 0.075, 16), L.chrome], [place(new THREE.CircleGeometry(0.043, 16), 0.24, 0.55, 0.091), L.whiteProp, { cast: false }]);
  g.push([tube([[0.22, 0.38, -0.05], [0.16, 0.3, -0.08], [0.12, 0.36, -0.1]], 0.012, 8, 6), L.hose]);
  return g;
}

/* ═══════════ противооткатные колодки (пара с тросиком) ═══════════ */
export function chocks(L, sep = 1.0) {
  const out = [];
  const wedge = () => { const s = new THREE.Shape(); s.moveTo(-0.14, 0); s.lineTo(0.14, 0); s.lineTo(0.06, 0.16); s.lineTo(-0.02, 0.16); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.42, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 }); g.translate(0, 0, -0.21); return g; };
  for (const [x, f] of [[-sep / 2, 1], [sep / 2, -1]]) {
    const w = wedge(); if (f < 0) w.rotateY(Math.PI); w.translate(x, 0, 0); out.push([w, L.yellow]);
    out.push([box(0.02, 0.12, 0.43, x + f * 0.035, 0.1, 0, 0, 0, f * 0.45), L.black]);
    out.push([torus(0.035, 0.008, "x", x - f * 0.16, 0.08, 0, 5, 12), L.steel]);
  }
  out.push([tube([[-sep / 2 - 0.19, 0.08, 0], [-sep / 4, 0.01, 0.05], [0, 0.005, 0.12], [sep / 4, 0.01, 0.05], [sep / 2 + 0.19, 0.08, 0]], 0.006, 30, 5), L.steelDark]);
  return out;
}

/* ═══════════ аэродромный источник питания (двухосный прицеп) ═══════════ */
export function apaTrailer(L) {
  const g = [], G = L.greenProp;
  // рама, оси, рессоры
  g.push([mergeAll([box(3.0, 0.12, 0.08, 0, 0.5, 0.5), box(3.0, 0.12, 0.08, 0, 0.5, -0.5), ...[-1.3, -0.4, 0.4, 1.3].map((x) => box(0.08, 0.1, 1.0, x, 0.5, 0))]), L.darkProp]);
  for (const x of [-0.85, 0.85]) {
    g.push([cyl(0.04, 0.04, 1.5, "z", x, 0.3, 0, 10), L.darkProp]);
    for (const z of [-0.5, 0.5]) for (let i = 0; i < 3; i++) g.push([box(0.7 - i * 0.12, 0.018, 0.07, x, 0.36 + i * 0.022, z), L.darkProp]);
    for (const z of [-0.72, 0.72]) {
      g.push(...wheel(L, 0.3, 0.2, x, 0.3, z, L.greyProp));
      g.push([gridSurface((a, w) => [x + Math.cos(a) * 0.4, 0.3 + Math.sin(a) * 0.4, z + w], range(0.15, Math.PI - 0.15, 10), [-0.13, 0.13]), G]);
    }
  }
  // кожух: корпус с закруглённой крышей, двери, жалюзи
  g.push([rbox(2.6, 1.05, 1.36, 0.05, 0, 1.1, 0), G, { collide: true }]);
  g.push([gridSurface((x, a) => [x, 1.62 + Math.sin(a) * 0.12, Math.cos(a) * 0.68], range(-1.3, 1.3, 2), range(0, Math.PI, 12)), G]);
  for (const x of [-1.3, 1.3]) { const s = new THREE.Shape(); s.moveTo(-0.68, 0); for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; s.lineTo(-Math.cos(a) * 0.68, Math.sin(a) * 0.12); } const cap = new THREE.ShapeGeometry(s); cap.rotateY(Math.PI / 2); cap.translate(x, 1.62, 0); g.push([cap, G]); }
  for (const z of [0.681, -0.681]) {
    g.push([louvers(0.9, 0.5, 9, -0.55, 1.15, z, z > 0 ? 0 : Math.PI), L.darkProp]);
    g.push([mergeAll([box(1.1, 0.012, 0.012, 0.6, 1.58, z), box(1.1, 0.012, 0.012, 0.6, 0.62, z), box(0.012, 0.96, 0.012, 0.05, 1.1, z), box(0.012, 0.96, 0.012, 1.15, 1.1, z)]), L.darkProp]);
    g.push([box(0.02, 0.12, 0.03, 0.2, 1.1, z + Math.sign(z) * 0.015), L.chrome]);
  }
  // пульт управления в открытой двери торца
  g.push([place(new THREE.PlaneGeometry(0.95, 0.6), -1.305, 1.1, 0, 0, -Math.PI / 2, 0), instrumentPanel("АПА · 115В 400Гц / 27В"), { cast: false }]);
  g.push([box(0.03, 0.66, 1.0, -1.34, 1.1, 0), L.darkProp]);
  const dr = box(0.03, 0.66, 0.5, 0, 0, 0.25); dr.rotateY(-1.9); dr.translate(-1.33, 1.1, 0.5); g.push([dr, G]);
  // барабан кабеля, выхлоп, фонари, дышло, опорная стойка
  g.push([cyl(0.36, 0.36, 0.05, "z", 0.85, 1.05, 0.78, 28), L.redDark], [cyl(0.36, 0.36, 0.05, "z", 0.85, 1.05, 1.1, 28), L.redDark], [cyl(0.24, 0.24, 0.28, "z", 0.85, 1.05, 0.94, 24), L.wireBlack]);
  for (let i = 0; i < 6; i++) g.push([torus(0.25, 0.028, "z", 0.85, 1.05, 0.82 + i * 0.05, 6, 24), L.wireBlack]);
  g.push([cyl(0.04, 0.04, 0.3, "z", 0.85, 1.05, 0.7, 10), L.steelDark]);
  g.push([cyl(0.04, 0.045, 0.32, "y", 0.9, 1.9, -0.35, 12), L.steelDark], [cyl(0.05, 0.05, 0.04, "y", 0.9, 2.07, -0.35, 12), L.black]);
  for (const z of [-0.5, 0.5]) g.push([box(0.02, 0.07, 0.14, 1.52, 0.55, z), L.navRed]);
  const plate = plateMat([["ОСТОРОЖНО!", 60], ["115 В · 400 Гц", 44]], { bg: "#e8b21a" });
  g.push([place(new THREE.PlaneGeometry(0.5, 0.25), -0.5, 1.46, 0.683), plate, { cast: false }]);
  g.push([rodG([-1.5, 0.5, 0.45], [-2.4, 0.45, 0.0], 0.035), L.yellow], [rodG([-1.5, 0.5, -0.45], [-2.4, 0.45, 0.0], 0.035), L.yellow]);
  g.push([torus(0.08, 0.02, "y", -2.48, 0.45, 0, 6, 16), L.steelDark], [cyl(0.03, 0.03, 0.4, "y", -1.9, 0.25, 0, 8), L.darkProp], [cyl(0.07, 0.07, 0.03, "y", -1.9, 0.03, 0, 12), L.darkProp]);
  return g;
}

/* ═══════════ гидроустановка на колёсах ═══════════ */
export function upgCart(L) {
  const g = [], B = L.blueGrey;
  g.push([rbox(1.6, 0.9, 0.9, 0.04, 0, 0.72, 0), B, { collide: true }]);
  g.push([box(1.7, 0.06, 1.0, 0, 0.26, 0), L.darkProp]);
  g.push([place(new THREE.PlaneGeometry(0.9, 0.56), 0, 0.82, 0.456), instrumentPanel("УПГ-300 · ДАВЛЕНИЕ", { dials: 3, lamps: 4 }), { cast: false }]);
  g.push([louvers(0.5, 0.4, 7, 0.0, 0.72, -0.451, Math.PI), L.darkProp]);
  g.push([cyl(0.22, 0.22, 0.04, "x", -0.45, 1.42, 0, 24), L.redDark], [cyl(0.22, 0.22, 0.04, "x", -0.15, 1.42, 0, 24), L.redDark], [cyl(0.15, 0.15, 0.28, "x", -0.3, 1.42, 0, 20), L.hose]);
  g.push([cyl(0.22, 0.22, 0.04, "x", 0.15, 1.42, 0, 24), B], [cyl(0.22, 0.22, 0.04, "x", 0.45, 1.42, 0, 24), B], [cyl(0.15, 0.15, 0.28, "x", 0.3, 1.42, 0, 20), L.hose]);
  for (let i = 0; i < 5; i++) { g.push([torus(0.16, 0.022, "x", -0.42 + i * 0.06, 1.42, 0, 6, 20), L.hose], [torus(0.16, 0.022, "x", 0.18 + i * 0.06, 1.42, 0, 6, 20), L.hose]); }
  g.push([mergeAll([box(0.05, 0.3, 0.05, -0.7, 1.3, 0), box(0.05, 0.3, 0.05, 0.7, 1.3, 0), cyl(0.02, 0.02, 1.4, "x", 0, 1.42, 0, 8)]), L.darkProp]);
  g.push([tube([[-0.85, 0.5, -0.35], [-1.15, 1.1, -0.35], [-1.15, 1.1, 0.35], [-0.85, 0.5, 0.35]], 0.018, 16, 6), L.chrome]);
  for (const [x, z] of [[-0.55, -0.4], [0.55, -0.4], [-0.55, 0.4], [0.55, 0.4]]) g.push(...wheel(L, 0.14, 0.08, x, 0.14, z * 1.15, L.greyProp));
  g.push([cyl(0.1, 0.1, 0.4, "y", 0.55, 1.0, -0.3, 16), L.redDark], [cyl(0.03, 0.03, 0.08, "y", 0.55, 1.24, -0.3, 8), L.brass]);
  return g;
}

/* ═══════════ контрольно-проверочная аппаратура РЛС ═══════════ */
export function kpaConsole(L, scr) {
  const g = [], C = L.greenProp;
  g.push([rbox(1.2, 1.25, 0.75, 0.03, 0, 0.8, 0), C, { collide: true }]);
  for (let i = 0; i < 3; i++) {
    const y = 0.4 + i * 0.36;
    g.push([box(1.1, 0.3, 0.02, 0, y, 0.38), L.darkProp]);
    g.push([place(new THREE.PlaneGeometry(1.06, 0.28), 0, y, 0.392), instrumentPanel(["БЛОК ПИТАНИЯ", "ИМИТАТОР ЦЕЛИ", "ИЗМЕРИТЕЛЬ"][i], { dials: 2 + (i % 2), lamps: 5 }), { cast: false }]);
    for (const x of [-0.5, 0.5]) g.push([box(0.03, 0.08, 0.04, x, y, 0.41), L.chrome]);
  }
  g.push([louvers(0.8, 0.35, 8, 0, 0.95, -0.381, Math.PI), L.darkProp], [louvers(0.8, 0.35, 8, 0, 0.45, -0.381, Math.PI), L.darkProp]);
  for (let i = 0; i < 4; i++) g.push([cyl(0.025, 0.025, 0.04, "z", -0.4 + i * 0.12, 1.3, -0.39, 12), L.brass]);
  for (const x of [-0.62, 0.62]) g.push([tube([[x, 1.2, -0.2], [x + Math.sign(x) * 0.05, 1.2, -0.2], [x + Math.sign(x) * 0.05, 1.2, 0.2], [x, 1.2, 0.2]], 0.012, 8, 6), L.chrome]);
  g.push([place(new THREE.PlaneGeometry(0.4, 0.2), 0.3, 0.7, -0.381, 0, Math.PI, 0), plateMat([["КПА-Н019МЭ", 58], ["№ 0417  558 АРЗ", 40]]), { cast: false }]);
  g.push([rbox(0.6, 0.42, 0.45, 0.03, -0.25, 1.64, -0.05), C], [place(new THREE.PlaneGeometry(0.4, 0.28), -0.25, 1.65, 0.176), scr, { cast: false }]);
  g.push([box(0.46, 0.34, 0.08, -0.25, 1.65, 0.21), L.black]);
  for (let i = 0; i < 4; i++) g.push([cyl(0.022, 0.022, 0.03, "z", 0.15 + (i % 2) * 0.12, 1.55 + Math.floor(i / 2) * 0.12, 0.2, 10), L.black]);
  for (const [x, z] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) g.push(...caster(L, x, z, 0.07, 0.17));
  g.push([cyl(0.2, 0.2, 0.04, "z", 0.4, 1.5, -0.4, 20), L.darkProp], [cyl(0.13, 0.13, 0.2, "z", 0.4, 1.5, -0.3, 16), L.wireBlack]);
  return g;
}

/* ═══════════ тележка с азотными баллонами и редуктором ═══════════ */
export function n2Cart(L) {
  const g = [];
  g.push([mergeAll([box(0.8, 0.04, 0.45, 0, 0.12, 0), box(0.04, 1.4, 0.04, -0.38, 0.8, -0.2), box(0.04, 1.4, 0.04, 0.38, 0.8, -0.2), box(0.8, 0.04, 0.04, 0, 1.48, -0.2), box(0.8, 0.04, 0.04, 0, 0.9, -0.2)]), L.darkProp, { collide: true }]);
  for (let i = 0; i < 3; i++) {
    const x = -0.24 + i * 0.24;
    g.push([latheY([[0.001, 0.14], [0.11, 0.15], [0.11, 1.45], [0.08, 1.56], [0.03, 1.6], [0.001, 1.6]], 20).translate(x, 0, 0), L.blackCyl || L.black]);
    g.push([mergeAll([cyl(0.022, 0.022, 0.08, "y", x, 1.64, 0, 10), box(0.05, 0.03, 0.03, x + 0.03, 1.67, 0), cyl(0.03, 0.03, 0.015, "x", x + 0.06, 1.67, 0, 10)]), L.brass]);
    g.push([place(new THREE.PlaneGeometry(0.1, 0.35), x, 0.9, 0.112), plateMat([["АЗОТ", 90]], { w: 128, h: 384, bg: "#1a1a1a", fg: "#e8e2c8", border: "#1a1a1a" }), { cast: false }]);
  }
  g.push([torus(0.33, 0.01, "y", 0, 1.2, -0.02, 4, 24, Math.PI), L.steel], [torus(0.33, 0.01, "y", 0, 0.6, -0.02, 4, 24, Math.PI), L.steel]);
  g.push([cyl(0.045, 0.045, 0.06, "z", 0.3, 1.3, 0.14, 16), L.chrome], [place(new THREE.CircleGeometry(0.04, 16), 0.3, 1.3, 0.171), L.whiteProp, { cast: false }]);
  g.push([tube([[0.0, 1.66, 0], [0.2, 1.7, 0.1], [0.3, 1.36, 0.14], [0.45, 0.9, 0.2], [0.35, 0.4, 0.3], [0.1, 0.3, 0.35]], 0.012, 30, 6), L.hose]);
  for (const x of [-0.3, 0.3]) g.push(...wheel(L, 0.12, 0.07, x, 0.12, -0.22, L.greyProp));
  return g;
}

/* ═══════════ инструментальная тумба на колёсах ═══════════ */
export function toolChest(L, col) {
  const g = [];
  g.push([rbox(0.74, 0.92, 0.48, 0.015, 0, 0.62, 0), col, { collide: true }]);
  const n = 7;
  for (let d = 0; d < n; d++) {
    const h = d < 4 ? 0.1 : 0.14, y = 0.22 + (d < 4 ? d * 0.11 : 0.44 + (d - 4) * 0.15) + h / 2;
    g.push([box(0.68, h - 0.012, 0.015, 0, y, 0.243), col]);
    g.push([box(0.5, 0.018, 0.028, 0, y + h * 0.28, 0.258), L.chrome]);
  }
  g.push([box(0.76, 0.025, 0.5, 0, 1.095, 0), L.black]);
  g.push([rbox(0.74, 0.3, 0.44, 0.015, 0, 1.27, -0.02), col]);
  g.push([box(0.7, 0.012, 0.42, 0, 1.425, -0.02), L.black]);
  for (let d = 0; d < 3; d++) g.push([box(0.68, 0.07, 0.015, 0, 1.17 + d * 0.08, 0.2), col], [box(0.3, 0.012, 0.02, 0, 1.19 + d * 0.08, 0.212), L.chrome]);
  g.push([box(0.04, 0.03, 0.44, 0.39, 0.95, 0), L.chrome]);
  g.push([cyl(0.012, 0.012, 0.44, "z", 0.42, 0.95, 0, 8), L.chrome]);
  for (const [x, z] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]]) g.push(...caster(L, x, z, 0.055, 0.15));
  // инструмент сверху: ключи, отвёртка, трещотка
  g.push([mergeAll([box(0.22, 0.006, 0.025, -0.15, 1.44, 0.05, 0, 0.3, 0), box(0.18, 0.006, 0.022, -0.1, 1.44, -0.08, 0, -0.2, 0)]), L.chrome]);
  g.push([cyl(0.012, 0.016, 0.1, "x", 0.12, 1.445, 0.06, 8), L.red], [cyl(0.004, 0.004, 0.12, "x", 0.23, 1.445, 0.06, 6), L.steel]);
  return g;
}

/* ═══════════ верстак с тисками, тумбой и перфопанелью с инструментом ═══════════ */
export function workbench(L) {
  const g = [];
  g.push([box(2.4, 0.06, 0.8, 0, 0.92, 0), L.wood, { collide: true }], [box(2.42, 0.03, 0.82, 0, 0.885, 0), L.greyProp]);
  for (const [x, z] of [[-1.15, -0.35], [1.15, -0.35], [-1.15, 0.35], [1.15, 0.35]]) g.push([box(0.05, 0.87, 0.05, x, 0.44, z), L.greyProp]);
  g.push([box(2.3, 0.03, 0.7, 0, 0.15, 0), L.greyProp]);
  // тумба с ящиками
  g.push([box(0.55, 0.75, 0.72, 0.85, 0.47, 0), L.blueGrey]);
  for (let d = 0; d < 4; d++) g.push([box(0.5, 0.16, 0.012, 0.85, 0.2 + d * 0.18, 0.365), L.blueGrey], [box(0.22, 0.02, 0.025, 0.85, 0.25 + d * 0.18, 0.375), L.chrome]);
  // слесарные тиски
  g.push([mergeAll([box(0.2, 0.05, 0.16, -0.9, 0.975, 0.28), box(0.07, 0.11, 0.14, -0.96, 1.06, 0.28), box(0.07, 0.11, 0.14, -0.82, 1.06, 0.28), box(0.2, 0.05, 0.06, -0.89, 1.02, 0.28)]), L.blueGrey]);
  g.push([cyl(0.012, 0.012, 0.28, "x", -0.66, 1.06, 0.28, 8), L.chrome], [sphere(0.018, -0.52, 1.06, 0.28), L.chrome], [box(0.004, 0.08, 0.13, -0.927, 1.1, 0.28), L.steelDark]);
  // перфопанель и инструмент
  const pc = T.canvas(512, 256), pg = pc.getContext("2d");
  pg.fillStyle = "#d9d8cf"; pg.fillRect(0, 0, 512, 256); pg.fillStyle = "#8f8f88";
  for (let y = 8; y < 256; y += 16) for (let x = 8; x < 512; x += 16) { pg.beginPath(); pg.arc(x, y, 2.5, 0, 7); pg.fill(); }
  pg.strokeStyle = "#555"; pg.lineWidth = 3; for (let i = 0; i < 9; i++) { pg.strokeRect(30 + i * 36, 30, 20, 70 + (i % 3) * 16); }
  g.push([place(new THREE.PlaneGeometry(2.4, 1.2), 0, 1.75, -0.375), new THREE.MeshStandardMaterial({ map: T.texFromCanvas(pc), roughness: 0.8 }), { cast: false }]);
  g.push([box(2.44, 1.24, 0.02, 0, 1.75, -0.39), L.greyProp]);
  const tools = [];
  for (let i = 0; i < 9; i++) { const x = -1.05 + i * 0.17, len = 0.22 + (i % 3) * 0.05; tools.push(box(0.03, len, 0.008, x, 1.9 - len / 2, -0.36), torus(0.022, 0.006, "z", x, 1.9 - len - 0.01, -0.36, 5, 10), torus(0.018, 0.006, "z", x, 1.92, -0.36, 5, 10)); }
  g.push([mergeAll(tools), L.chrome]);
  for (let i = 0; i < 6; i++) { const x = 0.55 + i * 0.1; g.push([cyl(0.013, 0.016, 0.12, "y", x, 1.62, -0.355, 8), i % 2 ? L.red : L.yellow], [cyl(0.004, 0.004, 0.12, "y", x, 1.5, -0.355, 6), L.steel]); }
  g.push([mergeAll([box(0.3, 0.035, 0.035, 0.25, 1.35, -0.355), box(0.05, 0.08, 0.05, 0.4, 1.35, -0.355)]), L.darkProp]);
  // светильник на кронштейне
  g.push([rodG([1.0, 0.95, -0.3], [1.0, 1.5, -0.3], 0.012), L.darkProp], [rodG([1.0, 1.5, -0.3], [0.6, 1.65, 0.0], 0.012), L.darkProp], [latheY([[0.11, 0.0], [0.1, 0.02], [0.01, 0.12]], 16).translate(0.6, 1.55, 0.0), L.darkProp]);
  return g;
}

/* ═══════════ транспортная тележка двигателя ═══════════ */
export function engineStand(L, axisY = 1.0) {
  const g = [], Y = L.yellow;
  g.push([mergeAll([box(3.6, 0.1, 0.1, -1.6, 0.35, 0.55), box(3.6, 0.1, 0.1, -1.6, 0.35, -0.55), box(0.1, 0.1, 1.2, 0.2, 0.35, 0), box(0.1, 0.1, 1.2, -1.6, 0.35, 0), box(0.1, 0.1, 1.2, -3.4, 0.35, 0)]), Y, { collide: true }]);
  // передняя опора: вилка под цапфы
  for (const s of [1, -1]) {
    g.push([rodG([-0.74, 0.4, s * 0.55], [-0.74, axisY - 0.02, s * 0.6], 0.045), Y], [box(0.14, 0.1, 0.06, -0.74, axisY, s * 0.6), Y]);
    g.push([rodG([-0.74, 0.4, s * 0.55], [-0.3, 0.4, s * 0.55], 0.03), Y], [rodG([-0.74, axisY - 0.2, s * 0.58], [-0.25, 0.42, s * 0.55], 0.03), Y]);
  }
  // задняя опора: полукольцо
  g.push([torus(0.46, 0.035, "x", -2.45, axisY, 0, 8, 28, Math.PI).rotateX(Math.PI).translate(0, 2 * axisY, 0), Y]);
  for (const s of [1, -1]) g.push([rodG([-2.45, 0.4, s * 0.55], [-2.45, axisY - 0.05, s * 0.46], 0.04), Y]);
  g.push([rodG([-2.45, 0.4, 0], [-2.45, axisY - 0.46, 0], 0.04), Y], [box(0.1, 0.06, 0.3, -2.45, axisY - 0.46, 0), L.rubber]);
  for (const [x, z] of [[0.1, 0.5], [0.1, -0.5], [-3.3, 0.5], [-3.3, -0.5]]) g.push(...caster(L, x, z, 0.1, 0.3));
  g.push([rodG([0.25, 0.35, 0.4], [1.1, 0.33, 0.0], 0.03), Y], [rodG([0.25, 0.35, -0.4], [1.1, 0.33, 0.0], 0.03), Y], [torus(0.07, 0.018, "y", 1.17, 0.33, 0, 6, 14), L.steelDark]);
  g.push([place(new THREE.PlaneGeometry(0.5, 0.18), -1.6, 0.35, 0.603), plateMat([["РД-33 сер.2", 60], ["ТЕЛЕЖКА ТРАНСП.", 40]]), { cast: false }]);
  return g;
}

/* ═══════════ огнетушитель передвижной ОП-100 ═══════════ */
export function fireCart(L) {
  const g = [];
  g.push([latheY([[0.001, 0.26], [0.26, 0.28], [0.28, 0.4], [0.28, 1.15], [0.2, 1.32], [0.06, 1.37], [0.001, 1.37]], 24), L.red, { collide: true }]);
  g.push([mergeAll([cyl(0.04, 0.04, 0.08, "y", 0, 1.4, 0, 12), box(0.14, 0.04, 0.04, 0.05, 1.46, 0), box(0.2, 0.025, 0.025, 0.1, 1.52, 0, 0, 0, 0.3)]), L.chrome]);
  g.push([cyl(0.045, 0.045, 0.03, "z", -0.1, 1.2, 0.26, 16), L.chrome], [place(new THREE.CircleGeometry(0.04, 16), -0.1, 1.2, 0.276), L.whiteProp, { cast: false }]);
  g.push([mergeAll([box(0.05, 1.1, 0.05, -0.34, 0.8, 0.2), box(0.05, 1.1, 0.05, -0.34, 0.8, -0.2), cyl(0.02, 0.02, 0.5, "z", -0.36, 1.36, 0, 8)]), L.darkProp]);
  g.push(...wheel(L, 0.25, 0.1, -0.1, 0.25, 0.36, L.greyProp), ...wheel(L, 0.25, 0.1, -0.1, 0.25, -0.36, L.greyProp));
  g.push([cyl(0.02, 0.02, 0.8, "z", -0.1, 0.25, 0, 8), L.darkProp]);
  const hose = []; for (let i = 0; i < 4; i++) hose.push(torus(0.18 - i * 0.004, 0.018, "z", 0.15, 0.85, 0.3 + i * 0.03, 6, 20));
  g.push([mergeAll(hose), L.black], [cyl(0.02, 0.03, 0.3, "y", 0.3, 0.55, 0.3, 10), L.black]);
  g.push([place(new THREE.PlaneGeometry(0.25, 0.35), 0, 0.75, 0.283), plateMat([["ОП-100", 90], ["ПЕНА", 60]], { w: 256, h: 384, bg: "#f0ece0", fg: "#b0231f", border: "#b0231f" }), { cast: false }]);
  return g;
}

/* ═══════════ заглушка воздухозаборника с вымпелом ═══════════ */
export function intakePlug(L, flagMat) {
  const g = [];
  const sh = new THREE.Shape(), w = 0.34, h = 0.46, r = 0.12;
  sh.moveTo(-w + r, -h); sh.lineTo(w - r, -h); sh.quadraticCurveTo(w, -h, w, -h + r); sh.lineTo(w, h - r); sh.quadraticCurveTo(w, h, w - r, h); sh.lineTo(-w + r, h); sh.quadraticCurveTo(-w, h, -w, h - r); sh.lineTo(-w, -h + r); sh.quadraticCurveTo(-w, -h, -w + r, -h);
  const body = new THREE.ExtrudeGeometry(sh, { depth: 0.26, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.05, bevelSegments: 4 });
  body.rotateX(-Math.PI / 2); body.translate(0, 0.05, 0);
  g.push([body, new THREE.MeshStandardMaterial({ color: "#a8261f", roughness: 0.92, metalness: 0, normalMap: L.hose.normalMap, normalScale: new THREE.Vector2(0.8, 0.8) })]);
  g.push([tube([[-0.15, 0.36, 0], [-0.1, 0.46, 0], [0.1, 0.46, 0], [0.15, 0.36, 0]], 0.02, 10, 6), L.black]);
  g.push([place(new THREE.PlaneGeometry(0.9, 0.1), 0.25, 0.012, 0.62, -Math.PI / 2, 0, 0.35), flagMat, { cast: false }]);
  return g;
}
