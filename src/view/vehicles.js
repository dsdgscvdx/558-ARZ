/* Техника аэродрома: трактор «Беларус» МТЗ-82.1 с водилом для буксировки МиГ-29 и аэродромный
   тягач. Всё в локальных координатах: +X — вперёд, Y — вверх, земля Y = 0. Возвращают списки
   [геометрия, материал, опции] для пакетной сборки (Batch). */
import * as THREE from "three";
import { box, rbox, cyl, torus, tube, sphere, place, mergeAll, range, gridSurface } from "./geo.js";
import * as T from "./tex.js";

const TAU = Math.PI * 2;
function rodG(a, b, r, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(A.x, A.y, A.z);
  return g;
}
/* тело вращения вокруг оси Z из профиля [[r, z], ...] */
function latheZ(prof, seg = 32) {
  const g = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(Math.max(0.0005, r), z)), seg);
  g.rotateX(Math.PI / 2); return g;
}

let VM = null;
function mats(L) {
  if (VM) return VM;
  const P = (o) => new THREE.MeshPhysicalMaterial(o), S = (o) => new THREE.MeshStandardMaterial(o);
  const red = "#b31f1b";
  VM = {
    red: P({ color: red, roughness: 0.32, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.25, normalMap: L.red.normalMap, normalScale: new THREE.Vector2(0.25, 0.25) }),
    redDS: P({ color: red, roughness: 0.32, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.25, side: THREE.DoubleSide }),
    redDull: P({ color: "#9a2420", roughness: 0.55, metalness: 0.1, clearcoat: 0.2 }),
    frame: S({ color: "#1f2224", roughness: 0.55, metalness: 0.35 }),
    frameDS: S({ color: "#1f2224", roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide }),
    engine: S({ color: "#2a2e30", roughness: 0.6, metalness: 0.45, normalMap: L.unitGrey.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) }),
    rim: P({ color: "#c9ccc8", roughness: 0.42, metalness: 0.25, clearcoat: 0.3 }),
    rimDark: S({ color: "#3b3f41", roughness: 0.5, metalness: 0.5 }),
    tire: L.tire,
    white: P({ color: "#e9e9e3", roughness: 0.35, metalness: 0.1, clearcoat: 0.5 }),
    glass: P({ color: "#9fb4bd", roughness: 0.04, metalness: 0, transmission: 0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 }),
    black: S({ color: "#141516", roughness: 0.6, metalness: 0.1 }),
    rubber: S({ color: "#181818", roughness: 0.85 }),
    chrome: L.chrome, steel: L.steel,
    lens: P({ color: "#dfe6ea", roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.85 }),
    reflector: S({ color: "#e7eaec", roughness: 0.1, metalness: 1 }),
    tail: P({ color: "#8e1010", roughness: 0.1, clearcoat: 1, emissive: "#300000" }),
    amber: P({ color: "#e08a10", roughness: 0.1, clearcoat: 1, emissive: "#4a2600", transparent: true, opacity: 0.9 }),
    orange: L.orange, yellow: P({ color: "#d99a12", roughness: 0.45, metalness: 0.05, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    seat: S({ color: "#1c1d1f", roughness: 0.8, normalMap: L.hose.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) }),
    decal: S({ map: T.texFromCanvas(wordmark()), roughness: 0.4, transparent: true }),
    grille: S({ map: grilleTex(), roughness: 0.55, metalness: 0.3 }),
    dash: S({ map: dashTex(), roughness: 0.5 }),
    plate: S({ map: plateTex(), roughness: 0.5 }),
    glassDark: P({ color: "#1b2329", roughness: 0.05, metalness: 0.2, clearcoat: 1 }),
    shutter: S({ map: shutterTex(), roughness: 0.35, metalness: 0.8 }),
    blueLens: P({ color: "#1f4fd8", roughness: 0.1, clearcoat: 1, emissive: "#0c2a8a", emissiveIntensity: 1.2, transparent: true, opacity: 0.9 }),
    stripe: S({ color: "#f2f2ec", roughness: 0.4 }),
    fireText: S({ map: T.texFromCanvas(fireText()), roughness: 0.4, transparent: true }),
  };
  return VM;
}
function wordmark() {
  const c = T.canvas(512, 96), g = c.getContext("2d");
  g.clearRect(0, 0, 512, 96); g.fillStyle = "#f4f2ea"; g.font = "italic 800 74px 'Arial Black', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("БЕЛАРУС", 256, 50);
  return c;
}
function grilleTex() {
  const c = T.canvas(256, 256), g = c.getContext("2d");
  g.fillStyle = "#101112"; g.fillRect(0, 0, 256, 256);
  for (let y = 8; y < 256; y += 14) { g.fillStyle = "#4a4d4f"; g.fillRect(12, y, 232, 6); g.fillStyle = "#8a8e90"; g.fillRect(12, y, 232, 1.5); }
  g.fillStyle = "#101112"; for (let x = 30; x < 256; x += 40) g.fillRect(x, 0, 4, 256);
  return T.texFromCanvas(c);
}
function dashTex() {
  const c = T.canvas(256, 128), g = c.getContext("2d");
  g.fillStyle = "#1a1b1c"; g.fillRect(0, 0, 256, 128);
  for (const [x, r] of [[64, 40], [150, 30], [215, 22]]) { g.fillStyle = "#e9e6dc"; g.beginPath(); g.arc(x, 60, r, 0, 7); g.fill(); g.strokeStyle = "#111"; g.lineWidth = 2; for (let k = 0; k <= 8; k++) { const a = Math.PI * 0.8 + (k / 8) * Math.PI * 1.4; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.7, 60 + Math.sin(a) * r * 0.7); g.lineTo(x + Math.cos(a) * r * 0.92, 60 + Math.sin(a) * r * 0.92); g.stroke(); } g.strokeStyle = "#c01818"; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 60); g.lineTo(x + r * 0.7 * Math.cos(3.6), 60 + r * 0.7 * Math.sin(3.6)); g.stroke(); }
  for (let i = 0; i < 6; i++) { g.fillStyle = ["#2e7d32", "#e0a020", "#c62828"][i % 3]; g.fillRect(20 + i * 38, 108, 22, 10); }
  return T.texFromCanvas(c);
}
function shutterTex() {
  const c = T.canvas(128, 256), g = c.getContext("2d");
  g.fillStyle = "#b9bec1"; g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 8) { g.fillStyle = "#8d9396"; g.fillRect(0, y + 6, 128, 2); g.fillStyle = "#dfe3e5"; g.fillRect(0, y, 128, 1); }
  g.fillStyle = "#6c7275"; g.fillRect(0, 238, 128, 18); g.fillStyle = "#2a2d2f"; g.fillRect(50, 242, 28, 8);
  return T.texFromCanvas(c);
}
function fireText() {
  const c = T.canvas(512, 96), g = c.getContext("2d");
  g.clearRect(0, 0, 512, 96); g.fillStyle = "#f4f2ea"; g.font = "800 60px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("МЧС   01", 256, 50);
  return c;
}
function plateTex() {
  const c = T.canvas(256, 128), g = c.getContext("2d");
  g.fillStyle = "#f2f2ec"; g.fillRect(0, 0, 256, 128); g.strokeStyle = "#111"; g.lineWidth = 6; g.strokeRect(4, 4, 248, 120);
  g.fillStyle = "#111"; g.font = "bold 56px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("4817 ВА-1", 128, 66);
  return T.texFromCanvas(c);
}

