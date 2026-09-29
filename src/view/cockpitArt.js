/* Графика кабины МиГ-29: циферблаты приборов (атлас), шар авиагоризонта, шкала ПНП,
   символика ИЛС-31, индикатор ИПВ, табло сигнализации и «Экран». Всё рисуется на canvas.
   Шкалы приборов описаны один раз (GAUGES) — по ним рисуются циферблаты и считаются углы стрелок. */
import * as THREE from "three";
import { canvas, texFromCanvas, mulberry32, TEX } from "./tex.js";

const TAU = Math.PI * 2, D2R = Math.PI / 180;
export const FONT = "'IBM Plex Sans Condensed','Arial Narrow',Arial,sans-serif";
const INK = "#eeeee4", RED = "#e2382c", YEL = "#e8b424", GRN = "#3fb160";

/* кусочно-линейное отображение значения шкалы в долю дуги */
const pw = (pts) => (v) => {
  if (v <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (v <= pts[i][0]) { const [a, ta] = pts[i - 1], [b, tb] = pts[i]; return ta + ((v - a) / (b - a)) * (tb - ta); }
  return pts[pts.length - 1][1];
};
const lin = (v0, v1) => (v) => (v - v0) / (v1 - v0);

/* шкалы: a0/a1 — углы (° по часовой от «12 часов») начала и конца дуги; wrap — полный круг без упора */
export const GAUGES = {
  kus: { a0: -140, a1: 140, map: pw([[0, 0], [200, 0.05], [300, 0.13], [400, 0.21], [500, 0.28], [600, 0.35], [700, 0.41], [800, 0.47], [900, 0.52], [1000, 0.57], [1200, 0.66], [1400, 0.74], [1600, 0.81], [2000, 0.92], [2500, 1]]) },
  alt: { a0: 0, a1: 360, map: lin(0, 1000), wrap: true },            // длинная стрелка — сотни метров
  altKm: { a0: 0, a1: 360, map: lin(0, 10), wrap: true },            // короткая — километры
  mach: { a0: -140, a1: 140, map: lin(0.5, 2.5) },
  aoa: { a0: -140, a1: 140, map: lin(-10, 30) },
  g: { a0: -120, a1: 120, map: lin(-3, 9) },
  vvi: { a0: -90, a1: -90, map: pw([[-150, -1], [-100, -0.87], [-50, -0.68], [-20, -0.42], [-10, -0.25], [0, 0], [10, 0.25], [20, 0.42], [50, 0.68], [100, 0.87], [150, 1]]), span: 165 },
  radalt: { a0: -140, a1: 140, map: pw([[0, 0], [50, 0.2], [100, 0.34], [200, 0.5], [300, 0.6], [500, 0.73], [1000, 0.9], [1500, 1]]) },
  rpm: { a0: -150, a1: 150, map: lin(0, 110) },
  egt: { a0: -140, a1: 140, map: lin(300, 1000) },
  fuel: { a0: -140, a1: 140, map: lin(0, 5000) },
  hyd: { a0: -140, a1: 140, map: lin(0, 300) },
  oil: { a0: -140, a1: 140, map: lin(0, 8) },
  brake: { a0: -140, a1: 140, map: lin(0, 150) },
  cabin: { a0: -140, a1: 140, map: lin(0, 20) },
  oxy: { a0: -140, a1: 140, map: lin(0, 200) },
  volt: { a0: -140, a1: 140, map: lin(0, 30) },
  clockH: { a0: 0, a1: 360, map: lin(0, 12), wrap: true },
  clockM: { a0: 0, a1: 360, map: lin(0, 60), wrap: true },
};
/* угол стрелки (радианы, по часовой от «12») */
export function needleAngle(id, v) {
  const s = GAUGES[id];
  if (s.span) return (s.a0 + s.map(v) * s.span) * D2R;
  let t = s.map(v); if (!s.wrap) t = Math.max(-0.015, Math.min(1.015, t));
  return (s.a0 + (s.a1 - s.a0) * t) * D2R;
}

/* ---------- рисование циферблатов ---------- */
const P = (c, r, a) => [c + r * Math.sin(a), c - r * Math.cos(a)];
function faceBase(g, c, R, col = "#121416") {
  const gr = g.createRadialGradient(c, c - R * 0.3, R * 0.1, c, c, R);
  gr.addColorStop(0, "#1d2022"); gr.addColorStop(1, col);
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
}
function text(g, s, x, y, px, col = INK, weight = 600, font = FONT) {
  g.fillStyle = col; g.font = `${weight} ${px}px ${font}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, x, y);
}
function arcBand(g, c, r0, r1, a0, a1, col) {
  g.fillStyle = col; g.beginPath();
  g.arc(c, c, r1, a0 - Math.PI / 2, a1 - Math.PI / 2); g.arc(c, c, r0, a1 - Math.PI / 2, a0 - Math.PI / 2, true); g.closePath(); g.fill();
}
/* шкала: ticks — [значение, длина(доля R), толщина], labels — [значение, текст] */
function scaleArc(g, c, R, id, { ticks = [], labels = [], bands = [], rOut = 0.93, rLab = 0.66, lpx = 0.15, spec = null } = {}) {
  const s = spec || GAUGES[id];
  const ang = (v) => (s.span ? (s.a0 + s.map(v) * s.span) * D2R : (s.a0 + (s.a1 - s.a0) * s.map(v)) * D2R);
  for (const [v0, v1, col, w = 0.07] of bands) arcBand(g, c, R * (rOut - w), R * rOut, ang(v0), ang(v1), col);
  g.strokeStyle = INK; g.lineCap = "butt";
  for (const [v, len, w] of ticks) {
    const a = ang(v); const [x0, y0] = P(c, R * rOut, a), [x1, y1] = P(c, R * (rOut - len), a);
    g.lineWidth = w * R; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  for (const [v, t] of labels) { const [x, y] = P(c, R * rLab, ang(v)); text(g, t, x, y, R * lpx); }
}
const seq = (a, b, st) => { const o = []; for (let v = a; v <= b + 1e-6; v += st) o.push(+v.toFixed(3)); return o; };
const T = (vals, len, w) => vals.map((v) => [v, len, w]);

const FACES = {
  kus(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "kus", {
      ticks: [...T(seq(200, 1000, 50), 0.07, 0.012), ...T(seq(1000, 2500, 100), 0.07, 0.012), ...T([200, 300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 2000, 2500], 0.15, 0.024)],
      labels: [[200, "2"], [300, "3"], [400, "4"], [500, "5"], [600, "6"], [700, "7"], [800, "8"], [900, "9"], [1000, "10"], [1200, "12"], [1400, "14"], [1600, "16"], [2000, "20"], [2500, "25"]],
      lpx: 0.13, rLab: 0.68,
    });
    text(g, "КМ/Ч", c, c + R * 0.34, R * 0.12); text(g, "×100", c, c - R * 0.3, R * 0.1, "#b9bdb4", 500);
    text(g, "КУС-2500", c, c + R * 0.55, R * 0.08, "#9ea39a", 500);
  },
  alt(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "alt", {
      ticks: [...T(seq(0, 980, 20), 0.07, 0.012), ...T(seq(0, 900, 100), 0.16, 0.028), ...T(seq(50, 950, 100), 0.1, 0.018)],
      labels: seq(0, 900, 100).map((v) => [v, String(v / 100)]), lpx: 0.18, rLab: 0.64,
    });
    g.fillStyle = "#050606"; g.fillRect(c - R * 0.2, c + R * 0.22, R * 0.4, R * 0.17);
    text(g, "760", c, c + R * 0.305, R * 0.12, "#f2f0e6", 600, "'IBM Plex Mono',monospace");
    text(g, "ВЫСОТА", c, c - R * 0.33, R * 0.11); text(g, "КМ · ×100 М", c, c - R * 0.2, R * 0.075, "#b9bdb4", 500);
    text(g, "ВДИ-30", c, c + R * 0.55, R * 0.08, "#9ea39a", 500);
  },
  mach(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "mach", {
      ticks: [...T(seq(0.5, 2.5, 0.05), 0.07, 0.012), ...T(seq(0.6, 2.4, 0.2), 0.15, 0.026), [2.5, 0.15, 0.026]],
      labels: [[0.6, ".6"], [1, "1"], [1.4, "1.4"], [1.8, "1.8"], [2.2, "2.2"], [0.8, ".8"], [1.2, "1.2"], [1.6, "1.6"], [2.0, "2"], [2.5, "2.5"]], lpx: 0.13,
      bands: [[0.95, 1.05, "#c9c9c0", 0.04]],
    });
    text(g, "М", c, c + R * 0.3, R * 0.2); text(g, "УМ-1", c, c + R * 0.55, R * 0.08, "#9ea39a", 500);
  },
  aoa(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "aoa", {
      ticks: [...T(seq(-10, 30, 1), 0.06, 0.012), ...T(seq(-10, 30, 5), 0.14, 0.026)],
      labels: [[-10, "−10"], [0, "0"], [10, "10"], [20, "20"], [30, "30"]], bands: [[26, 30, RED], [24, 26, YEL]], lpx: 0.13, rLab: 0.74,
    });
    scaleArc(g, c, R, "g", { ticks: [...T(seq(-3, 9, 1), 0.07, 0.016)], labels: [[-2, "−2"], [0, "0"], [2, "2"], [4, "4"], [6, "6"], [8, "8"]], rOut: 0.55, rLab: 0.38, lpx: 0.11, bands: [[7, 9, RED, 0.05]] });
    text(g, "α°", c - R * 0.2, c + R * 0.62, R * 0.12); text(g, "n", c + R * 0.2, c + R * 0.62, R * 0.12, "#f0a070");
    text(g, "УАП-14", c, c + R * 0.8, R * 0.075, "#9ea39a", 500);
  },
  vvi(g, c, R) {
    faceBase(g, c, R);
    const vals = [0, 5, 10, 20, 50, 100, 150];
    const tk = []; for (const v of seq(1, 20, 1)) tk.push([v, 0.06, 0.012], [-v, 0.06, 0.012]);
    for (const v of vals) tk.push([v, 0.15, 0.026], [-v, 0.15, 0.026]);
    scaleArc(g, c, R, "vvi", { ticks: tk, labels: vals.flatMap((v) => (v ? [[v, String(v)], [-v, String(v)]] : [[0, "0"]])), lpx: 0.13, rLab: 0.7 });
    text(g, "▲ ВВЕРХ", c + R * 0.08, c - R * 0.34, R * 0.085); text(g, "▼ ВНИЗ", c + R * 0.08, c + R * 0.34, R * 0.085);
    text(g, "М/С", c + R * 0.22, c, R * 0.11); text(g, "ВАР-150", c + R * 0.2, c + R * 0.54, R * 0.075, "#9ea39a", 500);
  },
  radalt(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "radalt", {
      ticks: [...T(seq(0, 100, 10), 0.07, 0.012), ...T([0, 50, 100, 200, 300, 500, 1000, 1500], 0.15, 0.026), ...T([150, 400, 700], 0.08, 0.014)],
      labels: [[0, "0"], [50, "50"], [100, "100"], [200, "200"], [300, "300"], [500, "500"], [1000, "1000"], [1500, "1500"]], lpx: 0.11, rLab: 0.66,
    });
    text(g, "РВ", c, c - R * 0.28, R * 0.16); text(g, "М", c, c + R * 0.28, R * 0.12); text(g, "УВ-30", c, c + R * 0.55, R * 0.08, "#9ea39a", 500);
  },
  rpm(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "rpm", {
      ticks: [...T(seq(0, 110, 2), 0.06, 0.012), ...T(seq(0, 110, 10), 0.15, 0.026)],
      labels: seq(0, 110, 10).map((v) => [v, String(v / 10)]), bands: [[88, 103, GRN], [103, 110, RED]], lpx: 0.14,
    });
    text(g, "ОБОРОТЫ", c, c - R * 0.3, R * 0.11); text(g, "% ×10", c, c + R * 0.3, R * 0.09, "#b9bdb4", 500);
    text(g, "1 ЛЕВ  2 ПРАВ", c, c + R * 0.46, R * 0.075, "#b9bdb4", 500); text(g, "ИТА-6", c, c + R * 0.62, R * 0.075, "#9ea39a", 500);
  },
  egt(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "egt", {
      ticks: [...T(seq(300, 1000, 20), 0.06, 0.012), ...T(seq(300, 1000, 100), 0.15, 0.026)],
      labels: seq(300, 1000, 100).map((v) => [v, String(v / 100)]), bands: [[860, 1000, RED], [800, 860, YEL]], lpx: 0.15,
    });
    text(g, "Т ГАЗОВ", c, c - R * 0.3, R * 0.11); text(g, "°C ×100", c, c + R * 0.3, R * 0.09, "#b9bdb4", 500);
    text(g, "1   2", c, c + R * 0.46, R * 0.09, "#b9bdb4", 500); text(g, "ИТ-9", c, c + R * 0.62, R * 0.075, "#9ea39a", 500);
  },
  fuel(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "fuel", {
      ticks: [...T(seq(0, 5000, 100), 0.06, 0.012), ...T(seq(0, 5000, 500), 0.15, 0.026)],
      labels: seq(0, 5000, 1000).map((v) => [v, String(v / 1000)]), bands: [[0, 550, RED], [550, 800, YEL]], lpx: 0.16,
    });
    text(g, "ТОПЛИВО", c, c - R * 0.3, R * 0.11); text(g, "Т", c, c + R * 0.3, R * 0.12); text(g, "СУИТ", c, c + R * 0.55, R * 0.08, "#9ea39a", 500);
  },
  hyd(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "hyd", {
      ticks: [...T(seq(0, 300, 10), 0.06, 0.012), ...T(seq(0, 300, 50), 0.15, 0.026)],
      labels: seq(0, 300, 50).map((v) => [v, String(v)]), bands: [[190, 235, GRN], [0, 120, RED, 0.04]], lpx: 0.12,
    });
    text(g, "ГИДРО", c, c - R * 0.3, R * 0.11); text(g, "КГС/СМ²", c, c + R * 0.28, R * 0.085, "#b9bdb4", 500);
    text(g, "О   Б", c, c + R * 0.46, R * 0.1, "#b9bdb4", 500); text(g, "ДИМ-300", c, c + R * 0.62, R * 0.075, "#9ea39a", 500);
  },
  oil(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "oil", {
      ticks: [...T(seq(0, 8, 0.2), 0.06, 0.012), ...T(seq(0, 8, 1), 0.15, 0.026)],
      labels: seq(0, 8, 1).map((v) => [v, String(v)]), bands: [[2.6, 5.5, GRN], [0, 1.4, RED, 0.04]], lpx: 0.15,
    });
    text(g, "МАСЛО", c, c - R * 0.3, R * 0.11); text(g, "КГС/СМ²", c, c + R * 0.28, R * 0.085, "#b9bdb4", 500); text(g, "1   2", c, c + R * 0.46, R * 0.09, "#b9bdb4", 500);
  },
  brake(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "brake", {
      ticks: [...T(seq(0, 150, 5), 0.06, 0.012), ...T(seq(0, 150, 25), 0.15, 0.026)],
      labels: seq(0, 150, 50).map((v) => [v, String(v)]), lpx: 0.15,
    });
    text(g, "ТОРМОЗ", c, c - R * 0.3, R * 0.11); text(g, "Л   П", c, c + R * 0.34, R * 0.1, "#b9bdb4", 500);
  },
  cabin(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "cabin", { ticks: [...T(seq(0, 20, 0.5), 0.06, 0.012), ...T(seq(0, 20, 2), 0.15, 0.026)], labels: seq(0, 20, 4).map((v) => [v, String(v)]), lpx: 0.15 });
    text(g, "ВЫСОТА", c, c - R * 0.34, R * 0.1); text(g, "КАБИНЫ", c, c - R * 0.2, R * 0.1); text(g, "КМ", c, c + R * 0.3, R * 0.1); text(g, "УВПД", c, c + R * 0.55, R * 0.08, "#9ea39a", 500);
  },
  oxy(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "oxy", { ticks: [...T(seq(0, 200, 5), 0.06, 0.012), ...T(seq(0, 200, 25), 0.15, 0.026)], labels: seq(0, 200, 50).map((v) => [v, String(v)]), bands: [[0, 30, RED]], lpx: 0.14 });
    text(g, "КИСЛОРОД", c, c - R * 0.3, R * 0.1); text(g, "КГС/СМ²", c, c + R * 0.3, R * 0.085, "#b9bdb4", 500);
  },
  volt(g, c, R) {
    faceBase(g, c, R);
    scaleArc(g, c, R, "volt", { ticks: [...T(seq(0, 30, 1), 0.06, 0.012), ...T(seq(0, 30, 5), 0.15, 0.026)], labels: seq(0, 30, 10).map((v) => [v, String(v)]), bands: [[26, 29.5, GRN]], lpx: 0.16 });
    text(g, "V", c, c - R * 0.28, R * 0.16); text(g, "ВОЛЬТМЕТР", c, c + R * 0.3, R * 0.085, "#b9bdb4", 500);
  },
  clock(g, c, R) {
    faceBase(g, c, R, "#0e1011");
    scaleArc(g, c, R, null, { spec: GAUGES.clockM, ticks: [...T(seq(0, 59, 1), 0.06, 0.014), ...T(seq(0, 55, 5), 0.13, 0.03)] });
    scaleArc(g, c, R, null, { spec: GAUGES.clockH, labels: seq(1, 12, 1).map((v) => [v, String(v)]), lpx: 0.15, rLab: 0.7 });
    for (const dy of [-0.36, 0.36]) {
      g.strokeStyle = "#8d918a"; g.lineWidth = R * 0.012; g.beginPath(); g.arc(c, c + R * dy, R * 0.17, 0, TAU); g.stroke();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const [x0, y0] = P(c, R * 0.17, a), [x1, y1] = P(c, R * 0.13, a); g.beginPath(); g.moveTo(x0, y0 + R * dy); g.lineTo(x1, y1 + R * dy); g.stroke(); }
    }
    text(g, "АЧС-1", c, c + R * 0.12, R * 0.07, "#9ea39a", 500);
  },
  /* кольцо авиагоризонта: шкала крена по верхней дуге, шар виден в окне */
  adiRing(g, c, R) {
    g.fillStyle = "#101213"; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
    g.strokeStyle = INK;
    for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60, 90, -90]) {
      const r0 = Math.abs(a) % 30 === 0 ? 0.8 : 0.86;
      const [x0, y0] = P(c, R * 0.96, a * D2R), [x1, y1] = P(c, R * r0, a * D2R);
      g.lineWidth = R * (a === 0 ? 0.03 : 0.018); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    text(g, "КПП", c - R * 0.72, c + R * 0.72, R * 0.08, "#9ea39a", 500);
  },
  /* неподвижная часть ПНП */
  hsiRing(g, c, R) {
    g.fillStyle = "#111314"; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
    g.strokeStyle = INK;
    for (let k = 0; k < 8; k++) { const a = k * 45 * D2R; const [x0, y0] = P(c, R * 0.97, a), [x1, y1] = P(c, R * 0.88, a); g.lineWidth = R * 0.03; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    g.fillStyle = "#f2c12e"; g.beginPath(); g.moveTo(c, c - R * 0.86); g.lineTo(c - R * 0.06, c - R * 0.98); g.lineTo(c + R * 0.06, c - R * 0.98); g.closePath(); g.fill();
    text(g, "ПНП-72", c + R * 0.72, c + R * 0.74, R * 0.075, "#9ea39a", 500);
  },
  /* вращающаяся картушка курса */
  hsiCard(g, c, R) {
    g.fillStyle = "#16191a"; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
    g.strokeStyle = INK;
    for (let d = 0; d < 360; d += 5) {
      const a = d * D2R, len = d % 30 === 0 ? 0.12 : d % 10 === 0 ? 0.08 : 0.05;
      const [x0, y0] = P(c, R * 0.98, a), [x1, y1] = P(c, R * (0.98 - len), a);
      g.lineWidth = R * (d % 30 === 0 ? 0.022 : 0.012); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    const lab = { 0: "С", 90: "В", 180: "Ю", 270: "З" };
    for (let d = 0; d < 360; d += 30) {
      const a = d * D2R, [x, y] = P(c, R * 0.72, a);
      g.save(); g.translate(x, y); g.rotate(a); text(g, lab[d] || String(d / 10), 0, 0, R * (lab[d] ? 0.17 : 0.14), lab[d] ? "#f0f0e6" : INK, lab[d] ? 700 : 600); g.restore();
    }
    // стрелка курса (жёлтая) и планка отклонения
    g.fillStyle = "#e9b82a";
    g.beginPath(); g.moveTo(c, c - R * 0.56); g.lineTo(c - R * 0.06, c - R * 0.44); g.lineTo(c - R * 0.02, c - R * 0.44); g.lineTo(c - R * 0.02, c - R * 0.2);
    g.lineTo(c + R * 0.02, c - R * 0.2); g.lineTo(c + R * 0.02, c - R * 0.44); g.lineTo(c + R * 0.06, c - R * 0.44); g.closePath(); g.fill();
    g.fillRect(c - R * 0.02, c + R * 0.2, R * 0.04, R * 0.36);
    g.fillStyle = "#c9ccc4"; for (const k of [-2, -1, 1, 2]) { g.beginPath(); g.arc(c + k * R * 0.14, c, R * 0.025, 0, TAU); g.fill(); }
  },
};
export const FACE_IDS = Object.keys(FACES);

/* атлас циферблатов: 5×5 плиток. tile(id) → {x, y, s} в долях текстуры (y снизу, как UV) */
export function gaugeAtlas() {
  const S = Math.round(2048 * Math.min(1, TEX.scale)), N = 5, ts = Math.floor(S / N);
  const c = canvas(S, S), g = c.getContext("2d");
  g.fillStyle = "#0c0d0e"; g.fillRect(0, 0, S, S);
  const tiles = {};
  FACE_IDS.forEach((id, i) => {
    const col = i % N, row = Math.floor(i / N);
    const x = col * ts, y = row * ts, R = ts / 2 - 2;
    g.save(); g.translate(x, y); FACES[id](g, ts / 2, R); g.restore();
    tiles[id] = { u: x / S, v: 1 - (y + ts) / S, s: ts / S };
  });
  const tex = texFromCanvas(c, { clamp: true });
  return { tex, tiles };
}

/* шар авиагоризонта КПП: равнопромежуточная развёртка, полюс — вертикаль */
export function adiBallTexture() {
  const W = Math.round(1024 * Math.max(0.5, Math.min(1, TEX.scale))), H = W / 2;
  const c = canvas(W, H), g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, H / 2); sky.addColorStop(0, "#5f86b8"); sky.addColorStop(1, "#8fb4dc");
  g.fillStyle = sky; g.fillRect(0, 0, W, H / 2);
  const gnd = g.createLinearGradient(0, H / 2, 0, H); gnd.addColorStop(0, "#6d4a2a"); gnd.addColorStop(1, "#3b2716");
  g.fillStyle = gnd; g.fillRect(0, H / 2, W, H / 2);
  g.fillStyle = "#f4f4ee"; g.fillRect(0, H / 2 - H * 0.004, W, H * 0.008);
  for (const u0 of [0.25, 0.75]) {
    for (let p = -80; p <= 80; p += 5) {
      if (!p) continue;
      const y = H / 2 - (p / 180) * H, major = p % 10 === 0;
      const half = (major ? 12 : 5) / Math.cos(p * D2R) / 360 * W;
      g.fillStyle = p > 0 ? "#f4f4ee" : "#f0e6d0";
      g.fillRect(u0 * W - half, y - H * 0.0025, half * 2, H * 0.005);
      if (major) {
        g.font = `600 ${H * 0.035}px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(Math.abs(p)), u0 * W - half - H * 0.03, y); g.fillText(String(Math.abs(p)), u0 * W + half + H * 0.03, y);
      }
    }
    // «Н» и «В» по крену/курсу — метки сторон
    g.font = `700 ${H * 0.05}px ${FONT}`; g.fillStyle = "#f4f4ee"; g.fillText("0", u0 * W, H / 2 - H * 0.03);
  }
  return texFromCanvas(c);
}

