/* Процедурные текстуры: шум, карты нормалей из высот, материалы ангара и самолёта.
   Всё рисуется на canvas / в типизированные массивы при загрузке — внешних файлов нет. */
import * as THREE from "three";

export const TEX = { aniso: 8, scale: 1 };           // scale: 0.5 на слабых устройствах

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- периодический value-noise ---------- */
export function makeNoise(seed = 1) {
  const rnd = mulberry32(seed);
  const V = new Float32Array(256), P = new Uint8Array(512);
  for (let i = 0; i < 256; i++) { V[i] = rnd(); P[i] = i; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = P[i]; P[i] = P[j]; P[j] = t; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  function n2(x, y, px = 256, py = 256) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const a = V[P[P[x0 & 255] + (y0 & 255)]], b = V[P[P[x1 & 255] + (y0 & 255)]];
    const c = V[P[P[x0 & 255] + (y1 & 255)]], d = V[P[P[x1 & 255] + (y1 & 255)]];
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  }
  function fbm(x, y, oct = 4, px = 256, py = 256) {
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let o = 0; o < oct; o++) { s += amp * n2(x * f, y * f, px * f, py * f); n += amp; amp *= 0.5; f *= 2; }
    return s / n;
  }
  return { n2, fbm, rnd };
}

/* заполняет Float32Array значениями fbm; cells — число ячеек шума по ширине (текстура тайлится) */
export function noiseField(w, h, cells, oct, seed, cellsY) {
  const N = makeNoise(seed), out = new Float32Array(w * h);
  const cy = cellsY || Math.round(cells * h / w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    out[y * w + x] = N.fbm((x / w) * cells, (y / h) * cy, oct, cells, cy);
  return out;
}

export function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

export function texFromCanvas(c, { srgb = true, repeat = null, clamp = false, mips = true, flipY = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.flipY = flipY;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = TEX.aniso;
  if (!clamp) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return t;
}

export function dataTex(data, w, h, { srgb = false, repeat = null, clamp = false } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = TEX.aniso; t.flipY = false;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

/* карта нормалей (tangent space, OpenGL) из поля высот */
export function heightToNormal(H, w, h, strength = 2, wrap = true) {
  const out = new Uint8Array(w * h * 4);
  const at = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = Math.max(0, Math.min(w - 1, x)); y = Math.max(0, Math.min(h - 1, y)); }
    return H[y * w + x];
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    // строки массива идут по +v (flipY=false), нормаль в конвенции OpenGL
    let nx = -dx, ny = -dy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    out[i] = (nx * 0.5 + 0.5) * 255; out[i + 1] = (ny * 0.5 + 0.5) * 255; out[i + 2] = (nz * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return out;
}

export function canvasToFloat(c, channel = 0) {
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, out = new Float32Array(c.width * c.height);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + channel] / 255;
  return out;
}

/* ORM-упаковка: R=AO, G=roughness, B=metalness */
export function ormTex(rough, metal, w, h, opts) {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = 255;
    out[i * 4 + 1] = Math.max(0, Math.min(255, rough[i] * 255));
    out[i * 4 + 2] = Math.max(0, Math.min(255, (metal ? metal[i] : 0) * 255));
    out[i * 4 + 3] = 255;
  }
  return dataTex(out, w, h, opts);
}

const sz = (n) => Math.max(64, Math.round(n * TEX.scale));

/* кляксы (пятна масла, грязь): неровные пятна из нескольких радиальных градиентов */
function blot(g, x, y, r, col, a, rnd) {
  for (let k = 0; k < 7; k++) {
    const ox = x + (rnd() - 0.5) * r, oy = y + (rnd() - 0.5) * r, rr = r * (0.35 + rnd() * 0.6);
    const gr = g.createRadialGradient(ox, oy, 0, ox, oy, rr);
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(ox, oy, rr, 0, Math.PI * 2); g.fill();
  }
}
/* рисование с учётом тайлинга: дублирует фигуру по краям */
function tiled(w, h, x, y, r, fn) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
    if (x + dx + r < 0 || x + dx - r > w || y + dy + r < 0 || y + dy - r > h) continue;
    fn(x + dx, y + dy);
  }
}

