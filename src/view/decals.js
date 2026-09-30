/* Текстуры надписей на планере: бортовой номер, флаг, трафареты. */
import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { canvas, texFromCanvas } from "./tex.js";

/* ---------- текстуры надписей ---------- */
export function stencilCanvas(kind) {
  const c = canvas(512, 256), g = c.getContext("2d");
  g.clearRect(0, 0, 512, 256); g.textAlign = "center"; g.textBaseline = "middle";
  if (kind === "danger") {
    g.fillStyle = "#d32f2f"; g.beginPath(); g.moveTo(256, 18); g.lineTo(400, 236); g.lineTo(112, 236); g.closePath(); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.moveTo(256, 62); g.lineTo(364, 222); g.lineTo(148, 222); g.closePath(); g.fill();
    g.fillStyle = "#111"; g.font = "bold 110px Arial"; g.fillText("!", 256, 168);
  } else if (kind === "rescue") {
    g.strokeStyle = "#e8b21a"; g.lineWidth = 22; g.beginPath(); g.moveTo(60, 128); g.lineTo(380, 128); g.stroke();
    g.fillStyle = "#e8b21a"; g.beginPath(); g.moveTo(470, 128); g.lineTo(370, 60); g.lineTo(370, 196); g.closePath(); g.fill();
    g.fillStyle = "#c62828"; g.font = "bold 44px Arial"; g.fillText("СПАСЕНИЕ", 220, 64);
  } else if (kind === "nostep") {
    g.fillStyle = "#1a1a1a"; g.font = "bold 64px Arial"; g.fillText("НЕ СТУПАТЬ", 256, 128);
    g.fillRect(40, 80, 432, 6); g.fillRect(40, 172, 432, 6);
  } else if (kind === "fuel") {
    g.fillStyle = "#1a1a1a"; g.font = "bold 44px Arial"; g.fillText("ТОПЛИВО", 256, 96); g.font = "32px Arial"; g.fillText("Т-1, ТС-1, РТ", 256, 160);
  } else if (kind === "intake") {
    g.fillStyle = "#c62828"; g.fillRect(20, 50, 472, 156); g.fillStyle = "#fff"; g.font = "bold 50px Arial"; g.fillText("ОПАСНАЯ ЗОНА", 256, 108); g.font = "30px Arial"; g.fillText("при работе двигателя", 256, 160);
  } else if (kind === "ground") {
    g.fillStyle = "#1a1a1a"; g.font = "bold 40px Arial"; g.fillText("⏚ ЗАЗЕМЛЕНИЕ", 256, 128);
  } else if (kind === "walk") {
    g.strokeStyle = "#1a1a1a"; g.lineWidth = 8; g.strokeRect(20, 20, 472, 216); g.font = "bold 40px Arial"; g.fillStyle = "#1a1a1a"; g.fillText("ХОДИТЬ ЗДЕСЬ", 256, 128);
  } else if (kind === "nitrogen" || kind === "hydro" || kind === "oil" || kind === "oxygen" || kind === "tow") {
    const T = { nitrogen: ["АЗОТ", "ЗАРЯДКА 110 кгс/см²"], hydro: ["ГИДРОСИСТЕМА", "АМГ-10"], oil: ["МАСЛО", "ИПМ-10  ЗАПРАВКА"], oxygen: ["КИСЛОРОД", "ЗАРЯДКА 150 кгс/см²"], tow: ["БУКСИРОВКА", "ЗА НОСОВУЮ ОПОРУ"] }[kind];
    g.strokeStyle = "#151515"; g.lineWidth = 6; g.strokeRect(24, 48, 464, 160);
    g.fillStyle = "#151515"; g.font = "bold 58px Arial"; g.fillText(T[0], 256, 104); g.font = "34px Arial"; g.fillText(T[1], 256, 166);
  } else if (kind === "pyro") {
    g.fillStyle = "#c62828"; g.font = "bold 54px Arial"; g.fillText("ОСТОРОЖНО!", 256, 88); g.font = "bold 40px Arial"; g.fillText("ПИРОСРЕДСТВА", 256, 150);
    g.strokeStyle = "#c62828"; g.lineWidth = 6; g.strokeRect(20, 30, 472, 160);
  } else if (kind === "canopyEmerg") {
    g.fillStyle = "#e8b21a"; g.fillRect(8, 20, 496, 216); g.fillStyle = "#1a1a1a"; g.fillRect(22, 34, 468, 188);
    g.fillStyle = "#e8b21a"; g.font = "bold 40px Arial"; g.fillText("АВАРИЙНОЕ", 256, 80); g.fillText("ОТКРЫТИЕ ФОНАРЯ", 256, 130);
    g.font = "30px Arial"; g.fillText("ОТКРЫТЬ ЛЮЧОК · ПОТЯНУТЬ", 256, 184);
  } else if (kind === "serial") {
    g.fillStyle = "#d9dad2"; g.fillRect(40, 70, 432, 116); g.strokeStyle = "#1a1a1a"; g.lineWidth = 4; g.strokeRect(40, 70, 432, 116);
    g.fillStyle = "#1a1a1a"; g.font = "bold 44px monospace"; g.fillText("2960535418", 256, 116); g.font = "26px Arial"; g.fillText("ИЗД. 9-13  РЕМ. 558 АРЗ", 256, 160);
  } else if (kind === "walkLine") {
    g.fillStyle = "#171717"; g.fillRect(0, 40, 512, 14); g.fillRect(0, 202, 512, 14);
  } else if (kind === "noEntry") {
    g.fillStyle = "#c62828"; g.font = "bold 46px Arial"; g.fillText("НЕ ПОДХОДИТЬ", 256, 96); g.font = "32px Arial"; g.fillText("работает двигатель", 256, 156);
  } else if (kind === "antiglare") {
    const gr = g.createLinearGradient(0, 0, 512, 0); gr.addColorStop(0, "rgba(40,44,46,0)"); gr.addColorStop(0.12, "rgba(40,44,46,1)"); gr.addColorStop(1, "rgba(40,44,46,1)");
    g.fillStyle = gr; g.fillRect(0, 20, 512, 216);
  }
  return c;
}