/* символика ИЛС-31 (прозрачный фон — аддитивное смешение) */
export function hudTexture() {
  const S = 512, c = canvas(S, S), g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, S, S);
  const col = "#7dffa8";
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3;
  // перекрестие самолёта
  const cx = S / 2, cy = S * 0.46;
  g.beginPath(); g.arc(cx, cy, 13, 0, TAU); g.moveTo(cx - 60, cy); g.lineTo(cx - 13, cy); g.moveTo(cx + 13, cy); g.lineTo(cx + 60, cy); g.moveTo(cx, cy - 13); g.lineTo(cx, cy - 30); g.stroke();
  // лестница тангажа
  g.lineWidth = 2.5;
  for (const k of [-2, -1, 1, 2]) {
    const y = cy - k * 90;
    g.setLineDash(k < 0 ? [14, 10] : []);
    g.beginPath(); g.moveTo(cx - 140, y); g.lineTo(cx - 55, y); g.lineTo(cx - 55, y + (k > 0 ? 14 : -14)); g.moveTo(cx + 140, y); g.lineTo(cx + 55, y); g.lineTo(cx + 55, y + (k > 0 ? 14 : -14)); g.stroke();
    g.setLineDash([]);
    g.font = "600 22px 'IBM Plex Mono',monospace"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(String(Math.abs(k) * 5), cx + 150, y);
  }
  // горизонт
  g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 220, cy); g.lineTo(cx - 90, cy); g.moveTo(cx + 90, cy); g.lineTo(cx + 220, cy); g.stroke();
  // шкала курса сверху
  g.font = "600 22px 'IBM Plex Mono',monospace"; g.textAlign = "center";
  for (let i = -3; i <= 3; i++) { const x = cx + i * 55; g.beginPath(); g.moveTo(x, 44); g.lineTo(x, i % 1 ? 52 : 60); g.stroke(); g.fillText(String((36 + i * 1 + 36) % 36).padStart(2, "0"), x, 26); }
  g.beginPath(); g.moveTo(cx, 66); g.lineTo(cx - 9, 80); g.lineTo(cx + 9, 80); g.closePath(); g.stroke();
  // скорость и высота
  g.lineWidth = 2.5; g.strokeRect(34, cy - 20, 92, 40); g.strokeRect(S - 126, cy - 20, 92, 40);
  g.font = "600 26px 'IBM Plex Mono',monospace"; g.fillText("0", 80, cy + 1); g.fillText("0", S - 80, cy + 1);
  g.font = "600 20px 'IBM Plex Mono',monospace"; g.textAlign = "left";
  g.fillText("НАВ", 34, S - 60); g.fillText("n 1.0", 34, S - 30); g.textAlign = "right"; g.fillText("М 0.00", S - 34, S - 30); g.fillText("ВЗЛЁТ", S - 34, S - 60);
  return texFromCanvas(c, { clamp: true });
}

