/* Процедурная модель МиГ-29БМ со съёмными узлами (38 ремонтных позиций игры).
   Геометрия строится в системе координат самолёта (см. mig29dims.js), все окрашенные сетки
   хранят вершины в этой системе — шейдер окраски проецирует на них общие карты панелей. */
import * as THREE from "three";
import {
  gridSurface, range, angles, sectionBody, sectionPatch, sePoint, airfoilSurface, latheX,
  box, rbox, cyl, torus, tube, sphere, mergeAll, mirrorZ, place,
} from "./geo.js";
import { CORE, CORE_X0, CORE_X1, NAC, NAC_X0, NAC_X1, INTAKE_SLOPE, WING_SECTIONS, FIN, STAB, CANOPY, canopyTop, HOLES, COWL, GEAR, DEG } from "./mig29dims.js";
import { cloneMat } from "./materials.js";

const TAU = Math.PI * 2;
const angIn = (t, a, b) => { const d = (((t - a) % TAU) + TAU) % TAU; return d <= b - a + 1e-6; };
const inX = (x, h) => x <= Math.max(h.x0, h.x1) + 1e-6 && x >= Math.min(h.x0, h.x1) - 1e-6;

/* стенки и дно ниши под вырезом обшивки: контур выреза проецируется вертикально до уровня toY */
function bayFromHole(sec, h, toY, n = 10) {
  const loop = [];
  const at = (x, t) => { const p = sec(x); const [y, z] = sePoint(p, t); return [x, y, z]; };
  for (let i = 0; i < n; i++) loop.push(at(h.x0 + ((h.x1 - h.x0) * i) / n, h.t0));
  for (let i = 0; i < n; i++) loop.push(at(h.x1, h.t0 + ((h.t1 - h.t0) * i) / n));
  for (let i = 0; i < n; i++) loop.push(at(h.x1 + ((h.x0 - h.x1) * i) / n, h.t1));
  for (let i = 0; i < n; i++) loop.push(at(h.x0, h.t1 + ((h.t0 - h.t1) * i) / n));
  const pos = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    pos.push(...a, ...b, b[0], toY, b[2], ...a, b[0], toY, b[2], a[0], toY, a[2]);
  }
  const shape = loop.map((p) => new THREE.Vector2(p[0], p[2]));
  const tris = THREE.ShapeUtils.triangulateShape(shape, []);
  for (const [a, b, c] of tris) pos.push(shape[a].x, toY, shape[a].y, shape[b].x, toY, shape[b].y, shape[c].x, toY, shape[c].y);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/* мотогондола как функция (x, θ) с учётом скоса воздухозаборника */
function nacPoint(x, t) {
  const p = NAC(x);
  const [y, z] = sePoint(p, t);
  const f = Math.max(0, Math.min(1, (x - 1.55) / (NAC_X0 - 1.55)));
  return [x + INTAKE_SLOPE * (y - p.cy) * f, y, z];
}