/* ══════════ пол ангара: полимерное покрытие по бетону, плита 6×6 м ══════════ */
export function floorSet() {
  const S = sz(2048), rnd = mulberry32(71);
  const col = canvas(S, S), gc = col.getContext("2d");
  const rou = canvas(S, S), gr = rou.getContext("2d");
  const hei = canvas(S, S), gh = hei.getContext("2d");
  // базовый цвет с пятнистостью
  const n1 = noiseField(256, 256, 6, 5, 11), n2 = noiseField(256, 256, 24, 3, 12);
  const small = canvas(256, 256), sg = small.getContext("2d"), id = sg.createImageData(256, 256);
  for (let i = 0; i < 65536; i++) {
    const v = 0.93 + (n1[i] - 0.5) * 0.16 + (n2[i] - 0.5) * 0.06;
    id.data[i * 4] = 128 * v; id.data[i * 4 + 1] = 132 * v; id.data[i * 4 + 2] = 133 * v; id.data[i * 4 + 3] = 255;
  }
  sg.putImageData(id, 0, 0);
  gc.imageSmoothingEnabled = true; gc.drawImage(small, 0, 0, S, S);
  // мелкий заполнитель (крапинки)
  const spk = (S * S) / 90;
  for (let i = 0; i < spk; i++) {
    const v = rnd() < 0.5 ? 90 + rnd() * 30 : 150 + rnd() * 40;
    gc.fillStyle = `rgba(${v},${v + 2},${v + 3},${0.08 + rnd() * 0.12})`;
    const s = 1 + rnd() * 2.2; gc.fillRect(rnd() * S, rnd() * S, s, s);
  }
  // шероховатость: базовая + вариации
  gr.fillStyle = "rgb(0,76,0)"; gr.fillRect(0, 0, S, S);
  const rsm = canvas(256, 256), rg = rsm.getContext("2d"), rid = rg.createImageData(256, 256);
  for (let i = 0; i < 65536; i++) { const v = 62 + (n1[(i * 7) % 65536] - 0.5) * 60 + (n2[i] - 0.5) * 30; rid.data[i * 4 + 1] = v; rid.data[i * 4 + 3] = 255; }
  rg.putImageData(rid, 0, 0); gr.drawImage(rsm, 0, 0, S, S);
  // высоты: «апельсиновая корка»
  gh.fillStyle = "rgb(128,128,128)"; gh.fillRect(0, 0, S, S);
  const hn = noiseField(256, 256, 64, 2, 13), hid = gh.createImageData(256, 256);
  for (let i = 0; i < 65536; i++) { const v = 128 + (hn[i] - 0.5) * 10; hid.data[i * 4] = hid.data[i * 4 + 1] = hid.data[i * 4 + 2] = v; hid.data[i * 4 + 3] = 255; }
  const hs = canvas(256, 256); hs.getContext("2d").putImageData(hid, 0, 0);
  gh.globalAlpha = 1; gh.drawImage(hs, 0, 0, S, S);
  // следы шин (дуги)
  for (let i = 0; i < 14; i++) {
    const x = rnd() * S, y = rnd() * S, r = S * (0.3 + rnd() * 1.2), a0 = rnd() * Math.PI * 2, len = 0.15 + rnd() * 0.35, wdt = S * (0.01 + rnd() * 0.012);
    for (const [g2, style] of [[gc, `rgba(48,48,50,${0.025 + rnd() * 0.035})`], [gr, `rgba(0,140,0,${0.1})`]]) {
      g2.strokeStyle = style; g2.lineWidth = wdt; g2.lineCap = "round";
      tiled(S, S, x, y, r + wdt, (tx, ty) => { g2.beginPath(); g2.arc(tx - Math.cos(a0) * r, ty - Math.sin(a0) * r, r, a0, a0 + len); g2.stroke(); });
    }
  }
  // масляные пятна и потёки
  for (let i = 0; i < 14; i++) {
    const x = rnd() * S, y = rnd() * S, r = S * (0.02 + rnd() * 0.07);
    tiled(S, S, x, y, r * 2, (tx, ty) => {
      blot(gc, tx, ty, r, "38,32,26", 0.05 + rnd() * 0.08, rnd);
      blot(gr, tx, ty, r * 0.9, "0,18,0", 0.25, rnd);
    });
  }
  // затёртые участки (светлее и шершавее)
  for (let i = 0; i < 10; i++) {
    const x = rnd() * S, y = rnd() * S, r = S * (0.05 + rnd() * 0.1);
    tiled(S, S, x, y, r * 2, (tx, ty) => { blot(gc, tx, ty, r, "170,172,170", 0.05, rnd); blot(gr, tx, ty, r, "0,140,0", 0.12, rnd); });
  }
  // трещины
  gc.lineCap = gh.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    let x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2;
    const pts = [[x, y]];
    for (let k = 0; k < 40; k++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * S * 0.006; y += Math.sin(a) * S * 0.006; pts.push([x, y]); }
    for (const [g2, style, lw] of [[gc, "rgba(40,42,44,.55)", 1.4], [gh, "rgb(60,60,60)", 2]]) {
      g2.strokeStyle = style; g2.lineWidth = lw * S / 2048; g2.beginPath(); pts.forEach(([px, py], j) => j ? g2.lineTo(px, py) : g2.moveTo(px, py)); g2.stroke();
    }
  }
  // деформационные швы по краям плиты
  const jw = Math.max(2, S * 0.0035);
  for (const g2 of [gc, gh, gr]) {
    g2.fillStyle = g2 === gc ? "rgba(52,54,55,.95)" : g2 === gh ? "rgb(20,20,20)" : "rgb(0,230,0)";
    g2.fillRect(0, 0, S, jw); g2.fillRect(0, 0, jw, S);
    if (g2 === gc) { g2.fillStyle = "rgba(90,92,93,.6)"; g2.fillRect(0, jw, S, jw * 0.8); g2.fillRect(jw, 0, jw * 0.8, S); }
  }
  const H = canvasToFloat(hei);
  const nrm = dataTex(heightToNormal(H, S, S, 3.2), S, S);
  const rough = canvasToFloat(rou, 1);
  return { map: texFromCanvas(col, { flipY: false }), orm: ormTex(rough, null, S, S), normal: nrm };
}

