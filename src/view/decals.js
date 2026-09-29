/* Текстуры кабины (приборная доска, пульты, ИЛС) и надписей на планере (бортовой номер, флаг, трафареты). */
import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { canvas, texFromCanvas, mulberry32 } from "./tex.js";

function gauge(g, x, y, r, rnd, style = 0) {
  g.fillStyle = "#101214"; g.beginPath(); g.arc(x, y, r + 5, 0, 7); g.fill();
  g.fillStyle = "#1b1e21"; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.strokeStyle = "#dfe3e0"; g.lineWidth = Math.max(1, r / 22);
  for (let i = 0; i <= 12; i++) { const a = Math.PI * 0.75 + (i / 12) * Math.PI * 1.5, r0 = i % 3 ? r * 0.82 : r * 0.72; g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); g.stroke(); }
  if (style === 1) { g.fillStyle = "#3d6fa8"; g.beginPath(); g.arc(x, y, r * 0.66, Math.PI, 0); g.fill(); g.fillStyle = "#6b4a2c"; g.beginPath(); g.arc(x, y, r * 0.66, 0, Math.PI); g.fill(); g.strokeStyle = "#fff"; g.beginPath(); g.moveTo(x - r * 0.66, y); g.lineTo(x + r * 0.66, y); g.stroke(); }
  const a = Math.PI * 0.75 + rnd() * Math.PI * 1.5;
  g.strokeStyle = "#f2f2ea"; g.lineWidth = Math.max(2, r / 12); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); g.stroke();
  g.fillStyle = "#444"; g.beginPath(); g.arc(x, y, r * 0.1, 0, 7); g.fill();
}