/* сельхозшина с грунтозацепами «ёлочкой»: каркас, зацепы, диск с отверстиями, ступица с гайками.
   ось колеса — Z, центр (x, y, z), s — сторона (наружная часть диска смотрит в s·Z) */
function agWheel(M, { R, W, rimR, lugs, lugH, x, y, z, s, dish = 0.08, holes = 8, front = false }) {
  const out = [];
  const r0 = R - lugH, hw = W / 2, d = r0 - rimR;
  // сечение каркаса: закраина — выпуклая боковина — плечо — беговая дорожка — и зеркально
  const half = [[rimR - 0.004, -0.7 * hw], [rimR + 0.2 * d, -0.9 * hw], [rimR + 0.45 * d, -hw], [rimR + 0.72 * d, -0.97 * hw], [r0 - 0.03, -0.87 * hw], [r0 - 0.008, -0.72 * hw], [r0, -0.45 * hw], [r0 + 0.008, 0]];
  const carcass = latheZ([...half, ...half.slice(0, -1).reverse().map(([r, zz]) => [r, -zz])], 56);
  out.push([carcass.translate(x, y, z), M.tire]);
  // зацепы: наклонные бруски от середины к плечу, чередуются по сторонам
  const L = [], beta = front ? 0.5 : 0.62, len = hw * 0.86 / Math.cos(beta);
  if (lugs) for (let k = 0; k < lugs; k++) for (const sd of [1, -1]) {
    const a = (k / lugs) * TAU + (sd > 0 ? 0 : Math.PI / lugs);
    const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 4, 1); g.rotateY(Math.PI / 4); g.scale(front ? 0.05 : 0.064, lugH, len); g.rotateX(Math.PI / 2); g.rotateX(-Math.PI / 2);
    { const q = g.attributes.position; for (let i = 0; i < q.count; i++) if (q.getY(i) > 0) q.setX(i, q.getX(i) * 0.6); g.computeVertexNormals(); }
    g.translate(0, 0, sd * len / 2); g.rotateY(sd * beta); g.translate(0, r0 + lugH / 2 - 0.004, sd * 0.012);
    // зацеп заходит на плечо
    const sh = new THREE.BoxGeometry(front ? 0.034 : 0.044, lugH * 0.7, 0.045); sh.rotateX(sd * 0.75); sh.translate(Math.sin(beta) * len, r0 - 0.03, sd * hw * 0.9);
    for (const q of [g, sh]) { q.rotateZ(a); q.translate(x, y, z); L.push(q); }
  }
  if (L.length) out.push([mergeAll(L), M.tire]);
  // обод и диск
  const rim = latheZ([[rimR - 0.012, -hw * 0.8], [rimR + 0.022, -hw * 0.82], [rimR + 0.02, -hw * 0.74], [rimR, -hw * 0.7], [rimR - 0.01, 0], [rimR, hw * 0.7], [rimR + 0.02, hw * 0.74], [rimR + 0.022, hw * 0.82], [rimR - 0.012, hw * 0.8]], 48);
  out.push([rim.translate(x, y, z), M.rim]);
  const dz = s * dish;
  const disc = latheZ([[rimR - 0.01, dz * 0.4], [rimR * 0.82, dz], [rimR * 0.36, dz], [rimR * 0.3, dz + s * 0.03], [0.001, dz + s * 0.03]], 40);
  if (s < 0) disc.scale(1, 1, 1);
  out.push([disc.translate(x, y, z), M.rim]);
  // «отверстия» в диске — тёмные вставки
  const hl = [];
  for (let k = 0; k < holes; k++) { const a = (k / holes) * TAU; const h = new THREE.CircleGeometry(rimR * 0.13, 14); if (s < 0) h.rotateY(Math.PI); h.translate(x + Math.cos(a) * rimR * 0.6, y + Math.sin(a) * rimR * 0.6, z + dz + s * 0.003); hl.push(h); }
  out.push([mergeAll(hl), M.black, { cast: false }]);
  // ступица, гайки, у передних колёс — колёсный редуктор
  const hub = [cyl(rimR * 0.24, rimR * 0.26, 0.09, "z", x, y, z + dz + s * 0.07, 24)];
  const nuts = [];
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; nuts.push(cyl(0.013, 0.013, 0.025, "z", x + Math.cos(a) * rimR * 0.3, y + Math.sin(a) * rimR * 0.3, z + dz + s * 0.04, 6)); }
  if (front) hub.push(cyl(rimR * 0.34, rimR * 0.3, 0.16, "z", x, y, z + dz + s * 0.14, 24), cyl(rimR * 0.12, rimR * 0.12, 0.05, "z", x, y, z + dz + s * 0.24, 16));
  out.push([mergeAll(hub), M.rimDark], [mergeAll(nuts), M.chrome]);
  return out;
}