/* крупномасштабная неоднородность пола (без повторов) — грязь, потёртости, дорожки тягача */
export function floorMacro(W = 72, D = 48) {
  const w = sz(512), h = Math.round(w * D / W), rnd = mulberry32(5);
  const c = canvas(w, h), g = c.getContext("2d");
  const n = noiseField(128, 96, 5, 4, 21);
  const s = canvas(128, 96), sg = s.getContext("2d"), id = sg.createImageData(128, 96);
  for (let i = 0; i < n.length; i++) { const v = 128 + (n[i] - 0.5) * 120; id.data[i * 4] = v; id.data[i * 4 + 1] = 128 + (n[(i * 13) % n.length] - 0.5) * 140; id.data[i * 4 + 2] = 0; id.data[i * 4 + 3] = 255; }
  sg.putImageData(id, 0, 0); g.drawImage(s, 0, 0, w, h);
  // R: яркость (грязь), G: шероховатость. Дорожка от ворот (+X) к центру
  const X = (x) => (x / W + 0.5) * w, Z = (z) => (z / D + 0.5) * h;
  for (const zz of [-1.6, 1.6]) {
    const gr = g.createLinearGradient(X(8), 0, X(36), 0);
    gr.addColorStop(0, "rgba(90,150,0,0)"); gr.addColorStop(0.3, "rgba(90,150,0,.35)"); gr.addColorStop(1, "rgba(90,150,0,.5)");
    g.fillStyle = gr; g.fillRect(X(8), Z(zz - 0.5), X(36) - X(8), Z(0.5) - Z(-0.5));
  }
  for (let i = 0; i < 30; i++) blot(g, rnd() * w, rnd() * h, w * (0.01 + rnd() * 0.03), "70,100,0", 0.18, rnd);
  const t = texFromCanvas(c, { srgb: false, clamp: true });
  return t;
}

