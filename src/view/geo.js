/* Геометрический инструментарий: параметрические поверхности, лофтинг сечений,
   аэродинамические поверхности (профиль NACA), тела вращения, слияние геометрий. */
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const TAU = Math.PI * 2;

/* Монотонная кубическая интерполяция параметров по ключам (без перерегулирования). */
export function makeInterp(keys, arg = "x") {
  const ks = [...keys].sort((a, b) => a[arg] - b[arg]);
  const xs = ks.map((k) => k[arg]);
  const names = Object.keys(ks[0]).filter((n) => n !== arg);
  const tang = {};
  for (const n of names) {
    const ys = ks.map((k) => (k[n] !== undefined ? k[n] : ks[0][n]));
    const m = ys.length, d = [], t = new Array(m).fill(0);
    for (let i = 0; i < m - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    t[0] = d[0] || 0; t[m - 1] = d[m - 2] || 0;
    for (let i = 1; i < m - 1; i++) t[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < m - 1; i++) {
      if (d[i] === 0) { t[i] = t[i + 1] = 0; continue; }
      const a = t[i] / d[i], b = t[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * d[i]; t[i + 1] = k * b * d[i]; }
    }
    tang[n] = { ys, t };
  }
  return function (x) {
    const out = {};
    let i = 0;
    if (x <= xs[0]) i = 0; else if (x >= xs[xs.length - 1]) i = xs.length - 2;
    else while (i < xs.length - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], u = Math.max(0, Math.min(1, (x - xs[i]) / h));
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
    for (const n of names) {
      const { ys, t } = tang[n];
      out[n] = h00 * ys[i] + h10 * h * t[i] + h01 * ys[i + 1] + h11 * h * t[i + 1];
    }
    out[arg] = x;
    return out;
  };
}

/* Суперэллипс сечения: θ=0 — верх, θ=π/2 — правый борт (+z), θ=π — низ. */
export function sePoint(p, th) {
  const s = Math.sin(th), c = Math.cos(th);
  const n = c >= 0 ? p.nt : p.nb, h = c >= 0 ? p.ht : p.hb;
  const ns = p.ns || n;
  const z = (p.cz || 0) + p.w * Math.sign(s) * Math.pow(Math.abs(s), 2 / ns);
  const y = p.cy + h * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  return [y, z];
}

/* Универсальная параметрическая сетка: fn(u,v)→[x,y,z]; us, vs — узлы.
   closedV — сшивать по v (кольцо). skip(i,j) — пропустить ячейку (вырезы люков). */
export function gridSurface(fn, us, vs, { closedV = false, skip = null, flip = false } = {}) {
  const nu = us.length, nv = vs.length, cv = closedV ? nv : nv;
  const pos = new Float32Array(nu * nv * 3), uv = new Float32Array(nu * nv * 2);
  let k = 0;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const p = fn(us[i], vs[j], i, j);
    pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
    uv[k * 2] = i / (nu - 1); uv[k * 2 + 1] = j / (closedV ? nv : nv - 1); k++;
  }
  const idx = [];
  const jm = closedV ? cv : nv - 1;
  for (let i = 0; i < nu - 1; i++) for (let j = 0; j < jm; j++) {
    if (skip && skip(i, j)) continue;
    const j1 = (j + 1) % nv;
    const a = i * nv + j, b = (i + 1) * nv + j, c = (i + 1) * nv + j1, d = i * nv + j1;
    if (flip) idx.push(a, d, b, b, d, c); else idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* диапазон значений с шагом + обязательные точки */
export function range(a, b, n, must = []) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  for (const m of must) if ((m - a) * (m - b) <= 0) out.push(m);
  out.sort((p, q) => (a < b ? p - q : q - p));
  return out.filter((v, i) => i === 0 || Math.abs(v - out[i - 1]) > 1e-6);
}
export function angles(n) { const out = []; for (let j = 0; j < n; j++) out.push((j / n) * TAU); return out; }

/* Тело по сечениям-суперэллипсам. sec(x) → {cy,w,ht,hb,nt,nb,cz}. xs — по убыванию (нос→хвост). */
export function sectionBody(sec, xs, N = 64, opts = {}) {
  const th = angles(N);
  return gridSurface((x, t) => { const p = sec(x); const [y, z] = sePoint(p, t); return [x, y, z]; }, xs, th, { closedV: true, ...opts });
}

/* Заплатка-панель на поверхности тела (люк): оболочка толщиной th, смещённая наружу на off. */
export function sectionPatch(sec, x0, x1, t0, t1, { nx = 10, nt = 12, off = 0.004, thick = 0.012 } = {}) {
  const xs = range(x0, x1, nx), ts = range(t0, t1, nt);
  const pt = (x, t, o) => {
    const p = sec(x), [y, z] = sePoint(p, t);
    // нормаль сечения ≈ радиальное направление от центра, достаточно для тонкой панели
    const dy = y - p.cy, dz = z - (p.cz || 0), l = Math.hypot(dy, dz) || 1;
    return [x, y + (dy / l) * o, z + (dz / l) * o];
  };
  const outer = gridSurface((x, t) => pt(x, t, off), xs, ts);
  const inner = gridSurface((x, t) => pt(x, t, off - thick), xs, ts, { flip: true });
  const rim = [];
  const edges = [
    xs.map((x) => [x, ts[0]]), xs.map((x) => [x, ts[ts.length - 1]]).reverse(),
    ts.map((t) => [xs[0], t]).reverse(), ts.map((t) => [xs[xs.length - 1], t]),
  ];
  for (const e of edges) {
    rim.push(gridSurface((s, w) => { const [x, t] = e[s]; return pt(x, t, w ? off : off - thick); }, e.map((_, i) => i), [0, 1], { flip: true }));
  }
  return mergeAll([outer, inner, ...rim]);
}

/* ---------- профили ---------- */
export function nacaT(xc, t) { // полутолщина симметричного профиля NACA 00xx
  return 5 * t * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1036 * xc ** 4);
}

