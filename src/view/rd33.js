/* Двигатель РД-33: корпуса вентилятора, разделительный, КВД, камера сгорания, турбина,
   форсажная камера и всережимное сопло; входное устройство с обтекателем, лопатками
   направляющего аппарата и вентилятора; фланцы с болтами, коробка приводов с агрегатами,
   топливные коллекторы, трубопроводы и жгуты на хомутах, узлы подвески.
   Система координат двигателя: ось — X, вход при x = 0, выхлоп — в сторону −X. */
import * as THREE from "three";
import { latheX, mergeAll, tube, cyl, box, rbox, torus, gridSurface, range } from "./geo.js";
import { mulberry32 } from "./tex.js";

const TAU = Math.PI * 2;

/* корпус по участкам: grp — к какому снимаемому узлу относится при установке на самолёт */
const SECTIONS = [
  { id: "fan", x0: 0.0, x1: -0.62, r0: 0.455, r1: 0.455, bulge: 0.0, grp: "comp", mat: "casing" },
  { id: "int", x0: -0.62, x1: -0.86, r0: 0.47, r1: 0.47, bulge: 0.018, grp: "comp", mat: "casing" },
  { id: "hpc", x0: -0.86, x1: -1.5, r0: 0.4, r1: 0.372, bulge: 0.0, grp: "comp", mat: "ti" },
  { id: "cc", x0: -1.5, x1: -1.95, r0: 0.43, r1: 0.445, bulge: 0.014, grp: "turb", mat: "hot" },
  { id: "tur", x0: -1.95, x1: -2.55, r0: 0.43, r1: 0.408, bulge: 0.0, grp: "turb", mat: "hot" },
  { id: "trf", x0: -2.55, x1: -2.9, r0: 0.412, r1: 0.42, bulge: 0.0, grp: "turb", mat: "hot2" },
];
const AB_SECTIONS = [
  { id: "abd", x0: -2.9, x1: -3.25, r0: 0.42, r1: 0.455, bulge: 0.0, grp: "ab", mat: "hot2" },
  { id: "abp", x0: -3.25, x1: -3.95, r0: 0.455, r1: 0.455, bulge: 0.0, grp: "ab", mat: "abpipe" },
];
function rAt(x, secs) {
  for (const s of secs) if (x <= s.x0 + 1e-6 && x >= s.x1 - 1e-6) { const t = (x - s.x0) / (s.x1 - s.x0); return s.r0 + (s.r1 - s.r0) * t + s.bulge * Math.sin(Math.PI * t); }
  return secs[secs.length - 1].r1;
}

/* материалы двигателя */
export function rd33Materials(L) {
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const brushed = L.alu.normalMap;
  return {
    casing: S({ color: "#b3b8ba", roughness: 0.46, metalness: 0.62, normalMap: brushed, normalScale: new THREE.Vector2(0.25, 0.25) }),
    ti: S({ color: "#a4aab0", roughness: 0.4, metalness: 0.7, normalMap: brushed, normalScale: new THREE.Vector2(0.25, 0.25) }),
    hot: S({ color: "#ffffff", vertexColors: true, roughness: 0.46, metalness: 0.68, normalMap: brushed, normalScale: new THREE.Vector2(0.15, 0.15) }),
    hot2: S({ color: "#ffffff", vertexColors: true, roughness: 0.55, metalness: 0.8 }),
    abpipe: S({ map: L.titanium.map, roughnessMap: L.titanium.roughnessMap, metalnessMap: L.titanium.metalnessMap, color: "#a9a49c", roughness: 1, metalness: 1 }),
    bolts: S({ color: "#c9cdd0", roughness: 0.3, metalness: 1 }),
    pipe: S({ color: "#c6cacc", roughness: 0.28, metalness: 1 }),
    copper: S({ color: "#b98352", roughness: 0.35, metalness: 1 }),
    harness: S({ color: "#1c1c1c", roughness: 0.65, metalness: 0, normalMap: L.hose.normalMap }),
    harnessO: S({ color: "#c36a2a", roughness: 0.6, metalness: 0 }),
    clamp: S({ color: "#6e7478", roughness: 0.4, metalness: 0.9 }),
    unit: S({ color: "#7c8588", roughness: 0.6, metalness: 0.35, normalMap: L.unitGrey.normalMap, normalScale: new THREE.Vector2(0.4, 0.4) }),
    unitDark: S({ color: "#3a3f42", roughness: 0.55, metalness: 0.4 }),
    olive: L.olive,
    fan: S({ color: "#a8afb5", roughness: 0.25, metalness: 1, side: THREE.DoubleSide }),
    dark: S({ color: "#1d1c1b", roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide }),
    soot: S({ color: "#2c2724", roughness: 0.8, metalness: 0.5, side: THREE.DoubleSide }),
    nozzle: L.titanium,
    chrome: L.chrome,
  };
}