/* ═══════════ трактор «Беларус» МТЗ-82.1 с водилом ═══════════ */
export function tractorMTZ(L) {
  const M = mats(L), g = [];
  const xr = -0.95, xf = 1.45, Rr = 0.775, Rf = 0.49, tr = 0.8, tf = 0.74;
  // ── колёса
  for (const s of [1, -1]) g.push(...agWheel(M, { R: Rr, W: 0.39, rimR: 0.485, lugs: 22, lugH: 0.045, x: xr, y: Rr, z: s * tr, s, dish: 0.07 }));
  for (const s of [1, -1]) g.push(...agWheel(M, { R: Rf, W: 0.28, rimR: 0.255, lugs: 18, lugH: 0.032, x: xf, y: Rf, z: s * tf, s, dish: 0.04, holes: 6, front: true }));
  // ── передний ведущий мост: балка, главная передача, кожухи полуосей, рулевые тяги, шкворни
  g.push([mergeAll([cyl(0.075, 0.075, 1.12, "z", xf, Rf, 0, 16), sphere(0.17, xf, Rf, 0.05, 1, 0.85, 1.1, 18, 12), cyl(0.06, 0.06, 0.3, "x", xf - 0.2, Rf + 0.02, 0.05, 12)]), M.frame]);
  for (const s of [1, -1]) g.push([mergeAll([cyl(0.09, 0.09, 0.2, "y", xf, Rf + 0.08, s * 0.58, 14), cyl(0.1, 0.11, 0.16, "z", xf, Rf, s * 0.6, 18)]), M.frame]);
  g.push([rodG([xf - 0.18, Rf - 0.05, 0.58], [xf - 0.18, Rf - 0.05, -0.58], 0.018), M.steel], [rodG([xf - 0.02, Rf + 0.18, 0.1], [xf - 0.45, Rf + 0.32, 0.25], 0.02), M.steel]);
  g.push([rodG([xf - 0.45, Rf + 0.35, 0.25], [xf - 0.4, 1.05, 0.25], 0.02), M.steel], [cyl(0.04, 0.04, 0.3, "x", xf - 0.62, 1.02, 0.25, 12), M.frame]);
  // ── полурама, двигатель Д-243, картер, генератор, стартер, вентилятор
  g.push([mergeAll([box(2.2, 0.18, 0.12, 0.55, 0.78, 0.26), box(2.2, 0.18, 0.12, 0.55, 0.78, -0.26), box(0.14, 0.24, 0.64, 1.62, 0.78, 0)]), M.frame, { collide: true }]);
  g.push([mergeAll([rbox(1.1, 0.46, 0.46, 0.04, 0.72, 1.0, 0), rbox(0.95, 0.2, 0.4, 0.03, 0.72, 0.66, 0), rbox(0.9, 0.12, 0.52, 0.02, 0.72, 1.28, 0)]), M.engine]);
  for (let k = 0; k < 4; k++) g.push([mergeAll([cyl(0.022, 0.022, 0.08, "y", 0.42 + k * 0.2, 1.37, 0.12, 8), rodG([0.42 + k * 0.2, 1.37, 0.12], [0.42 + k * 0.2, 1.25, 0.27], 0.012)]), M.steel]);
  g.push([mergeAll([cyl(0.075, 0.075, 0.16, "x", 1.18, 1.12, 0.3, 16), cyl(0.05, 0.05, 0.03, "x", 1.27, 1.12, 0.3, 14)]), M.engine], [cyl(0.06, 0.06, 0.24, "x", 0.35, 0.85, -0.3, 14), M.black]);
  g.push([cyl(0.2, 0.2, 0.03, "x", 1.32, 1.05, 0, 24), M.black], [torus(0.24, 0.012, "x", 1.34, 1.05, 0, 6, 28), M.frame]);
  g.push([tube([[1.2, 1.0, 0.24], [1.32, 0.95, 0.3], [1.45, 0.9, 0.2], [1.52, 0.9, 0.05]], 0.03, 12, 10), M.rubber]);
  // ── радиатор, решётка, фары, облицовка
  g.push([box(0.08, 0.6, 0.56, 1.5, 1.1, 0), M.frame]);
  // капот: сечение со скруглёнными верхними рёбрами, сужается вперёд, передний скос
  const hood = (() => {
    const pos = [], idx = [], nx = 12, nt = 22;
    const sec = (u) => { const x = 0.12 + u * 1.5, top = 1.47 - 0.05 * u * u, w = 0.36 - 0.025 * u, bot = 0.88; return { x, top, w, bot }; };
    for (let i = 0; i <= nx; i++) {
      const u = i / nx, s = sec(u);
      for (let j = 0; j <= nt; j++) {
        const t = j / nt;                                   // 0 — низ левого борта … 1 — низ правого борта
        const r = 0.09;                                     // радиус скругления верхних рёбер
        let yy, zz;
        // по контуру: борт — скругление — крыша — скругление — борт
        const segL = [s.top - r - s.bot, (Math.PI / 2) * r, s.w - r, s.w - r, (Math.PI / 2) * r, s.top - r - s.bot], tot = segL.reduce((p, q) => p + q, 0);
        let d = t * tot, k = 0; while (k < 5 && d > segL[k]) { d -= segL[k]; k++; }
        if (k === 0) { zz = -s.w; yy = s.bot + d; }
        else if (k === 1) { const q = d / r; zz = -s.w + r - r * Math.cos(q); yy = s.top - r + r * Math.sin(q); }
        else if (k === 2) { zz = -s.w + r + d; yy = s.top; }
        else if (k === 3) { zz = d; yy = s.top; }
        else if (k === 4) { const q = d / r; zz = s.w - r + r * Math.sin(q); yy = s.top - r + r * Math.cos(q); }
        else { zz = s.w; yy = s.top - r - d; }
        pos.push(s.x + (yy - s.bot) * -0.0, yy, zz);
      }
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) { const a = i * (nt + 1) + j, b = a + nt + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  })();
  g.push([hood, M.red]);
  g.push([mergeAll([box(0.03, 0.08, 0.72, 1.625, 1.44, 0)]), M.red]);
  g.push([place(new THREE.PlaneGeometry(0.62, 0.5), 1.635, 1.13, 0, 0, Math.PI / 2, 0), M.grille, { cast: false }]);
  g.push([mergeAll([box(0.05, 0.62, 0.05, 1.625, 1.13, 0.335), box(0.05, 0.62, 0.05, 1.625, 1.13, -0.335), box(0.05, 0.05, 0.72, 1.625, 0.84, 0)]), M.red]);
  for (const s of [1, -1]) {
    g.push([rbox(0.06, 0.14, 0.16, 0.02, 1.64, 1.3, s * 0.24), M.frame], [place(new THREE.PlaneGeometry(0.14, 0.11), 1.672, 1.3, s * 0.24, 0, Math.PI / 2, 0), M.reflector, { cast: false }],
      [place(new THREE.PlaneGeometry(0.13, 0.1), 1.674, 1.3, s * 0.24, 0, Math.PI / 2, 0), M.lens, { cast: false }]);
    // боковые жалюзи капота и надпись
    const sl = []; for (let k = 0; k < 7; k++) sl.push(box(0.5, 0.018, 0.012, 0.95, 0.98 + k * 0.045, s * 0.35));
    g.push([mergeAll(sl), M.frame]);
    const wm = new THREE.PlaneGeometry(0.62, 0.12); if (s < 0) wm.rotateY(Math.PI); wm.translate(0.62, 1.34, s * 0.357); g.push([wm, M.decal, { cast: false }]);
  }
  // балластные грузы на переднем брусе
  g.push([box(0.14, 0.2, 0.9, 1.78, 0.8, 0), M.frame]);
  for (let i = 0; i < 8; i++) {
    const z = -0.42 + i * 0.12;
    g.push([mergeAll([rbox(0.2, 0.34, 0.1, 0.02, 1.92, 0.78, z), torus(0.035, 0.012, "z", 1.95, 0.99, z, 6, 12)]), M.frame]);
  }
  g.push([mergeAll([box(0.25, 0.12, 0.3, 2.07, 0.62, 0), cyl(0.03, 0.03, 0.2, "y", 2.13, 0.62, 0, 12)]), M.frame]);
  // воздухоочиститель с моноциклоном и выхлоп с глушителем
  g.push([mergeAll([cyl(0.075, 0.075, 0.3, "y", 0.38, 1.62, 0.2, 18), cyl(0.09, 0.08, 0.08, "y", 0.38, 1.81, 0.2, 18)]), M.black], [cyl(0.095, 0.095, 0.015, "y", 0.38, 1.86, 0.2, 18), M.frame]);
  g.push([mergeAll([cyl(0.04, 0.04, 0.35, "y", 0.3, 1.64, -0.22, 14), cyl(0.07, 0.07, 0.4, "y", 0.3, 1.95, -0.22, 18), cyl(0.04, 0.04, 0.35, "y", 0.3, 2.32, -0.22, 14)]), M.black],
    [mergeAll([cyl(0.075, 0.075, 0.05, "y", 0.3, 1.74, -0.22, 18), cyl(0.075, 0.075, 0.05, "y", 0.3, 2.16, -0.22, 18)]), M.chrome], [place(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 14), 0.31, 2.51, -0.22, 0, 0, 0.5), M.black]);
  // ── задний мост, коробка, топливный бак, подножки, навеска, ВОМ
  g.push([mergeAll([rbox(0.7, 0.62, 0.7, 0.06, xr + 0.05, 0.95, 0), cyl(0.12, 0.12, 1.4, "z", xr, Rr, 0, 18), rbox(0.9, 0.45, 0.5, 0.05, xr + 0.75, 0.95, 0)]), M.frame, { collide: true }]);
  for (const s of [1, -1]) g.push([cyl(0.15, 0.13, 0.25, "z", xr, Rr, s * 0.52, 18), M.frame]);
  g.push([mergeAll([cyl(0.18, 0.18, 0.55, "x", -0.05, 0.98, 0.52, 20)]), M.red], [mergeAll([cyl(0.05, 0.05, 0.05, "y", -0.15, 1.18, 0.52, 12)]), M.black]);
  for (const s of [1, -1]) {
    g.push([mergeAll([box(0.36, 0.03, 0.22, xr + 0.5, 0.58, s * 0.63), box(0.36, 0.03, 0.22, xr + 0.5, 0.92, s * 0.63), box(0.03, 0.46, 0.03, xr + 0.33, 0.76, s * 0.73), box(0.03, 0.46, 0.03, xr + 0.67, 0.76, s * 0.73)]), M.frame]);
    // навеска: нижние тяги, раскосы, подъёмные рычаги
    g.push([rodG([xr - 0.25, 0.55, s * 0.28], [xr - 0.95, 0.42, s * 0.42], 0.03, 10), M.frame], [rodG([xr - 0.3, 1.2, s * 0.3], [xr - 0.65, 1.15, s * 0.32], 0.035, 10), M.frame], [rodG([xr - 0.65, 1.15, s * 0.32], [xr - 0.62, 0.5, s * 0.35], 0.02, 8), M.steel]);
    g.push([mergeAll([torus(0.04, 0.012, "z", xr - 0.97, 0.42, s * 0.42, 6, 12)]), M.steel]);
    // задние фонари на крыльях
    g.push([rbox(0.05, 0.1, 0.16, 0.02, xr - 0.62, 1.52, s * 0.8), M.frame], [place(new THREE.PlaneGeometry(0.14, 0.08), xr - 0.648, 1.52, s * 0.8, 0, -Math.PI / 2, 0), M.tail, { cast: false }]);
  }
  g.push([rodG([xr - 0.25, 1.4, 0], [xr - 0.85, 1.25, 0], 0.03, 10), M.frame], [mergeAll([box(0.22, 0.14, 0.3, xr - 0.45, 0.62, 0), cyl(0.035, 0.035, 0.12, "x", xr - 0.58, 0.72, 0, 12)]), M.frame]);
  g.push([place(new THREE.PlaneGeometry(0.34, 0.17), xr - 0.37, 0.9, 0, 0, -Math.PI / 2, 0), M.plate, { cast: false }]);
  // ── крылья задних колёс
  for (const s of [1, -1]) {
    g.push([gridSurface((a, w) => { const R = Rr + 0.07; return [xr + Math.cos(a) * R, Rr + Math.sin(a) * R, s * (tr + w)]; }, range(0.2, Math.PI - 0.35, 16), [-0.24, 0.24]), M.redDS]);
    g.push([gridSurface((a, k) => { const R = Rr + 0.07 - k * 0.05; return [xr + Math.cos(a) * R, Rr + Math.sin(a) * R, s * (tr + 0.24)]; }, range(0.2, Math.PI - 0.35, 16), [0, 1]), M.redDS]);
  }
  // ── кабина: пол, каркас, двери, остекление, крыша с козырьком, маячок, фары, зеркала
  const cx = -0.55, cf = 0.02, cb = -1.22, cy0 = 1.36, cy1 = 2.62, hw = 0.62;
  g.push([box(cf - cb, 0.06, hw * 2, cx, cy0, 0), M.frame, { collide: true }]);
  const posts = [];
  for (const [x, z] of [[cf, hw], [cf, -hw], [cb, hw], [cb, -hw]]) posts.push(rbox(0.06, cy1 - cy0, 0.06, 0.015, x, (cy0 + cy1) / 2, z));
  for (const z of [hw, -hw]) posts.push(rbox(0.05, cy1 - cy0 - 0.1, 0.05, 0.012, (cf + cb) / 2 - 0.08, (cy0 + cy1) / 2, z));
  posts.push(box(cf - cb, 0.05, 0.05, cx, cy0 + 0.55, hw), box(cf - cb, 0.05, 0.05, cx, cy0 + 0.55, -hw), box(0.05, 0.05, hw * 2, cf, cy0 + 0.55, 0), box(0.05, 0.05, hw * 2, cb, cy0 + 0.55, 0));
  g.push([mergeAll(posts), M.frame]);
  g.push([mergeAll([rbox(cf - cb + 0.28, 0.09, hw * 2 + 0.16, 0.04, cx + 0.06, cy1 + 0.045, 0), rbox(0.2, 0.03, hw * 2 + 0.1, 0.01, cf + 0.2, cy1 - 0.02, 0)]), M.white]);
  g.push([mergeAll([rbox(cf - cb - 0.04, 0.08, hw * 2 - 0.1, 0.03, cx, cy1 + 0.1, 0)]), M.red]);
  const glass = [
    place(new THREE.PlaneGeometry(hw * 2 - 0.06, cy1 - cy0 - 0.12), cf + 0.005, (cy0 + cy1) / 2 + 0.02, 0, 0, Math.PI / 2, 0),
    place(new THREE.PlaneGeometry(hw * 2 - 0.06, cy1 - cy0 - 0.62), cb - 0.005, cy1 - (cy1 - cy0 - 0.62) / 2 - 0.05, 0, 0, Math.PI / 2, 0),
  ];
  for (const z of [hw, -hw]) glass.push(place(new THREE.PlaneGeometry(cf - cb - 0.06, cy1 - cy0 - 0.12), cx, (cy0 + cy1) / 2 + 0.02, z));
  g.push([mergeAll(glass), M.glass, { cast: false }]);
  // дверь слева: ручка, петли, уплотнитель
  g.push([mergeAll([box(0.02, 0.03, 0.14, cx + 0.02, cy0 + 0.72, hw + 0.03), box(0.02, 0.1, 0.03, cf - 0.04, cy0 + 0.3, hw + 0.02), box(0.02, 0.1, 0.03, cf - 0.04, cy1 - 0.3, hw + 0.02)]), M.chrome]);
  g.push([mergeAll([box(0.02, 0.02, 0.08, cf - 0.02, cy0 + 0.9, -hw - 0.02)]), M.chrome]);
  // стеклоочиститель
  g.push([mergeAll([rodG([cf + 0.02, cy0 + 0.2, 0.05], [cf + 0.02, cy0 + 0.72, 0.28], 0.006), rodG([cf + 0.025, cy0 + 0.28, 0.12], [cf + 0.025, cy0 + 0.8, 0.34], 0.004)]), M.black]);
  // маячок, рабочие фары на крыше, зеркала
  g.push([mergeAll([cyl(0.08, 0.09, 0.04, "y", cx - 0.15, cy1 + 0.16, 0, 18)]), M.black], [mergeAll([cyl(0.07, 0.075, 0.12, "y", cx - 0.15, cy1 + 0.24, 0, 18), sphere(0.07, cx - 0.15, cy1 + 0.3, 0, 1, 0.5, 1, 16, 8)]), M.amber]);
  for (const z of [0.42, -0.42]) for (const [x, rx] of [[cf + 0.12, 0], [cb - 0.02, Math.PI]]) {
    g.push([rbox(0.08, 0.1, 0.14, 0.02, x, cy1 + 0.05, z), M.black], [place(new THREE.PlaneGeometry(0.12, 0.08), x + (rx ? -0.042 : 0.042), cy1 + 0.05, z, 0, rx ? -Math.PI / 2 : Math.PI / 2, 0), M.lens, { cast: false }]);
  }
  for (const s of [1, -1]) g.push([mergeAll([rodG([cf - 0.02, cy1 - 0.25, s * hw], [cf + 0.05, cy1 - 0.15, s * (hw + 0.28)], 0.012)]), M.black], [rbox(0.03, 0.2, 0.12, 0.015, cf + 0.06, cy1 - 0.22, s * (hw + 0.3)), M.black], [place(new THREE.PlaneGeometry(0.1, 0.17), cf + 0.043, cy1 - 0.22, s * (hw + 0.3), 0, -Math.PI / 2, 0), M.chrome, { cast: false }]);
  // салон: сиденье, руль с колонкой, щиток приборов, рычаги, педали
  g.push([mergeAll([rbox(0.42, 0.1, 0.46, 0.04, cx - 0.35, cy0 + 0.42, 0), rbox(0.1, 0.5, 0.44, 0.04, cx - 0.56, cy0 + 0.72, 0), cyl(0.04, 0.06, 0.34, "y", cx - 0.35, cy0 + 0.2, 0, 10)]), M.seat]);
  g.push([torus(0.19, 0.014, "x", cx + 0.22, cy0 + 0.9, 0, 8, 28), M.black], [rodG([cx + 0.22, cy0 + 0.9, 0], [cx + 0.42, cy0 + 0.4, 0], 0.025), M.black]);
  g.push([mergeAll([rbox(0.2, 0.3, 0.9, 0.03, cf - 0.14, cy0 + 0.72, 0)]), M.frame]);
  { const d = new THREE.PlaneGeometry(0.34, 0.17); d.rotateY(-Math.PI / 2); d.rotateZ(-0.3); d.translate(cf - 0.245, cy0 + 0.82, 0); g.push([d, M.dash, { cast: false }]); }
  for (const [z, h] of [[0.34, 0.5], [0.28, 0.42], [0.4, 0.38], [-0.3, 0.45]]) g.push([rodG([cx - 0.1, cy0 + 0.05, z], [cx - 0.05, cy0 + h, z - 0.02], 0.009), M.black], [sphere(0.022, cx - 0.05, cy0 + h, z - 0.02, 1, 1, 1, 10, 8), M.red]);
  for (const z of [0.12, -0.12, -0.22]) g.push([box(0.08, 0.02, 0.06, cf - 0.15, cy0 + 0.1, z), M.black]);
  // ── прицепное устройство и водило к носовой стойке МиГ-29
  g.push([torus(0.06, 0.018, "y", 2.2, 0.62, 0, 6, 14), M.steel]);
  g.push([tube([[2.2, 0.62, 0], [3.4, 0.5, 0], [4.6, 0.42, 0]], 0.05, 8, 8), M.orange]);
  g.push([mergeAll([cyl(0.07, 0.07, 0.15, "x", 4.62, 0.42, 0, 14), box(0.12, 0.04, 0.3, 4.7, 0.42, 0)]), M.frame]);
  for (const x of [3.2, 4.2]) g.push([mergeAll([box(0.1, 0.012, 0.1, x, 0.36, 0), box(0.012, 0.28, 0.06, x - 0.03, 0.22, 0), box(0.012, 0.28, 0.06, x + 0.03, 0.22, 0)]), M.frame], [cyl(0.08, 0.08, 0.04, "x", x, 0.08, 0, 14), M.rubber]);
  return g;
}