/* Аэродинамическая поверхность. sections: [{s, le, c, off, t}] — s по размаху,
   le — x передней кромки, c — хорда, off — смещение плоскости хорд, t — относит. толщина.
   map(x, off+thick, s) → [x,y,z]. Возвращает замкнутую поверхность с заглушкой на конце. */
export function airfoilSurface(sections, map, { M = 22, capEnd = true, capStart = false, flatTE = 0.004, flip = false } = {}) {
  const cs = [];
  for (let k = 0; k <= M; k++) cs.push((1 - Math.cos((Math.PI * k) / M)) / 2);
  // кольцо: верх от задней кромки к передней, низ от передней к задней
  const ring = [];
  for (let k = M; k >= 0; k--) ring.push([cs[k], 1]);
  for (let k = 1; k < M; k++) ring.push([cs[k], -1]);
  const secs = [...sections];
  const us = secs.map((_, i) => i);
  const rows = secs.map((S) => ring.map(([xc, side]) => {
    const half = Math.max(nacaT(xc, S.t), flatTE * (xc > 0.97 ? 1 : 0)) * S.c;
    return map(S.le - xc * S.c, (S.off || 0) + side * half + (S.camber || 0) * S.c * 4 * xc * (1 - xc), S.s);
  }));
  const all = [];
  if (capStart) rows.unshift(ring.map(([xc]) => { const S = secs[0]; return map(S.le - xc * S.c, S.off || 0, S.s); }));
  if (capEnd) rows.push(ring.map(([xc]) => { const S = secs[secs.length - 1]; return map(S.le - xc * S.c, S.off || 0, S.s); }));
  const ui = rows.map((_, i) => i);
  all.push(gridSurface((i, j) => rows[i][j], ui, ring.map((_, j) => j), { closedV: true, flip }));
  void us;
  return all[0];
}

/* тело вращения вокруг оси X: profile [[x, r], ...] */
export function latheX(profile, seg = 32, { cy = 0, cz = 0, a0 = 0, a1 = TAU, flip = false } = {}) {
  const closed = Math.abs(a1 - a0 - TAU) < 1e-6;
  const n = closed ? seg : seg + 1;
  const ts = []; for (let j = 0; j < n; j++) ts.push(a0 + ((a1 - a0) * j) / seg);
  return gridSurface((i, t) => { const [x, r] = profile[i]; return [x, cy + r * Math.cos(t), cz + r * Math.sin(t)]; },
    profile.map((_, i) => i), ts, { closedV: closed, flip });
}