export function buildMig29(L, { detail = 1 } = {}) {
  const plane = new THREE.Group(); plane.name = "MiG-29BM";
  const parts = {}, pickables = [], airframeMeshes = [], colliders = [], lights = {}, anchors = {};
  const buckets = new Map();
  const air = (geo, mat, o = {}) => {                           // неснимаемая часть планера (сливается по материалам)
    if (!geo) return;
    const key = mat.uuid + (o.noShadow ? "n" : "");
    if (!buckets.has(key)) buckets.set(key, { mat, geos: [], o });
    buckets.get(key).geos.push(geo);
    if (o.collide) colliders.push(geo);
  };
  const part = (id, list, dir, o = {}) => {
    const g = new THREE.Group(); g.userData.slot = id;
    const meshes = [];
    for (const [geo, mat] of list) {
      const m = new THREE.Mesh(geo, cloneMat(mat));
      m.material.userData.base = m.material.color.clone();
      m.castShadow = !o.noShadow; m.receiveShadow = true; m.userData.slot = id;
      g.add(m); meshes.push(m); pickables.push(m);
    }
    plane.add(g);
    parts[id] = { group: g, meshes, dir: dir || new THREE.Vector3(0, 0.8, 0) };
    return g;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const seg = Math.round(24 * detail);

  /* ═══════════ фюзеляж ═══════════ */
  const coreHoles = [HOLES.cockpit, HOLES.av, HOLES.tank, HOLES.hydro, HOLES.nosegear];
  const xs = range(CORE_X0, CORE_X1, Math.round(150 * detail), coreHoles.flatMap((h) => [h.x0, h.x1]));
  const N = 72, th = angles(N);
  const coreGeo = sectionBody(CORE, xs, N, {
    skip: (i, j) => {
      const xm = (xs[i] + xs[i + 1]) / 2, tm = th[j] + Math.PI / N;
      return coreHoles.some((h) => inX(xm, h) && angIn(tm, h.t0, h.t1));
    },
  });
  air(coreGeo, L.paint, { collide: true });
  // носовой шпангоут (за обтекателем)
  const bulk = []; { const p = CORE(CORE_X0); for (let j = 0; j < N; j++) { const [y, z] = sePoint(p, th[j]); const [y2, z2] = sePoint(p, th[(j + 1) % N]); bulk.push(CORE_X0, p.cy, 0, CORE_X0, y, z, CORE_X0, y2, z2); } }
  const bulkGeo = new THREE.BufferGeometry(); bulkGeo.setAttribute("position", new THREE.Float32BufferAttribute(bulk, 3)); bulkGeo.computeVertexNormals();
  air(bulkGeo, L.primerGrey);
  air(torus(0.515, 0.012, "x", CORE_X0 - 0.01, 2.06, 0, 6, 48), L.aluDark);

  /* ═══════════ обтекатель РЛС, ПВД ═══════════ */
  {
    const XT = 8.3, xsR = range(CORE_X0, XT, 30), R = 0.52;
    const rad = gridSurface((x, t) => {
      const u = (x - CORE_X0) / (XT - CORE_X0);
      const r = R * Math.pow(Math.max(0, 1 - Math.pow(u, 1.55)), 0.72) + 0.004;
      const cy = 2.06 - 0.1 * u * u;
      return [x, cy + r * Math.cos(t), r * Math.sin(t)];
    }, xsR.slice().reverse(), angles(64), { closedV: true });
    part("radome", [[rad, L.radome]], V(2.2, 0, 0));
    const pit = [
      [mergeAll([cyl(0.034, 0.02, 1.15, "x", 8.85, 1.96, 0, 12), cyl(0.022, 0.022, 0.16, "x", 9.5, 1.96, 0, 10), cyl(0.012, 0.012, 0.05, "x", 9.605, 1.96, 0, 8)]), L.steel],
      [mergeAll([box(0.06, 0.004, 0.05, 8.72, 1.96, 0.045, 0, 0, 0), box(0.06, 0.05, 0.004, 8.72, 2.0, 0, 0, 0, 0)]), L.black],
      [cyl(0.036, 0.036, 0.06, "x", 8.29, 1.96, 0, 12), L.steelDark],
    ];
    part("pitot", pit, V(1.2, 0.15, 0), { noShadow: true });
  }

  /* ═══════════ РЛС «Топаз»: антенна с приводом, ВЧ-блок ═══════════ */
  {
    const f = 0.42 * 0.42 / (4 * 0.14), prof = [];
    for (let i = 0; i <= 10; i++) { const r = (0.42 * i) / 10; prof.push([6.78 + (r * r) / (4 * f), r]); }
    const dish = latheX(prof, 40, { cy: 2.06 });
    const sub = mergeAll([cyl(0.07, 0.07, 0.015, "x", 7.08, 2.06, 0, 20), ...[0, 1, 2].map((k) => {
      const a = (k / 3) * TAU; return tube([[6.9, 2.06 + Math.cos(a) * 0.4, Math.sin(a) * 0.4], [7.08, 2.06 + Math.cos(a) * 0.06, Math.sin(a) * 0.06]], 0.006, 4, 4);
    })]);
    const gimbal = mergeAll([
      cyl(0.09, 0.09, 0.22, "x", 6.62, 2.06, 0, 16), box(0.08, 0.5, 0.06, 6.55, 2.06, 0.2), box(0.08, 0.5, 0.06, 6.55, 2.06, -0.2),
      cyl(0.07, 0.07, 0.12, "z", 6.55, 2.28, 0.2, 14), cyl(0.07, 0.07, 0.12, "z", 6.55, 2.28, -0.2, 14), box(0.1, 0.06, 0.46, 6.55, 1.82, 0),
    ]);
    part("radar_drive", [[dish, L.aluDS], [sub, L.aluDark], [gimbal, L.unitGrey]], V(1.3, 0.5, 0));
    const hf = mergeAll([rbox(0.34, 0.24, 0.5, 0.02, 6.44, 1.72, 0), box(0.06, 0.05, 0.3, 6.62, 1.86, 0.1, 0.4, 0, 0), box(0.2, 0.05, 0.05, 6.5, 1.92, -0.12)]);
    const hfConn = mergeAll([cyl(0.02, 0.02, 0.05, "x", 6.62, 1.72, 0.15, 10), cyl(0.02, 0.02, 0.05, "x", 6.62, 1.72, -0.15, 10), cyl(0.02, 0.02, 0.05, "x", 6.62, 1.66, 0, 10)]);
    part("radar_hf", [[hf, L.unitGrey], [hfConn, L.brass]], V(1.4, -0.35, 0));
    air(mergeAll([cyl(0.03, 0.03, 0.2, "x", 6.4, 2.3, 0.25, 8), box(0.12, 0.3, 0.08, 6.36, 2.1, -0.3)]), L.primerGrey);
  }

  /* ═══════════ кабина ═══════════ */
  {
    const hc = HOLES.cockpit;
    air(bayFromHole(CORE, hc, 1.98, 14), L.cockpit);
    // приборная доска с козырьком
    const pg = new THREE.PlaneGeometry(0.78, 0.46); pg.rotateY(-Math.PI / 2); pg.rotateZ(-0.3); pg.translate(4.40, 2.5, 0);
    air(pg, L.panelMat || L.cockpitDark);
    air(mergeAll([rbox(0.3, 0.05, 0.86, 0.02, 4.52, 2.75, 0), box(0.04, 0.5, 0.84, 4.46, 2.48, 0)]), L.cockpitDark);
    // ИЛС
    air(mergeAll([box(0.03, 0.2, 0.03, 4.63, 2.86, 0.14), box(0.03, 0.2, 0.03, 4.63, 2.86, -0.14), box(0.2, 0.05, 0.3, 4.62, 2.78, 0)]), L.black);
    const hg = new THREE.PlaneGeometry(0.28, 0.2); hg.rotateY(-Math.PI / 2); hg.rotateZ(-0.55); hg.translate(4.62, 2.9, 0);
    air(hg, L.hudGlass || L.glassDark, { noShadow: true });
    // пульты
    air(mergeAll([box(1.2, 0.2, 0.16, 3.62, 2.26, 0.39), box(1.2, 0.2, 0.16, 3.62, 2.26, -0.39)]), L.cockpit);
    air(mergeAll([place(new THREE.PlaneGeometry(1.18, 0.15), 3.62, 2.365, 0.39, -Math.PI / 2, 0, 0), place(new THREE.PlaneGeometry(1.18, 0.15), 3.62, 2.365, -0.39, -Math.PI / 2, 0, 0)]), L.consoleMat || L.cockpitDark);
    // РУС и РУД
    air(mergeAll([cyl(0.018, 0.022, 0.46, "y", 3.98, 2.2, 0, 10), rbox(0.05, 0.12, 0.045, 0.015, 3.98, 2.46, 0)]), L.black);
    air(mergeAll([box(0.05, 0.14, 0.03, 3.52, 2.43, -0.37, 0, 0, 0.3), box(0.05, 0.14, 0.03, 3.52, 2.43, -0.41, 0, 0, 0.3)]), L.black);
    // направляющие кресла
    air(mergeAll([box(0.05, 1.1, 0.05, 2.86, 2.5, 0.2), box(0.05, 1.1, 0.05, 2.86, 2.5, -0.2)]), L.steelDark);
    anchors.pilotEye = V(3.28, 3.0, 0);
    anchors.seat = V(3.2, 2.3, 0);
  }
  /* катапультное кресло К-36ДМ (узел «пиропатроны кресла») */
  {
    const bucket = mergeAll([rbox(0.46, 0.14, 0.44, 0.03, 3.26, 2.22, 0), rbox(0.1, 0.72, 0.46, 0.03, 2.98, 2.6, 0, 0, 0, 0.12)]);
    const head = mergeAll([rbox(0.2, 0.3, 0.36, 0.04, 2.96, 3.08, 0, 0, 0, 0.12), rbox(0.16, 0.08, 0.3, 0.02, 3.02, 3.25, 0, 0, 0, 0.12)]);
    const cushion = mergeAll([rbox(0.4, 0.08, 0.38, 0.03, 3.26, 2.32, 0), rbox(0.07, 0.56, 0.38, 0.03, 3.04, 2.64, 0, 0, 0, 0.12)]);
    const sides = mergeAll([box(0.5, 0.26, 0.03, 3.2, 2.3, 0.24), box(0.5, 0.26, 0.03, 3.2, 2.3, -0.24), box(0.08, 0.95, 0.03, 2.94, 2.66, 0.25), box(0.08, 0.95, 0.03, 2.94, 2.66, -0.25)]);
    const handle = mergeAll([torus(0.07, 0.012, "x", 3.5, 2.28, 0, 6, 16, Math.PI)]);
    const straps = mergeAll([box(0.02, 0.5, 0.05, 3.08, 2.62, 0.12, 0, 0, 0.2), box(0.02, 0.5, 0.05, 3.08, 2.62, -0.12, 0, 0, 0.2)]);
    part("seat_pyro", [[bucket, L.seatGreen], [head, L.cockpitDark], [cushion, L.seatGreen], [sides, L.gearGreen], [handle, L.yellowStripe], [straps, L.hose]], V(0, 1.5, 0));
  }

  /* ═══════════ фонарь: неподвижный козырёк + откидная часть на заднем шарнире ═══════════ */
  const canopy = new THREE.Group(); canopy.position.set(CANOPY.hingeX, CANOPY.hingeY, 0); plane.add(canopy);
  {
    const sill = (x) => { const [y, z] = sePoint(CORE(x), CANOPY.sillT); return [y, z]; };
    const canPt = (x, phi, grow = 0) => {
      const c = canopyTop(x), [ys, zs] = sill(x), hw = zs * 1.015 + grow, H = c.top - ys + grow;
      const a = phi * Math.PI / 2, s = Math.sin(a), co = Math.abs(Math.cos(a));
      return [x, ys + H * Math.pow(co, 0.87), hw * Math.sign(s) * Math.pow(Math.abs(s), 0.87)];
    };
    const glass = (x0, x1, nx) => gridSurface((x, p) => canPt(x, p), range(x0, x1, nx), range(-1, 1, 30));
    const ws = glass(CANOPY.x0, CANOPY.xw, 10);
    const mv = glass(CANOPY.xw - 0.01, CANOPY.x1, 18);
    const glassMat = L.canopyGlass || L.canopy;
    const wsM = new THREE.Mesh(ws, glassMat); wsM.userData.interact = "canopy"; plane.add(wsM); pickables.push(wsM);
    const mvM = new THREE.Mesh(mv, glassMat); mvM.userData.interact = "canopy"; mvM.position.set(-CANOPY.hingeX, -CANOPY.hingeY, 0); canopy.add(mvM); pickables.push(mvM);
    // переплёт
    const arch = (x, r, grow) => { const pts = []; for (let i = 0; i <= 16; i++) pts.push(canPt(x, -1 + i / 8, grow)); return tube(pts, r, 32, 6); };
    const rail = (x0, x1, side, r) => { const pts = []; for (let i = 0; i <= 12; i++) { const x = x0 + ((x1 - x0) * i) / 12; pts.push(canPt(x, side, 0.004)); } return tube(pts, r, 24, 6); };
    air(mergeAll([arch(CANOPY.xw + 0.012, 0.02, 0.006), rail(CANOPY.x0, CANOPY.xw, 1, 0.014), rail(CANOPY.x0, CANOPY.xw, -1, 0.014)]), L.paint);
    const mvFrame = mergeAll([arch(CANOPY.xw - 0.025, 0.022, 0.008), arch(CANOPY.x1 + 0.03, 0.03, 0.01), rail(CANOPY.xw, CANOPY.x1, 1, 0.022), rail(CANOPY.xw, CANOPY.x1, -1, 0.022),
      box(0.06, 0.03, 0.05, 4.2, canopyTop(4.2).top + 0.02, 0)]);
    const fr = new THREE.Mesh(mvFrame, L.paintDouble); fr.castShadow = true; fr.position.set(-CANOPY.hingeX, -CANOPY.hingeY, 0); fr.userData.interact = "canopy"; canopy.add(fr); pickables.push(fr);
    // перископ
    const per = new THREE.Mesh(place(new THREE.SphereGeometry(0.035, 10, 8), 4.26, canopyTop(4.26).top + 0.05, 0, 0, 0, 0, 1.6, 0.8, 1), L.chrome); per.position.set(-CANOPY.hingeX, -CANOPY.hingeY, 0); canopy.add(per);
    anchors.canopyGlassMeshes = [wsM, mvM];
  }

  /* ═══════════ закабинный отсек (жгут СУО, аккумулятор) и люк ═══════════ */
  {
    const h = HOLES.av;
    air(bayFromHole(CORE, h, 2.46, 8), L.bay);
    part("av_hatch", [[sectionPatch(CORE, h.x0 - 0.004, h.x1 + 0.004, h.t0 - 0.01, h.t1 + 0.01, { off: 0.003, thick: 0.014 }), L.paintDouble]], V(0, 0.9, 0.5));
    const wires = [];
    for (let k = 0; k < 5; k++) {
      const dz = -0.14 + k * 0.035, dy = (k % 2) * 0.02;
      wires.push(tube([[2.04, 2.5 + dy, dz], [1.8, 2.53 + dy, dz + 0.05], [1.55, 2.5 + dy, dz - 0.02], [1.22, 2.52 + dy, dz + 0.03]], 0.012, 20, 6));
    }
    const ties = mergeAll([1.4, 1.65, 1.9].map((x) => torus(0.07, 0.008, "x", x, 2.52, -0.07, 4, 12)));
    part("suo_harness", [[mergeAll(wires.slice(0, 3)), L.wireOrange], [mergeAll(wires.slice(3)), L.wireWhite], [ties, L.black]], V(0, 0.7, 0));
    const bat = mergeAll([rbox(0.3, 0.17, 0.22, 0.015, 1.5, 2.55, 0.18)]);
    const term = mergeAll([cyl(0.015, 0.015, 0.03, "y", 1.42, 2.65, 0.14, 8), cyl(0.015, 0.015, 0.03, "y", 1.58, 2.65, 0.14, 8), box(0.02, 0.02, 0.2, 1.5, 2.645, 0.18)]);
    part("battery", [[bat, L.battery], [term, L.brass]], V(0, 0.7, 0.3));
    air(mergeAll([rbox(0.26, 0.2, 0.2, 0.01, 1.85, 2.56, -0.02), rbox(0.2, 0.16, 0.14, 0.01, 1.35, 2.54, -0.16)]), L.unitGrey);
  }

  /* ═══════════ бак №3: люк-лаз, уплотнения, топливопровод ═══════════ */
  {
    const h = HOLES.tank;
    air(bayFromHole(CORE, h, 2.3, 8), L.bay);
    air(box(0.9, 0.02, 0.5, -1.62, 2.31, 0), L.black);
    part("tank3_hatch", [[sectionPatch(CORE, h.x0 - 0.004, h.x1 + 0.004, h.t0 - 0.01, h.t1 + 0.01, { off: 0.003, thick: 0.016 }), L.paintDouble],
      [mergeAll([-2.05, -1.9, -1.75, -1.6, -1.45, -1.3, -1.18].flatMap((x) => [cyl(0.012, 0.012, 0.012, "y", x, coreTopY(x, 0.24) + 0.006, 0.24, 8), cyl(0.012, 0.012, 0.012, "y", x, coreTopY(x, 0.24) + 0.006, -0.24, 8)])), L.steel]], V(0, 0.9, 0));
    const ring = new THREE.Shape(); ring.moveTo(-0.44, -0.2); ring.lineTo(0.44, -0.2); ring.lineTo(0.44, 0.2); ring.lineTo(-0.44, 0.2); ring.closePath();
    const holeS = new THREE.Path(); holeS.moveTo(-0.39, -0.15); holeS.lineTo(-0.39, 0.15); holeS.lineTo(0.39, 0.15); holeS.lineTo(0.39, -0.15); holeS.closePath(); ring.holes.push(holeS);
    const seal = new THREE.ExtrudeGeometry(ring, { depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 });
    seal.rotateX(-Math.PI / 2); seal.translate(-1.62, 2.35, 0);
    part("tank3_seal", [[seal, L.rubber]], V(0, 0.7, -0.4));
    const fl = mergeAll([tube([[-2.1, 2.36, 0.12], [-1.8, 2.4, 0.13], [-1.5, 2.38, 0.08], [-1.2, 2.4, 0.1]], 0.022, 20, 8), torus(0.028, 0.008, "x", -1.95, 2.385, 0.125, 6, 14), torus(0.028, 0.008, "x", -1.35, 2.39, 0.09, 6, 14)]);
    part("fuel_line", [[fl, L.brass]], V(0, 0.7, 0.4));
  }

  /* ═══════════ гидроотсек в «тоннеле» между мотогондолами ═══════════ */
  {
    const h = HOLES.hydro;
    air(bayFromHole(CORE, h, 2.08, 8), L.bay);
    part("hydro_tank", [[mergeAll([cyl(0.15, 0.15, 0.78, "x", -0.5, 1.88, -0.08, 20), sphere(0.15, -0.11, 1.88, -0.08, 0.3, 1, 1), sphere(0.15, -0.89, 1.88, -0.08, 0.3, 1, 1)]), L.aluDark],
      [mergeAll([cyl(0.03, 0.03, 0.08, "y", -0.3, 2.05, -0.08, 10), box(0.08, 0.1, 0.02, -0.65, 1.88, 0.075)]), L.brass]], V(0, -0.9, 0));
    part("hydro_filter", [[mergeAll([cyl(0.05, 0.05, 0.2, "y", 0.04, 1.86, 0.2, 14), cyl(0.056, 0.056, 0.03, "y", 0.04, 1.97, 0.2, 14)]), L.yellowFilter || L.brass]], V(0, -0.8, 0));
    const hoses = [];
    for (const s of [1, -1]) {
      hoses.push(tube([[-0.2, 1.9, -0.08], [0.0, 1.95, 0.25 * s], [-0.3, 2.0, 0.34 * s], [-0.6, 2.02, 0.4 * s]], 0.018, 20, 6));
      // тормозная магистраль по стойке
      const gz = GEAR.main.legZ * s;
      hoses.push(tube([[-0.62, 2.04, gz - 0.06 * s], [-0.64, 1.6, gz - 0.07 * s], [-0.66, 1.1, gz - 0.07 * s], [-0.7, 0.62, gz - 0.09 * s], [-0.72, 0.5, (GEAR.main.z + 0.06) * s]], 0.011, 30, 6));
    }
    part("hydro_hoses", [[mergeAll(hoses), L.hose]], V(0, -0.8, 0));
    air(mergeAll([cyl(0.04, 0.04, 0.25, "z", -1.0, 1.95, 0.1, 10), box(0.2, 0.12, 0.15, 0.0, 1.98, -0.2)]), L.unitGrey);
  }

  /* ═══════════ ниша носовой стойки и носовая стойка ═══════════ */
  {
    const h = HOLES.nosegear, gx = GEAR.nose.x, r = GEAR.nose.r;
    air(bayFromHole(CORE, h, 1.98, 8), L.bay);
    const leg = mergeAll([cyl(0.058, 0.058, 1.1, "y", gx + 0.05, 1.4, 0, 14), cyl(0.07, 0.07, 0.1, "y", gx + 0.05, 1.93, 0, 14),
      box(0.12, 0.08, 0.3, gx + 0.05, 1.92, 0), box(0.4, 0.05, 0.05, gx + 0.25, 1.6, 0, 0, 0, 0.9)]);
    air(leg, L.gearPaint, { collide: true });
    air(cyl(0.045, 0.045, 0.55, "y", gx + 0.04, 0.65, 0, 14), L.chrome);
    air(mergeAll([box(0.14, 0.06, 0.09, gx, r + 0.07, 0), cyl(0.028, 0.028, 0.44, "z", gx, r, 0, 10),
      box(0.16, 0.03, 0.08, gx + 0.1, 0.62, 0.05, 0, 0, -0.6), box(0.16, 0.03, 0.08, gx + 0.1, 0.5, 0.05, 0, 0, 0.6)]), L.gearPaint);
    // грязезащитный щиток за колёсами
    air(gridSurface((a, zz) => [gx - 0.12 - Math.sin(a) * 0.36, r + Math.cos(a) * 0.36, zz], range(-0.3, 1.25, 10), [-0.24, 0.24]), L.gearPaintD || L.gearPaint);
    for (const dz of [GEAR.nose.dz, -GEAR.nose.dz]) {
      air(place(lathed(r, GEAR.nose.w), gx, r, dz), L.tire);
      air(place(hubGeo(0.17, GEAR.nose.w + 0.01), gx, r, dz), L.aluDark);
    }
    // створки ниши
    for (const s of [1, -1]) {
      const z = s * 0.3;
      air(box(1.2, 0.5, 0.012, (h.x0 + h.x1) / 2, 1.3, z, 0, 0, 0), L.paintDouble);
    }
    // фары
    air(mergeAll([cyl(0.045, 0.05, 0.06, "x", gx + 0.12, 1.12, 0.07, 14), cyl(0.045, 0.05, 0.06, "x", gx + 0.12, 1.12, -0.07, 14)]), L.chrome);
    colliders.push(cyl(0.3, 0.3, 0.7, "y", gx, 0.35, 0, 10));
  }

  /* ═══════════ мотогондолы, воздухозаборники, капоты, двигатели РД-33, сопла ═══════════ */
  const nxs = range(NAC_X0, NAC_X1, Math.round(90 * detail), [COWL.x0, COWL.x1]);
  const NN = 56, nth = angles(NN);
  const nacR = gridSurface((x, t) => nacPoint(x, t), nxs, nth, {
    closedV: true,
    skip: (i, j) => { const xm = (nxs[i] + nxs[i + 1]) / 2, tm = nth[j] + Math.PI / NN; return inX(xm, COWL) && angIn(tm, COWL.t0, COWL.t1); },
  });
  const nacGeo = { R: nacR, L: mirrorZ(nacR) };
  air(nacGeo.R, L.paint, { collide: true }); air(nacGeo.L, L.paint, { collide: true });
  // внутренняя обшивка отсека двигателя
  const liner = gridSurface((x, t) => { const p = NAC(x); const q = { ...p, w: p.w - 0.02, ht: p.ht - 0.02, hb: p.hb - 0.02 }; const [y, z] = sePoint(q, t); return [x, y, z]; },
    range(COWL.x0 - 0.05, COWL.x1 + 0.05, 20), nth, { closedV: true, flip: true });
  air(liner, L.primer); air(mirrorZ(liner), L.primer);
  // канал воздухозаборника, губа, створка защиты от посторонних предметов
  {
    const inset = 0.035;
    const inPt = (x, t) => { const p = NAC(Math.min(x, NAC_X0)); const q = { ...p, w: p.w - inset, ht: p.ht - inset, hb: p.hb - inset }; const [y, z] = sePoint(q, t); const f = Math.max(0, Math.min(1, (x - 1.55) / (NAC_X0 - 1.55))); return [x + INTAKE_SLOPE * (y - p.cy) * f, y, z]; };
    const duct = gridSurface(inPt, range(NAC_X0, 1.1, 12), nth, { closedV: true, flip: true });
    const lip = gridSurface((k, t) => (k ? inPt(NAC_X0, t) : nacPoint(NAC_X0, t)), [0, 1], nth, { closedV: true });
    const plate = (() => { const p = NAC(1.6); const g = new THREE.PlaneGeometry((p.w - inset) * 2, p.ht + p.hb - 0.06); g.rotateY(-Math.PI / 2); g.rotateZ(-0.35); g.translate(1.6, p.cy, p.cz); return g; })();
    air(duct, L.intakeDark); air(mirrorZ(duct), L.intakeDark);
    air(lip, L.aluDark); air(mirrorZ(lip), L.aluDark);
    air(plate, L.primerGrey); air(mirrorZ(plate), L.primerGrey);
  }
  // жалюзи дополнительных входов на наплывах (открыты на земле)
  {
    const sl = [], dk = [];
    for (let k = 0; k < 6; k++) {
      const x = 2.25 - k * 0.17;
      for (const s of [1, -1]) {
        const zc = s * (0.96 + (2.25 - x) * 0.12);
        const y = wingTopY(x, Math.abs(zc));
        dk.push(box(0.12, 0.004, 0.36, x, y + 0.002, zc));
        sl.push(box(0.14, 0.01, 0.37, x - 0.02, y + 0.03, zc, 0, 0, 0.55));
      }
    }
    air(mergeAll(dk), L.black, { noShadow: true }); air(mergeAll(sl), L.paint);
  }
  const buildEngineSide = (s) => {
    const S = s > 0 ? "R" : "L", mz = (g) => (s > 0 ? g : mirrorZ(g));
    const pc = NAC(-1.5), cyE = pc.cy, cz = (x) => NAC(x).cz;
    // капот
    part("cowl_" + S, [[mz(nacCowl()), L.paintDouble]], V(0, -1.2, 0.5 * s));
    // компрессор
    const compProf = [[0.05, 0.3], [0.0, 0.37], [-0.2, 0.375], [-0.22, 0.395], [-0.26, 0.395], [-0.28, 0.375], [-0.6, 0.38], [-0.62, 0.4], [-0.66, 0.4], [-0.68, 0.38], [-1.0, 0.385], [-1.02, 0.405], [-1.06, 0.405], [-1.08, 0.385], [-1.4, 0.39], [-1.45, 0.3]];
    const comp = latheX(compProf.map(([x, r]) => [x, r]), 40, { cy: cyE, cz: cz(-0.7) });
    const compPipes = mergeAll([tube([[0.0, cyE + 0.2, cz(0) + 0.33], [-0.5, cyE + 0.25, cz(-0.5) + 0.36], [-1.2, cyE + 0.15, cz(-1.2) + 0.37]], 0.02, 20, 6),
      tube([[-0.1, cyE - 0.3, cz(0) + 0.2], [-0.8, cyE - 0.33, cz(-0.8) + 0.22], [-1.3, cyE - 0.3, cz(-1.3) + 0.25]], 0.016, 20, 6)]);
    part("comp_" + S, [[mz(comp), L.alu], [mz(compPipes), L.steel]], V(0, -0.9, 0.9 * s));
    // камера сгорания и турбина
    const turbProf = [[-1.45, 0.39], [-1.5, 0.42], [-1.9, 0.43], [-1.93, 0.45], [-1.97, 0.45], [-2.0, 0.43], [-2.6, 0.42], [-2.63, 0.44], [-2.68, 0.44], [-2.7, 0.41], [-3.2, 0.39], [-3.25, 0.36]];
    const turb = latheX(turbProf, 40, { cy: cyE, cz: cz(-2.3) });
    const inj = mergeAll(Array.from({ length: 10 }, (_, k) => { const a = (k / 10) * TAU; return cyl(0.018, 0.018, 0.08, "x", -1.75, cyE + Math.cos(a) * 0.45, cz(-1.75) + Math.sin(a) * 0.45, 6); }));
    part("turb_" + S, [[mz(turb), L.burnt], [mz(inj), L.bronze]], V(0, -0.9, 0.9 * s));
    // агрегаты на коробке приводов
    part("reg_" + S, [[mz(mergeAll([rbox(0.42, 0.15, 0.24, 0.02, -0.25, 1.2, cz(-0.25) - 0.06), cyl(0.03, 0.03, 0.1, "y", -0.12, 1.3, cz(-0.12) + 0.02, 8)])), L.olive]], V(0, -0.6, 0.5 * s));
    part("oilpump_" + S, [[mz(mergeAll([rbox(0.26, 0.13, 0.2, 0.02, -0.85, 1.2, cz(-0.85) - 0.05), cyl(0.04, 0.04, 0.06, "z", -0.85, 1.2, cz(-0.85) + 0.08, 12)])), L.unitGrey]], V(0, -0.6, 0.5 * s));
    part("oilfilt_" + S, [[mz(mergeAll([cyl(0.055, 0.055, 0.24, "x", -1.42, 1.2, cz(-1.42) - 0.04, 14), cyl(0.06, 0.06, 0.03, "x", -1.3, 1.2, cz(-1.3) - 0.04, 14)])), L.yellowFilter || L.brass]], V(0, -0.6, 0.5 * s));
    air(mz(mergeAll([rbox(0.9, 0.12, 0.28, 0.03, -0.55, 1.28, cz(-0.55)), cyl(0.05, 0.05, 0.3, "y", -0.55, 1.45, cz(-0.55), 10)])), L.aluDark);
    // форсажная труба (неснимаемая) и хвостовой конус турбины
    const jp = latheX([[-3.2, 0.38], [-4.5, 0.39], [-6.0, 0.385], [-6.75, 0.36]], 32, { cy: cyE, cz: cz(-5) });
    air(mz(jp), L.jetpipe);
    air(mz(latheX([[-3.2, 0.2], [-3.5, 0.16], [-3.8, 0.02]], 20, { cy: cyE, cz: cz(-3.4) })), L.burnt);
    // сопло: 18 внешних створок с проставками
    const nzc = NAC(NAC_X1), petals = [], seals = [];
    const P = 18, NL = 0.72;
    for (let k = 0; k < P; k++) {
      // створки внахлёст: каждая чуть повёрнута и приподнята над соседней — видна «чешуя» сопла
      const a = (k / P) * TAU, hw = (TAU / P) * 0.56, lift = (k % 2) * 0.009;
      petals.push(gridSurface((u, v) => { const x = NAC_X1 - u * NL, r = 0.472 - 0.078 * Math.pow(u, 1.15) + lift + v * 0.004; const t = a + v * hw; return [x, nzc.cy + r * Math.cos(t), nzc.cz + r * Math.sin(t)]; },
        range(0, 1, 6), range(-1, 1, 4)));
      const b = a + TAU / P / 2;
      seals.push(gridSurface((u, v) => { const x = NAC_X1 - u * NL * 0.98, r = 0.468 - 0.077 * Math.pow(u, 1.15) + 0.012; const t = b + v * 0.022; return [x, nzc.cy + r * Math.cos(t), nzc.cz + r * Math.sin(t)]; },
        range(0, 1, 4), [-1, 1]));
    }
    const ring = mergeAll([torus(0.478, 0.018, "x", NAC_X1 + 0.01, nzc.cy, nzc.cz, 6, 40), torus(0.4, 0.012, "x", NAC_X1 - NL, nzc.cy, nzc.cz, 6, 40)]);
    const inner = latheX([[NAC_X1 - NL - 0.01, 0.395], [NAC_X1 - NL + 0.25, 0.36], [NAC_X1 - NL + 0.45, 0.355]], 32, { cy: nzc.cy, cz: nzc.cz, flip: true });
    part("nozzle_" + S, [[mz(mergeAll(petals)), L.titanium], [mz(mergeAll(seals)), L.jetpipe], [mz(ring), L.steelDark], [mz(inner), L.jetpipe]], V(-1.4, 0, 0));
    // форсажная камера: стабилизаторы пламени и коллекторы
    const ab = mergeAll([torus(0.27, 0.022, "x", -5.75, cyE, cz(-5.75), 6, 36), torus(0.15, 0.02, "x", -5.75, cyE, cz(-5.75), 6, 28),
      torus(0.32, 0.01, "x", -5.55, cyE, cz(-5.55), 5, 36),
      ...Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * TAU; return place(new THREE.BoxGeometry(0.03, 0.2, 0.025), -5.75, cyE + Math.cos(a) * 0.21, cz(-5.75) + Math.sin(a) * 0.21, a, 0, 0); })]);
    part("ab_" + S, [[mz(ab), L.burnt]], V(-1.2, 0.3, 0));
    anchors["nozzle" + S] = V(NAC_X1 - NL, nzc.cy, nzc.cz * s);
    anchors["intake" + S] = V(NAC_X0, NAC(NAC_X0).cy, NAC(NAC_X0).cz * s);
    // привод стабилизатора
    const ay = STAB.y0 - 0.12, az = 1.6;
    const act = mergeAll([cyl(0.05, 0.05, 0.5, "x", -5.3, ay, az, 14), cyl(0.026, 0.026, 0.36, "x", -5.7, ay, az, 10), sphere(0.04, -5.88, ay, az)]);
    const actFit = mergeAll([box(0.1, 0.07, 0.07, -5.02, ay, az), box(0.08, 0.1, 0.05, -5.9, ay + 0.06, az)]);
    part("stab_" + S, [[mz(act), L.chrome], [mz(actFit), L.gearPaint]], V(0, -0.7, 0.3 * s));
  };
  function nacCowl() { return sectionPatchNac(COWL.x0 + 0.01, COWL.x1 - 0.01, COWL.t0, COWL.t1); }
  buildEngineSide(1); buildEngineSide(-1);
  // обтекатели приводов стабилизаторов
  for (const s of [1, -1]) air(place(new THREE.SphereGeometry(0.1, 16, 10), -4.95, STAB.y0 - 0.02, 1.53 * s, 0, 0, 0, 2.6, 0.8, 0.7), L.paint);

  /* ═══════════ наплывы и крыло ═══════════ */
  const wingR = airfoilSurface(WING_SECTIONS, (x, y, s) => [x, y, s], { M: 26 });
  air(wingR, L.paint, { collide: true }); air(mirrorZ(wingR), L.paint, { collide: true });
  // законцовки: огни
  for (const s of [1, -1]) {
    const tip = WING_SECTIONS[WING_SECTIONS.length - 1];
    const lm = new THREE.Mesh(sphere(0.035, tip.le - 0.25, tip.off, s * (tip.s + 0.01), 1.6, 0.8, 1), s > 0 ? L.navGreen : L.navRed);
    plane.add(lm); lights[s > 0 ? "navR" : "navL"] = lm;
  }

  /* ═══════════ кили ═══════════ */
  {
    const c = Math.cos(FIN.cant), sn = Math.sin(FIN.cant);
    const map = (x, t, s) => [x, FIN.y0 + s * c - t * sn, FIN.z + s * sn + t * c];
    const main = airfoilSurface(FIN.sections.slice(0, 5), (x, t, s) => map(x, t, s), { M: 20, capEnd: false, flip: true });
    const tipSecs = [FIN.sections[4], FIN.sections[5]];
    const tip = airfoilSurface(tipSecs, (x, t, s) => map(x, t, s), { M: 20, capEnd: true, flip: true });
    air(main, L.paint, { collide: true }); air(mirrorZ(main), L.paint, { collide: true });
    air(tip, L.dielectric); air(mirrorZ(tip), L.dielectric);
    // корневые наплывы килей
    const strake = airfoilSurface([{ s: 0, le: -1.9, c: 1.8, t: 0.05 }, { s: 0.3, le: -3.4, c: 0.3, t: 0.05 }], (x, t, s) => map(x, t, s), { M: 10, flip: true });
    air(strake, L.paint); air(mirrorZ(strake), L.paint);
    // антенны на законцовках
    const ant = place(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 10), -6.35, FIN.y0 + 2.42 * c, FIN.z + 2.42 * sn, 0, 0, Math.PI / 2);
    air(ant, L.dielectric); air(mirrorZ(ant), L.dielectric);
    const tl = new THREE.Mesh(sphere(0.03, -8.06, 2.18, 0), L.navWhite); plane.add(tl); lights.tail = tl;
  }

  /* ═══════════ стабилизаторы (цельноповоротные, группы вращения) ═══════════ */
  const stabs = {};
  for (const s of [1, -1]) {
    const g = new THREE.Group(); g.position.set(STAB.pivotX, STAB.y0, STAB.z0 * s); plane.add(g);
    const surf = airfoilSurface(STAB.sections, (x, t, z) => [x - STAB.pivotX, t + (z - STAB.z0) * Math.tan(STAB.anh), z - STAB.z0], { M: 20 });
    const geo = s > 0 ? surf : mirrorZ(surf);
    // сдвиг к системе самолёта для шейдера окраски: храним вершины в координатах самолёта
    geo.translate(STAB.pivotX, STAB.y0, STAB.z0 * s);
    const m = new THREE.Mesh(geo, L.paint); m.position.set(-STAB.pivotX, -STAB.y0, -STAB.z0 * s);
    m.castShadow = m.receiveShadow = true; g.add(m); pickables.push(m); airframeMeshes.push(m);
    colliders.push(geo);
    stabs[s > 0 ? "R" : "L"] = g;
  }

  /* ═══════════ основные стойки шасси ═══════════ */
  for (const s of [1, -1]) {
    const S = s > 0 ? "R" : "L", mg = GEAR.main, gx = mg.x, lz = mg.legZ, wz = mg.z, r = mg.r;
    const mz = (g) => (s > 0 ? g : mirrorZ(g));
    const tire = place(lathed(r, mg.w), gx, r, wz);
    const hub = place(hubGeo(0.25, mg.w + 0.02), gx, r, wz);
    part("wheel_" + S, [[mz(tire), L.tire], [mz(hub), L.aluDark]], V(0, 0, 1.3 * s));
    const disc = mergeAll([cyl(0.2, 0.2, 0.1, "z", gx, r, wz - 0.1, 28), ...Array.from({ length: 6 }, (_, k) => cyl(0.205, 0.205, 0.008, "z", gx, r, wz - 0.14 + k * 0.016, 28))]);
    const cal = mergeAll([box(0.14, 0.12, 0.1, gx + 0.16, r + 0.12, wz - 0.12), cyl(0.025, 0.025, 0.1, "z", gx + 0.17, r + 0.18, wz - 0.12, 8)]);
    part("brakes_" + S, [[mz(disc), L.burnt], [mz(cal), L.gearPaint]], V(0, 0, 0.8 * s));
    const barrel = mergeAll([cyl(0.078, 0.078, 1.1, "y", gx, 1.56, lz, 18), cyl(0.1, 0.1, 0.12, "y", gx, 2.04, lz, 18), cyl(0.05, 0.05, 0.34, "z", gx, 2.0, lz - 0.1, 12)]);
    const piston = cyl(0.056, 0.056, 0.55, "y", gx, 0.86, lz, 16);
    const axle = mergeAll([box(0.18, 0.16, 0.12, gx, r + 0.02, lz), cyl(0.045, 0.045, lz - wz + 0.04, "z", gx, r, (lz + wz) / 2, 12)]);
    const links = mergeAll([box(0.03, 0.34, 0.06, gx + 0.1, 1.08, lz, 0, 0, -0.35), box(0.03, 0.34, 0.06, gx + 0.1, 0.78, lz, 0, 0, 0.35)]);
    const brace = mergeAll([tube([[gx, 1.35, lz], [gx + 0.5, 1.75, lz - 0.08], [gx + 0.9, 2.05, lz - 0.12]], 0.035, 12, 8), tube([[gx - 0.02, 1.25, lz], [gx - 0.2, 1.7, lz - 0.2], [gx - 0.35, 2.05, lz - 0.3]], 0.026, 12, 8)]);
    part("strut_" + S, [[mz(mergeAll([barrel, axle, links, brace])), L.gearPaint], [mz(piston), L.chrome]], V(0, -0.4, 0.9 * s));
    // створка ниши основной стойки
    air(mz(mergeAll([box(0.72, 0.72, 0.012, gx - 0.12, 1.62, lz + 0.11), box(0.5, 0.012, 0.3, gx + 0.35, 2.05, lz - 0.28)])), L.paintDouble);
    // фара на стойке (левой)
    if (s < 0) air(mz(cyl(0.05, 0.055, 0.07, "x", gx + 0.12, 1.3, lz, 14)), L.chrome);
    colliders.push(mz(cyl(0.45, 0.45, 1.2, "y", gx, 0.6, (lz + wz) / 2, 12)));
    anchors["wheel" + S] = V(gx, r, wz * s);
  }

  /* ═══════════ мелкие детали: ОЛС, антенны, пушка, маяки ═══════════ */
  {
    air(mergeAll([cyl(0.1, 0.12, 0.08, "y", 5.18, 2.74, 0.16, 16)]), L.black);
    air(sphere(0.105, 5.18, 2.79, 0.16, 1, 1, 1, 20, 12), L.lens);
    const blade = (x, y, h, down) => place(new THREE.BoxGeometry(0.28, h, 0.012), x, y + (down ? -h / 2 : h / 2), 0, 0, 0, down ? -0.25 : 0.25);
    air(mergeAll([blade(-0.6, 2.77, 0.16), blade(-3.0, 2.6, 0.12), blade(1.0, CORE(1).cy - CORE(1).hb, 0.14, true)]), L.dielectric);
    // пушка ГШ-30-1 в корне левого наплыва
    air(cyl(0.028, 0.034, 0.3, "x", 2.55, 2.26, -0.78, 12), L.steelDark);
    air(cyl(0.045, 0.045, 0.04, "x", 2.7, 2.26, -0.78, 12), L.black);
    const b1 = new THREE.Mesh(sphere(0.045, -1.0, CORE(-1).cy + CORE(-1).ht + 0.01, 0, 1, 0.6, 1), L.navRed); plane.add(b1);
    const b2 = new THREE.Mesh(sphere(0.045, 0.6, CORE(0.6).cy - CORE(0.6).hb - 0.01, 0, 1, 0.6, 1), L.navRed); plane.add(b2);
    lights.beacons = [b1, b2];
    // контейнер тормозного парашюта между килями (характерный «цилиндр» МиГ-29)
    { const top = (x) => CORE(x).cy + CORE(x).ht;
      const prof = [[-4.7, 0.02], [-4.85, 0.13], [-5.3, 0.17], [-6.9, 0.175], [-7.35, 0.16], [-7.55, 0.1], [-7.62, 0.0]];
      air(latheX(prof, 28, { cy: top(-6) + 0.12, cz: 0 }), L.paint);
      air(mergeAll([torus(0.176, 0.006, "x", -7.3, top(-6) + 0.12, 0, 4, 28), box(0.5, 0.1, 0.12, -5.6, top(-5.6) + 0.02, 0)]), L.steelDark); }
    // подфюзеляжные гребни под мотогондолами
    for (const s of [1, -1]) {
      const cz = NAC(-5.6).cz * s, yb = NAC(-5.6).cy - NAC(-5.6).hb + 0.03;
      const sh = new THREE.Shape(); sh.moveTo(-4.9, 0); sh.lineTo(-6.35, 0); sh.lineTo(-6.45, -0.34); sh.lineTo(-5.95, -0.36); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.024, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 });
      g.translate(0, 0, -0.012); g.rotateX(s * 0.12); g.translate(0, yb, cz + s * 0.18);
      air(g, L.paint);
    }
    // точки швартовки/заземления
    air(mergeAll([cyl(0.03, 0.03, 0.05, "y", 4.2, CORE(4.2).cy - CORE(4.2).hb - 0.02, 0, 10)]), L.steel);
  }

  /* ═══════════ сборка слитых сеток планера ═══════════ */
  for (const { mat, geos, o } of buckets.values()) {
    const m = new THREE.Mesh(mergeAll(geos), mat);
    m.castShadow = !o.noShadow; m.receiveShadow = true;
    plane.add(m); pickables.push(m); airframeMeshes.push(m);
  }
  anchors.canopy = canopy; anchors.stabs = stabs;
  anchors.canopyHinge = V(CANOPY.hingeX, CANOPY.hingeY, 0);
  return { group: plane, parts, pickables, airframeMeshes, colliders, lights, anchors, canopy, stabs };
}

