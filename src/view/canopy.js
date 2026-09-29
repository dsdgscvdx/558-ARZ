/* Фонарь кабины МиГ-29: неподвижный козырёк с плоским лобовым бронестеклом и двумя стойками,
   откидная часть на заднем шарнире. Рамы — полосы прямоугольного сечения, выметенные по
   поверхности остекления: снаружи окрашены камуфляжем, изнутри — в цвет кабины. */
import * as THREE from "three";
import { gridSurface, range, mergeAll, tube, cyl, box, latheX, place } from "./geo.js";
import { CORE, CANOPY, WS, canopyPt, canopyTop } from "./mig29dims.js";
import { sePoint } from "./geo.js";

const S = (x, phi, g = 0) => new THREE.Vector3(...canopyPt(x, phi, g));

/* касательные к поверхности остекления и внешняя нормаль */
function frameAt(x, phi, along) {
  const e = 1e-3, P = S(x, phi);
  const dx = S(x + e, phi).sub(S(x - e, phi)).normalize();
  const p0 = Math.max(-1, phi - e), p1 = Math.min(1, phi + e), dp = S(x, p1).sub(S(x, p0)).normalize();
  const T = along === "x" ? dx : dp, W0 = along === "x" ? dp : dx;
  const W = W0.clone().addScaledVector(T, -W0.dot(T)).normalize();
  const N = new THREE.Vector3().crossVectors(T, W).normalize();
  const c = new THREE.Vector3(x, sePoint(CORE(x), CANOPY.sillT)[0] - 0.1, 0);
  if (N.dot(P.clone().sub(c)) < 0) N.negate();
  return { P, T, W, N };
}

/* рама: полоса ширины width вдоль образцов; shift — смещение полосы поперёк (вдоль W) */
function band(samples, along, { width = 0.04, tOut = 0.011, tIn = 0.016, shift = 0 } = {}) {
  const F = samples.map(([x, phi]) => frameAt(x, phi, along));
  const pt = (i, side, out) => { const f = F[i]; return f.P.clone().addScaledVector(f.N, out ? tOut : -tIn).addScaledVector(f.W, shift + side * width / 2); };
  const strip = (a, b) => gridSurface((i, k) => { const p = k ? b(i) : a(i); return [p.x, p.y, p.z]; }, F.map((_, i) => i), [0, 1]);
  const outer = strip((i) => pt(i, -1, true), (i) => pt(i, 1, true));
  const inner = strip((i) => pt(i, 1, false), (i) => pt(i, -1, false));
  const s1 = strip((i) => pt(i, -1, false), (i) => pt(i, -1, true)), s2 = strip((i) => pt(i, 1, true), (i) => pt(i, 1, false));
  return { outer: mergeAll([outer, s1, s2]), inner };
}
const arch = (x, n = 40, p0 = -1, p1 = 1) => range(p0, p1, n).map((p) => [x, p]);
const rail = (x0, x1, phi, n = 24) => range(x0, x1, n).map((x) => [x, phi]);

