/* Карты окраски планера: разделка панелей, заклёпки, крепёж, грязь, потёртости, копоть.
   Рисуются в двух проекциях — «план» (вид сверху/снизу) и «борт» (вид сбоку) — в метрах самолёта. */
import * as THREE from "three";
import { canvas, mulberry32, noiseField, dataTex, TEX, texFromCanvas } from "./tex.js";
import { PAINT } from "./materials.js";
import { WING_SECTIONS, FIN, STAB, NAC, CORE, HOLES, COWL, DEG } from "./mig29dims.js";
import { sePoint } from "./geo.js";

const PX0 = -9.2, PX1 = 10.0, PZ0 = -6.3, PZ1 = 6.3;     // план
const SX0 = -9.2, SX1 = 10.0, SY0 = 0.6, SY1 = 5.0;      // борт

function wingAt(z) {
  const S = WING_SECTIONS; let i = 0; while (i < S.length - 2 && S[i + 1].s < z) i++;
  const a = S[i], b = S[i + 1], k = Math.max(0, Math.min(1, (z - a.s) / (b.s - a.s)));
  const le = a.le + (b.le - a.le) * k, c = a.c + (b.c - a.c) * k;
  return { le, c, te: le - c };
}
function stabAt(z) {
  const S = STAB.sections; let i = 0; while (i < S.length - 2 && S[i + 1].s < z) i++;
  const a = S[i], b = S[i + 1], k = Math.max(0, Math.min(1, (z - a.s) / (b.s - a.s)));
  const le = a.le + (b.le - a.le) * k, c = a.c + (b.c - a.c) * k; return { le, c, te: le - c };
}