/* ══════════ профлист стен (трапециевидный профиль), тайл 2×2 м ══════════ */
export function corrugatedSet(color = [184, 190, 194]) {
  const w = sz(512), h = sz(512), rnd = mulberry32(3);
  const H = new Float32Array(w * h);
  const pitch = w / 10; // 10 гофр на 2 м
  for (let x = 0; x < w; x++) {
    const p = (x % pitch) / pitch;
    const v = p < 0.35 ? 1 : p < 0.5 ? 1 - (p - 0.35) / 0.15 : p < 0.85 ? 0 : (p - 0.85) / 0.15;
    for (let y = 0; y < h; y++) H[y * w + x] = v * 0.5;
  }
  const nrm = dataTex(heightToNormal(H, w, h, 6), w, h);
  const c = canvas(w, h), g = c.getContext("2d");
  g.fillStyle = `rgb(${color})`; g.fillRect(0, 0, w, h);
  const n = noiseField(64, 64, 4, 3, 31), s = canvas(64, 64), sg = s.getContext("2d"), id = sg.createImageData(64, 64);
  for (let i = 0; i < 4096; i++) { const v = (n[i] - 0.5) * 60; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 128 + v; id.data[i * 4 + 3] = 40; }
  sg.putImageData(id, 0, 0); g.globalCompositeOperation = "overlay"; g.drawImage(s, 0, 0, w, h); g.globalCompositeOperation = "source-over";
  // потёки сверху вниз
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w, l = h * (0.2 + rnd() * 0.8), gr = g.createLinearGradient(0, 0, 0, l);
    gr.addColorStop(0, "rgba(60,58,52,.18)"); gr.addColorStop(1, "rgba(60,58,52,0)");
    g.fillStyle = gr; g.fillRect(x, 0, 1 + rnd() * 3, l);
  }
  const rough = new Float32Array(w * h).fill(0.42);
  for (let i = 0; i < rough.length; i++) rough[i] += (n[(i >> 3) % 4096] - 0.5) * 0.2;
  return { map: texFromCanvas(c, { flipY: false }), normal: nrm, orm: ormTex(rough, new Float32Array(w * h).fill(0.35), w, h) };
}

/* ══════════ окрашенный металл общего назначения: царапины, потёртости ══════════ */
export function paintedMetalSet() {
  const S = sz(1024), rnd = mulberry32(8);
  const hei = canvas(S, S), gh = hei.getContext("2d");
  const rou = canvas(S, S), gr = rou.getContext("2d");
  const alb = canvas(S, S), ga = alb.getContext("2d");
  gh.fillStyle = "rgb(128,128,128)"; gh.fillRect(0, 0, S, S);
  gr.fillStyle = "rgb(0,105,0)"; gr.fillRect(0, 0, S, S);
  ga.fillStyle = "rgb(255,255,255)"; ga.fillRect(0, 0, S, S);
  const n = noiseField(128, 128, 5, 4, 41), s = canvas(128, 128), sg = s.getContext("2d"), id = sg.createImageData(128, 128);
  for (let i = 0; i < n.length; i++) { const v = 128 + (n[i] - 0.5) * 90; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  sg.putImageData(id, 0, 0);
  gr.globalAlpha = 0.35; gr.drawImage(s, 0, 0, S, S); gr.globalAlpha = 1;
  ga.globalAlpha = 0.18; ga.globalCompositeOperation = "multiply"; ga.drawImage(s, 0, 0, S, S); ga.globalCompositeOperation = "source-over"; ga.globalAlpha = 1;
  // царапины
  for (let i = 0; i < 260; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, l = S * (0.01 + rnd() * 0.08);
    const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
    gh.strokeStyle = "rgba(90,90,90,.6)"; gh.lineWidth = 1; gh.beginPath(); gh.moveTo(x, y); gh.lineTo(x2, y2); gh.stroke();
    gr.strokeStyle = "rgba(0,60,0,.5)"; gr.beginPath(); gr.moveTo(x, y); gr.lineTo(x2, y2); gr.stroke();
    ga.strokeStyle = "rgba(210,210,210,.35)"; ga.beginPath(); ga.moveTo(x, y); ga.lineTo(x2, y2); ga.stroke();
  }
  // сколы
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S, r = 1 + rnd() * S * 0.006;
    ga.fillStyle = "rgba(120,120,120,.55)"; ga.beginPath(); ga.ellipse(x, y, r * 1.6, r, rnd() * 3, 0, 7); ga.fill();
    gh.fillStyle = "rgba(100,100,100,.7)"; gh.beginPath(); gh.ellipse(x, y, r * 1.6, r, rnd() * 3, 0, 7); gh.fill();
  }
  const H = canvasToFloat(hei);
  const hn = noiseField(S / 4, S / 4, 96, 1, 42);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) H[y * S + x] += hn[((y >> 2) * (S / 4)) + (x >> 2)] * 0.04;
  return { normal: dataTex(heightToNormal(H, S, S, 1.6), S, S), orm: ormTex(canvasToFloat(rou, 1), null, S, S), albedo: texFromCanvas(alb, { flipY: false }) };
}