/* ---------- примитивы с «запечённым» преобразованием ---------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
export function place(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s); g.applyMatrix4(_m); return g;
}
export const box = (w, h, d, x, y, z, rx, ry, rz) => place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
export function rbox(w, h, d, r, x, y, z, rx = 0, ry = 0, rz = 0) { // скруглённый параллелепипед точно w×h×d
  const bt = Math.min(r, d / 3), bs = bt * 0.9;                   // фаска выдвигает контур наружу — компенсируем
  const W = Math.max(w - 2 * bs, 1e-3), Hh = Math.max(h - 2 * bs, 1e-3), rr = Math.min(Math.max(r - bs, 0.0004), W / 2, Hh / 2);
  const s = new THREE.Shape(), hw = W / 2 - rr, hh = Hh / 2 - rr;
  s.moveTo(-hw, -Hh / 2); s.lineTo(hw, -Hh / 2); s.quadraticCurveTo(W / 2, -Hh / 2, W / 2, -hh); s.lineTo(W / 2, hh);
  s.quadraticCurveTo(W / 2, Hh / 2, hw, Hh / 2); s.lineTo(-hw, Hh / 2); s.quadraticCurveTo(-W / 2, Hh / 2, -W / 2, hh);
  s.lineTo(-W / 2, -hh); s.quadraticCurveTo(-W / 2, -Hh / 2, -hw, -Hh / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * bt, bevelEnabled: true, bevelSize: bs, bevelThickness: bt, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * bt) / 2);
  return place(g, x, y, z, rx, ry, rz);
}
/* цилиндр вдоль оси ('x' | 'y' | 'z') */
export function cyl(r1, r2, len, axis, x, y, z, seg = 16, open = false) {
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1, open);
  if (axis === "x") g.rotateZ(-Math.PI / 2); else if (axis === "z") g.rotateX(Math.PI / 2);
  return place(g, x, y, z);
}
export function torus(R, r, axis, x, y, z, rs = 8, ts = 32, arc = TAU) {
  const g = new THREE.TorusGeometry(R, r, rs, ts, arc);
  if (axis === "x") g.rotateY(Math.PI / 2); else if (axis === "y") g.rotateX(Math.PI / 2);
  return place(g, x, y, z);
}
export function tube(pts, r, seg = 24, rs = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed, "centripetal");
  return new THREE.TubeGeometry(curve, seg, r, rs, closed);
}
export function sphere(r, x, y, z, sx = 1, sy = 1, sz = 1, ws = 16, hs = 12) {
  return place(new THREE.SphereGeometry(r, ws, hs), x, y, z, 0, 0, 0, sx, sy, sz);
}

/* объединение геометрий с приведением атрибутов (position/normal/uv, без индекса) */
export function mergeAll(list) {
  const src = list.filter(Boolean);
  const keep = ["position", "normal", "uv"];
  if (src.length && src.every((g) => g.attributes.color)) keep.push("color");      // цвета вершин (побежалость и т.п.)
  const prepared = src.map((g) => {
    let q = g.index ? g.toNonIndexed() : g;
    if (!q.attributes.normal) q.computeVertexNormals();
    if (!q.attributes.uv) q.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    for (const k of Object.keys(q.attributes)) if (!keep.includes(k)) q.deleteAttribute(k);
    q.morphAttributes = {};
    return q;
  });
  if (!prepared.length) return new THREE.BufferGeometry();
  const m = mergeGeometries(prepared, false);
  return m;
}
export { mergeVertices };

/* плоская фигура (x,z) с толщиной по y */
export function slabXZ(pts, y0, thick, bevel = 0.01) {
  const s = new THREE.Shape(); pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
  return g;
}

/* зеркальная копия относительно плоскости XY (левый борт из правого) */
export function mirrorZ(g) {
  const m = g.clone();
  m.scale(1, 1, -1);
  if (m.index) { const a = m.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } m.index.needsUpdate = true; }
  else {
    for (const key of Object.keys(m.attributes)) {
      const at = m.attributes[key], n = at.itemSize, arr = at.array;
      for (let i = 0; i < at.count; i += 3) for (let c = 0; c < n; c++) { const t = arr[(i + 1) * n + c]; arr[(i + 1) * n + c] = arr[(i + 2) * n + c]; arr[(i + 2) * n + c] = t; }
    }
  }
  m.computeVertexNormals();
  return m;
}