/* ═══════════ аэродромный тягач (низкий, с балластом и защитной дугой) ═══════════ */
export function airfieldTug(L) {
  const M = mats(L), g = [];
  const Y = M.yellow;
  const R = 0.36, xb = -0.9, xf = 0.95;
  for (const [x, s] of [[xb, 1], [xb, -1], [xf, 1], [xf, -1]]) g.push(...agWheel(M, { R, W: 0.26, rimR: 0.2, lugs: 0, lugH: 0.0, x, y: R, z: s * 0.68, s, dish: 0.03, holes: 5, front: true }));
  // корпус-балласт: скошенный нос, плоская палуба, крылья
  const sh = new THREE.Shape(); sh.moveTo(-1.45, 0.25); sh.lineTo(1.3, 0.25); sh.lineTo(1.55, 0.45); sh.lineTo(1.4, 0.82); sh.lineTo(0.4, 0.86); sh.lineTo(0.2, 0.8); sh.lineTo(-1.45, 0.8); sh.closePath();
  const body = new THREE.ExtrudeGeometry(sh, { depth: 1.0, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }); body.translate(0, 0, -0.5);
  const deck = new THREE.ExtrudeGeometry(sh, { depth: 1.5, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }); deck.translate(0, 0, -0.75); deck.scale(1, 1, 1);
  { const q = deck.attributes.position; for (let i = 0; i < q.count; i++) q.setY(i, Math.max(q.getY(i), 0.62)); deck.computeVertexNormals(); }
  g.push([deck, Y]);
  g.push([body, Y, { collide: true }]);
  for (const x of [xb, xf]) for (const s of [1, -1]) g.push([gridSurface((a, w) => [x + Math.cos(a) * 0.42, R + Math.sin(a) * 0.42, s * (0.66 + w)], range(0.15, Math.PI - 0.15, 10), [-0.16, 0.16]), M.frameDS]);
  // чёрно-жёлтая полоса, буфер, фары
  g.push([box(0.06, 0.18, 1.02, 1.5, 0.52, 0), M.black]);
  for (const s of [1, -1]) g.push([rbox(0.05, 0.1, 0.16, 0.02, 1.47, 0.72, s * 0.36), M.black], [place(new THREE.PlaneGeometry(0.13, 0.08), 1.498, 0.72, s * 0.36, 0, Math.PI / 2, 0), M.lens, { cast: false }]);
  // место водителя: сиденье, руль, дуга с крышей, маячок
  g.push([mergeAll([rbox(0.4, 0.1, 0.46, 0.04, -0.5, 1.0, 0), rbox(0.1, 0.45, 0.44, 0.04, -0.72, 1.25, 0)]), M.seat]);
  g.push([torus(0.17, 0.014, "x", 0.05, 1.3, 0, 8, 24), M.black], [rodG([0.05, 1.3, 0], [0.2, 0.86, 0], 0.025), M.black], [rbox(0.3, 0.2, 0.7, 0.04, 0.3, 0.95, 0), M.frame]);
  const bar = [];
  for (const s of [1, -1]) { bar.push(rodG([-1.0, 0.86, s * 0.48], [-1.0, 2.1, s * 0.48], 0.035), rodG([0.35, 0.86, s * 0.48], [0.2, 2.1, s * 0.48], 0.03)); }
  bar.push(rodG([-1.0, 2.1, 0.48], [-1.0, 2.1, -0.48], 0.035), rodG([0.2, 2.1, 0.48], [0.2, 2.1, -0.48], 0.03));
  g.push([mergeAll(bar), M.frame], [rbox(1.45, 0.05, 1.1, 0.02, -0.4, 2.14, 0), Y]);
  g.push([mergeAll([cyl(0.07, 0.075, 0.12, "y", -0.4, 2.23, 0, 18), sphere(0.07, -0.4, 2.29, 0, 1, 0.5, 1, 16, 8)]), M.amber]);
  // сцепка сзади и спереди
  g.push([mergeAll([box(0.3, 0.14, 0.34, -1.55, 0.45, 0), box(0.3, 0.14, 0.34, 1.62, 0.4, 0)]), M.frame], [mergeAll([torus(0.06, 0.02, "y", -1.72, 0.45, 0, 6, 14), cyl(0.025, 0.025, 0.24, "y", 1.7, 0.4, 0, 10)]), M.steel]);
  g.push([place(new THREE.PlaneGeometry(0.34, 0.17), -1.49, 0.6, 0, 0, -Math.PI / 2, 0), M.plate, { cast: false }]);
  return g;
}

