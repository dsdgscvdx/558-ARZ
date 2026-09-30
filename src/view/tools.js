/* Ручной инструмент техника: трещотка с головкой, динамометрический ключ, отвёртка, мультиметр
   со щупами, рожковый ключ. Каждый инструмент — группа с началом координат в середине рукоятки,
   рукоятка вдоль +Z (так её обхватывает кулак), рабочая часть — на +Z. */
import * as THREE from "three";
import { canvas, texFromCanvas } from "./tex.js";

let M = null;
function mats() {
  if (M) return M;
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const lcd = canvas(128, 64), g = lcd.getContext("2d");
  g.fillStyle = "#8f9d86"; g.fillRect(0, 0, 128, 64);
  g.fillStyle = "#1c2419"; g.font = "700 38px 'Courier New', monospace"; g.textAlign = "right"; g.textBaseline = "middle"; g.fillText("27.4", 118, 36);
  g.font = "700 12px Arial"; g.textAlign = "left"; g.fillText("V DC", 6, 12);
  M = {
    chrome: S({ color: "#d9dde0", roughness: 0.16, metalness: 1 }),
    steel: S({ color: "#9aa0a4", roughness: 0.32, metalness: 1 }),
    dark: S({ color: "#2a2c2e", roughness: 0.45, metalness: 0.7 }),
    gripRed: S({ color: "#a3231d", roughness: 0.6, metalness: 0 }),
    gripBlack: S({ color: "#1b1c1d", roughness: 0.7, metalness: 0 }),
    yellow: S({ color: "#e0b52a", roughness: 0.55, metalness: 0 }),
    screen: S({ map: texFromCanvas(lcd), roughness: 0.3, metalness: 0, emissive: "#20261e", emissiveIntensity: 0.3 }),
    wireRed: S({ color: "#c0261f", roughness: 0.5 }),
    wireBlack: S({ color: "#151515", roughness: 0.5 }),
  };
  return M;
}
const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };
const cylZ = (r1, r2, len, z, seg = 14) => { const g = new THREE.CylinderGeometry(r2, r1, len, seg); g.rotateX(Math.PI / 2); g.translate(0, 0, z); return g; };