/* ══════════ шлифованный/анизотропный металл ══════════ */
export function brushedSet() {
  const w = sz(512), h = sz(512), rnd = mulberry32(9);
  const R = new Float32Array(w * h), H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let v = 0;
    for (let x = 0; x < w; x++) { if (x % 3 === 0) v = rnd(); const i = y * w + x; R[i] = 0.22 + v * 0.12; H[i] = v * 0.15; }
  }
  return { normal: dataTex(heightToNormal(H, w, h, 1), w, h), orm: ormTex(R, new Float32Array(w * h).fill(1), w, h) };
}

/* ══════════ протектор шины (u — по окружности, v — поперёк) ══════════ */
export function tireSet() {
  const w = sz(1024), h = sz(128);
  const H = new Float32Array(w * h), R = new Float32Array(w * h);
  const n = noiseField(w / 4, h / 4, 32, 2, 51, 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = y / h; let hh = 1;
    for (const gpos of [0.3, 0.44, 0.56, 0.7]) if (Math.abs(v - gpos) < 0.022) hh = 0.1;
    if (v < 0.12 || v > 0.88) hh = 0.8 - Math.abs(v - 0.5) * 0.4;
    const i = y * w + x; H[i] = hh * 0.6 + n[((y >> 2) * (w >> 2)) + (x >> 2)] * 0.05; R[i] = 0.82 + (hh < 0.5 ? 0.1 : 0) - n[((y >> 2) * (w >> 2)) + (x >> 2)] * 0.1;
  }
  return { normal: dataTex(heightToNormal(H, w, h, 5), w, h), orm: ormTex(R, null, w, h) };
}