export function buildCanopy({ plane, air, L, pickables, anchors }) {
  const { x0, xw, x1, hingeX, hingeY } = CANOPY;
  const inner = new THREE.MeshStandardMaterial({ color: "#3f5b5d", roughness: 0.7, metalness: 0.25, side: THREE.DoubleSide, normalMap: L.cockpit.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) });
  const seal = new THREE.MeshStandardMaterial({ color: "#161718", roughness: 0.9, metalness: 0 });
  const glassMat = L.canopyGlass || L.canopy;
  const canopy = new THREE.Group(); canopy.position.set(hingeX, hingeY, 0); plane.add(canopy);
  const PH = [-1, 1];

  /* ── остекление ── */
  const ws = gridSurface((x, p) => canopyPt(x, p), range(x0, xw, 14), range(-1, 1, 44));
  const mv = gridSurface((x, p) => canopyPt(x, p), range(xw - 0.012, x1, 26), range(-1, 1, 44));
  const wsM = new THREE.Mesh(ws, glassMat); wsM.userData.interact = "canopy"; plane.add(wsM); pickables.push(wsM);
  const mvM = new THREE.Mesh(mv, glassMat); mvM.userData.interact = "canopy"; mvM.position.set(-hingeX, -hingeY, 0); canopy.add(mvM); pickables.push(mvM);
  anchors.canopyGlassMeshes = [wsM, mvM];

  /* ── рамы козырька (неподвижные) ── */
  const fixedO = [], fixedI = [];
  const push = (b, O, I) => { O.push(b.outer); I.push(b.inner); };
  push(band(arch(x0 - 0.004, 30), "phi", { width: 0.034, tOut: 0.01, tIn: 0.01 }), fixedO, fixedI);
  for (const s of PH) {
    push(band(rail(x0, xw + 0.02, s * WS.pf, 14), "x", { width: 0.042, tOut: 0.012, tIn: 0.018 }), fixedO, fixedI);
    push(band(rail(x0, xw + 0.03, s * 1, 16), "x", { width: 0.05, tOut: 0.012, tIn: 0.02, shift: -0.018 }), fixedO, fixedI);
  }
  push(band(arch(xw + 0.016, 44), "phi", { width: 0.036, tOut: 0.014, tIn: 0.024 }), fixedO, fixedI);
  air(mergeAll(fixedO), L.paintDouble); air(mergeAll(fixedI), inner);
  // уплотнение по борту (видно при открытом фонаре)
  for (const s of PH) {
    const pts = range(xw - 0.02, x1 + 0.02, 20).map((x) => { const [y, z] = sePoint(CORE(x), CANOPY.sillT); return [x, y + 0.004, s * (z - 0.012)]; });
    air(tube(pts, 0.009, 30, 6), seal);
  }

  /* ── рамы откидной части ── */
  const mO = [], mI = [];
  push(band(arch(xw - 0.022, 44), "phi", { width: 0.04, tOut: 0.012, tIn: 0.022 }), mO, mI);
  for (const s of PH) push(band(rail(xw - 0.01, x1 + 0.02, s * 1, 30), "x", { width: 0.056, tOut: 0.012, tIn: 0.026, shift: -0.022 }), mO, mI);
  push(band(arch(x1 + 0.03, 40), "phi", { width: 0.07, tOut: 0.014, tIn: 0.03 }), mO, mI);
  // перископ на гаргроте фонаря
  const px = xw - 0.14, pTop = canopyPt(px, 0)[1];
  const peri = latheX([[0.075, 0.0], [0.06, 0.018], [0.02, 0.03], [-0.04, 0.03], [-0.07, 0.016], [-0.08, 0.0]].map(([x, r]) => [px + x, r]), 18, { cy: pTop + 0.038 });
  peri.scale(1, 1, 1); const periGeo = place(peri, 0, 0, 0, 0, 0, 0, 1, 1, 1);
  mO.push(periGeo, box(0.05, 0.03, 0.022, px + 0.01, pTop + 0.014, 0));
  const frameO = new THREE.Mesh(mergeAll(mO), L.paintDouble), frameI = new THREE.Mesh(mergeAll(mI), inner);
  for (const m of [frameO, frameI]) { m.position.set(-hingeX, -hingeY, 0); m.castShadow = true; m.receiveShadow = true; m.userData.interact = "canopy"; canopy.add(m); pickables.push(m); }
  const lens = new THREE.Mesh(place(new THREE.CircleGeometry(0.022, 16), px - 0.079, pTop + 0.04, 0, 0, -Math.PI / 2, 0), L.lens || L.black);
  lens.position.set(-hingeX, -hingeY, 0); canopy.add(lens);
  // ручки открытия фонаря изнутри (по бокам передней дуги) и замок на левой раме
  const handles = [];
  for (const s of PH) {
    const f = frameAt(xw - 0.022, s * 0.62, "phi"), a = f.P.clone().addScaledVector(f.N, -0.03);
    const b = a.clone().addScaledVector(f.T, 0.09), mid = a.clone().lerp(b, 0.5).addScaledVector(f.N, -0.035).addScaledVector(f.W, -0.02);
    handles.push(tube([[a.x, a.y, a.z], [mid.x, mid.y, mid.z], [b.x, b.y, b.z]], 0.008, 12, 8));
  }
  const lk = frameAt(3.55, -1, "x"), lp = lk.P.clone().addScaledVector(lk.N, -0.04).addScaledVector(lk.W, -0.03);
  handles.push(place(new THREE.BoxGeometry(0.12, 0.02, 0.018), lp.x, lp.y, lp.z), cyl(0.012, 0.012, 0.03, "z", lp.x + 0.05, lp.y, lp.z + 0.012, 10));
  const hm = new THREE.Mesh(mergeAll(handles), new THREE.MeshStandardMaterial({ color: "#1c1d1e", roughness: 0.5, metalness: 0.3 }));
  hm.position.set(-hingeX, -hingeY, 0); canopy.add(hm);
  return { canopy, wsM, mvM };
}
export { canopyTop };