/* трещотка: прорезиненная рукоятка, хромированная шейка, головка с флажком реверса и торцевой головкой */
export function ratchet() {
  const m = mats(), t = new THREE.Group(); t.name = "ratchet";
  t.add(mesh(cylZ(0.0135, 0.0125, 0.11, -0.005), m.gripRed));
  for (let k = 0; k < 5; k++) t.add(mesh(cylZ(0.0142, 0.0142, 0.004, -0.05 + k * 0.022, 14), m.gripBlack));
  t.add(mesh(cylZ(0.009, 0.011, 0.06, 0.075), m.chrome));
  const head = new THREE.CylinderGeometry(0.021, 0.021, 0.016, 20); head.translate(0, 0, 0.115); t.add(mesh(head, m.chrome));
  const lever = new THREE.BoxGeometry(0.006, 0.02, 0.012); lever.translate(0, 0.012, 0.115); t.add(mesh(lever, m.dark));
  const sock = new THREE.CylinderGeometry(0.012, 0.012, 0.034, 12); sock.translate(0, -0.025, 0.115); t.add(mesh(sock, m.chrome));
  return t;
}
/* динамометрический ключ: длинная труба со шкалой и накатанной рукояткой */
export function torqueWrench() {
  const m = mats(), t = new THREE.Group(); t.name = "torque";
  t.add(mesh(cylZ(0.014, 0.014, 0.1, 0), m.gripBlack));
  for (let k = 0; k < 8; k++) t.add(mesh(cylZ(0.0148, 0.0148, 0.003, -0.042 + k * 0.012, 12), m.dark));
  t.add(mesh(cylZ(0.0115, 0.0115, 0.24, 0.17), m.chrome));
  const win = new THREE.BoxGeometry(0.008, 0.004, 0.05); win.translate(0, 0.0115, 0.12); t.add(mesh(win, m.yellow));
  t.add(mesh(cylZ(0.009, 0.0115, 0.03, 0.305), m.chrome));
  const head = new THREE.CylinderGeometry(0.019, 0.019, 0.015, 18); head.translate(0, 0, 0.33); t.add(mesh(head, m.chrome));
  const sock = new THREE.CylinderGeometry(0.011, 0.011, 0.03, 12); sock.translate(0, -0.022, 0.33); t.add(mesh(sock, m.chrome));
  t.add(mesh(cylZ(0.006, 0.006, 0.012, -0.056), m.chrome));
  return t;
}
/* отвёртка: шестигранная рукоятка двух цветов, стержень, шлиц */
export function screwdriver() {
  const m = mats(), t = new THREE.Group(); t.name = "screwdriver";
  t.add(mesh(cylZ(0.012, 0.014, 0.075, 0, 6), m.yellow));
  t.add(mesh(cylZ(0.0145, 0.0145, 0.02, -0.03, 6), m.gripBlack));
  t.add(mesh(cylZ(0.006, 0.01, 0.018, 0.046), m.gripBlack));
  t.add(mesh(cylZ(0.0033, 0.0033, 0.12, 0.115, 8), m.chrome));
  const tip = new THREE.BoxGeometry(0.0085, 0.0018, 0.012); tip.translate(0, 0, 0.18); t.add(mesh(tip, m.chrome));
  return t;
}
/* рожковый ключ: плоская рукоять с двумя зевами */
export function spanner() {
  const m = mats(), t = new THREE.Group(); t.name = "spanner";
  const sh = new THREE.Shape();
  sh.moveTo(-0.009, -0.09); sh.lineTo(0.009, -0.09); sh.lineTo(0.007, 0.08); sh.lineTo(-0.007, 0.08); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1 });
  g.translate(0, 0, -0.003); g.rotateX(Math.PI / 2); t.add(mesh(g, m.chrome));
  for (const [z, r, a] of [[0.1, 0.02, 0], [-0.105, 0.017, Math.PI]]) {
    const jaw = new THREE.TorusGeometry(r, 0.0075, 6, 14, Math.PI * 1.35); jaw.rotateZ(Math.PI * 0.82 + a); jaw.rotateX(Math.PI / 2); jaw.translate(0, 0, z); t.add(mesh(jaw, m.chrome));
  }
  return t;
}
/* мультиметр в жёлтом чехле: экран, галетный переключатель, гнёзда со щупами (левая рука) */
export function multimeter() {
  const m = mats(), t = new THREE.Group(); t.name = "multimeter";
  const body = new THREE.BoxGeometry(0.036, 0.075, 0.14); t.add(mesh(body, m.yellow));
  const face = new THREE.BoxGeometry(0.003, 0.064, 0.125); face.translate(0.0185, 0, 0); t.add(mesh(face, m.gripBlack));
  const scr = new THREE.PlaneGeometry(0.052, 0.034); scr.rotateZ(Math.PI / 2); scr.rotateY(Math.PI / 2); scr.translate(0.0205, 0, 0.042); t.add(mesh(scr, m.screen));
  const knob = new THREE.CylinderGeometry(0.016, 0.016, 0.008, 18); knob.rotateZ(Math.PI / 2); knob.translate(0.022, 0, -0.012); t.add(mesh(knob, m.dark));
  const ptr = new THREE.BoxGeometry(0.004, 0.004, 0.02); ptr.translate(0.027, 0.004, -0.012); t.add(mesh(ptr, m.chrome));
  for (const [y, mat] of [[0.018, m.wireRed], [-0.018, m.wireBlack]]) {
    const jack = new THREE.CylinderGeometry(0.004, 0.004, 0.012, 8); jack.rotateZ(Math.PI / 2); jack.translate(0.023, y, -0.05); t.add(mesh(jack, mat));
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0.026, y, -0.05), new THREE.Vector3(0.05, y - 0.04, -0.08), new THREE.Vector3(0.03, y - 0.12, -0.02), new THREE.Vector3(-0.01, y * 2 - 0.1, 0.06)]);
    t.add(mesh(new THREE.TubeGeometry(c, 20, 0.0022, 5), mat));
  }
  return t;
}
/* щуп мультиметра (правая рука при дефектовке) */
export function probe() {
  const m = mats(), t = new THREE.Group(); t.name = "probe";
  t.add(mesh(cylZ(0.0055, 0.0065, 0.1, 0, 10), m.wireRed));
  t.add(mesh(cylZ(0.009, 0.009, 0.006, 0.05, 12), m.wireRed));
  t.add(mesh(cylZ(0.0012, 0.0016, 0.04, 0.073, 6), m.chrome));
  const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, -0.05), new THREE.Vector3(0, -0.03, -0.1), new THREE.Vector3(-0.03, -0.1, -0.12)]);
  t.add(mesh(new THREE.TubeGeometry(c, 12, 0.0022, 5), m.wireRed));
  return t;
}
/* инструмент по виду работы: [правая рука, левая рука] */
export function toolsFor(kind) {
  if (kind === "inspect") return [probe(), multimeter()];
  if (kind === "install") return [torqueWrench(), null];
  if (kind === "repair") return [screwdriver(), spanner()];
  return [ratchet(), null];
}