/* ══════════ цвета побежалости титанового сопла (u — вдоль оси, v — по окружности) ══════════ */
export function heatTintSet() {
  const w = sz(512), h = sz(512);
  const c = canvas(w, h), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, w, 0);
  // от мотогондолы (u=0) к срезу сопла (u=1)
  gr.addColorStop(0, "#5a5957"); gr.addColorStop(0.25, "#625d55"); gr.addColorStop(0.4, "#6b6152");
  gr.addColorStop(0.55, "#5b5a60"); gr.addColorStop(0.68, "#56596a"); gr.addColorStop(0.85, "#606163"); gr.addColorStop(1, "#484643");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const n = noiseField(64, 64, 6, 4, 61, 6), s = canvas(64, 64), sg = s.getContext("2d"), id = sg.createImageData(64, 64);
  for (let i = 0; i < 4096; i++) { const v = 128 + (n[i] - 0.5) * 140; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 70; }
  sg.putImageData(id, 0, 0); g.globalCompositeOperation = "overlay"; g.drawImage(s, 0, 0, w, h); g.globalCompositeOperation = "source-over";
  // продольные полосы нагара
  const rnd = mulberry32(62);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(30,26,22,${0.05 + rnd() * 0.12})`; g.fillRect(w * (0.3 + rnd() * 0.7), rnd() * h, w, 1 + rnd() * 3); }
  const R = new Float32Array(w * h), M = new Float32Array(w * h).fill(0.85);
  for (let i = 0; i < R.length; i++) R[i] = 0.38 + (n[((i / w | 0) >> 3) * 64 + ((i % w) >> 3)] - 0.5) * 0.25;
  return { map: texFromCanvas(c, { flipY: false }), orm: ormTex(R, M, w, h) };
}

/* ══════════ цифровой камуфляж ВВС Беларуси (тайл) ══════════ */
export function digitalCamo() {
  const S = sz(1024), rnd = mulberry32(2029);
  const c = canvas(S, S), g = c.getContext("2d");
  const cols = ["#7f8b95", "#5e6b78", "#9aa5ad", "#48535e"];
  g.fillStyle = cols[0]; g.fillRect(0, 0, S, S);
  const R = 96, cell = S / R; // «пиксель» камуфляжа ≈ 5 см при тайле 5 м
  const N = makeNoise(77);
  for (let li = 1; li < 4; li++) {
    const sc = [0, 3, 4, 5][li], th = [0, 0.56, 0.6, 0.64][li];
    g.fillStyle = cols[li];
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      const v = N.fbm((x / R) * sc + li * 17.3, (y / R) * sc + li * 7.1, 4, sc, sc) + (rnd() - 0.5) * 0.05;
      if (v > th) g.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
    }
  }
  // «рваные» границы пятен: одиночные пиксели соседних тонов
  for (let i = 0; i < 500; i++) { g.fillStyle = cols[1 + Math.floor(rnd() * 3)]; const x = Math.floor(rnd() * R), y = Math.floor(rnd() * R); g.fillRect(x * cell, y * cell, cell, cell); }
  // лёгкая неоднородность краски
  const n = noiseField(64, 64, 8, 3, 78), s = canvas(64, 64), sg = s.getContext("2d"), id = sg.createImageData(64, 64);
  for (let i = 0; i < 4096; i++) { const v = 128 + (n[i] - 0.5) * 50; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 50; }
  sg.putImageData(id, 0, 0); g.globalCompositeOperation = "overlay"; g.drawImage(s, 0, 0, S, S); g.globalCompositeOperation = "source-over";
  return texFromCanvas(c);
}

/* ══════════ ткань (саржа) для комбинезона ══════════ */
export function fabricSet() {
  const w = sz(256), h = sz(256);
  const H = new Float32Array(w * h);
  const n = noiseField(w, h, 32, 2, 81);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = 0.5 + 0.35 * Math.sin((x + y) * Math.PI / 2) * 0.5 + n[y * w + x] * 0.3;
  const R = new Float32Array(w * h).fill(0.9);
  return { normal: dataTex(heightToNormal(H, w, h, 1.2), w, h), orm: ormTex(R, null, w, h) };
}

/* ══════════ бетон перрона (плиты ПАГ 2×6 м) ══════════ */
export function apronSet() {
  const S = sz(1024), rnd = mulberry32(91);
  const c = canvas(S, S), g = c.getContext("2d");
  const n = noiseField(256, 256, 8, 5, 92), s = canvas(256, 256), sg = s.getContext("2d"), id = sg.createImageData(256, 256);
  for (let i = 0; i < 65536; i++) { const v = 0.92 + (n[i] - 0.5) * 0.3; id.data[i * 4] = 150 * v; id.data[i * 4 + 1] = 151 * v; id.data[i * 4 + 2] = 147 * v; id.data[i * 4 + 3] = 255; }
  sg.putImageData(id, 0, 0); g.drawImage(s, 0, 0, S, S);
  for (let i = 0; i < S * S / 60; i++) { const v = 100 + rnd() * 100; g.fillStyle = `rgba(${v},${v},${v},.15)`; g.fillRect(rnd() * S, rnd() * S, 2, 2); }
  for (let i = 0; i < 8; i++) blot(g, rnd() * S, rnd() * S, S * 0.05, "60,56,50", 0.06, rnd);
  // швы плит, заполненные мастикой
  g.fillStyle = "rgba(35,35,33,.9)"; const jw = Math.max(2, S * 0.004);
  g.fillRect(0, 0, S, jw); g.fillRect(0, S / 3, S, jw); g.fillRect(0, (2 * S) / 3, S, jw); g.fillRect(0, 0, jw, S);
  const H = new Float32Array(S * S);
  const cd = g.getImageData(0, 0, S, S).data;
  for (let i = 0; i < H.length; i++) H[i] = cd[i * 4] / 255;
  const R = new Float32Array(S * S);
  for (let i = 0; i < R.length; i++) R[i] = 0.78 + (1 - H[i]) * 0.15;
  return { map: texFromCanvas(c, { flipY: false }), normal: dataTex(heightToNormal(H, S, S, 1.5), S, S), orm: ormTex(R, null, S, S) };
}

/* ══════════ трава / грунт вдали ══════════ */
export function grassTex() {
  const S = sz(512), c = canvas(S, S), g = c.getContext("2d"), rnd = mulberry32(93);
  const n = noiseField(128, 128, 8, 4, 94), s = canvas(128, 128), sg = s.getContext("2d"), id = sg.createImageData(128, 128);
  for (let i = 0; i < n.length; i++) { const v = n[i]; id.data[i * 4] = 70 + v * 40; id.data[i * 4 + 1] = 92 + v * 45; id.data[i * 4 + 2] = 48 + v * 18; id.data[i * 4 + 3] = 255; }
  sg.putImageData(id, 0, 0); g.drawImage(s, 0, 0, S, S);
  for (let i = 0; i < S * 30; i++) { const v = rnd(); g.fillStyle = `rgba(${60 + v * 70},${85 + v * 70},${40 + v * 25},.35)`; g.fillRect(rnd() * S, rnd() * S, 1, 2 + rnd() * 3); }
  return texFromCanvas(c);
}

/* ══════════ дерево (верстак), картон ══════════ */
export function woodTex() {
  const w = sz(512), h = sz(512), c = canvas(w, h), g = c.getContext("2d"), rnd = mulberry32(95);
  g.fillStyle = "#8a6a45"; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 1) { const v = Math.sin(y * 0.09 + Math.sin(y * 0.013) * 6) * 0.5 + 0.5; g.fillStyle = `rgba(60,38,20,${v * 0.18})`; g.fillRect(0, y, w, 1); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,30,20,${0.1 + rnd() * 0.2})`; g.fillRect(rnd() * w, rnd() * h, w * 0.3, 1); }
  for (let i = 0; i < 60; i++) blot(g, rnd() * w, rnd() * h, 12, "40,34,28", 0.05, rnd);
  return texFromCanvas(c);
}

