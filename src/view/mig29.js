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
import { buildCockpit, buildSeat } from "./cockpit.js";
import { buildCanopy } from "./canopy.js";
import { buildMainGear, buildNoseGear } from "./gear.js";
import { buildDetails, perforatedMaterial, removeFlagMaterial, streamer, stabDischargers } from "./details.js";
import { engineBay, radarUnits, avBayUnits, hydroBayUnits } from "./bays.js";
import { buildRD33, rd33Materials, rd33Meshes, placeInNacelle } from "./rd33.js";

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
  const flagMat = removeFlagMaterial(), redCloth = new THREE.MeshStandardMaterial({ color: "#b51c17", roughness: 0.85, metalness: 0 });
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
      // чехол ПВД с красной лентой (самолёт на стоянке)
      [mergeAll([cyl(0.03, 0.03, 0.24, "x", 9.53, 1.96, 0, 12), sphere(0.03, 9.65, 1.96, 0, 0.6, 1, 1, 12, 8)]), redCloth],
      [streamer([9.47, 1.935, 0.0], 0.3, 0.034, 0.25), flagMat],
    ];
    part("pitot", pit, V(1.2, 0.15, 0), { noShadow: true });
  }

  /* ═══════════ РЛС «Топаз»: антенна с приводом, ВЧ-блок, шпангоут ═══════════ */
  {
    const R = radarUnits(L);
    part("radar_drive", R.drive, V(1.3, 0.5, 0));
    part("radar_hf", R.hf, V(1.4, -0.35, 0));
    air(R.staticGeo.bh, R.staticGeo.bhMat); air(R.staticGeo.brackets, L.primerGrey); air(R.staticGeo.cables, L.wireBlack);
  }

  /* ═══════════ кабина и кресло К-36ДМ (узел «пиропатроны кресла») ═══════════ */
  const cockpit = buildCockpit({ plane, air, part, L, anchors, pickables, detail });
  part("seat_pyro", buildSeat(part, L), V(0, 1.5, 0));

  /* ═══════════ фонарь: неподвижный козырёк + откидная часть на заднем шарнире ═══════════ */
  const { canopy } = buildCanopy({ plane, air, L, pickables, anchors });

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
    const U = avBayUnits();
    air(U.bodies, L.unitGrey); air(U.handles, L.black); air(U.conns, L.brass); air(U.shelf, L.primerGrey); air(U.cab, L.wireBlack);
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
      const lz = GEAR.main.legZ;
      hoses.push(tube([[-0.62, 2.04, s * (lz - 0.14)], [-0.83, 1.95, s * (lz - 0.1)], [-0.84, 1.5, s * (lz - 0.1)], [-0.84, 1.0, s * (lz - 0.1)], [-0.76, 0.76, s * (lz - 0.12)], [-0.63, 0.64, s * lz]], 0.011, 40, 6));
    }
    part("hydro_hoses", [[mergeAll(hoses), L.hose]], V(0, -0.8, 0));
    air(mergeAll([cyl(0.04, 0.04, 0.25, "z", -1.0, 1.95, 0.1, 10), box(0.2, 0.12, 0.15, 0.0, 1.98, -0.2)]), L.unitGrey);
    const HB = hydroBayUnits();
    air(HB.acc, L.gearPaint); air(HB.pump, L.unitGrey); air(HB.pipes, L.steel);
  }

  /* ═══════════ ниша носовой стойки и носовая опора ═══════════ */
  air(bayFromHole(CORE, HOLES.nosegear, 1.98, 8), L.bay);
  buildNoseGear({ air, L, colliders, flagMat, redCloth });

  /* ═══════════ мотогондолы, воздухозаборники, капоты, двигатели РД-33, сопла ═══════════ */
  const nxs = range(NAC_X0, NAC_X1, Math.round(90 * detail), [COWL.x0, COWL.x1]);
  const NN = 56, nth = angles(NN);
  const nacR = gridSurface((x, t) => nacPoint(x, t), nxs, nth, {
    closedV: true,
    skip: (i, j) => { const xm = (nxs[i] + nxs[i + 1]) / 2, tm = nth[j] + Math.PI / NN; return inX(xm, COWL) && angIn(tm, COWL.t0, COWL.t1); },
  });
  const nacGeo = { R: nacR, L: mirrorZ(nacR) };
  air(nacGeo.R, L.paint, { collide: true }); air(nacGeo.L, L.paint, { collide: true });
  // двигательный отсек изнутри: обшивка, шпангоуты, подвеска, жгуты, трубопроводы
  {
    const B = engineBay();
    for (const mz of [(g) => g, mirrorZ]) {
      air(mz(B.liner), L.primer); air(mz(B.frames), L.primerGrey); air(mz(B.mounts), L.steelDark);
      air(mz(B.harness), L.wireBlack); air(mz(B.pipes), L.steel); air(mz(B.clamps), L.steelDark);
    }
  }
  // канал воздухозаборника, губа, створка защиты от посторонних предметов
  {
    const inset = 0.016;                                            // острая кромка воздухозаборника
    const inPt = (x, t) => { const p = NAC(Math.min(x, NAC_X0)); const q = { ...p, w: p.w - inset, ht: p.ht - inset, hb: p.hb - inset }; const [y, z] = sePoint(q, t); const f = Math.max(0, Math.min(1, (x - 1.55) / (NAC_X0 - 1.55))); return [x + INTAKE_SLOPE * (y - p.cy) * f, y, z]; };
    const duct = gridSurface(inPt, range(NAC_X0, 1.1, 12), nth, { closedV: true, flip: true });
    const lip = gridSurface((k, t) => (k ? inPt(NAC_X0, t) : nacPoint(NAC_X0, t)), [0, 1], nth, { closedV: true });
    const plate = (() => { const p = NAC(1.6); const g = new THREE.PlaneGeometry((p.w - inset) * 2, p.ht + p.hb - 0.06); g.rotateY(-Math.PI / 2); g.rotateZ(-0.35); g.translate(1.6, p.cy, p.cz); return g; })();
    air(duct, L.intakeDark); air(mirrorZ(duct), L.intakeDark);
    air(lip, L.aluDark); air(mirrorZ(lip), L.aluDark);
    const perf = perforatedMaterial(); air(plate, perf); air(mirrorZ(plate), perf);
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
  const RD = buildRD33({ ab: false, detail, accessories: false }), RM = rd33Materials(L);
  const buildEngineSide = (s) => {
    const S = s > 0 ? "R" : "L", mz = (g) => (s > 0 ? g : mirrorZ(g));
    const pc = NAC(-1.5), cyE = pc.cy, cz = (x) => NAC(x).cz;
    // капот
    part("cowl_" + S, [[mz(nacCowl()), L.paintDouble]], V(0, -1.2, 0.5 * s));
    // РД-33: компрессорная часть и горячая часть — отдельные снимаемые узлы
    const inst = (grp) => rd33Meshes(RD, RM, grp).map(([g, m]) => [mz(placeInNacelle(g, 0.05, 1.12, 0.86, cyE, cz)), m]);
    part("comp_" + S, inst("comp"), V(0, -0.9, 0.9 * s));
    part("turb_" + S, inst("turb"), V(0, -0.9, 0.9 * s));
    // агрегаты на коробке приводов
    part("reg_" + S, [[mz(mergeAll([rbox(0.42, 0.15, 0.24, 0.02, -0.25, 1.2, cz(-0.25) - 0.06), cyl(0.03, 0.03, 0.1, "y", -0.12, 1.3, cz(-0.12) + 0.02, 8)])), L.olive]], V(0, -0.6, 0.5 * s));
    part("oilpump_" + S, [[mz(mergeAll([rbox(0.26, 0.13, 0.2, 0.02, -0.85, 1.2, cz(-0.85) - 0.05), cyl(0.04, 0.04, 0.06, "z", -0.85, 1.2, cz(-0.85) + 0.08, 12)])), L.unitGrey]], V(0, -0.6, 0.5 * s));
    part("oilfilt_" + S, [[mz(mergeAll([cyl(0.055, 0.055, 0.24, "x", -1.42, 1.2, cz(-1.42) - 0.04, 14), cyl(0.06, 0.06, 0.03, "x", -1.3, 1.2, cz(-1.3) - 0.04, 14)])), L.yellowFilter || L.brass]], V(0, -0.6, 0.5 * s));
    air(mz(mergeAll([rbox(0.9, 0.12, 0.28, 0.03, -0.55, 1.28, cz(-0.55)), cyl(0.05, 0.05, 0.3, "y", -0.55, 1.45, cz(-0.55), 10)])), L.aluDark);
    // форсажная труба (неснимаемая) и хвостовой конус турбины
    const jp = latheX([[-3.2, 0.38], [-4.5, 0.39], [-6.0, 0.385], [-6.75, 0.36]], 32, { cy: cyE, cz: cz(-5) });
    air(mz(jp), L.jetpipe);
    // гофрированный экран форсажной камеры, стойки заднего корпуса турбины, коллекторы форсажа — видно в сопло
    {
      const inner = [], cz5 = cz(-5);
      for (let x = -3.55; x > -6.6; x -= 0.28) inner.push(torus(0.368, 0.012, "x", x, cyE, cz5, 5, 36));
      for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; const g = new THREE.BoxGeometry(0.16, 0.2, 0.022); g.translate(0, 0.27, 0); g.rotateX(a); g.translate(-3.32, cyE, cz(-3.32)); inner.push(g); }
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU + 0.15; const g = new THREE.CylinderGeometry(0.007, 0.007, 0.2, 5); g.translate(0, 0.27, 0); g.rotateX(a); g.translate(-5.35, cyE, cz(-5.35)); inner.push(g); }
      air(mz(mergeAll(inner)), L.burnt, { noShadow: true });
    }
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
    const dg = s > 0 ? stabDischargers() : mirrorZ(stabDischargers()), dm = new THREE.Mesh(dg, L.black); dm.position.copy(m.position); g.add(dm);
    stabs[s > 0 ? "R" : "L"] = g;
  }

  /* ═══════════ основные опоры шасси ═══════════ */
  const bayDark = new THREE.MeshStandardMaterial({ color: "#1a1d1c", roughness: 0.9, side: THREE.DoubleSide });
  for (const s of [1, -1]) buildMainGear(s, { part, air, L, colliders, anchors, V, bayMat: bayDark, flagMat, redCloth });

  /* ═══════════ мелкие детали: ОЛС, антенны, пушка, маяки ═══════════ */
  {
    air(mergeAll([cyl(0.1, 0.12, 0.08, "y", 5.18, 2.74, 0.16, 16)]), L.black);
    air(sphere(0.105, 5.18, 2.79, 0.16, 1, 1, 1, 20, 12), L.lens);
    const blade = (x, y, h, down) => place(new THREE.BoxGeometry(0.28, h, 0.012), x, y + (down ? -h / 2 : h / 2), 0, 0, 0, down ? -0.25 : 0.25);
    air(mergeAll([blade(-0.6, 2.77, 0.16), blade(-3.0, 2.6, 0.12), blade(1.0, CORE(1).cy - CORE(1).hb, 0.14, true)]), L.dielectric);
    // пилоны, разрядники, датчики, пушка, дренажи
    buildDetails({ air, L, colliders, wingTopY });
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
  return { group: plane, parts, pickables, airframeMeshes, colliders, lights, anchors, canopy, stabs, cockpit };
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
/* капот — заплатка на поверхности мотогондолы */
function sectionPatchNac(x0, x1, t0, t1) {
  const xs = range(x0, x1, 24), ts = range(t0, t1, 18);
  const pt = (x, t, o) => { const [px, y, z] = nacPoint(x, t); const p = NAC(x); const dy = y - p.cy, dz = z - p.cz, l = Math.hypot(dy, dz) || 1; return [px, y + (dy / l) * o, z + (dz / l) * o]; };
  const outer = gridSurface((x, t) => pt(x, t, 0.004), xs, ts);
  const inner = gridSurface((x, t) => pt(x, t, -0.012), xs, ts, { flip: true });
  const edge = (list) => gridSurface((i, k) => { const [x, t] = list[i]; return pt(x, t, k ? 0.004 : -0.012); }, list.map((_, i) => i), [0, 1], { flip: true });
  return mergeAll([outer, inner, edge(xs.map((x) => [x, ts[0]])), edge(xs.map((x) => [x, ts[ts.length - 1]]).reverse()), edge(ts.map((t) => [xs[0], t]).reverse()), edge(ts.map((t) => [xs[xs.length - 1], t]))]);
}