export function buildPaintMaps(q = 1) {
  const ppm = Math.round(190 * q * TEX.scale);                    // пикселей на метр
  const PW = Math.round((PX1 - PX0) * ppm), PH = Math.round((PZ1 - PZ0) * ppm);
  const SW = Math.round((SX1 - SX0) * ppm), SH = Math.round((SY1 - SY0) * ppm);
  const rnd = mulberry32(558);

  const mk = (w, h, v) => { const c = canvas(w, h), g = c.getContext("2d"); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, 0, w, h); g.lineCap = "round"; g.lineJoin = "round"; return g; };
  // план
  const topH = mk(PW, PH, 128), botH = mk(PW, PH, 128), pGr = mk(PW, PH, 0), pWr = mk(PW, PH, 0);
  // борт
  const sH = mk(SW, SH, 128), sGr = mk(SW, SH, 0), sSo = mk(SW, SH, 0), sWr = mk(SW, SH, 0);

  const P = (x, z) => [(x - PX0) * ppm, (z - PZ0) * ppm];
  const Sd = (x, y) => [(x - SX0) * ppm, (y - SY0) * ppm];
  const M = (m) => m * ppm;

  /* примитивы: pts в метрах, map — функция проекции */
  function poly(g, map, pts, w, v, closed = false, alpha = 1) {
    g.strokeStyle = typeof v === "string" ? v : `rgba(${v},${v},${v},${alpha})`; g.lineWidth = Math.max(1, M(w));
    g.beginPath(); pts.forEach((p, i) => { const [a, b] = map(p[0], p[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); if (closed) g.closePath(); g.stroke();
  }
  function dots(g, map, pts, step, r, v) {
    g.fillStyle = `rgb(${v},${v},${v})`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(L / step));
      for (let k = 0; k < n; k++) { const t = k / n; const [a, b] = map(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t); g.beginPath(); g.arc(a, b, Math.max(0.7, M(r)), 0, 7); g.fill(); }
    }
  }
  function screws(g, map, pts, step, r) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(L / step));
      for (let k = 0; k <= n; k++) { const t = k / n; const [a, b] = map(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        g.fillStyle = "rgb(84,84,84)"; g.beginPath(); g.arc(a, b, Math.max(1, M(r)), 0, 7); g.fill();
        g.fillStyle = "rgb(118,118,118)"; g.beginPath(); g.arc(a, b, Math.max(0.6, M(r * 0.6)), 0, 7); g.fill(); }
    }
  }
  const rectPts = (x0, a0, x1, a1) => [[x0, a0], [x1, a0], [x1, a1], [x0, a1], [x0, a0]];
  function panel(gH, map, x0, a0, x1, a1, { scr = 0.07, v = 34, w = 0.01, grime = null } = {}) {
    const pts = rectPts(x0, a0, x1, a1);
    poly(gH, map, pts, w, v);
    if (scr) { const i = 0.025, d = Math.sign(x1 - x0) * i, e = Math.sign(a1 - a0) * i; screws(gH, map, rectPts(x0 + d, a0 + e, x1 - d, a1 - e), scr, 0.008); }
    if (grime) poly(grime, map, pts, 0.05, 40, true, 0.5);
  }
  const both = (fn) => { fn(1); fn(-1); };

  /* ═════════ ПЛАН: верх (R) ═════════ */
  const zs = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  both((s) => {
    for (const g of [topH, botH]) {
      // корень крыла
      poly(g, P, [[wingAt(1.95).le, 1.95 * s], [wingAt(1.95).te, 1.95 * s]], 0.01, 36);
      // предкрылки
      for (const [za, zb] of [[2.15, 3.3], [3.32, 4.45], [4.47, 5.5]]) {
        const pts = zs(za, zb, 8).map((z) => [wingAt(z).le - 0.16 * wingAt(z).c, z * s]);
        poly(g, P, [[wingAt(za).le, za * s], ...pts, [wingAt(zb).le, zb * s]], 0.01, 30);
      }
      // закрылки и флапероны
      for (const [za, zb, k] of [[2.05, 3.55, 0.27], [3.6, 5.35, 0.24]]) {
        const pts = zs(za, zb, 8).map((z) => [wingAt(z).te + k * wingAt(z).c, z * s]);
        poly(g, P, [[wingAt(za).te, za * s], ...pts, [wingAt(zb).te, zb * s]], 0.011, 28);
      }
      // лонжероны — ряды заклёпок
      for (const k of [0.2, 0.45, 0.62]) dots(g, P, zs(2.0, 5.5, 10).map((z) => [wingAt(z).le - k * wingAt(z).c, z * s]), 0.045, 0.006, 150);
      for (const z of [2.6, 3.3, 4.0, 4.7]) dots(g, P, [[wingAt(z).le - 0.16 * wingAt(z).c, z * s], [wingAt(z).te + 0.27 * wingAt(z).c, z * s]], 0.045, 0.006, 150);
      // стабилизатор
      poly(g, P, zs(1.65, 3.85, 6).map((z) => [stabAt(z).te + 0.2 * stabAt(z).c, z * s]), 0.008, 40);
      for (const k of [0.25, 0.55]) dots(g, P, zs(1.7, 3.8, 6).map((z) => [stabAt(z).le - k * stabAt(z).c, z * s]), 0.045, 0.006, 150);
      poly(g, P, [[STAB.sections[0].le - 0.05, 1.66 * s], [STAB.sections[0].le - 2.4, 1.66 * s]], 0.008, 40);
    }
    // лючки на верхней поверхности крыла
    panel(topH, P, -1.0, 2.55 * s, -1.55, 2.95 * s);
    panel(topH, P, -2.1, 3.7 * s, -2.5, 4.05 * s);
    panel(topH, P, -0.2, 2.15 * s, -0.65, 2.45 * s, { scr: 0.06 });
    topH.fillStyle = "rgb(40,40,40)"; { const [a, b] = P(-1.9, 2.4 * s); topH.beginPath(); topH.arc(a, b, M(0.06), 0, 7); topH.lineWidth = M(0.01); topH.strokeStyle = "rgb(40,40,40)"; topH.stroke(); }
    // наплыв: разделка и жалюзи
    for (const x of [3.3, 0.35, -1.0]) { const z0 = CORE(x).w * 0.95; const z1 = x > 1 ? 0.7 + (3.4 - x) * 0.33 : 1.9; poly(topH, P, [[x, z0 * s], [x, Math.min(z1, 1.9) * s]], 0.01, 34); }
    panel(topH, P, 2.42, 0.78 * s, 1.18, 1.32 * s, { scr: 0.05 });
    // мотогондолы за крылом
    for (const x of [-4.6, -5.5, -6.3]) poly(topH, P, [[x, 0.62 * s], [x, 1.52 * s]], 0.009, 38);
    poly(topH, P, [[-4.6, 1.3 * s], [-6.4, 1.3 * s]], 0.008, 40);
    // хвостовая балка — верхний тормозной щиток
    panel(topH, P, -6.75, 0.34 * s, -7.8, 0.02 * s, { scr: 0.06 });
    // нижняя поверхность: капоты с замками, створки, лючки
    const nz = (x, t) => { const p = NAC(x); return (p.cz + p.w * Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), 2 / p.ns)) * s; };
    for (const t of [COWL.t0, COWL.t1]) {
      const pts = zs(COWL.x1, COWL.x0, 10).map((x) => [x, nz(x, t)]);
      screws(botH, P, pts, 0.1, 0.01);
    }
    for (const x of [-1.2, -2.4, -3.4]) { botH.fillStyle = "rgb(70,70,70)"; const [a, b] = P(x, nz(x, Math.PI) - 0.0); botH.fillRect(a - M(0.05), b - M(0.018), M(0.1), M(0.036)); }
    panel(botH, P, 1.8, 0.62 * s, 0.6, 1.3 * s);
    panel(botH, P, -1.5, 2.3 * s, -2.1, 2.7 * s);
    panel(botH, P, 0.1, 2.2 * s, -0.4, 2.5 * s, { scr: 0.05 });
    for (const x of [1.0, -0.2]) poly(botH, P, [[x, 0.6 * s], [x, 0.2 * s]], 0.01, 34);
  });
  // хребет фюзеляжа: шпангоуты, люки, горловина
  for (const x of [6.28, 5.62, 5.0, 2.6, 0.55, -0.4, -2.6, -3.4, -4.4, -5.6, -6.7]) {
    const w = CORE(x).w * (x > 2.5 ? 0.75 : 0.5);
    poly(topH, P, [[x, -w], [x, w]], 0.01, 34);
    dots(topH, P, [[x - 0.03, -w], [x - 0.03, w]], 0.04, 0.006, 150);
  }
  for (const [h, pad] of [[HOLES.av, 0.012], [HOLES.tank, 0.012]]) {
    const w0 = CORE((h.x0 + h.x1) / 2).w * Math.pow(Math.sin(h.t1), 2 / 2.3);
    screws(topH, P, rectPts(h.x0 - pad - 0.02, -w0 - 0.03, h.x1 + pad + 0.02, w0 + 0.03), 0.07, 0.008);
  }
  topH.lineWidth = M(0.012); topH.strokeStyle = "rgb(40,40,40)";
  { const [a, b] = P(-3.0, 0); topH.beginPath(); topH.arc(a, b, M(0.075), 0, 7); topH.stroke(); }
  for (const s of [1, -1]) poly(topH, P, [[5.6, 0.36 * s], [-5.8, 0.38 * s]], 0.008, 44);
  // низ фюзеляжа
  for (const x of [5.6, 4.6, 1.8, 0.8, -1.6, -2.8, -4.2, -5.6]) poly(botH, P, [[x, -0.45], [x, 0.45]], 0.01, 34);
  panel(botH, P, -6.8, -0.3, -7.8, 0.3, { scr: 0.06 });
  panel(botH, P, 5.4, -0.25, 4.8, 0.25);

  /* ═════════ БОРТ (R — высоты) ═════════ */
  for (const x of [6.28, 5.62, 5.0, 2.62, 0.55, -0.4, -1.6, -2.6, -3.4, -4.4, -5.6, -6.7]) {
    const p = CORE(x), y0 = p.cy - p.hb * 0.8, y1 = p.cy + p.ht * 0.85;
    poly(sH, Sd, [[x, y0], [x, y1]], 0.01, 34);
    dots(sH, Sd, [[x - 0.03, y0], [x - 0.03, y1]], 0.04, 0.006, 150);
  }
  // люки носового отсека
  panel(sH, Sd, 5.95, 1.72, 5.2, 2.2, { grime: sGr });
  panel(sH, Sd, 4.9, 1.7, 4.3, 2.0);
  panel(sH, Sd, 2.3, 1.72, 1.4, 2.05);
  // подножка
  panel(sH, Sd, 3.85, 1.95, 3.65, 2.12, { scr: 0 });
  // воздухозаборник и мотогондола
  const nacY = (x, t) => { const p = NAC(x); const c = Math.cos(t); return p.cy + (c >= 0 ? p.ht : p.hb) * Math.sign(c) * Math.pow(Math.abs(c), 2 / (c >= 0 ? p.nt : p.nb)); };
  for (const x of [1.9, 1.0, 0.0]) poly(sH, Sd, [[x, nacY(x, Math.PI * 0.9)], [x, nacY(x, Math.PI * 0.2)]], 0.01, 34);
  poly(sH, Sd, [[2.3, 1.62], [0.0, 1.6]], 0.009, 38);
  // верхняя кромка капота (θ = 110°) и крепёж
  const cowlEdge = zs(COWL.x1, COWL.x0, 12).map((x) => [x, nacY(x, COWL.t0)]);
  poly(sH, Sd, cowlEdge, 0.011, 30);
  screws(sH, Sd, cowlEdge.map(([x, y]) => [x, y + 0.03]), 0.09, 0.009);
  poly(sH, Sd, [[COWL.x1, nacY(0, COWL.t0)], [COWL.x1, nacY(0, Math.PI)]], 0.011, 30);
  poly(sH, Sd, [[COWL.x0, nacY(COWL.x0, COWL.t0)], [COWL.x0, nacY(COWL.x0, Math.PI)]], 0.011, 30);
  for (const x of [-1.4, -2.9]) poly(sH, Sd, [[x, nacY(x, COWL.t0)], [x, nacY(x, Math.PI * 0.95)]], 0.008, 44);
  for (const x of [-4.8, -5.8]) poly(sH, Sd, [[x, nacY(x, Math.PI * 0.95)], [x, nacY(x, Math.PI * 0.35)]], 0.009, 36);
  // кили: руль направления, лонжероны
  {
    const c = Math.cos(FIN.cant), fy = (sv) => FIN.y0 + sv * c;
    const finAt = (sv) => { const S = FIN.sections; let i = 0; while (i < S.length - 2 && S[i + 1].s < sv) i++; const a = S[i], b = S[i + 1], k = (sv - a.s) / (b.s - a.s); return { le: a.le + (b.le - a.le) * k, c: a.c + (b.c - a.c) * k }; };
    const r0 = 0.28, r1 = 1.95;
    const hinge = zs(r0, r1, 6).map((sv) => { const f = finAt(sv); return [f.le - f.c * 0.72, fy(sv)]; });
    poly(sH, Sd, [[finAt(r0).le - finAt(r0).c, fy(r0)], ...hinge, [finAt(r1).le - finAt(r1).c, fy(r1)]], 0.011, 28);
    for (const k of [0.15, 0.45]) dots(sH, Sd, zs(0.1, 2.15, 8).map((sv) => { const f = finAt(sv); return [f.le - f.c * k, fy(sv)]; }), 0.045, 0.006, 150);
    for (const sv of [0.6, 1.3]) dots(sH, Sd, [[finAt(sv).le, fy(sv)], [finAt(sv).le - finAt(sv).c * 0.72, fy(sv)]], 0.045, 0.006, 150);
    poly(sH, Sd, [[finAt(0.12).le - 0.05, fy(0.12)], [finAt(0.12).le - finAt(0.12).c, fy(0.12)]], 0.009, 36);
    panel(sH, Sd, -4.8, fy(0.35), -5.25, fy(0.7), { scr: 0.05 });
    // потёртости передней кромки киля
    poly(sWr, Sd, zs(0, 2.2, 8).map((sv) => [finAt(sv).le - 0.01, fy(sv)]), 0.03, 160);
  }
  // отсек пушки и лючки хребта
  panel(sH, Sd, 2.7, 2.18, 2.1, 2.34, { scr: 0.05 });
  poly(sH, Sd, [[5.0, 2.6], [2.62, 2.66]], 0.009, 40);

  /* ═════════ ГРЯЗЬ, ПОТЁРТОСТИ, КОПОТЬ ═════════ */
  const splat = (g, w, h, cells, seed, alpha, scale = 1) => {
    const n = noiseField(128, Math.max(16, Math.round(128 * h / w)), cells, 5, seed);
    const s = canvas(128, Math.max(16, Math.round(128 * h / w))), sg = s.getContext("2d"), id = sg.createImageData(s.width, s.height);
    for (let i = 0; i < n.length; i++) { const v = Math.max(0, (n[i] - 0.45) * 2.4) * 255 * scale; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    sg.putImageData(id, 0, 0); g.globalAlpha = alpha; g.globalCompositeOperation = "lighter"; g.drawImage(s, 0, 0, w, h); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
  };
  splat(pGr, PW, PH, 10, 601, 0.8); splat(sGr, SW, SH, 12, 602, 0.8);
  // потёки назад по потоку от крепежа и швов
  const streaks = (g, map, n, xr, ar, len, a0) => {
    for (let i = 0; i < n; i++) {
      const x = xr[0] + rnd() * (xr[1] - xr[0]), a = ar[0] + rnd() * (ar[1] - ar[0]), l = len * (0.3 + rnd());
      const [p0, q0] = map(x, a), [p1] = map(x - l, a);
      const gr = g.createLinearGradient(p0, 0, p1, 0); gr.addColorStop(0, `rgba(255,255,255,${a0})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(p1, q0 - M(0.008 + rnd() * 0.02), p0 - p1, M(0.016 + rnd() * 0.03));
    }
  };
  streaks(sGr, Sd, 260, [-6, 6], [1.2, 2.8], 0.8, 0.35);
  streaks(pGr, P, 220, [-6, 5], [-5.5, 5.5], 0.7, 0.3);
  // грязь у ниш шасси и гидроотсека, потёки АМГ-10
  for (const [x, z, r] of [[-0.6, 0, 0.9], [2.8, 0, 0.6], [-0.75, 1.6, 0.5], [-0.75, -1.6, 0.5]]) {
    const [a, b] = P(x, z), gr = pGr.createRadialGradient(a, b, 0, a, b, M(r)); gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    pGr.fillStyle = gr; pGr.fillRect(a - M(r), b - M(r), M(2 * r), M(2 * r));
  }
  // потёртости: передние кромки, дорожки у кабины, края люков
  for (const s of [1, -1]) {
    poly(pWr, P, zs(1.95, 5.6, 16).map((z) => [wingAt(z).le - 0.012, z * s]), 0.035, 150);
    poly(pWr, P, zs(1.62, 3.85, 8).map((z) => [stabAt(z).le - 0.01, z * s]), 0.03, 150);
    poly(pWr, P, [[4.9, 0.6 * s], [4.2, 0.72 * s], [3.4, 0.9 * s], [2.6, 1.12 * s], [1.8, 1.4 * s], [1.2, 1.68 * s], [0.75, 1.95 * s]], 0.03, 120);
    for (let i = 0; i < 420; i++) { const x = 0.3 + rnd() * 2.6, z = (0.55 + rnd() * 0.9) * s; pWr.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.6})`; const [a, b] = P(x, z); pWr.fillRect(a, b, 1 + rnd() * M(0.012), 1 + rnd() * M(0.008)); }
    for (let i = 0; i < 160; i++) { const x = 0.0 + rnd() * 2.2, z = (0.55 + rnd() * 1.1) * s; pGr.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.4})`; const [a, b] = P(x, z); pGr.beginPath(); pGr.ellipse(a, b, M(0.05 + rnd() * 0.08), M(0.03 + rnd() * 0.05), rnd() * 3, 0, 7); pGr.fill(); }
  }
  // губы воздухозаборников (борт)
  poly(sWr, Sd, [[2.6, 2.14], [2.2, 1.12]], 0.03, 170);
  // копоть: сопла, пушка
  {
    const [a0, b0] = Sd(-6.2, 1.56), [a1] = Sd(-8.2, 1.56);
    const gr = sSo.createLinearGradient(a0, 0, a1, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,.35)"); gr.addColorStop(1, "rgba(255,255,255,.75)");
    sSo.fillStyle = gr; sSo.fillRect(a1, b0 - M(0.6), a0 - a1, M(1.1));
    const [c0, d0] = Sd(2.6, 2.26); const g2 = sSo.createRadialGradient(c0, d0, 0, c0, d0, M(0.7));
    g2.addColorStop(0, "rgba(255,255,255,.7)"); g2.addColorStop(1, "rgba(255,255,255,0)"); sSo.fillStyle = g2; sSo.save(); sSo.translate(c0, d0); sSo.scale(1.8, 0.35); sSo.translate(-c0, -d0);
    sSo.beginPath(); sSo.arc(c0 - M(0.35), d0, M(0.7), 0, 7); sSo.fill(); sSo.restore();
  }
  // полос копоти на верхней стороне хвостовых балок
  { const [a0, b0] = P(-6.0, -1.3), [a1, b1] = P(-8.2, 1.3); const gr = pGr.createLinearGradient(a0, 0, a1, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(255,255,255,.55)"); pGr.fillStyle = gr; pGr.fillRect(a1, b0, a0 - a1, b1 - b0); }

  /* ═════════ сборка RGBA ═════════ */
  const pack = (cs, w, h) => {
    const out = new Uint8Array(w * h * 4);
    const ds = cs.map((g) => g.getImageData(0, 0, w, h).data);
    for (let i = 0, n = w * h; i < n; i++) { out[i * 4] = ds[0][i * 4]; out[i * 4 + 1] = ds[1][i * 4]; out[i * 4 + 2] = ds[2][i * 4]; out[i * 4 + 3] = ds[3][i * 4]; }
    return out;
  };
  const plan = dataTex(pack([topH, botH, pGr, pWr], PW, PH), PW, PH, { clamp: true });
  const side = dataTex(pack([sH, sGr, sSo, sWr], SW, SH), SW, SH, { clamp: true });
  plan.premultiplyAlpha = false; side.premultiplyAlpha = false;
  PAINT.plan = plan; PAINT.side = side;
  PAINT.planBox.set(PX0, PZ0, 1 / (PX1 - PX0), 1 / (PZ1 - PZ0));
  PAINT.sideBox.set(SX0, SY0, 1 / (SX1 - SX0), 1 / (SY1 - SY0));
  buildMarkings();
  void sePoint; void DEG; void THREE;
  return { plan, side };
}

/* ═════════ маркировка: флаг Республики Беларусь и бортовой номер ═════════ */
const ORN = [
  "......X......", ".....XXX.....", "....XX.XX....", "...XX.X.XX...", "..XX.XXX.XX..", ".XX.XX.XX.XX.", "XX.XX...XX.XX",
  ".XX.XX.XX.XX.", "..XX.XXX.XX..", "...XX.X.XX...", "....XX.XX....", ".....XXX.....", "......X......",
  "X...........X", "XX.........XX", ".XX.......XX.", "..XX.....XX..", ".XX.......XX.", "XX.........XX", "X...........X",
];
function drawFlag(g, x0, y0, W, H) {
  const RED = "#c8313e", GRN = "#4a9e55";
  g.fillStyle = RED; g.fillRect(x0, y0, W, H * 2 / 3);
  g.fillStyle = GRN; g.fillRect(x0, y0 + H * 2 / 3, W, H / 3);
  // орнамент у древка: белая полоса 1/9 длины с красным узором
  const bw = W / 9; g.fillStyle = "#f4f2ec"; g.fillRect(x0, y0, bw, H);
  const cell = (bw * 0.9) / 13, ox = x0 + bw * 0.05, rows = ORN.length, rep = Math.ceil(H / (rows * cell)) + 1;
  g.fillStyle = RED;
  for (let r = 0; r < rep * rows; r++) {
    const row = ORN[r % rows], y = y0 + r * cell - cell * 3;
    for (let c = 0; c < 13; c++) if (row[c] === "X" && y >= y0 && y + cell <= y0 + H) g.fillRect(ox + c * cell, y, cell + 0.4, cell + 0.4);
  }
}
let MARK = null;
function buildMarkings() {
  const c = canvas(1024, 256), g = c.getContext("2d");
  g.clearRect(0, 0, 1024, 256);
  drawFlag(g, 0, 0, 512, 256);
  MARK = { c, g, tex: null };
  drawBort("23");
  MARK.tex = texFromCanvas(c, { clamp: true });
  PAINT.mark = MARK.tex;
}
/* бортовой номер: синие цифры с белой окантовкой */
export function drawBort(txt) {
  if (!MARK) return;
  const g = MARK.g;
  g.clearRect(512, 0, 512, 256);
  g.save(); g.translate(768, 136);
  g.font = "bold 210px 'Russo One', 'Arial Black', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineJoin = "round"; g.lineWidth = 20; g.strokeStyle = "#eef1f2"; g.strokeText(txt, 0, 0);
  g.fillStyle = "#1d3f8a"; g.fillText(txt, 0, 0);
  g.restore();
  if (MARK.tex) MARK.tex.needsUpdate = true;
}