/* трубка вдоль корпуса: по углу th от x0 до x1 с отступом off над обшивкой (дуги у фланцев) */
function runPipe(secs, th0, th1, x0, x1, off, r, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, th = th0 + (th1 - th0) * t, R = rAt(x, secs) + off + r; pts.push([x, Math.cos(th) * R, Math.sin(th) * R]); }
  return pts;
}
function clampsOn(pts, r, n) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "centripetal"), out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), p = c.getPoint(t), d = c.getTangent(t);
    const g = new THREE.TorusGeometry(r * 1.4, Math.max(0.002, r * 0.35), 5, 10);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d)); g.translate(p.x, p.y, p.z); out.push(g);
  }
  return out;
}
function rodBetween(a, b, r, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(A.x, A.y, A.z);
  return g;
}

/* побежалость горячей части: цвет вершин по осевой координате (соломенный → бронза → фиолетовый →
   синий → серый) с полосами от 24 форсунок и пятнами */
const TINT = {
  hot: [[-1.45, "#a8a196"], [-1.6, "#b39c6c"], [-1.78, "#a6784e"], [-1.95, "#7c5870"], [-2.12, "#58668e"], [-2.32, "#6d7a89"], [-2.6, "#6c6762"]],
  hot2: [[-2.5, "#6f6a66"], [-2.72, "#5f657a"], [-2.95, "#7a6a5b"], [-3.35, "#5f5752"], [-4.4, "#4f4a45"]],
};
const _c = new THREE.Color(), _d = new THREE.Color();
function heatTint(g, stops, rnd) {
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const lin = stops.map(([x, h]) => [x, new THREE.Color(h)]);
  const ph = rnd() * TAU;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), a = Math.atan2(p.getZ(i), p.getY(i));
    const xs = x + 0.035 * Math.sin(24 * a + ph) + 0.02 * Math.sin(7 * a + x * 9);
    let k = 0; while (k < lin.length - 2 && xs < lin[k + 1][0]) k++;
    const [x0, c0] = lin[k], [x1, c1] = lin[k + 1], t = Math.max(0, Math.min(1, (xs - x0) / (x1 - x0)));
    _c.copy(c0).lerp(c1, t);
    const n = 0.93 + 0.07 * Math.sin(a * 31 + x * 57) * Math.sin(a * 13 - x * 23);
    _d.copy(_c).multiplyScalar(n);
    col[i * 3] = _d.r; col[i * 3 + 1] = _d.g; col[i * 3 + 2] = _d.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
}
/* деталь «на корпусе»: геометрия построена с радиальным направлением +Y, ставится на угол a, радиус r */
function onCasing(g, x, a, r) { g.translate(0, r, 0); g.rotateX(a); g.translate(x, 0, 0); return g; }
const polar = (x, a, r) => [x, Math.cos(a) * r, Math.sin(a) * r];
/* шестигранная гайка на трубе в точке p по направлению d */
function nutAt(p, d, r) {
  const g = new THREE.CylinderGeometry(r, r, r * 1.6, 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)); g.translate(p.x, p.y, p.z);
  return g;
}

/* opts: { ab: true — форсажная камера и сопло (для запасного двигателя), detail: 0.5..1 }
   → { groups: { comp|turb|ab: { matKey: [geo] } } } */