/* небольшие динамические экраны (перерисовываются только при смене состояния) */
export class Screen {
  constructor(w, h, draw) { this.c = canvas(w, h); this.g = this.c.getContext("2d"); this.draw = draw; this.tex = texFromCanvas(this.c, { clamp: true, mips: false }); this.key = null; }
  set(state) { const k = JSON.stringify(state); if (k === this.key) return; this.key = k; this.draw(this.g, this.c.width, this.c.height, state); this.tex.needsUpdate = true; }
}

/* табло сигнализации: ячейки с надписями; lit — массив ключей горящих ячеек */
export const TABLO = [
  ["fireL", "ПОЖАР\nЛЕВ", "r"], ["fireR", "ПОЖАР\nПРАВ", "r"], ["genL", "ГЕНЕРАТ.\nЛЕВ", "y"], ["genR", "ГЕНЕРАТ.\nПРАВ", "y"],
  ["oilL", "МАСЛО\nЛЕВ", "y"], ["oilR", "МАСЛО\nПРАВ", "y"], ["hydO", "ГИДРО\nОСН", "y"], ["hydB", "ГИДРО\nБУСТ", "y"],
  ["fuel800", "ОСТАТОК\n800", "y"], ["canopy", "ФОНАРЬ\nОТКРЫТ", "r"], ["brake", "ТОРМОЗ\nСТОЯН.", "g"], ["sau", "САУ\nОТКАЗ", "y"],
];
export function drawTablo(g, W, H, st) {
  const lit = new Set(st.lit || []), cols = 4, rows = 3, cw = W / cols, ch = H / rows;
  g.fillStyle = "#050606"; g.fillRect(0, 0, W, H);
  TABLO.forEach(([key, label, col], i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch, on = lit.has(key);
    const tint = col === "r" ? [255, 60, 40] : col === "g" ? [60, 255, 110] : [255, 190, 50];
    g.fillStyle = on ? `rgb(${tint[0] * 0.55},${tint[1] * 0.55},${tint[2] * 0.55})` : "#15191a";
    g.fillRect(x + 3, y + 3, cw - 6, ch - 6);
    g.fillStyle = on ? "#fff8ea" : "#4c5452"; g.textAlign = "center"; g.textBaseline = "middle";
    const lines = label.split("\n");
    let fs = ch * 0.24; g.font = `700 ${fs}px ${FONT}`;
    const wmax = Math.max(...lines.map((s) => g.measureText(s).width));
    if (wmax > cw * 0.84) { fs *= (cw * 0.84) / wmax; g.font = `700 ${fs}px ${FONT}`; }
    lines.forEach((s, k) => g.fillText(s, x + cw / 2, y + ch * (0.36 + k * 0.3)));
  });
}
/* «Экран-03»: текстовые сообщения */
export function drawEkran(g, W, H, st) {
  g.fillStyle = "#040504"; g.fillRect(0, 0, W, H);
  if (!st.on) return;
  g.fillStyle = "#ffae3a"; g.font = `600 ${H * 0.2}px 'IBM Plex Mono',monospace`; g.textAlign = "left"; g.textBaseline = "top";
  (st.lines || []).slice(0, 4).forEach((s, i) => g.fillText(s, W * 0.05, H * (0.06 + i * 0.23)));
}
/* ИПВ: индикатор РЛС/ОЛС (зелёный) */
export function drawIpv(g, W, H, st) {
  g.fillStyle = "#020403"; g.fillRect(0, 0, W, H);
  if (!st.on) return;
  const col = "#5cff9a"; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2;
  g.globalAlpha = 0.35; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(W * 0.1, H * (0.15 + k * 0.18)); g.lineTo(W * 0.9, H * (0.15 + k * 0.18)); g.stroke(); }
  for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(W * (0.1 + k * 0.2), H * 0.15); g.lineTo(W * (0.1 + k * 0.2), H * 0.87); g.stroke(); }
  g.globalAlpha = 1; g.lineWidth = 3; g.strokeRect(W * 0.1, H * 0.15, W * 0.8, H * 0.72);
  g.font = `600 ${H * 0.085}px 'IBM Plex Mono',monospace`; g.textAlign = "left"; g.textBaseline = "top";
  g.fillText(st.mode || "РЛС  ОБЗОР", W * 0.1, H * 0.03); g.textAlign = "right"; g.fillText("Д 80", W * 0.9, H * 0.03);
  g.textAlign = "center"; g.fillText(st.msg || "ГОТОВ", W / 2, H * 0.9);
  const rnd = mulberry32(7); g.globalAlpha = 0.5; for (let i = 0; i < 40; i++) g.fillRect(W * (0.12 + rnd() * 0.76), H * (0.6 + rnd() * 0.25), 2, 2); g.globalAlpha = 1;
}

/* жёлто-чёрная «зебра» для ручек катапультирования и такелажа */
export function stripeTexture(a = "#e2b21e", b = "#141414", n = 8) {
  const c = canvas(128, 16), g = c.getContext("2d");
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect((i * 128) / n, 0, 128 / n + 1, 16); }
  const t = texFromCanvas(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