/* ══════════ стекло: лёгкие разводы (шероховатость) ══════════ */
export function smudgeOrm() {
  const w = sz(512), h = sz(512), n = noiseField(w, h, 6, 5, 97);
  const R = new Float32Array(w * h);
  for (let i = 0; i < R.length; i++) R[i] = 0.04 + Math.max(0, n[i] - 0.55) * 0.5;
  return ormTex(R, null, w, h);
}

/* ══════════ надписи/таблички ══════════ */
export function textPlate(lines, { w = 1024, h = 256, bg = "#1e2a33", fg = "#e8c04a", flag = true, font = "'Russo One', 'Arial Black', sans-serif", align = "left", pad = 60, border = null } = {}) {
  const c = canvas(w, h), g = c.getContext("2d");
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (border) { g.strokeStyle = border; g.lineWidth = h * 0.05; g.strokeRect(h * 0.03, h * 0.03, w - h * 0.06, h - h * 0.06); }
  if (flag) { g.fillStyle = "#c8313e"; g.fillRect(0, 0, w * 0.025, h * 2 / 3); g.fillStyle = "#48a456"; g.fillRect(0, h * 2 / 3, w * 0.025, h / 3); }
  g.textBaseline = "middle"; g.textAlign = align;
  lines.forEach(([t, size, col], i) => {
    g.font = `${size}px ${font}`; g.fillStyle = col || fg;
    g.fillText(t, align === "center" ? w / 2 : pad, (h / (lines.length + 1)) * (i + 1));
  });
  return c;
}