/* ---------- вспомогательные геометрии ---------- */
/* высота верхней обшивки фюзеляжа над точкой (x, z) */
export function coreTopY(x, z) {
  const p = CORE(x), s = Math.min(1, Math.abs(z) / p.w), sinT = Math.pow(s, p.nt / 2), cosT = Math.sqrt(Math.max(0, 1 - sinT * sinT));
  return p.cy + p.ht * Math.pow(cosT, 2 / p.nt);
}
/* верх наплыва/крыла в точке (x,|z|) — для деталей, лежащих на поверхности */
export function wingTopY(x, z) {
  const S = WING_SECTIONS;
  let i = 0; while (i < S.length - 2 && S[i + 1].s < z) i++;
  const a = S[i], b = S[i + 1], k = Math.max(0, Math.min(1, (z - a.s) / (b.s - a.s)));
  const le = a.le + (b.le - a.le) * k, c = a.c + (b.c - a.c) * k, t = a.t + (b.t - a.t) * k, off = a.off + (b.off - a.off) * k;
  const xc = Math.max(0.001, Math.min(1, (le - x) / c));
  const half = 5 * t * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1036 * xc ** 4) * c;
  return off + half;
}
/* шина: тор с прямоугольным сечением, ось вращения — Z */
function lathed(R, W) {
  const prof = [];
  const rIn = R * 0.58;
  const pts = [[rIn, -W / 2 * 0.9], [R * 0.8, -W / 2], [R * 0.95, -W / 2 * 0.9], [R, -W / 2 * 0.55], [R, 0], [R, W / 2 * 0.55], [R * 0.95, W / 2 * 0.9], [R * 0.8, W / 2], [rIn, W / 2 * 0.9]];
  for (const p of pts) prof.push(new THREE.Vector2(p[0], p[1]));
  const g = new THREE.LatheGeometry(prof, 48);
  g.rotateX(Math.PI / 2);
  // UV: u — по окружности (протектор), v — поперёк
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i));
  return g;
}
function hubGeo(R, W) {
  const pts = [[0.02, -W / 2], [R * 0.45, -W / 2], [R * 0.55, -W / 2 * 0.6], [R, -W / 2 * 0.5], [R, W / 2 * 0.5], [R * 0.55, W / 2 * 0.6], [R * 0.45, W / 2], [0.02, W / 2]];
  const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), 36);
  g.rotateX(Math.PI / 2);
  const bolts = [];
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; bolts.push(cyl(0.012, 0.012, 0.03, "z", Math.cos(a) * R * 0.35, Math.sin(a) * R * 0.35, W / 2, 6)); }
  return mergeAll([g, ...bolts]);
}
/* капот — заплатка на поверхности мотогондолы */
function sectionPatchNac(x0, x1, t0, t1) {
  const xs = range(x0, x1, 24), ts = range(t0, t1, 18);
  const pt = (x, t, o) => { const [px, y, z] = nacPoint(x, t); const p = NAC(x); const dy = y - p.cy, dz = z - p.cz, l = Math.hypot(dy, dz) || 1; return [px, y + (dy / l) * o, z + (dz / l) * o]; };
  const outer = gridSurface((x, t) => pt(x, t, 0.004), xs, ts);
  const inner = gridSurface((x, t) => pt(x, t, -0.012), xs, ts, { flip: true });
  const edge = (list) => gridSurface((i, k) => { const [x, t] = list[i]; return pt(x, t, k ? 0.004 : -0.012); }, list.map((_, i) => i), [0, 1], { flip: true });
  return mergeAll([outer, inner, edge(xs.map((x) => [x, ts[0]])), edge(xs.map((x) => [x, ts[ts.length - 1]]).reverse()), edge(ts.map((t) => [xs[0], t]).reverse()), edge(ts.map((t) => [xs[xs.length - 1], t]))]);
}
