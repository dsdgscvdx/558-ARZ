/* Ремонтный ангар 558 АРЗ и прилегающий перрон с газовочной площадкой.
   Ворота на +X (со стороны перрона), самолёт в центре носом к воротам. */
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { Batch, xform } from "./batch.js";
import { box, rbox, cyl, torus, tube, sphere, place, mergeAll, latheX, range } from "./geo.js";
import * as T from "./tex.js";
import { jackGSE, chocks, apaTrailer, upgCart, kpaConsole, n2Cart, toolChest, workbench, engineStand, fireCart, intakePlug } from "./gse.js";
import { tractorMTZ, airfieldTug, fireTruck } from "./vehicles.js";
import { buildRD33, rd33Materials, rd33Meshes } from "./rd33.js";

export const H = { x0: -30, x1: 30, z: 22, eave: 11, ridge: 14.5, doorW: 16, doorH: 10.5, lift: 0.06 };
export const PAD = { x: 78, z: 0, ry: Math.PI };           // газовочная площадка: самолёт носом к ангару
export const SUN_DIR = new THREE.Vector3(0.62, 0.55, 0.56).normalize();

const TAU = Math.PI * 2;

/* ---------- материалы разметки и текстуры табличек ---------- */
function lineTex() {
  const w = 512, h = 64, c = T.canvas(w, h), g = c.getContext("2d"), rnd = T.mulberry32(7);
  g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
  // потёртости: вырезаем альфу пятнами
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${0.1 + rnd() * 0.5})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 2 + rnd() * 18, 1 + rnd() * 5, rnd() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(0,0,0,.85)"; g.fillRect(rnd() * w, rnd() < 0.5 ? 0 : h - 3, 4 + rnd() * 30, 3 + rnd() * 3); }
  return T.texFromCanvas(c, { srgb: false });
}
function stripeCanvas(c1, c2, w = 256, h = 64) {
  const c = T.canvas(w, h), g = c.getContext("2d"); g.fillStyle = c1; g.fillRect(0, 0, w, h); g.fillStyle = c2;
  for (let x = -h; x < w + h; x += h) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h / 2, 0); g.lineTo(x + h, 0); g.lineTo(x + h / 2, h); g.fill(); }
  return c;
}
function missionBoardTex() {
  const w = 1024, h = 560, c = T.canvas(w, h), g = c.getContext("2d"), rnd = T.mulberry32(12);
  g.fillStyle = "#6b5b45"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${60 + rnd() * 40},${45 + rnd() * 30},${30 + rnd() * 20},.35)`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  g.fillStyle = "#1e2a33"; g.fillRect(0, 0, w, 86);
  g.fillStyle = "#c8313e"; g.fillRect(0, 0, 18, 58); g.fillStyle = "#48a456"; g.fillRect(0, 58, 18, 28);
  g.font = "54px 'Russo One', 'Arial Black', sans-serif"; g.fillStyle = "#e8c04a"; g.textBaseline = "middle"; g.fillText("НАРЯДЫ-ЗАДАНИЯ ЦЕХА", 40, 45);
  for (let i = 0; i < 9; i++) {
    const x = 40 + (i % 5) * 196 + rnd() * 10, y = 110 + Math.floor(i / 5) * 220 + rnd() * 12, a = (rnd() - 0.5) * 0.08;
    g.save(); g.translate(x + 80, y + 95); g.rotate(a); g.translate(-80, -95);
    g.fillStyle = "#efeadc"; g.fillRect(0, 0, 160, 200);
    g.fillStyle = "#333"; g.font = "bold 15px Arial"; g.fillText("НАРЯД 558/" + String(i + 1).padStart(2, "0"), 12, 22);
    g.fillStyle = "#666"; for (let l = 0; l < 11; l++) g.fillRect(12, 42 + l * 13, 60 + rnd() * 80, 3);
    g.strokeStyle = "#1d3f8a"; g.lineWidth = 3; g.beginPath(); g.arc(120, 170, 18, 0, 7); g.stroke();
    g.fillStyle = ["#c8313e", "#e8c04a", "#48a456"][i % 3]; g.beginPath(); g.arc(80, 6, 7, 0, 7); g.fill();
    g.restore();
  }
  return T.texFromCanvas(c);
}
function screenTex(kind) {
  const w = 512, h = 320, c = T.canvas(w, h), g = c.getContext("2d");
  if (kind === "shop") {
    g.fillStyle = "#0d1a24"; g.fillRect(0, 0, w, h); g.fillStyle = "#e8c04a"; g.fillRect(0, 0, w, 40);
    g.fillStyle = "#1a1405"; g.font = "bold 24px Arial"; g.fillText("СНАБЖЕНИЕ 558 АРЗ", 16, 28);
    g.font = "18px monospace"; const rows = ["Колесо КТ-150Д", "Фильтр гидросистемы", "Лопатки турбины РД-33", "Насос-регулятор НР-59А", "Обтекатель РЛС", "Аккумуляторная батарея"];
    rows.forEach((r, i) => { g.fillStyle = i % 2 ? "#12242f" : "#0f1f29"; g.fillRect(10, 52 + i * 42, w - 20, 38); g.fillStyle = "#cfe3ea"; g.fillText(r, 20, 77 + i * 42); g.fillStyle = "#55c38a"; g.fillText("НА СКЛАДЕ", w - 140, 77 + i * 42); });
  } else {
    g.fillStyle = "#031009"; g.fillRect(0, 0, w, h); g.strokeStyle = "#2f7a4c"; g.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = "#7dffa8"; g.lineWidth = 3; g.beginPath();
    for (let x = 0; x < w; x++) { const y = h / 2 + Math.sin(x * 0.07) * 60 * Math.exp(-((x - w / 2) ** 2) / 20000) + Math.sin(x * 0.9) * 4; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.fillStyle = "#7dffa8"; g.font = "20px monospace"; g.fillText("КПА-Н019МЭ  ГОТОВ", 14, 26);
  }
  return T.texFromCanvas(c);
}
function posterTex(title, lines, color = "#c8313e") {
  const w = 512, h = 720, c = T.canvas(w, h), g = c.getContext("2d");
  g.fillStyle = "#ece6d6"; g.fillRect(0, 0, w, h); g.fillStyle = color; g.fillRect(0, 0, w, 120);
  g.fillStyle = "#fff"; g.font = "44px 'Russo One', 'Arial Black', sans-serif"; g.textAlign = "center"; g.fillText(title, w / 2, 78);
  g.fillStyle = "#222"; g.font = "28px Arial"; lines.forEach((l, i) => g.fillText(l, w / 2, 190 + i * 46));
  g.strokeStyle = "#222"; g.lineWidth = 6; g.strokeRect(20, 140, w - 40, h - 170);
  return T.texFromCanvas(c);
}

/* ═════════════════════════ ПОСТРОЕНИЕ ═════════════════════════ */
export function buildWorld(L, TX, opts = {}) {
  const root = new THREE.Group(); root.name = "world";
  const hangar = new THREE.Group(); hangar.name = "hangar"; root.add(hangar);
  const outside = new THREE.Group(); outside.name = "outside"; root.add(outside);
  const b = new Batch(), bo = new Batch();
  const spots = [];                       // точки взаимодействия
  const ladders = [];                     // зоны лестниц
  const dyn = {};                         // анимируемые объекты
  const spot = (key, label, x, y, z, w, h, d, extra = {}) => spots.push({ key, label, box: new THREE.Box3(new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)), ...extra });

  /* ---------- материалы стен и пола ---------- */
  const floorMat = new THREE.MeshStandardMaterial({ map: TX.floor.map, normalMap: TX.floor.normal, roughnessMap: TX.floor.orm, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.7, 0.7) });
  for (const t of [TX.floor.map, TX.floor.normal, TX.floor.orm]) t.repeat.set(1 / 6, 1 / 6);
  const macro = TX.floorMacro;
  // планарное отражение (включается из view.js на «Высоком»/«Ультра»)
  const refl = { uReflTex: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 }, uReflK: { value: 0.48 } };
  floorMat.userData.refl = refl;
  floorMat.onBeforeCompile = (sh) => {
    sh.uniforms.uMacro = { value: macro };
    Object.assign(sh.uniforms, refl);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP; varying vec4 vReflUv; uniform mat4 uReflMat;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vReflUv = uReflMat * vec4(vWP, 1.0);");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D uMacro; varying vec3 vWP; varying vec4 vReflUv; uniform sampler2D uReflTex; uniform float uReflOn; uniform float uReflK;")
      .replace("#include <color_fragment>", "#include <color_fragment>\nvec4 MAC = texture2D(uMacro, vec2(vWP.x / 72.0 + 0.5, vWP.z / 48.0 + 0.5));\ndiffuseColor.rgb *= mix(0.78, 1.1, MAC.r);")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * mix(0.75, 1.5, MAC.g), 0.08, 1.0);")
      .replace("#include <opaque_fragment>", `
        if (uReflOn > 0.5) {
          vec3 Nr = normalize(normal); vec3 Vr = normalize(vViewPosition);
          float NdV = clamp(dot(Nr, Vr), 0.0, 1.0);
          vec2 ruv = vReflUv.xy / vReflUv.w + Nr.xy * 0.025;
          vec3 rc = textureLod(uReflTex, ruv, roughnessFactor * 8.0).rgb;
          float fres = 0.05 + 0.95 * pow(1.0 - NdV, 4.0);
          outgoingLight += rc * fres * pow(1.0 - roughnessFactor, 2.2) * uReflK;
        }
        #include <opaque_fragment>`);
  };
  floorMat.customProgramCacheKey = () => "floor-macro-refl";
  const corr = TX.corrugated;
  const wallUpper = new THREE.MeshStandardMaterial({ map: corr.map, normalMap: corr.normal, roughnessMap: corr.orm, metalnessMap: corr.orm, metalness: 1, roughness: 1, color: "#e4e8ea" });
  const roofMat = new THREE.MeshStandardMaterial({ map: TX.corrugatedRoof.map, normalMap: TX.corrugatedRoof.normal, roughnessMap: TX.corrugatedRoof.orm, metalnessMap: TX.corrugatedRoof.orm, metalness: 0.6, roughness: 1, color: "#c9ced1", side: THREE.DoubleSide });
  const dado = new THREE.MeshStandardMaterial({ color: "#56675f", roughness: 0.75, metalness: 0, normalMap: TX.paintedMetal.normal, normalScale: new THREE.Vector2(0.3, 0.3) });
  const steelBeam = new THREE.MeshStandardMaterial({ color: "#3f4a52", roughness: 0.6, metalness: 0.6, normalMap: TX.paintedMetal.normal, normalScale: new THREE.Vector2(0.4, 0.4), roughnessMap: TX.paintedMetal.orm });
  const windowMat = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#dbe8f5", emissiveIntensity: 5.5, roughness: 0.1 });
  const skyPanel = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#e8eef2", emissiveIntensity: 4.0, roughness: 0.3, side: THREE.DoubleSide });
  const frameMat = new THREE.MeshStandardMaterial({ color: "#2b3236", roughness: 0.5, metalness: 0.6 });

  /* ---------- пол ---------- */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0 + 1, H.z * 2 + 1, 1, 1), floorMat);
  // UV в метрах, чтобы тайлинг 6 м совпадал с плитами
  { const g = floor.geometry, uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), -p.getY(i)); }
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; hangar.add(floor); dyn.floor = floor;
  b.colliders.push(box(H.x1 - H.x0 + 40, 0.2, H.z * 2 + 40, 0, -0.1, 0));

  /* ---------- разметка пола ---------- */
  {
    const lt = lineTex();
    const mk = (color, rough = 0.5) => { const m = new THREE.MeshStandardMaterial({ color, alphaMap: lt, transparent: true, roughness: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }); return m; };
    const yellow = mk("#e2b21f"), white = mk("#e9ece8"), red = mk("#c8313e");
    const lines = { yellow: [], white: [], red: [] };
    const strip = (col, x0, z0, x1, z1, w) => {
      const len = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(len, w);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 4, uv.getY(i));
      g.rotateX(-Math.PI / 2); g.rotateY(-Math.atan2(z1 - z0, x1 - x0)); g.translate((x0 + x1) / 2, 0.003, (z0 + z1) / 2);
      lines[col].push(g);
    };
    const rect = (col, x0, z0, x1, z1, w) => { strip(col, x0, z0, x1, z0, w); strip(col, x1, z0, x1, z1, w); strip(col, x1, z1, x0, z1, w); strip(col, x0, z1, x0, z0, w); };
    rect("yellow", -11, -9, 12, 9, 0.14);
    for (let x = 12.5; x < 29.5; x += 2) strip("yellow", x, 0, x + 1.2, 0, 0.14);
    strip("yellow", 3.2, -1.4, 3.2, 1.4, 0.3);
    strip("white", -28.5, -18.2, 28.5, -18.2, 0.1); strip("white", -28.5, -16.8, 28.5, -16.8, 0.1);
    strip("white", -28.5, 18.2, 28.5, 18.2, 0.1); strip("white", -28.5, 16.8, 28.5, 16.8, 0.1);
    rect("red", 24.5, -21.5, 29.5, -19.2, 0.1); rect("red", -29.5, 19, -21.5, 21.6, 0.1);
    for (const [col, arr] of Object.entries(lines)) { const m = new THREE.Mesh(mergeAll(arr), col === "yellow" ? yellow : col === "white" ? white : red); m.receiveShadow = true; hangar.add(m); }
    // надписи на полу
    const txt = (s, x, z, ry, size = 1.2, color = "#e2b21f") => {
      const c = T.canvas(512, 128), g = c.getContext("2d"); g.font = "92px 'Russo One', 'Arial Black', sans-serif"; g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, 256, 68);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 4, size), new THREE.MeshStandardMaterial({ map: T.texFromCanvas(c), alphaMap: lt, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
      m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(x, 0.004, z); m.receiveShadow = true; hangar.add(m);
    };
    txt("СТОЯНКА № 1", -8, -7.8, 0, 0.9); txt("МиГ-29", 5.2, 0, -Math.PI / 2, 0.8); txt("ПРОХОД", -20, -17.5, 0, 0.7, "#e9ece8"); txt("ПРОХОД", 20, 17.5, Math.PI, 0.7, "#e9ece8");
    // штриховка «не загромождать» у пожарного оборудования
    const hatch = T.texFromCanvas(stripeCanvas("#c8313e", "#e9ece8"));
    hatch.repeat.set(3, 1);
    const hm = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.1), new THREE.MeshStandardMaterial({ map: hatch, alphaMap: lt, transparent: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
    hm.rotation.x = -Math.PI / 2; hm.position.set(27, 0.003, -20.35); hangar.add(hm);
  }

  /* ---------- стены ---------- */
  const T_W = 0.3, Z = H.z;
  const wallPiece = (x0, x1, y0, y1, z, face) => { // стена вдоль X в плоскости z
    const w = x1 - x0, h = y1 - y0;
    const g = box(w, h, T_W, (x0 + x1) / 2, (y0 + y1) / 2, z + face * T_W / 2);
    fixUV(g, w, h, 2); return g;
  };
  const wallPieceZ = (z0, z1, y0, y1, x, face) => {
    const w = z1 - z0, h = y1 - y0;
    const g = box(T_W, h, w, x + face * T_W / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    fixUV(g, w, h, 2); return g;
  };
  // боковые стены с ленточным остеклением
  for (const s of [1, -1]) {
    b.add(wallPiece(H.x0, H.x1, 0, 2.4, s * Z, s), dado, { collide: true });
    b.add(wallPiece(H.x0, H.x1, 2.4, 7.4, s * Z, s), wallUpper);
    b.add(wallPiece(H.x0, H.x1, 10.2, H.eave, s * Z, s), wallUpper);
    for (let k = 0; k < 10; k++) {
      const xa = H.x0 + k * 6, xb = xa + 6;
      b.add(wallPiece(xa, xa + 0.6, 7.4, 10.2, s * Z, s), wallUpper);
      b.add(wallPiece(xb - 0.6, xb, 7.4, 10.2, s * Z, s), wallUpper);
      const gl = new THREE.PlaneGeometry(4.8, 2.8); if (s > 0) gl.rotateY(Math.PI); gl.translate(xa + 3, 8.8, s * (Z + 0.2));
      b.add(gl, windowMat, { cast: false, receive: false });
      for (const fx of [xa + 0.6, xa + 1.8, xa + 3, xa + 4.2, xb - 0.6]) b.add(box(0.08, 2.8, 0.1, fx, 8.8, s * (Z + 0.05)), frameMat, { cast: false });
      b.add(box(4.8, 0.1, 0.12, xa + 3, 8.8, s * (Z + 0.05)), frameMat, { cast: false });
      b.add(box(4.9, 0.12, 0.3, xa + 3, 7.34, s * (Z - 0.05)), frameMat);
    }
  }
  // торцевая стена
  b.add(wallPieceZ(-Z, Z, 0, 2.4, H.x0, -1), dado, { collide: true });
  b.add(wallPieceZ(-Z, Z, 2.4, H.eave, H.x0, -1), wallUpper);
  // фронтон с воротами
  b.add(wallPieceZ(-Z, -H.doorW, 0, H.eave, H.x1, 1), wallUpper, { collide: true });
  b.add(wallPieceZ(H.doorW, Z, 0, H.eave, H.x1, 1), wallUpper, { collide: true });
  b.add(wallPieceZ(-H.doorW, H.doorW, H.doorH, H.eave, H.x1, 1), wallUpper);
  b.add(box(0.5, 0.6, H.doorW * 2 + 0.6, H.x1, H.doorH + 0.3, 0), steelBeam);
  for (const s of [1, -1]) b.add(box(0.5, H.doorH, 0.5, H.x1, H.doorH / 2, s * (H.doorW + 0.25)), steelBeam, { collide: true });
  // щипцы (треугольники)
  for (const [x, f] of [[H.x0, -1], [H.x1, 1]]) {
    const s = new THREE.Shape(); s.moveTo(-Z, H.eave); s.lineTo(Z, H.eave); s.lineTo(0, H.ridge); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: T_W, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(x + (f > 0 ? 0 : -T_W), 0, 0);
    fixUV(g, 44, 4, 2, true); b.add(g, wallUpper);
  }
  // кровля с зенитными фонарями
  for (const s of [1, -1]) {
    const len = Math.hypot(Z, H.ridge - H.eave), ang = Math.atan2(H.ridge - H.eave, Z);
    for (let k = 0; k < 10; k++) {
      const xa = H.x0 + k * 6;
      const seg = (u0, u1, mat, cast = true) => {
        const g = new THREE.PlaneGeometry(6, (u1 - u0) * len); fixUV(g, 6, (u1 - u0) * len, 2);
        g.rotateX(Math.PI / 2); g.rotateX(s * ang); const um = (u0 + u1) / 2;
        g.translate(xa + 3, H.eave + (H.ridge - H.eave) * (1 - um), s * Z * um);
        b.add(g, mat, { cast, receive: true });
      };
      seg(0, 0.28, roofMat); seg(0.28, 0.4, skyPanel, false); seg(0.4, 1.0, roofMat);
    }
    // толстая кровля для теней (снаружи)
    const tg = box(62, 0.25, len, 0, 0, 0); tg.rotateX(s * ang); tg.translate(0, (H.eave + H.ridge) / 2 + 0.35, s * Z / 2);
    void tg;
  }
  // колонны, ригели, прогоны
  const ibeam = (len, hgt = 0.5, wdt = 0.3) => mergeAll([box(len, 0.025, wdt, 0, hgt / 2, 0), box(len, 0.025, wdt, 0, -hgt / 2, 0), box(len, hgt, 0.018, 0, 0, 0)]);
  for (let k = 0; k <= 10; k++) {
    const x = H.x0 + k * 6;
    for (const s of [1, -1]) {
      const col = ibeam(H.eave, 0.5, 0.35); col.rotateZ(Math.PI / 2); col.translate(x, H.eave / 2, s * (Z - 0.3));
      if (k > 0 && k < 10) b.add(col, steelBeam, { collide: true });
      const len = Math.hypot(Z, H.ridge - H.eave), ang = Math.atan2(H.ridge - H.eave, Z);
      const raf = ibeam(len, 0.7, 0.3); raf.rotateY(Math.PI / 2); raf.rotateX(s * ang); raf.translate(x, (H.eave + H.ridge) / 2 - 0.45, s * Z / 2);
      b.add(raf, steelBeam);
      // подкос
      const br = ibeam(2.2, 0.3, 0.2); br.rotateY(Math.PI / 2); br.rotateX(-s * 0.9); br.translate(x, H.eave - 0.9, s * (Z - 1.1)); b.add(br, steelBeam);
    }
  }
  for (const s of [1, -1]) for (let u = 0.1; u < 1; u += 0.18) {
    const g = box(60, 0.18, 0.1, 0, H.eave + (H.ridge - H.eave) * (1 - u) - 0.55, s * Z * u); b.add(g, steelBeam, { cast: false });
  }
  // подкрановые пути и мостовой кран
  for (const s of [1, -1]) b.add(box(60, 0.5, 0.35, 0, 9.4, s * (Z - 0.9)), steelBeam);
  {
    const cx = -9;
    b.add(box(0.8, 0.9, 43, cx, 10.15, 0), L.yellow); b.add(box(0.5, 0.14, 43.5, cx, 10.65, 0), L.yellow);
    b.add(box(1.3, 0.7, 1.5, cx, 9.4, 4), L.darkProp);
    b.add(cyl(0.012, 0.012, 7.0, "y", cx, 5.6, 4, 6), L.steel, { cast: false });
    b.add(torus(0.12, 0.03, "z", cx, 2.0, 4, 6, 16, Math.PI * 1.3), L.yellow);
    b.add(box(0.3, 0.3, 0.2, cx, 2.25, 4), L.yellow);
  }
  // светильники
  {
    const n = 30, housing = new THREE.InstancedMesh(latheY([[0.02, 0.55], [0.45, 0.35], [0.5, 0.05], [0.48, 0.0]], 24), L.darkProp, n);
    const lens = new THREE.InstancedMesh(new THREE.CircleGeometry(0.42, 24).rotateX(Math.PI / 2), L.lampLit, n);
    const m4 = new THREE.Matrix4(); let i = 0;
    for (let k = 0; k < 10; k++) for (const z of [-11, 0, 11]) {
      const x = H.x0 + 3 + k * 6, y = H.eave + (H.ridge - H.eave) * (1 - Math.abs(z) / Z) - 2.2;
      m4.makeTranslation(x, y, z); housing.setMatrixAt(i, m4); m4.makeTranslation(x, y - 0.005, z); lens.setMatrixAt(i, m4);
      b.add(cyl(0.008, 0.008, 1.6, "y", x, y + 1.1, z, 4), L.steel, { cast: false });
      i++;
    }
    housing.castShadow = false; hangar.add(housing, lens);
  }
  // окна и ворота снаружи
  // трубы и кабельные лотки вдоль стен
  for (const s of [1, -1]) {
    b.add(cyl(0.08, 0.08, 60, "x", 0, 3.6, s * (Z - 0.4), 10), L.red, { cast: false });
    b.add(cyl(0.05, 0.05, 60, "x", 0, 3.85, s * (Z - 0.35), 8), L.greyProp, { cast: false });
    b.add(box(60, 0.08, 0.4, 0, 4.4, s * (Z - 0.45)), L.greyProp, { cast: false });
    for (let x = -28; x <= 28; x += 3) b.add(box(0.05, 0.4, 0.45, x, 4.2, s * (Z - 0.3)), L.greyProp, { cast: false });
  }

  /* ---------- ворота: 4 створки на рельсах ---------- */
  {
    const leafW = H.doorW / 2 + 0.2, leafH = H.doorH;
    const leafGeo = mergeAll([box(leafW, leafH, 0.25, 0, leafH / 2, 0)]);
    fixUV(leafGeo, leafW, leafH, 2);
    const ribs = mergeAll([box(leafW, 0.12, 0.3, 0, 0.2, 0), box(leafW, 0.12, 0.3, 0, leafH - 0.2, 0), box(leafW, 0.12, 0.3, 0, leafH / 2, 0), box(0.12, leafH, 0.3, -leafW / 2 + 0.06, leafH / 2, 0), box(0.12, leafH, 0.3, leafW / 2 - 0.06, leafH / 2, 0)]);
    dyn.doors = [];
    const leafMat = wallUpper.clone(); leafMat.color = new THREE.Color("#d8dde0");
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const m1 = new THREE.Mesh(leafGeo, leafMat); m1.castShadow = m1.receiveShadow = true;
      const m2 = new THREE.Mesh(ribs, steelBeam); m2.castShadow = m2.receiveShadow = true;
      m1.rotation.y = m2.rotation.y = Math.PI / 2; g.add(m1, m2);
      const side = i < 2 ? -1 : 1, lane = i % 2;
      const closedZ = side * (lane === 0 ? leafW / 2 : leafW * 1.5) * (1 - 0.0);
      const openZ = side * (H.doorW + 0.6 + leafW / 2 + lane * 0.1);
      g.position.set(H.x1 + 0.45 + lane * 0.4, 0, openZ);
      g.userData = { closedZ, openZ };
      hangar.add(g); dyn.doors.push(g);
    }
    b.add(box(0.3, 0.3, 70, H.x1 + 0.6, H.doorH + 0.2, 0), steelBeam);
    dyn.doorOpen = 1;
    // пульт ворот
    b.add(rbox(0.4, 0.55, 0.2, 0.03, H.x1 - 0.5, 1.4, -H.doorW - 1.2, 0, Math.PI / 2, 0), L.greyProp);
    b.add(cyl(0.035, 0.035, 0.05, "x", H.x1 - 0.63, 1.5, -H.doorW - 1.1, 12), L.navGreen);
    b.add(cyl(0.035, 0.035, 0.05, "x", H.x1 - 0.63, 1.35, -H.doorW - 1.1, 12), L.redDark);
    spot("door", "Пульт ворот ангара", H.x1 - 0.55, 1.4, -H.doorW - 1.2, 0.5, 0.7, 0.5);
  }

  /* ---------- оборудование ---------- */
  const P = (fnGeos, x, z, ry, mats, o = {}) => {                // размещение набора [геометрия, материал]
    const m = xform(x, o.y || 0, z, ry);
    for (const [g, mat, opt] of fnGeos) b.add(g, mat, { matrix: m, ...(opt || {}) });
  };
  // инструментальные тумбы
  const chest = (col) => toolChest(L, col);
  for (let i = 0; i < 5; i++) P(chest(i % 2 ? L.red : L.redDark), -20 + i * 0.85, -21.2, 0);
  P(chest(L.red), -3.8, -5.6, 0.4); P(chest(L.blueGrey), 6.2, 5.8, -2.4);
  // верстаки с тисками, тумбой и перфопанелью
  { const wb = workbench(L); P(wb, -11, -21.2, 0); P(wb, -14, -21.2, 0); }
  // стол снабжения с терминалом
  {
    const sc = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#ffffff", emissiveMap: screenTex("shop"), emissiveIntensity: 1.3 });
    const desk = [[box(1.6, 0.05, 0.8, 0, 0.76, 0), L.greyProp, { collide: true }], [box(0.05, 0.74, 0.75, -0.75, 0.37, 0), L.greyProp], [box(0.05, 0.74, 0.75, 0.75, 0.37, 0), L.greyProp],
      [rbox(0.6, 0.4, 0.06, 0.01, 0, 1.12, -0.2), L.black], [box(0.06, 0.2, 0.06, 0, 0.88, -0.2), L.black], [box(0.45, 0.02, 0.16, 0, 0.8, 0.12), L.black],
      [place(new THREE.PlaneGeometry(0.54, 0.34), 0, 1.12, -0.165), sc, { cast: false }]];
    P(desk, 4.5, -20.9, 0);
    spot("shop", "Терминал снабжения", 4.5, 1.1, -20.9, 1.6, 0.8, 1.0);
  }
  // доска нарядов
  {
    const m = new THREE.MeshStandardMaterial({ map: missionBoardTex(), roughness: 0.85 });
    b.add(place(new THREE.PlaneGeometry(3.2, 1.75), -2.5, 1.9, -Z + 0.2), m, { cast: false });
    b.add(box(3.35, 1.9, 0.05, -2.5, 1.9, -Z + 0.17), L.darkProp);
    spot("board", "Доска нарядов", -2.5, 1.9, -Z + 0.4, 3.3, 1.9, 0.6);
    const pz = new THREE.MeshStandardMaterial({ map: posterTex("ТЕХНИКА БЕЗОПАСНОСТИ", ["Работы на самолёте —", "только по наряду.", "Пиросредства кресла —", "с допуском.", "Гонка двигателей —", "с пожарным расчётом.", "Излучение РЛС в цехе —", "только на эквивалент!"]), roughness: 0.8 });
    b.add(place(new THREE.PlaneGeometry(0.9, 1.26), 0.3, 1.9, -Z + 0.2), pz, { cast: false });
    const ph = new THREE.MeshStandardMaterial({ map: posterTex("СПРАВКА", ["Технологические карты", "ремонта МиГ-29БМ", "", "Порядок работы,", "пределы параметров", "РД-33 и РЛС «Топаз»"], "#1d3f8a"), roughness: 0.8 });
    b.add(place(new THREE.PlaneGeometry(0.9, 1.26), 1.4, 1.9, -Z + 0.2), ph, { cast: false });
    spot("help", "Технологические карты (справка)", 1.4, 1.9, -Z + 0.4, 1.0, 1.3, 0.6);
  }
  // стеллажи склада
  {
    const rack = (len) => {
      const out = [];
      for (const x of [-len / 2, 0, len / 2]) for (const z of [-0.45, 0.45]) out.push([box(0.08, 3.2, 0.08, x, 1.6, z), L.orange]);
      for (const y of [0.15, 1.05, 1.95, 2.85]) { out.push([box(len, 0.1, 0.06, 0, y, -0.45), L.orange], [box(len, 0.1, 0.06, 0, y, 0.45), L.orange], [box(len, 0.03, 0.95, 0, y + 0.05, 0), L.greyProp]); }
      return out;
    };
    const rnd = T.mulberry32(33);
    for (const zc of [-11, -6]) {
      const items = rack(4.2);
      for (const y of [0.2, 1.1, 2.0, 2.9]) for (let x = -1.8; x < 1.8; x += 0.5 + rnd() * 0.4) {
        const w = 0.35 + rnd() * 0.3, h = 0.25 + rnd() * 0.45, d = 0.4 + rnd() * 0.4;
        const r = rnd();
        if (r < 0.55) items.push([box(w, h, d, x, y + h / 2, (rnd() - 0.5) * 0.2), L.cardboard]);
        else if (r < 0.8) items.push([box(w, h * 0.8, d, x, y + h * 0.4, 0), L.greenProp]);
        else items.push([cyl(0.15, 0.15, 0.5, "z", x, y + 0.16, 0, 16), L.aluDark]);
      }
      P(items, -28.6, zc, Math.PI / 2);
      b.wall(1.0, 3.2, 4.3, -28.6, 1.6, zc);
    }
    // запасные колёса на полу
    for (let i = 0; i < 3; i++) b.add(place(new THREE.TorusGeometry(0.33, 0.13, 12, 32), -27.2, 0.13 + i * 0.27, -2.5, Math.PI / 2, 0, 0), L.tire);
    spot("stock", "Склад запчастей", -28.4, 1.5, -8.5, 1.4, 3, 10);
  }
  // кабина ОТК (застеклённая)
  {
    const x0 = -29.8, x1 = -23.5, z0 = 13, z1 = 21.8, hgt = 3.0;
    b.add(box(x1 - x0, 0.9, 0.12, (x0 + x1) / 2, 0.45, z0), L.whiteProp, { collide: true });
    b.add(box(0.12, 0.9, z1 - z0 - 1.2, x1, 0.45, (z0 + z1) / 2 + 0.6), L.whiteProp, { collide: true });
    b.wall(0.12, 3, z1 - z0 - 1.2, x1, 1.5, (z0 + z1) / 2 + 0.6); b.wall(x1 - x0, 3, 0.12, (x0 + x1) / 2, 1.5, z0);
    b.add(box(x1 - x0, 0.12, z1 - z0, (x0 + x1) / 2, hgt, (z0 + z1) / 2), L.whiteProp);
    const gl = [place(new THREE.PlaneGeometry(x1 - x0, 2.0), (x0 + x1) / 2, 1.95, z0), place(new THREE.PlaneGeometry(z1 - z0 - 1.2, 2.0), x1, 1.95, (z0 + z1) / 2 + 0.6, 0, Math.PI / 2, 0)];
    for (const g of gl) b.add(g, L.glassDark, { cast: false });
    for (let x = x0; x <= x1; x += 1.05) b.add(box(0.06, 2.1, 0.08, x, 1.95, z0), L.darkProp);
    b.add(box(1.8, 0.05, 0.8, -26.5, 0.78, 14.0), L.greyProp); b.add(box(0.5, 0.35, 0.05, -26.5, 1.0, 13.7), L.black);
    const otkSign = new THREE.MeshStandardMaterial({ map: T.texFromCanvas(T.textPlate([["ОТК", 150], ["отдел технического контроля", 40, "#c9d2d6"]], { w: 1024, h: 300 })), roughness: 0.6, emissive: "#ffffff", emissiveIntensity: 0.15, emissiveMap: null });
    b.add(place(new THREE.PlaneGeometry(2.6, 0.76), (x0 + x1) / 2, hgt + 0.5, z0 - 0.07, 0, Math.PI, 0), otkSign, { cast: false });
    b.add(box(1.0, 0.05, 0.4, -24.5, 1.0, z0 - 0.15), L.greyProp);
    spot("otk", "Окно ОТК — сдать самолёт", -24.5, 1.4, z0 - 0.2, 1.6, 1.2, 0.8);
  }
  // шкафчики (личное дело)
  {
    for (let i = 0; i < 7; i++) {
      const x = -20 + i * 0.62;
      b.add(box(0.6, 1.9, 0.5, x, 0.95, Z - 0.35), i % 2 ? L.blueGrey : L.greyProp, { collide: true });
      for (let v = 0; v < 4; v++) b.add(box(0.3, 0.015, 0.02, x, 1.65 + v * 0.04, Z - 0.6), L.darkProp, { cast: false });
      b.add(box(0.02, 0.12, 0.03, x + 0.22, 1.0, Z - 0.61), L.chrome, { cast: false });
    }
    b.add(box(3.0, 0.05, 0.35, -18.2, 0.45, Z - 1.1), L.wood); for (const x of [-19.5, -17]) b.add(box(0.05, 0.43, 0.3, x, 0.22, Z - 1.1), L.greyProp);
    spot("profile", "Шкафчик авиатехника — личное дело", -18.2, 1.0, Z - 0.5, 4.4, 2, 0.8);
  }
  // тягач «Беларус» МТЗ-82 с водилом
  {
    P(tractorMTZ(L), 19, 8.5, -0.3);
    spot("tractor", "Тягач — выкатить на газовочную площадку", 19, 1.2, 8.5, 4, 2.4, 2.2);
  }
  // КПА РЛС у носа самолёта
  {
    const scr = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#ffffff", emissiveMap: screenTex("kpa"), emissiveIntensity: 1.6 });
    const kpa = kpaConsole(L, scr);
    P(kpa, 9.2, 2.6, Math.PI);
    b.add(tube([[8.62, 1.0, 2.6], [8.4, 0.05, 2.4], [7.2, 0.04, 1.4], [6.6, 0.05, 0.7], [6.5, 1.0, 0.5], [6.45, 1.7, 0.3]], 0.025, 40, 6), L.wireBlack, { cast: false });
    spot("kpa", "КПА РЛС — настройка «Топаза»", 9.2, 1.2, 2.6, 1.4, 1.6, 1.0);
  }
  // аэродромный источник питания и гидроустановка
  {
    const plate = (lines, w = 512, h = 320, bg = "#20282c") => {
      const c = T.canvas(w, h), g = c.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#8a959a"; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
      for (let i = 0; i < 3; i++) { const x = 90 + i * 165, y = 120; g.fillStyle = "#0f1214"; g.beginPath(); g.arc(x, y, 58, 0, 7); g.fill(); g.strokeStyle = "#dfe3e0"; g.lineWidth = 3;
        for (let k = 0; k <= 10; k++) { const a = Math.PI * 0.8 + (k / 10) * Math.PI * 1.4; g.beginPath(); g.moveTo(x + Math.cos(a) * 40, y + Math.sin(a) * 40); g.lineTo(x + Math.cos(a) * 52, y + Math.sin(a) * 52); g.stroke(); }
        const a = Math.PI * (1.1 + i * 0.35); g.strokeStyle = "#ff5a3a"; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 46, y + Math.sin(a) * 46); g.stroke(); }
      g.fillStyle = "#e8e2c8"; g.font = "bold 30px Arial"; lines.forEach((t, i) => g.fillText(t, 30, 230 + i * 38));
      for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? "#c62828" : "#2e7d32"; g.beginPath(); g.arc(300 + i * 36, 222, 11, 0, 7); g.fill(); }
      return new THREE.MeshStandardMaterial({ map: T.texFromCanvas(c), roughness: 0.55 });
    };
    const warn = new THREE.MeshStandardMaterial({ map: T.texFromCanvas(T.textPlate([["ОСТОРОЖНО! ~115 В 400 Гц, =27 В", 44, "#111"]], { w: 1024, h: 128, bg: "#e8b21a", fg: "#111", flag: false, align: "center" })), roughness: 0.6 });
    const stripe = new THREE.MeshStandardMaterial({ map: T.texFromCanvas(stripeCanvas("#e0b020", "#1a1a1a", 256, 64)), roughness: 0.6 });
    const wheels = (list, R = 0.26, w = 0.18) => list.flatMap(([x, z]) => [[place(new THREE.TorusGeometry(R * 0.72, R * 0.3, 10, 24), x, R, z), L.tire], [cyl(R * 0.5, R * 0.5, w * 0.9, "z", x, R, z, 16), L.greyProp]]);
    // АПА (двухосный прицеп) и гидроустановка
    P(apaTrailer(L), -6.5, -6.0, 0.3);
    P(upgCart(L), -4.2, 5.5, -2.2);
    // кабель питания и гидрошланги — в мировых координатах, к разъёмам самолёта
    const wpt = (x, z, ry, lx, ly, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), ly, z - lx * Math.sin(ry) + lz * Math.cos(ry)];
    const a0 = wpt(-6.5, -6.0, 0.3, 0.85, 1.05, 0.95);
    b.add(tube([a0, [a0[0] + 0.3, 0.05, a0[2] + 0.6], [-2.5, 0.04, -4.2], [0.8, 0.04, -2.1], [2.0, 0.05, -1.3], [2.25, 0.9, -0.95], [2.3, 1.55, -0.66]], 0.03, 60, 6), L.wireBlack, { cast: false });
    const u0 = wpt(-4.2, 5.5, -2.2, -0.3, 1.42, 0.12), u1 = wpt(-4.2, 5.5, -2.2, 0.3, 1.42, 0.12);
    b.add(tube([u0, [u0[0] + 0.2, 0.05, u0[2] - 0.3], [-2.4, 0.04, 3.2], [-0.9, 0.04, 1.3], [-0.7, 0.9, 0.45], [-0.6, 1.72, 0.28]], 0.02, 50, 6), L.hose, { cast: false });
    b.add(tube([u1, [u1[0] + 0.3, 0.05, u1[2] - 0.2], [-2.0, 0.04, 3.0], [-0.4, 0.04, 1.1], [-0.35, 0.9, 0.4], [-0.3, 1.72, 0.2]], 0.02, 50, 6), L.hose, { cast: false });
    // тележка с азотными баллонами
    P(n2Cart(L), 3.8, -6.8, 0.8);
    b.wall(0.8, 1.8, 0.6, 3.8, 0.9, -6.8);
  }
  // запасной РД-33 на транспортной тележке
  {
    const RDs = buildRD33({ ab: true, detail: 1, seed: 7 }), RM = rd33Materials(L), axisY = 1.0;
    const set = [...engineStand(L, axisY)];
    for (const grp of ["comp", "turb", "ab"]) for (const [g, m] of rd33Meshes(RDs, RM, grp)) set.push([g.translate(0, axisY, 0), m]);
    for (const e of set) e[0].translate(1.1, 0, 0);
    P(set, -15, 11, 0.5);
    b.wall(4.6, 1.8, 1.3, -15, 0.9, 11, 0.5);
  }
  // противопожарное оборудование
  {
    const op = fireCart(L);
    P(op, 27.5, -20.3, 0); P(op, -27.8, 18.0, 0); P(op, 12.5, -8.8, 0);
    const wallExt = (x, z, ry) => P([[cyl(0.08, 0.08, 0.5, "y", 0, 1.1, 0, 14), L.red], [box(0.06, 0.12, 0.06, 0, 1.4, 0), L.black], [place(new THREE.PlaneGeometry(0.3, 0.3), 0, 1.8, 0.02), L.redSign || L.red]], x, z, ry);
    for (let x = -24; x <= 24; x += 12) { wallExt(x, -Z + 0.25, 0); wallExt(x + 6, Z - 0.25, Math.PI); }
    const pk = [[box(0.8, 1.0, 0.25, 0, 1.4, 0), L.red], [box(0.7, 0.9, 0.02, 0, 1.4, 0.13), L.whiteProp]];
    P(pk, 8, Z - 0.2, Math.PI); P(pk, -8, -Z + 0.2, 0);
    // электрощиты
    for (const [x, z, ry] of [[14, -Z + 0.2, 0], [15.1, -Z + 0.2, 0], [-26, Z - 0.2, Math.PI]]) P([[box(0.9, 1.4, 0.3, 0, 1.6, 0), L.greyProp], [box(0.8, 0.02, 0.02, 0, 2.2, 0.16), L.darkProp], [place(new THREE.PlaneGeometry(0.2, 0.18), 0.25, 2.05, 0.16), L.yellowStripe]], x, z, ry);
  }
  // стремянка-площадка у левого наплыва (доступ на верх фюзеляжа)
  {
    const deckY = 2.22, x0 = 1.25, x1 = 2.65, zin = -1.45, zout = -2.35, stairEnd = -5.1;
    const st = [];
    st.push([box(x1 - x0, 0.08, zin - zout, (x0 + x1) / 2, deckY - 0.04, (zin + zout) / 2), L.yellow]);
    for (const [x, z] of [[x0, zout], [x1, zout], [x0, zin + 0.1], [x1, zin + 0.1]]) st.push([box(0.08, deckY, 0.08, x, deckY / 2, z), L.yellow]);
    // перила
    for (const x of [x0, x1]) { st.push([box(0.05, 1.05, 0.05, x, deckY + 0.52, zout), L.yellow], [box(0.05, 0.05, zin - zout, x, deckY + 1.05, (zin + zout) / 2), L.yellow]); }
    // марши
    const n = 9, rise = deckY / n, run = (zout - stairEnd) / n;
    for (let i = 0; i < n; i++) st.push([box(x1 - x0 - 0.1, 0.05, run + 0.04, (x0 + x1) / 2, rise * (i + 1) - 0.03, stairEnd + run * (i + 0.5)), L.aluDark]);
    for (const x of [x0 + 0.02, x1 - 0.02]) {
      const len = Math.hypot(deckY, zout - stairEnd), ang = Math.atan2(deckY, zout - stairEnd);
      const g = box(0.06, 0.2, len, 0, 0, 0); g.rotateX(-ang); g.translate(x, deckY / 2 - 0.05, (zout + stairEnd) / 2); st.push([g, L.yellow]);
      const hr = box(0.05, 0.05, len, 0, 0, 0); hr.rotateX(-ang); hr.translate(x, deckY / 2 + 0.95, (zout + stairEnd) / 2); st.push([hr, L.yellow]);
      for (let k = 0; k < 3; k++) { const zz = stairEnd + 0.4 + k * (zout - stairEnd - 0.4) / 3; st.push([box(0.04, 0.95, 0.04, x, deckY * (zz - stairEnd) / (zout - stairEnd) + 0.47, zz), L.yellow]); }
    }
    for (const [x, z] of [[x0, stairEnd + 0.1], [x1, stairEnd + 0.1], [x0, zout], [x1, zout]]) st.push([cyl(0.07, 0.07, 0.05, "z", x, 0.07, z, 10), L.rubber]);
    for (const [g, m] of st) b.add(g, m);
    // физика: настил и пандус вместо ступеней, перила — стенки
    b.colliders.push(box(x1 - x0, 0.1, zin - zout, (x0 + x1) / 2, deckY - 0.05, (zin + zout) / 2));
    { const len = Math.hypot(deckY, zout - stairEnd), ang = Math.atan2(deckY, zout - stairEnd); const g = box(x1 - x0, 0.1, len + 0.1, 0, 0, 0); g.rotateX(-ang); g.translate((x0 + x1) / 2, deckY / 2 - 0.05, (zout + stairEnd) / 2); b.colliders.push(g); }
    for (const x of [x0 - 0.05, x1 + 0.05]) b.colliders.push(box(0.08, 3.4, zin - stairEnd, x, 1.7, (zin + stairEnd) / 2));
  }
  // бортовая стремянка МиГ-29 у кабины (слева)
  {
    const top = new THREE.Vector3(3.55, 2.62 + H.lift, -0.62), bot = new THREE.Vector3(3.65, 0, -1.45);
    const dir = top.clone().sub(bot), len = dir.length(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const rails = [box(0.04, len, 0.03, -0.22, len / 2, 0), box(0.04, len, 0.03, 0.22, len / 2, 0)];
    for (let i = 1; i < 9; i++) rails.push(box(0.44, 0.03, 0.09, 0, (i / 9) * len, 0.02));
    rails.push(box(0.5, 0.06, 0.12, 0, len - 0.02, -0.05));
    const g = mergeAll(rails); g.applyQuaternion(q); g.translate(bot.x, bot.y, bot.z);
    b.add(g, L.alu);
    ladders.push({ bottom: bot.clone(), top: top.clone().add(new THREE.Vector3(0, 0.05, 0)), dir: dir.clone().normalize(), width: 0.6, exitTo: new THREE.Vector3(3.3, 2.6, -0.95) });
    spot("cockpitLadder", "Бортовая стремянка", 3.6, 1.3, -1.05, 0.7, 2.6, 0.9, { ladder: 0 });
  }
  // гидроподъёмники под самолётом
  const jack = (x, z, topY) => P(jackGSE(L, topY), x, z, 0);
  jack(4.2, 0, 1.53 + H.lift); jack(-1.9, 2.45, 2.07 + H.lift); jack(-1.9, -2.45, 2.07 + H.lift);
  // противооткатные колодки, поддоны, конусы, ограждение
  for (const [x, z] of [[-0.75, 1.6], [-0.75, -1.6], [2.9, 0]]) P(chocks(L, 1.0), x, z, 0);
  for (const z of [1.02, -1.02]) b.add(box(1.4, 0.06, 0.9, -1.6, 0.03, z), L.darkProp, { cast: false });
  const cone = [[latheY([[0.2, 0], [0.04, 0.7], [0.0, 0.72]], 16), L.orange], [box(0.4, 0.03, 0.4, 0, 0.015, 0), L.black], [latheY([[0.125, 0.3], [0.1, 0.4], [0.098, 0.4]], 16, true), L.whiteProp]];
  for (const [x, z] of [[11.5, -8.5], [11.5, 8.5], [-10.5, -8.5], [-10.5, 8.5], [9.5, -3], [-9, 3.5]]) P(cone, x, z, 0);
  // заглушки воздухозаборников и чехлы с вымпелами на полу у носа
  {
    const flagTex = T.texFromCanvas(T.textPlate([["СНЯТЬ ПЕРЕД ПОЛЁТОМ", 70, "#fff"]], { w: 1024, h: 128, bg: "#b3242b", flag: false, align: "center" }));
    const fm = new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.9, side: THREE.DoubleSide });
    const plug = intakePlug(L, fm);
    P(plug, 6.8, -3.4, 0.4); P(plug, 7.4, -2.6, 0.2, null, { y: 0 });
  }
  // второй самолёт в дальнем пролёте — вставляется из main (клон модели); здесь его чехлы/стремянки
  dyn.bay2 = { x: -17.5, z: -9.5, ry: -0.55 };
  // тележка для снятых агрегатов (справа от самолёта)
  {
    const cx = 0.6, cz = 7.2, cart = [];
    cart.push([box(2.4, 0.06, 1.2, 0, 0.62, 0), L.darkProp, { collide: true }]);
    cart.push([box(2.44, 0.1, 0.04, 0, 0.66, 0.6), L.yellow], [box(2.44, 0.1, 0.04, 0, 0.66, -0.6), L.yellow], [box(0.04, 0.1, 1.2, 1.2, 0.66, 0), L.yellow], [box(0.04, 0.1, 1.2, -1.2, 0.66, 0), L.yellow]);
    for (const [x, z] of [[-1.05, -0.5], [1.05, -0.5], [-1.05, 0.5], [1.05, 0.5]]) { cart.push([box(0.05, 0.5, 0.05, x, 0.35, z), L.greyProp], [cyl(0.1, 0.1, 0.06, "z", x, 0.1, z, 14), L.rubber]); }
    cart.push([tube([[-1.2, 0.66, -0.45], [-1.55, 0.95, -0.45], [-1.55, 0.95, 0.45], [-1.2, 0.66, 0.45]], 0.02, 12, 6), L.greyProp]);
    for (const [g, m, o] of cart) b.add(g.translate(cx, 0, cz), m, o || {});
    dyn.cart = { x: cx, y: 0.66, z: cz, w: 2.3, d: 1.1 };
    spot("stock", "Тележка со снятыми агрегатами (склад)", cx, 0.9, cz, 2.6, 1.2, 1.4);
  }

  /* ---------- эвакуационные выходы, часы ---------- */
  {
    const exitTex = T.texFromCanvas(T.textPlate([["ВЫХОД", 110, "#ffffff"]], { w: 512, h: 160, bg: "#1f8f3f", flag: false, align: "center" }));
    const exitMat = new THREE.MeshStandardMaterial({ map: exitTex, emissiveMap: exitTex, emissive: "#ffffff", emissiveIntensity: 2.2, roughness: 0.4 });
    const doorMat = new THREE.MeshStandardMaterial({ color: "#6f7a80", roughness: 0.5, metalness: 0.5, normalMap: TX.paintedMetal.normal, normalScale: new THREE.Vector2(0.4, 0.4) });
    for (const [x, s2] of [[-15, -1], [15, 1], [-24, 1]]) {
      const zf = s2 * (Z - 0.16), ry = s2 > 0 ? Math.PI : 0;
      const g = [[box(1.25, 2.25, 0.1, 0, 1.12, 0), frameMat], [box(1.05, 2.1, 0.06, 0, 1.06, 0.03), doorMat], [box(0.8, 0.05, 0.06, 0, 1.05, 0.08), L.chrome],
        [box(0.5, 0.18, 0.08, 0, 2.55, 0.02), exitMat], [box(0.12, 0.16, 0.06, 0.8, 1.45, 0.02), L.red]];
      P(g, x, zf, ry);
    }
    const ck = T.canvas(256, 256), cg = ck.getContext("2d");
    cg.fillStyle = "#f2f0ea"; cg.beginPath(); cg.arc(128, 128, 124, 0, 7); cg.fill(); cg.strokeStyle = "#222"; cg.lineWidth = 8; cg.stroke();
    cg.fillStyle = "#111"; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; cg.fillRect(128 + Math.cos(a) * 100 - 4, 128 + Math.sin(a) * 100 - 8, 8, 16); }
    cg.lineCap = "round"; cg.lineWidth = 10; cg.beginPath(); cg.moveTo(128, 128); cg.lineTo(128 + Math.cos(-2.2) * 60, 128 + Math.sin(-2.2) * 60); cg.stroke();
    cg.lineWidth = 6; cg.beginPath(); cg.moveTo(128, 128); cg.lineTo(128 + Math.cos(0.9) * 92, 128 + Math.sin(0.9) * 92); cg.stroke();
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.45, 40), new THREE.MeshStandardMaterial({ map: T.texFromCanvas(ck), roughness: 0.3 }));
    clock.position.set(-7.5, 4.6, -Z + 0.18); hangar.add(clock);
    b.add(torus(0.46, 0.03, "z", -7.5, 4.6, -Z + 0.2, 6, 40), L.darkProp, { cast: false });
  }

  /* ---------- надписи и флаг ---------- */
  {
    const sign = new THREE.MeshStandardMaterial({ map: T.texFromCanvas(T.textPlate([["558 АВИАЦИОННЫЙ РЕМОНТНЫЙ ЗАВОД", 64], ["ремонтный цех · г. Барановичи", 40, "#c9d2d6"]])), roughness: 0.5, emissive: "#fff", emissiveIntensity: 0.05 });
    b.add(place(new THREE.PlaneGeometry(20, 5), H.x0 + 0.2, 8.5, 0, 0, Math.PI / 2, 0), sign, { cast: false });
    const s2 = new THREE.MeshStandardMaterial({ map: T.texFromCanvas(T.textPlate([["КАЧЕСТВО РЕМОНТА — БЕЗОПАСНОСТЬ ПОЛЁТОВ", 52]], { w: 1024, h: 150 })), roughness: 0.5 });
    b.add(place(new THREE.PlaneGeometry(18, 2.6), 0, 6.0, -Z + 0.2), s2, { cast: false });
    const flag = T.canvas(600, 300), g = flag.getContext("2d");
    g.fillStyle = "#c8313e"; g.fillRect(0, 0, 600, 200); g.fillStyle = "#3f9a4d"; g.fillRect(0, 200, 600, 100); g.fillStyle = "#fff"; g.fillRect(0, 0, 66, 300);
    g.fillStyle = "#c8313e"; for (let y = 6; y < 290; y += 34) { g.beginPath(); g.moveTo(33, y); g.lineTo(58, y + 17); g.lineTo(33, y + 34); g.lineTo(8, y + 17); g.closePath(); g.fill(); }
    const fg = new THREE.PlaneGeometry(6, 3, 24, 6); const fp = fg.attributes.position;
    for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getX(i) * 1.3) * 0.12 + Math.sin(fp.getY(i) * 2) * 0.04);
    fg.computeVertexNormals();
    const fl = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: T.texFromCanvas(flag), roughness: 0.9, side: THREE.DoubleSide }));
    fl.position.set(H.x0 + 0.5, 4.2, -8); fl.rotation.y = Math.PI / 2; fl.castShadow = true; hangar.add(fl);
  }

  /* ═════════ СНАРУЖИ: перрон, газовочная площадка, небо ═════════ */
  {
    const ap = TX.apron;
    for (const t of [ap.map, ap.normal, ap.orm]) t.repeat.set(1 / 6, 1 / 6);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(170, 120), new THREE.MeshStandardMaterial({ map: ap.map, normalMap: ap.normal, roughnessMap: ap.orm, roughness: 1 }));
    { const g = apron.geometry, uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), -p.getY(i)); }
    apron.rotation.x = -Math.PI / 2; apron.position.set(H.x1 + 85, -0.01, 0); apron.receiveShadow = true; outside.add(apron);
    // грунт с травой
    // в грунте вырезано пятно под ангаром и перроном: иначе на больших треугольниках
    // трава «пробивает» бетон по глубине (особенно без MSAA)
    const gt = TX.grass; gt.repeat.set(60 / 1400, 60 / 1400);
    const gs = new THREE.Shape([[-700, -700], [700, -700], [700, 700], [-700, 700]].map(([x, y]) => new THREE.Vector2(x, y)));
    const hx0 = H.x0 - 0.5 + 0.1, hx1 = H.x1 - 0.1, hz = H.z + 0.5 - 0.1, ax1 = H.x1 + 170 - 0.1, az = 60 - 0.1;
    gs.holes.push(new THREE.Path([[hx0, -hz], [hx1, -hz], [hx1, -az], [ax1, -az], [ax1, az], [hx1, az], [hx1, hz], [hx0, hz]].map(([x, y]) => new THREE.Vector2(x, y))));
    const ground = new THREE.Mesh(new THREE.ShapeGeometry(gs), new THREE.MeshStandardMaterial({ map: gt, roughness: 1, color: "#9aa58a" }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; outside.add(ground);
    bo.colliders.push(box(170, 0.2, 120, H.x1 + 85, -0.1, 0));
    // разметка перрона
    const pm = new THREE.MeshStandardMaterial({ color: "#e2b21f", roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    const pl = [];
    for (let x = H.x1 + 1; x < PAD.x - 4; x += 3) pl.push(place(new THREE.PlaneGeometry(1.8, 0.2), x + 0.9, 0.0, 0, -Math.PI / 2, 0, 0));
    pl.push(place(new THREE.RingGeometry(9.5, 9.7, 64), PAD.x, 0.0, 0, -Math.PI / 2, 0, 0));
    outside.add(new THREE.Mesh(mergeAll(pl), pm));
    // газоотбойник: наклонные стальные ламели на раме, бетонные фундаменты
    const defl = new THREE.Group(); defl.position.set(PAD.x + 17, 0, 0);
    const dl = [], df = [], dc = [];
    for (let i = 0; i < 9; i++) dl.push(box(0.9, 0.08, 18, -0.2 + i * 0.28, 0.6 + i * 0.52, 0, 0, 0, -0.62));
    for (let z = -9; z <= 9; z += 3) { df.push(box(0.2, 5.2, 0.2, 2.3, 2.6, z), box(0.18, 6.2, 0.18, 0.8, 2.6, z, 0, 0, -0.5)); dc.push(box(3.4, 0.4, 0.8, 1.2, 0.2, z)); }
    const dmesh = new THREE.Mesh(mergeAll(dl), L.greyProp), fmesh = new THREE.Mesh(mergeAll(df), L.darkProp), cmesh = new THREE.Mesh(mergeAll(dc), L.concreteWall);
    for (const m of [dmesh, fmesh, cmesh]) { m.castShadow = m.receiveShadow = true; defl.add(m); }
    outside.add(defl);
    bo.colliders.push(box(3, 5, 18, PAD.x + 17.5, 2.5, 0));
    // пожарная автоцистерна у газовочной площадки
    { const m = xform(PAD.x - 8, 0, -16, 0.5); for (const [g, mt, o] of fireTruck(L)) bo.add(g, mt, { ...(o || {}), matrix: m }); }
    // аэродромный тягач у ворот
    { const m = xform(H.x1 + 7.5, 0, -12.5, 2.3); for (const [g, mt, o] of airfieldTug(L)) bo.add(g, mt, { ...(o || {}), matrix: m }); }
    // другие ангары и постройки вдали
    const bm = new THREE.MeshStandardMaterial({ color: "#aeb4b6", roughness: 0.85, metalness: 0.3, map: TX.corrugated.map, normalMap: TX.corrugated.normal });
    for (const [x, z, w, d, h] of [[150, -70, 50, 36, 10], [150, 60, 40, 30, 9], [60, -90, 30, 24, 7], [-60, 60, 60, 40, 10], [230, 0, 30, 60, 8]]) {
      const hb = new THREE.Mesh(box(w, h, d, x, h / 2, z), bm); hb.castShadow = hb.receiveShadow = true; outside.add(hb);
      const arch = new THREE.CylinderGeometry(d / 2, d / 2, w, 32, 1, false, -Math.PI / 2, Math.PI);
      arch.rotateZ(Math.PI / 2); arch.scale(1, 0.32, 1); arch.translate(x, h, z);
      const rf = new THREE.Mesh(arch, bm); rf.castShadow = true; outside.add(rf);
    }
    // тело самого ангара снаружи (кровля видна с площадки)
    const shell = new THREE.MeshStandardMaterial({ color: "#c3c9cc", roughness: 0.7, metalness: 0.4, map: TX.corrugated.map, normalMap: TX.corrugated.normal });
    for (const s of [1, -1]) {
      const len = Math.hypot(H.z, H.ridge - H.eave), ang = Math.atan2(H.ridge - H.eave, H.z);
      const g = box(61, 0.2, len + 0.6, 0, 0, 0); g.rotateX(s * ang); g.translate(0, (H.eave + H.ridge) / 2 + 0.15, s * H.z / 2);
      const rm = new THREE.Mesh(g, shell); rm.castShadow = true; rm.receiveShadow = true; hangar.add(rm);
    }
    // лес: ели (ярусы конусов) и лиственные кроны, с вариацией оттенков
    const spruce = mergeAll([new THREE.ConeGeometry(0.42, 0.5, 8).translate(0, 0.45, 0), new THREE.ConeGeometry(0.34, 0.42, 8).translate(0, 0.72, 0), new THREE.ConeGeometry(0.24, 0.34, 8).translate(0, 0.93, 0), new THREE.CylinderGeometry(0.04, 0.05, 0.3, 6).translate(0, 0.15, 0)]);
    const leafy = mergeAll([new THREE.IcosahedronGeometry(0.5, 1).scale(1, 0.85, 1).translate(0, 0.78, 0), new THREE.IcosahedronGeometry(0.34, 1).translate(0.25, 1.05, 0.1), new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6).translate(0, 0.25, 0)]);
    const treeMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 });
    const rnd = T.mulberry32(99), m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (const [geo, n, base] of [[spruce, 520, "#2c4a2c"], [leafy, 300, "#4f6d35"]]) {
      const inst = new THREE.InstancedMesh(geo, treeMat, n);
      for (let i = 0; i < n; i++) {
        const a = rnd() * TAU, r = 300 + rnd() * 180, h = 16 + rnd() * 14;
        m4.compose(new THREE.Vector3(Math.cos(a) * r + 40, 0, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * TAU, 0)), new THREE.Vector3(h * (0.8 + rnd() * 0.4), h, h * (0.8 + rnd() * 0.4)));
        inst.setMatrixAt(i, m4); inst.setColorAt(i, col.set(base).offsetHSL((rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.08));
      }
      inst.castShadow = false; outside.add(inst);
    }
    // небо
    const sky = new Sky(); sky.scale.setScalar(800);
    const u = sky.material.uniforms; u.turbidity.value = 3.8; u.rayleigh.value = 1.1; u.mieCoefficient.value = 0.0022; u.mieDirectionalG.value = 0.76;
    u.sunPosition.value.copy(SUN_DIR).multiplyScalar(400);
    // яркость солнечного диска ограничиваем: иначе в half-float кубокарте получается Infinity → NaN после PMREM
    sky.material.fragmentShader = sky.material.fragmentShader.replace("gl_FragColor = vec4( texColor, 1.0 );",
      "texColor = clamp( texColor, 0.0, 2000.0 ); if ( any( isnan( texColor ) ) ) texColor = vec3( 0.0 ); gl_FragColor = vec4( texColor, 1.0 );");
    outside.add(sky); dyn.sky = sky;
  }
  // уличные невидимые границы
  bo.wall(1, 6, 130, H.x1 + 150, 3, 0); bo.wall(170, 6, 1, H.x1 + 85, 3, 58); bo.wall(170, 6, 1, H.x1 + 85, 3, -58);
  // невидимые границы: не выйти сквозь стены
  b.wall(0.6, 12, H.z * 2, H.x0 - 0.2, 6, 0);
  b.wall(62, 12, 0.6, 0, 6, H.z + 0.2); b.wall(62, 12, 0.6, 0, 6, -H.z - 0.2);

  const meshes = b.build(hangar).concat(bo.build(outside));
  return { root, hangar, outside, colliders: b.colliders.concat(bo.colliders), spots, ladders, dyn, meshes };
}

/* ---------- вспомогательные ---------- */
function fixUV(g, w, h, tile, planarYZ = false) {
  const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (planarYZ || ax > az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    if (Math.abs(n.getY(i)) > 0.9) { u = p.getX(i); v = p.getZ(i); }
    uv.setXY(i, u / tile, v / tile);
  }
}
function latheY(pts, seg = 16, open = false) { void open; return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
void range;