/* ═══════════ пожарная автоцистерна на шасси МАЗ ═══════════ */
export function fireTruck(L) {
  const M = mats(L), g = [];
  // рама и колёса: передняя ось, задняя тележка со спаренными колёсами
  g.push([mergeAll([box(7.4, 0.26, 0.92, -0.2, 0.78, 0), box(0.3, 0.3, 2.3, -3.85, 0.85, 0)]), M.frame]);
  for (const s of [1, -1]) {
    g.push(...agWheel(M, { R: 0.53, W: 0.31, rimR: 0.29, lugs: 0, lugH: 0, x: 2.75, y: 0.53, z: s * 1.02, s, dish: 0.07, holes: 8 }));
    for (const x of [-1.55, -2.95]) for (const d of [0.8, 1.14]) g.push(...agWheel(M, { R: 0.53, W: 0.3, rimR: 0.29, lugs: 0, lugH: 0, x, y: 0.53, z: s * d, s, dish: d > 1 ? 0.07 : -0.05, holes: 8 }));
  }
  // кабина
  const cx = 2.95, red = M.red;
  g.push([rbox(1.95, 1.8, 2.46, 0.13, cx, 2.12, 0), red, { collide: true }]);
  g.push([place(new THREE.PlaneGeometry(2.1, 0.86), cx + 0.978, 2.5, 0, 0, Math.PI / 2, 0), M.glassDark, { cast: false }]);
  for (const s of [1, -1]) {
    const w = new THREE.PlaneGeometry(1.1, 0.7); if (s < 0) w.rotateY(Math.PI); w.translate(cx + 0.25, 2.5, s * 1.233); g.push([w, M.glassDark, { cast: false }]);
    g.push([mergeAll([box(0.02, 0.03, 0.16, cx + 0.2, 2.02, s * 1.245), box(0.6, 0.05, 0.05, cx - 0.35, 1.2, s * 1.2)]), M.chrome]);
    g.push([mergeAll([rodG([cx + 0.9, 2.7, s * 1.2], [cx + 1.1, 2.6, s * 1.45], 0.02)]), M.black], [rbox(0.05, 0.36, 0.2, 0.02, cx + 1.12, 2.45, s * 1.48), M.black]);
    g.push([rbox(0.08, 0.16, 0.34, 0.03, cx + 0.99, 1.28, s * 0.88), M.frame], [place(new THREE.PlaneGeometry(0.3, 0.13), cx + 1.034, 1.28, s * 0.88, 0, Math.PI / 2, 0), M.lens, { cast: false }]);
    // ступени
    g.push([mergeAll([box(0.4, 0.04, 0.2, cx + 0.25, 0.95, s * 1.26), box(0.4, 0.04, 0.2, cx + 0.25, 0.6, s * 1.26)]), M.steel]);
  }
  g.push([place(new THREE.PlaneGeometry(1.5, 0.45), cx + 0.978, 1.62, 0, 0, Math.PI / 2, 0), M.grille, { cast: false }]);
  g.push([mergeAll([box(0.22, 0.34, 2.5, cx + 1.06, 0.92, 0)]), M.frame], [box(0.02, 0.2, 2.2, cx + 0.99, 2.06, 0), M.stripe]);
  // проблесковые маячки и сирена на крыше кабины
  g.push([mergeAll([box(0.28, 0.1, 1.7, cx + 0.45, 3.06, 0)]), M.black]);
  for (const z of [-0.6, -0.2, 0.2, 0.6]) g.push([rbox(0.24, 0.12, 0.32, 0.04, cx + 0.45, 3.15, z), M.blueLens]);
  // кузов с отсеками под рольставнями, белая полоса, надпись
  g.push([rbox(5.3, 2.06, 2.46, 0.06, -1.2, 2.08, 0), red, { collide: true }]);
  for (const s of [1, -1]) {
    for (const [x, w] of [[0.55, 1.1], [-0.7, 1.2], [-2.0, 1.2], [-3.2, 1.0]]) {
      const sh = new THREE.PlaneGeometry(w, 1.3); if (s < 0) sh.rotateY(Math.PI); sh.translate(x, 2.2, s * 1.234); g.push([sh, M.shutter, { cast: false }]);
    }
    const st = new THREE.PlaneGeometry(5.2, 0.12); if (s < 0) st.rotateY(Math.PI); st.translate(-1.2, 1.4, s * 1.236); g.push([st, M.stripe, { cast: false }]);
    const tx = new THREE.PlaneGeometry(1.4, 0.26); if (s < 0) tx.rotateY(Math.PI); tx.translate(cx + 0.1, 1.62, s * 1.236); g.push([tx, M.fireText, { cast: false }]);
    // крылья задней тележки
    g.push([box(2.35, 0.08, 0.5, -2.25, 1.14, s * 1.0), M.frame]);
  }
  // лестница и рукава на крыше, задние ступени и фонари
  const lad = [];
  for (const z of [-0.3, 0.3]) lad.push(box(4.6, 0.06, 0.05, -1.3, 3.2, z));
  for (let x = -3.5; x <= 0.9; x += 0.3) lad.push(box(0.04, 0.04, 0.6, x, 3.2, 0));
  g.push([mergeAll(lad), M.steel], [mergeAll([box(4.4, 0.1, 0.08, -1.2, 3.13, 1.0), box(4.4, 0.1, 0.08, -1.2, 3.13, -1.0)]), M.steel]);
  for (const z of [0.72, -0.72]) g.push([cyl(0.14, 0.14, 1.9, "x", -1.8, 3.26, z, 16), M.stripe]);
  g.push([mergeAll([box(0.05, 1.8, 0.05, -3.88, 2.0, 0.85), box(0.05, 1.8, 0.05, -3.88, 2.0, 0.55), ...[1.3, 1.6, 1.9, 2.2, 2.5].map((y) => box(0.05, 0.03, 0.3, -3.88, y, 0.7))]), M.steel]);
  for (const s of [1, -1]) g.push([rbox(0.05, 0.16, 0.2, 0.02, -3.87, 1.05, s * 0.95), M.frame], [place(new THREE.PlaneGeometry(0.18, 0.13), -3.9, 1.05, s * 0.95, 0, -Math.PI / 2, 0), M.tail, { cast: false }]);
  return g;
}