/* наложение надписи на поверхность: pos, normal, right (направление строки), size (w,h) */
export function decal(mesh, pos, normal, right, w, h, mat, depth = 0.25) {
  const z = normal.clone().normalize(), x = right.clone().sub(z.clone().multiplyScalar(right.dot(z))).normalize(), y = z.clone().cross(x);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  const e = new THREE.Euler().setFromRotationMatrix(m);
  const g0 = new DecalGeometry(mesh, pos, e, new THREE.Vector3(w, h, depth));
  // проектор «пробивает» тонкие поверхности насквозь — оставляем только грани, обращённые к нему
  const P = g0.attributes.position, N = g0.attributes.normal, U = g0.attributes.uv, keep = [];
  for (let i = 0; i < P.count; i += 3) {
    const nx = N.getX(i) + N.getX(i + 1) + N.getX(i + 2), ny = N.getY(i) + N.getY(i + 1) + N.getY(i + 2), nz = N.getZ(i) + N.getZ(i + 1) + N.getZ(i + 2);
    const l = Math.hypot(nx, ny, nz) || 1;
    if ((nx * z.x + ny * z.y + nz * z.z) / l > 0.3) keep.push(i);
  }
  const g = new THREE.BufferGeometry(), pa = [], na = [], ua = [];
  for (const i of keep) for (let k = 0; k < 3; k++) { pa.push(P.getX(i + k), P.getY(i + k), P.getZ(i + k)); na.push(N.getX(i + k), N.getY(i + k), N.getZ(i + k)); ua.push(U.getX(i + k), U.getY(i + k)); }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pa, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(na, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(ua, 2));
  g0.dispose();
  const d = new THREE.Mesh(g, mat); d.receiveShadow = true; d.renderOrder = 2;
  return d;
}
export function decalMaterial(tex, rough = 0.55) {
  return new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
}
export { texFromCanvas };