export function buildRD33({ ab = false, detail = 1, seed = 33, accessories = true } = {}) {
  const rnd = mulberry32(seed);
  const secs = ab ? [...SECTIONS, ...AB_SECTIONS] : SECTIONS;
  const G = {};
  const add = (grp, key, g) => {
    if (!g) return;
    if (TINT[key]) heatTint(g, TINT[key], rnd);
    (G[grp] = G[grp] || {}); (G[grp][key] = G[grp][key] || []).push(g);
  };
  const seg = Math.round(40 * detail);

  /* ── корпуса ── */
  for (const s of secs) {
    const prof = range(s.x0, s.x1, 8).map((x) => [x, rAt(x, secs)]);
    add(s.grp, s.mat, latheX(prof, seg));
  }
  // фланцы с болтами на стыках
  const joints = secs.slice(1).map((s, i) => ({ x: s.x0, a: secs[i], b: s }));
  for (const j of joints) {
    const rin = Math.min(j.a.r1, j.b.r0) - 0.004, rout = Math.max(j.a.r1, j.b.r0) + 0.022, w = 0.014;
    add(j.b.grp, j.b.mat === "casing" || j.b.mat === "ti" ? "casing" : "hot2", latheX([[j.x + w, rin], [j.x + w, rout], [j.x - w, rout], [j.x - w, rin]], seg));
    const n = Math.round((TAU * rout) / (0.05 / detail)), bolts = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU; bolts.push(cyl(0.0065, 0.0065, 0.014, "x", j.x - w - 0.006, Math.cos(a) * (rout - 0.009), Math.sin(a) * (rout - 0.009), 6)); }
    add(j.b.grp, "bolts", mergeAll(bolts));
  }
  // рёбра жёсткости корпуса вентилятора и кольца КВД
  for (const x of [-0.18, -0.34, -0.5]) add("comp", "casing", torus(0.458, 0.01, "x", x, 0, 0, 5, seg));
  for (const x of [-1.0, -1.15, -1.3]) add("comp", "ti", torus(rAt(x, secs) + 0.003, 0.007, "x", x, 0, 0, 5, seg));

  /* ── входное устройство: губа, обтекатель, направляющий аппарат, 1-я ступень вентилятора ── */
  add("comp", "casing", torus(0.458, 0.014, "x", 0.0, 0, 0, 6, seg));
  add("comp", "casing", latheX([[0.13, 0.0], [0.1, 0.05], [0.05, 0.1], [0.0, 0.13], [-0.06, 0.15], [-0.1, 0.155]], 28));
  {
    const igv = [];
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * TAU, len = 0.455 - 0.15;
      const g = new THREE.BoxGeometry(0.075, len, 0.008); g.translate(-0.04, 0.15 + len / 2, 0); g.rotateX(a); igv.push(g);
    }
    add("comp", "casing", mergeAll(igv));
    const blades = [], nb = Math.round(32 * detail);
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * TAU;
      blades.push(gridSurface((s, c) => {
        const r = 0.165 + s * 0.28, beta = (28 + 34 * s) * Math.PI / 180, hc = 0.045 - 0.012 * s;
        const tx = Math.cos(beta) * c * hc, tt = Math.sin(beta) * c * hc;
        const aa = a + tt / r;
        return [-0.2 + tx, Math.cos(aa) * r, Math.sin(aa) * r];
      }, range(0, 1, 5), range(-1, 1, 2)));
    }
    add("comp", "fan", mergeAll(blades));
    add("comp", "dark", latheX([[-0.14, 0.16], [-0.24, 0.17], [-0.3, 0.2]], 24));
    const disc = new THREE.CircleGeometry(0.45, 32); disc.rotateY(Math.PI / 2); disc.translate(-0.32, 0, 0);
    add("comp", "dark", disc);
  }

  /* ── коробка приводов с агрегатами (сверху разделительного корпуса) ── */
  if (accessories) {
    const yT = 0.47;
    add("comp", "unit", rbox(0.72, 0.13, 0.34, 0.03, -0.95, yT + 0.05, 0));
    add("comp", "unit", rbox(0.18, 0.1, 0.2, 0.02, -0.66, yT + 0.02, 0));
    add("comp", "unitDark", cyl(0.075, 0.075, 0.24, "x", -0.82, yT + 0.2, 0.09, 18));
    add("comp", "unitDark", cyl(0.085, 0.085, 0.05, "x", -0.69, yT + 0.2, 0.09, 18));
    add("comp", "olive", rbox(0.26, 0.15, 0.17, 0.02, -1.14, yT + 0.19, -0.08));
    add("comp", "unit", cyl(0.06, 0.06, 0.2, "x", -1.16, yT + 0.17, 0.12, 16));
    add("comp", "unit", cyl(0.065, 0.065, 0.03, "x", -1.04, yT + 0.17, 0.12, 16));
    add("comp", "unitDark", cyl(0.05, 0.05, 0.16, "y", -0.86, yT + 0.2, -0.12, 14));
    for (const [x, z] of [[-0.82, 0.18], [-1.14, -0.17], [-1.16, 0.2]]) add("comp", "copper", cyl(0.018, 0.018, 0.04, "z", x, yT + 0.2, z, 10));
    // генератор сбоку
    const gth = 0.9, gr = 0.47 + 0.09;
    add("comp", "unitDark", cyl(0.085, 0.085, 0.28, "x", -0.74, Math.cos(gth) * gr, Math.sin(gth) * gr, 18));
    add("comp", "unit", cyl(0.095, 0.095, 0.04, "x", -0.6, Math.cos(gth) * gr, Math.sin(gth) * gr, 18));
  }
  // цапфы передней подвески
  for (const s of [1, -1]) add("comp", "casing", mergeAll([cyl(0.04, 0.04, 0.1, "z", -0.74, 0, s * 0.53, 14), cyl(0.06, 0.06, 0.02, "z", -0.74, 0, s * 0.49, 16)]));

  /* ── камера сгорания: коллекторы, форсунки, запальники ── */
  {
    const xm = -1.66, rc = rAt(xm, secs);
    add("turb", "copper", torus(rc + 0.05, 0.011, "x", xm, 0, 0, 6, seg + 8));
    add("turb", "pipe", torus(rc + 0.075, 0.008, "x", xm - 0.06, 0, 0, 6, seg + 8));
    const noz = [], feed = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      noz.push(cyl(0.014, 0.014, 0.03, "x", xm - 0.03, ca * (rc + 0.012), sa * (rc + 0.012), 8));
      feed.push(rodBetween([xm, ca * (rc + 0.05), sa * (rc + 0.05)], [xm - 0.03, ca * (rc + 0.02), sa * (rc + 0.02)], 0.004, 5));
    }
    add("turb", "bolts", mergeAll(noz)); add("turb", "copper", mergeAll(feed));
    for (const a of [2.2, 4.1]) add("turb", "unitDark", cyl(0.018, 0.018, 0.08, "y", -1.8, Math.cos(a) * (rc + 0.04), Math.sin(a) * (rc + 0.04), 10));
    // термопары за турбиной
    const tc = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU + 0.1; tc.push(cyl(0.008, 0.008, 0.05, "y", -2.62, Math.cos(a) * 0.43, Math.sin(a) * 0.43, 5)); }
    add("turb", "bolts", mergeAll(tc)); add("turb", "harness", torus(0.445, 0.006, "x", -2.62, 0, 0, 4, seg));
    // задние узлы подвески
    for (const z of [0.12, -0.12]) add("turb", "casing", box(0.08, 0.07, 0.04, -2.45, 0.44, z));
  }

  /* ── трубопроводы и жгуты по корпусу ── */
  const pipeDefs = [];
  const P = (grp, key, th0, th1, x0, x1, off, r) => pipeDefs.push({ grp, key, th0, th1, x0, x1, off, r });
  // масляные и топливные магистрали
  P("comp", "pipe", 2.6, 2.4, -0.1, -1.45, 0.02, 0.011); P("comp", "pipe", 3.4, 3.6, -0.05, -1.45, 0.028, 0.009);
  P("comp", "copper", 1.9, 2.1, -0.3, -1.45, 0.04, 0.007); P("comp", "pipe", -2.2, -2.5, -0.15, -1.45, 0.024, 0.012);
  P("comp", "pipe", 1.2, 1.35, -0.62, -1.45, 0.03, 0.02);
  P("turb", "pipe", 2.4, 2.3, -1.5, -2.85, 0.03, 0.011); P("turb", "copper", 3.6, 3.8, -1.5, -2.85, 0.035, 0.008);
  P("turb", "pipe", -2.5, -2.7, -1.5, -2.8, 0.03, 0.013);
  // трубы охлаждения турбины (воздух из-за КВД)
  for (const th of [0.6, 1.8, 3.0, 4.2, 5.4]) P("turb", "pipe", th, th + 0.15, -1.48, -2.3, 0.03, 0.016);
  // жгуты
  P("comp", "harness", 2.9, 3.1, -0.05, -1.45, 0.04, 0.014); P("comp", "harnessO", -2.75, -2.9, -0.2, -1.45, 0.045, 0.011);
  P("turb", "harness", 2.9, 3.0, -1.5, -2.8, 0.05, 0.014); P("turb", "harnessO", -2.9, -3.0, -1.5, -2.6, 0.055, 0.01);
  if (ab) { P("ab", "copper", 2.7, 2.5, -2.9, -3.8, 0.04, 0.01); P("ab", "pipe", -2.6, -2.4, -2.9, -3.85, 0.04, 0.012); P("ab", "harness", 3.2, 3.0, -2.9, -3.7, 0.05, 0.012); }
  for (const d of pipeDefs) {
    const pts = runPipe(secs, d.th0, d.th1, d.x0, d.x1, d.off, d.r);
    add(d.grp, d.key, tube(pts, d.r, Math.round(40 * detail), 6));
    add(d.grp, "clamp", mergeAll(clampsOn(pts, d.r, Math.max(2, Math.round((d.x0 - d.x1) * 3)))));
    // стойки крепления к корпусу
    const st = [];
    for (let i = 3; i < pts.length - 1; i += 4) { const [x, y, z] = pts[i], l = Math.hypot(y, z), k = (l - d.off - d.r) / l; st.push(rodBetween([x, y * k, z * k], [x, y, z], 0.004, 4)); }
    if (st.length) add(d.grp, "clamp", mergeAll(st));
    // концы: у трубок — штуцер с накидной гайкой, уходящий в бобышку корпуса; у жгутов — штепсельные разъёмы
    const ends = [], plugs = [], wire = d.key.startsWith("harness");
    for (const [i0, i1] of [[0, 1], [pts.length - 1, pts.length - 2]]) {
      const A = new THREE.Vector3(...pts[i0]), B = new THREE.Vector3(...pts[i1]), dir = B.clone().sub(A).normalize();
      const l = Math.hypot(A.y, A.z), rc = l - d.off - d.r, a = Math.atan2(A.z, A.y);
      if (wire) {
        const g = new THREE.CylinderGeometry(d.r * 1.9, d.r * 1.9, 0.05, 12);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)); g.translate(A.x, A.y, A.z); plugs.push(g);
        plugs.push(onCasing(new THREE.BoxGeometry(0.05, 0.02, 0.05), A.x, a, rc + 0.01));
      } else {
        ends.push(nutAt(A.clone().addScaledVector(dir, 0.012), dir, d.r * 1.9));
        ends.push(rodBetween(polar(A.x, a, rc), [A.x, A.y, A.z], d.r, 6));
        ends.push(onCasing(new THREE.CylinderGeometry(d.r * 2.4, d.r * 2.8, 0.012, 8), A.x, a, rc + 0.004));
      }
    }
    if (ends.length) add(d.grp, "clamp", mergeAll(ends));
    if (plugs.length) add(d.grp, d.key === "harnessO" ? "olive" : "unitDark", mergeAll(plugs));
  }

  /* ── КВД: поворотные направляющие аппараты — кольца синхронизации, рычаги цапф, привод ── */
  {
    const rings = [], levers = [], bosses = [], nL = Math.max(18, Math.round(34 * detail)), aAct = 2.05;
    const XV = [-0.92, -1.07, -1.22];
    for (const x of XV) {
      const rc = rAt(x, secs), rr = rc + 0.04;
      rings.push(torus(rr, 0.0075, "x", x - 0.032, 0, 0, 5, Math.round(72 * detail)));
      for (let k = 0; k < nL; k++) {
        const a = (k / nL) * TAU + 0.04;
        bosses.push(onCasing(new THREE.CylinderGeometry(0.0095, 0.012, 0.016, 6), x, a, rc + 0.006));
        levers.push(rodBetween(polar(x, a, rc + 0.013), polar(x - 0.032, a, rr), 0.0032, 4));
      }
    }
    add("comp", "ti", mergeAll(bosses)); add("comp", "clamp", mergeAll(levers)); add("comp", "casing", mergeAll(rings));
    // вал синхронизации с рычагами к кольцам и опорами
    const rs = rAt(-1.07, secs) + 0.085, sh = [rodBetween(polar(-0.86, aAct, rs), polar(-1.28, aAct, rs), 0.011, 10)];
    for (const x of XV) { sh.push(rodBetween(polar(x - 0.032, aAct, rs), polar(x - 0.032, aAct - 0.03, rAt(x, secs) + 0.04), 0.006, 5)); sh.push(cyl(0.017, 0.017, 0.028, "x", x - 0.032, Math.cos(aAct) * rs, Math.sin(aAct) * rs, 10)); }
    for (const x of [-0.88, -1.26]) sh.push(rodBetween(polar(x, aAct, rAt(x, secs)), polar(x, aAct, rs), 0.009, 6));
    add("comp", "casing", mergeAll(sh));
    // гидроцилиндр привода: корпус, крышки, шток, качалка, трубки
    const ra = rAt(-0.74, secs) + 0.055, Y = Math.cos(aAct) * ra, Z = Math.sin(aAct) * ra;
    add("comp", "unit", mergeAll([cyl(0.02, 0.02, 0.2, "x", -0.74, Y, Z, 14), cyl(0.024, 0.024, 0.024, "x", -0.64, Y, Z, 14), cyl(0.024, 0.024, 0.024, "x", -0.84, Y, Z, 14)]));
    add("comp", "chrome", cyl(0.0075, 0.0075, 0.1, "x", -0.9, Y, Z, 8));
    add("comp", "casing", mergeAll([rodBetween(polar(-0.95, aAct, ra), polar(-0.95, aAct, rs), 0.01, 6), rodBetween(polar(-0.64, aAct, rAt(-0.64, secs)), polar(-0.64, aAct, ra), 0.01, 6)]));
    add("comp", "pipe", mergeAll([tube([polar(-0.66, aAct + 0.05, ra), polar(-0.55, aAct + 0.1, ra + 0.01), polar(-0.3, aAct + 0.14, rAt(-0.3, secs) + 0.04)], 0.006, 16, 6),
      tube([polar(-0.82, aAct + 0.05, ra), polar(-0.7, aAct + 0.14, ra), polar(-0.3, aAct + 0.19, rAt(-0.3, secs) + 0.035)], 0.006, 16, 6)]));
  }

  /* ── клапаны перепуска воздуха КВД с патрубками ── */
  for (const a of [1.62, 4.66]) {
    const x = -1.36, rc = rAt(x, secs);
    add("comp", "casing", mergeAll([onCasing(new THREE.CylinderGeometry(0.05, 0.055, 0.04, 16), x, a, rc + 0.02), onCasing(new THREE.CylinderGeometry(0.036, 0.05, 0.028, 16), x, a, rc + 0.054)]));
    add("comp", "unitDark", onCasing(rbox(0.07, 0.035, 0.05, 0.008, 0, 0, 0), x + 0.075, a, rc + 0.03));
    add("comp", "pipe", tube([polar(x, a, rc + 0.05), polar(x - 0.06, a + 0.04, rc + 0.07), polar(x - 0.13, a + 0.08, rc + 0.07)], 0.02, 12, 10));
    add("comp", "clamp", torus(0.024, 0.005, "x", x - 0.13, Math.cos(a + 0.08) * (rc + 0.07), Math.sin(a + 0.08) * (rc + 0.07), 5, 14));
  }

  /* ── агрегаты зажигания с высоковольтными проводами к запальникам ── */
  for (const [a, ai] of [[2.36, 2.2], [3.92, 4.1]]) {
    const x = -1.3, rc = rAt(x, secs);
    add("comp", "olive", onCasing(rbox(0.16, 0.055, 0.1, 0.012, 0, 0, 0), x, a, rc + 0.034));
    add("comp", "unitDark", mergeAll([onCasing(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10), x - 0.05, a + 0.08, rc + 0.07), onCasing(new THREE.BoxGeometry(0.2, 0.01, 0.12), x, a, rc + 0.006)]));
    const rI = rAt(-1.8, secs) + 0.07;
    add("comp", "harnessO", tube([polar(x - 0.06, a, rc + 0.07), polar(x - 0.2, a, rc + 0.07), polar(-1.62, (a + ai) / 2, rAt(-1.62, secs) + 0.1), polar(-1.8, ai, rI)], 0.007, 24, 6));
  }

  /* ── на корпусе вентилятора: маслобак, топливно-масляный теплообменник, блок регулятора ── */
  {
    const rc = rAt(-0.3, secs);
    // маслобак (к борту): мерное стекло, заливная горловина, суфлёр
    add("comp", "unit", onCasing(rbox(0.34, 0.06, 0.19, 0.02, 0, 0, 0), -0.3, 4.02, rc + 0.036));
    add("comp", "chrome", onCasing(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 14), -0.22, 4.02, rc + 0.07));
    add("comp", "unitDark", mergeAll([onCasing(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 14), -0.4, 3.97, rc + 0.078), onCasing(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 6), -0.4, 3.97, rc + 0.096)]));
    add("comp", "pipe", tube([polar(-0.46, 4.1, rc + 0.05), polar(-0.56, 4.15, rc + 0.04), polar(-0.64, 4.2, rAt(-0.64, secs) + 0.03)], 0.007, 12, 6));
    // теплообменник: цилиндр с крышками и патрубками
    const a2 = 2.26, R2 = rc + 0.058, y2 = Math.cos(a2) * R2, z2 = Math.sin(a2) * R2;
    add("comp", "unit", mergeAll([cyl(0.042, 0.042, 0.3, "x", -0.26, y2, z2, 18), cyl(0.047, 0.047, 0.025, "x", -0.11, y2, z2, 18), cyl(0.047, 0.047, 0.025, "x", -0.41, y2, z2, 18)]));
    add("comp", "bolts", mergeAll([-0.11, -0.41].flatMap((x) => Array.from({ length: 8 }, (_, k) => { const t = (k / 8) * TAU; return cyl(0.004, 0.004, 0.03, "x", x, y2 + Math.cos(t) * 0.04, z2 + Math.sin(t) * 0.04, 5); }))));
    for (const x of [-0.16, -0.36]) add("comp", "pipe", tube([polar(x, a2 - 0.04, R2 + 0.03), polar(x, a2 - 0.12, R2 + 0.02), polar(x - 0.05, a2 - 0.22, rc + 0.025)], 0.008, 10, 6));
    add("comp", "clamp", mergeAll([-0.18, -0.34].map((x) => onCasing(new THREE.BoxGeometry(0.02, 0.05, 0.1), x, a2, rc + 0.02))));
    // блок регулятора с рёбрами и разъёмами (выше, у бокового борта)
    const a3 = 1.72;
    add("comp", "unitDark", onCasing(rbox(0.26, 0.05, 0.15, 0.01, 0, 0, 0), -0.36, a3, rc + 0.032));
    add("comp", "unitDark", mergeAll(Array.from({ length: 9 }, (_, k) => onCasing(new THREE.BoxGeometry(0.24, 0.016, 0.004), -0.36, a3 - 0.14 + k * 0.035, rc + 0.064))));
    add("comp", "olive", mergeAll([-0.46, -0.38, -0.3].map((x) => onCasing(new THREE.CylinderGeometry(0.017, 0.017, 0.04, 12), x, a3 + 0.19, rc + 0.04))));
    add("comp", "harness", tube([polar(-0.46, a3 + 0.22, rc + 0.06), polar(-0.58, a3 + 0.35, rc + 0.06), polar(-0.8, 2.9, rAt(-0.8, secs) + 0.045)], 0.009, 14, 6));
    // продольные рёбра корпуса вентилятора и табличка
    add("comp", "casing", mergeAll(Array.from({ length: 20 }, (_, k) => onCasing(new THREE.BoxGeometry(0.58, 0.012, 0.009), -0.31, (k / 20) * TAU + 0.08, rAt(-0.31, secs) + 0.004))));
    add("comp", "bolts", onCasing(new THREE.BoxGeometry(0.1, 0.004, 0.06), -0.12, 2.75, rc + 0.012));
  }

  /* ── смотровые лючки (бороскоп) с пробками, коллекторы охлаждения турбины, дренаж ── */
  {
    const bs = [];
    for (const [x, a] of [[-0.98, 2.62], [-1.16, 3.72], [-1.4, 2.95], [-2.05, 2.5], [-2.2, 3.9], [-1.88, 3.2]]) {
      const rc = rAt(x, secs);
      bs.push(onCasing(new THREE.CylinderGeometry(0.016, 0.018, 0.02, 12), x, a, rc + 0.008), onCasing(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 6), x, a, rc + 0.024));
    }
    add("comp", "bolts", mergeAll(bs.slice(0, 8))); add("turb", "bolts", mergeAll(bs.slice(8)));
    for (const x of [-2.18, -2.38]) add("turb", "pipe", torus(rAt(x, secs) + 0.045, 0.009, "x", x, 0, 0, 6, seg + 8));
    const sp = [];
    for (const x of [-2.18, -2.38]) for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU + 0.3; sp.push(rodBetween(polar(x, a, rAt(x, secs)), polar(x, a, rAt(x, secs) + 0.04), 0.004, 4)); }
    add("turb", "clamp", mergeAll(sp));
    // дренажный коллектор снизу за турбиной
    const xd = -2.72, rd = rAt(xd, secs);
    add("turb", "unit", onCasing(rbox(0.1, 0.04, 0.08, 0.008, 0, 0, 0), xd, Math.PI, rd + 0.03));
    for (const [x, a] of [[-1.7, 2.8], [-1.9, 3.5], [-2.3, 2.9], [-2.45, 3.4]]) add("turb", "pipe", tube([polar(x, a, rAt(x, secs) + 0.02), polar((x + xd) / 2, (a + Math.PI) / 2, rAt((x + xd) / 2, secs) + 0.03), polar(xd + 0.04, Math.PI + (a - Math.PI) * 0.15, rd + 0.04)], 0.0045, 14, 5));
    add("turb", "pipe", tube([polar(xd, Math.PI, rd + 0.05), polar(xd - 0.02, Math.PI, rd + 0.1)], 0.006, 4, 6));
  }

  /* ── форсажная камера и сопло (запасной двигатель) ── */
  if (ab) {
    for (const x of [-3.45, -3.65, -3.85]) add("ab", "hot2", torus(0.46, 0.012, "x", x, 0, 0, 5, seg));
    add("ab", "copper", torus(0.475, 0.01, "x", -3.02, 0, 0, 6, seg)); add("ab", "copper", torus(0.482, 0.009, "x", -3.12, 0, 0, 6, seg));
    // кольцо управления соплом и гидроцилиндры
    add("ab", "casing", torus(0.475, 0.02, "x", -3.98, 0, 0, 6, seg));
    const acts = [], rods = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      acts.push(rodBetween([-3.72, ca * 0.478, sa * 0.478], [-3.9, ca * 0.482, sa * 0.482], 0.018, 10));
      rods.push(rodBetween([-3.9, ca * 0.482, sa * 0.482], [-3.99, ca * 0.476, sa * 0.476], 0.009, 8));
    }
    add("ab", "unit", mergeAll(acts)); add("ab", "chrome", mergeAll(rods));
    // створки сопла внахлёст
    const P16 = 16, pet = [], sea = [];
    for (let k = 0; k < P16; k++) {
      const a = (k / P16) * TAU, hw = (TAU / P16) * 0.56, lift = (k % 2) * 0.006;
      pet.push(gridSurface((u, v) => { const x = -3.98 - u * 0.4, r = 0.465 - 0.07 * Math.pow(u, 1.2) + lift; const t = a + v * hw; return [x, Math.cos(t) * r, Math.sin(t) * r]; }, range(0, 1, 5), range(-1, 1, 3)));
      const b = a + TAU / P16 / 2;
      sea.push(gridSurface((u, v) => { const x = -3.98 - u * 0.39, r = 0.462 - 0.069 * Math.pow(u, 1.2) + 0.01; const t = b + v * 0.02; return [x, Math.cos(t) * r, Math.sin(t) * r]; }, range(0, 1, 4), [-1, 1]));
    }
    add("ab", "nozzle", mergeAll(pet)); add("ab", "hot2", mergeAll(sea));
    // внутри: экран форсажной камеры, стабилизаторы пламени, конус за турбиной
    add("ab", "soot", latheX([[-4.36, 0.39], [-3.3, 0.43], [-2.95, 0.4]], 28));
    add("ab", "hot", mergeAll([torus(0.26, 0.018, "x", -3.3, 0, 0, 6, 32), torus(0.14, 0.016, "x", -3.3, 0, 0, 6, 24),
      ...Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * TAU; const g = new THREE.BoxGeometry(0.025, 0.2, 0.02); g.translate(0, 0.2, 0); g.rotateX(a); g.translate(-3.3, 0, 0); return g; })]));
    add("ab", "hot2", latheX([[-2.9, 0.2], [-3.05, 0.15], [-3.2, 0.03]], 20));
  }
  return G;
}

/* сведение групп в список [геометрия, материал] */
export function rd33Meshes(groups, M, grp) {
  const out = [];
  for (const [key, list] of Object.entries(groups[grp] || {})) out.push([mergeAll(list), M[key]]);
  return out;
}

/* установка в мотогондолу: ось двигателя по оси гондолы, масштаб под её обводы */
export function placeInNacelle(g, x0, kx, kr, cyE, cz) {
  const out = g.clone(), p = out.attributes.position, n = out.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = x0 + p.getX(i) * kx; p.setXYZ(i, x, cyE + p.getY(i) * kr, cz(x) + p.getZ(i) * kr);
    if (n) { const nx = n.getX(i) / kx, ny = n.getY(i) / kr, nz = n.getZ(i) / kr, l = Math.hypot(nx, ny, nz) || 1; n.setXYZ(i, nx / l, ny / l, nz / l); }
  }
  return out;
}