export function cockpitTextures() {
  const rnd = mulberry32(29);
  // приборная доска: база и слой подсветки
  const W = 1024, Hh = 604, c = canvas(W, Hh), g = c.getContext("2d");
  const e = canvas(W, Hh), ge = e.getContext("2d"); ge.fillStyle = "#000"; ge.fillRect(0, 0, W, Hh);
  g.fillStyle = "#4f8185"; g.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`; g.fillRect(rnd() * W, rnd() * Hh, 2, 2); }
  g.strokeStyle = "#2c4a4d"; g.lineWidth = 4; g.strokeRect(10, 10, W - 20, Hh - 20);
  // МФИ (модернизация БМ)
  g.fillStyle = "#0b0d0e"; g.fillRect(392, 60, 240, 190); g.fillStyle = "#15191b"; g.fillRect(404, 72, 216, 166);
  ge.fillStyle = "#06180d"; ge.fillRect(404, 72, 216, 166); ge.strokeStyle = "#5cff9a"; ge.lineWidth = 2;
  for (let r = 30; r < 90; r += 25) { ge.beginPath(); ge.arc(512, 230, r, Math.PI * 1.15, Math.PI * 1.85); ge.stroke(); }
  ge.fillStyle = "#ffd05c"; ge.fillRect(500, 140, 8, 8); ge.fillStyle = "#5cff9a"; ge.font = "16px monospace"; ge.fillText("РЛС  ОБЗОР  80", 420, 92);
  for (let i = 0; i < 6; i++) { g.fillStyle = "#2b2f31"; g.fillRect(398 + i * 40, 252, 30, 14); g.fillRect(398 + i * 40, 44, 30, 14); }
  // авиагоризонт и НПП
  gauge(g, 512, 380, 78, rnd, 1); gauge(g, 512, 530, 58, rnd);
  // левая группа
  [[150, 110, 58], [290, 110, 58], [150, 250, 58], [290, 250, 50], [110, 400, 46], [230, 400, 46], [350, 400, 46], [150, 520, 40], [280, 520, 40]].forEach(([x, y, r]) => gauge(g, x, y, r, rnd));
  // правая группа (двигатели)
  [[734, 110, 50], [874, 110, 50], [734, 240, 50], [874, 240, 50], [700, 380, 44], [820, 380, 44], [930, 380, 40], [734, 520, 42], [874, 520, 42]].forEach(([x, y, r]) => gauge(g, x, y, r, rnd));
  // табло сигнализации
  const lampCols = ["#ff3b30", "#ffcc33", "#33ff77", "#ffcc33", "#ff3b30", "#33c4ff"];
  for (let i = 0; i < 12; i++) {
    const x = 640 + (i % 6) * 58, y = 450 + Math.floor(i / 6) * 0;
    void x; void y;
  }
  for (let i = 0; i < 12; i++) {
    const x = 400 + (i % 6) * 38, y = 280 + Math.floor(i / 6) * 22;
    g.fillStyle = "#222"; g.fillRect(x, y, 32, 16);
    if (i % 4 === 1) { ge.fillStyle = lampCols[i % lampCols.length]; ge.fillRect(x + 2, y + 2, 28, 12); }
  }
  g.fillStyle = "#e0b020"; g.fillRect(470, 575, 84, 18);
  const panelMap = texFromCanvas(c), panelEmis = texFromCanvas(e);
  // боковые пульты
  const pc = canvas(1024, 128), gp = pc.getContext("2d");
  gp.fillStyle = "#4f8185"; gp.fillRect(0, 0, 1024, 128);
  for (let i = 0; i < 40; i++) {
    const x = 20 + i * 25, y = 20 + (i % 3) * 36;
    gp.fillStyle = "#1a1c1d"; gp.fillRect(x, y, 14, 22); gp.fillStyle = "#d8d8d0"; gp.fillRect(x + 5, y + 2, 4, 12);
  }
  gp.fillStyle = "#c62828"; gp.fillRect(900, 30, 60, 60);
  const consoleMap = texFromCanvas(pc);
  // символика ИЛС
  const hc = canvas(256, 192), gh = hc.getContext("2d"); gh.fillStyle = "#000"; gh.fillRect(0, 0, 256, 192);
  gh.strokeStyle = "#7dffa8"; gh.lineWidth = 2; gh.beginPath(); gh.arc(128, 96, 14, 0, 7); gh.moveTo(100, 96); gh.lineTo(114, 96); gh.moveTo(142, 96); gh.lineTo(156, 96); gh.moveTo(128, 82); gh.lineTo(128, 72); gh.stroke();
  for (let i = -2; i <= 2; i++) { if (!i) continue; gh.beginPath(); gh.moveTo(60, 96 + i * 30); gh.lineTo(100, 96 + i * 30); gh.moveTo(156, 96 + i * 30); gh.lineTo(196, 96 + i * 30); gh.stroke(); }
  gh.font = "14px monospace"; gh.fillStyle = "#7dffa8"; gh.fillText("0.00", 10, 20); gh.fillText("000", 210, 20);
  const hudTex = texFromCanvas(hc);
  return { panelMap, panelEmis, consoleMap, hudTex };
}

/* ---------- текстуры надписей ---------- */
export function boardNumberCanvas(txt) {
  const c = canvas(512, 256), g = c.getContext("2d");
  g.clearRect(0, 0, 512, 256);
  g.font = "bold 210px 'Russo One', 'Arial Black', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineJoin = "round"; g.lineWidth = 22; g.strokeStyle = "#eef1f2"; g.strokeText(txt, 256, 136);
  g.fillStyle = "#1d3f8a"; g.fillText(txt, 256, 136);
  return c;
}
export function flagCanvas() {
  const c = canvas(600, 330), g = c.getContext("2d");
  g.fillStyle = "#f2f2f0"; g.fillRect(0, 0, 600, 330);
  const x0 = 12, y0 = 12, w = 576, h = 306;
  g.fillStyle = "#c8313e"; g.fillRect(x0, y0, w, h * 2 / 3); g.fillStyle = "#3f9a4d"; g.fillRect(x0, y0 + h * 2 / 3, w, h / 3);
  g.fillStyle = "#fff"; g.fillRect(x0, y0, 70, h);
  g.fillStyle = "#c8313e";
  for (let y = y0 + 4; y < y0 + h - 30; y += 34) { g.beginPath(); g.moveTo(x0 + 35, y); g.lineTo(x0 + 60, y + 17); g.lineTo(x0 + 35, y + 34); g.lineTo(x0 + 10, y + 17); g.closePath(); g.fill(); g.fillStyle = "#fff"; g.fillRect(x0 + 31, y + 13, 8, 8); g.fillStyle = "#c8313e"; }
  return c;
}
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
  const g = new DecalGeometry(mesh, pos, e, new THREE.Vector3(w, h, depth));
  const d = new THREE.Mesh(g, mat); d.receiveShadow = true; d.renderOrder = 2;
  return d;
}
export function decalMaterial(tex, rough = 0.55) {
  return new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
}
export { texFromCanvas };
