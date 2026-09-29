/* Сцена целиком: свет, окружение, самолёт, ангар, эффекты, камера-«облёт», API для игровой логики. */
import * as THREE from "three";
import { Render, QUALITY } from "./render.js";
import * as T from "./tex.js";
import { buildLibrary, cloneMat, PAINT } from "./materials.js";
import { buildPaintMaps } from "./mig29paint.js";
import { buildMig29 } from "./mig29.js";
import { buildWorld, H, PAD, SUN_DIR } from "./hangar.js";
import { makeFlame, Particles, makeDust, makeBeam } from "./effects.js";
import { boardNumberCanvas, flagCanvas, stencilCanvas, decal, decalMaterial, texFromCanvas } from "./decals.js";
import { buildTechnician, buildViewmodel } from "./character.js";
import { NAC, NAC_X1, FIN, CANOPY } from "./mig29dims.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader.js";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export const V = {
  R: null, scene: null, camera: null, L: null, M: null, W: null, tech: null,
  parts: {}, pickables: [], airframeMats: [], anims: [],
  hovered: null, selected: null, inspect: false, status: null,
  world: "hangar", canopy: 0, canopyTarget: 0, power: false, doorTarget: 1,
  fx: {}, shake: 0, envHangar: null, envPad: null, marker: null,
};

/* ═════════════ инициализация ═════════════ */
export async function initView(canvas, quality, progress = () => {}) {
  const R = V.R = new Render(canvas);
  R.q = QUALITY[quality] || R.q; R.qKey = QUALITY[quality] ? quality : "high";
  T.TEX.aniso = Math.min(R.maxAniso, R.q.aniso); T.TEX.scale = R.q.tex;
  V.scene = R.scene; V.camera = R.camera;
  progress(0.05, "Процедурные текстуры…"); await nextFrame();
  const TX = {};
  TX.paintedMetal = T.paintedMetalSet(); TX.brushed = T.brushedSet(); TX.tire = T.tireSet(); TX.heat = T.heatTintSet();
  TX.fabric = T.fabricSet(); TX.smudge = T.smudgeOrm(); TX.wood = T.woodTex();
  progress(0.15, "Бетонный пол ангара…"); await nextFrame();
  TX.floor = T.floorSet(); TX.floorMacro = T.floorMacro();
  progress(0.3, "Профнастил, перрон…"); await nextFrame();
  TX.corrugated = T.corrugatedSet(); TX.corrugatedRoof = T.corrugatedSet([150, 156, 160]); TX.apron = T.apronSet(); TX.grass = T.grassTex();
  progress(0.4, "Окраска планера: разделка панелей…"); await nextFrame();
  buildPaintMaps(R.q.tex >= 1 ? 1 : 0.7);
  const L = V.L = buildLibrary(TX);
  L.aluDS = L.alu.clone(); L.aluDS.side = THREE.DoubleSide;
  L.yellowFilter = new THREE.MeshStandardMaterial({ color: "#c9a13a", roughness: 0.45, metalness: 0.6 });
  L.radome.userData.paint.uTint.value.set("#a9b0b2");
  L.canopyGlass = R.q.glass ? L.canopy : L.canopyFallback;
  L.blackCyl = new THREE.MeshStandardMaterial({ color: "#1e2326", roughness: 0.5, metalness: 0.3 });
  L.redSign = new THREE.MeshStandardMaterial({ color: "#c62828", roughness: 0.6 });
  L.navBlue = new THREE.MeshStandardMaterial({ color: "#012", emissive: "#2a6bff", emissiveIntensity: 3 });

  progress(0.55, "Сборка МиГ-29БМ…"); await nextFrame();
  const M = V.M = buildMig29(L, { detail: R.q.tex >= 1 ? 1 : 0.75 });
  // материалы планера — собственные копии (рентген-режим не должен трогать оборудование ангара)
  for (const m of M.airframeMeshes) { const c = cloneMat(m.material); c.userData.isAir = true; m.material = c; V.airframeMats.push(c); }
  V.parts = M.parts; V.pickables = M.pickables;
  for (const id in M.parts) for (const m of M.parts[id].meshes) m.material.userData.base = m.material.color.clone();

  progress(0.65, "Ангар 558 АРЗ…"); await nextFrame();
  const W = V.W = buildWorld(L, TX, { quality: R.q });
  V.scene.add(W.root);
  M.group.position.set(0, H.lift, 0);
  V.scene.add(M.group);
  M.group.updateMatrixWorld(true);

  progress(0.72, "Надписи и бортовой номер…"); await nextFrame();
  buildDecals(M, L);
  buildContactShadow();

  // второй самолёт в дальнем пролёте
  if (R.q.second) {
    const g2 = M.group.clone(true);
    const matMap = new Map();
    g2.traverse((o) => { if (o.isMesh) { if (!matMap.has(o.material)) matMap.set(o.material, cloneMat(o.material)); o.material = matMap.get(o.material); } });
    const b2 = W.dyn.bay2; g2.position.set(b2.x, 0, b2.z); g2.rotation.y = b2.ry;
    // снятые капоты и обтекатель — как будто самолёт в ремонте
    g2.traverse((o) => { if (o.userData.slot && ["radome", "pitot", "cowl_L", "nozzle_R", "wheel_R"].includes(o.userData.slot)) o.visible = false; });
    V.scene.add(g2); V.plane2 = g2;
  }

  progress(0.8, "Свет и тени…"); await nextFrame();
  buildLights();
  buildFx();

  // персонаж
  V.tech = buildTechnician(TX);
  V.scene.add(V.tech.root); V.tech.root.visible = false;
  V.hands = buildViewmodel(TX);
  V.camera.add(V.hands.root); V.scene.add(V.camera);
  buildNPCs(TX);

  progress(0.88, "Отражения окружения…"); await nextFrame();
  R.setupComposer();
  captureEnvs();
  setWorld("hangar", true);
  progress(1, "Готово");
  return V;
}

function buildDecals(M, L) {
  const mesh = M.airframeMeshes.find((m) => m.material.userData.paint && m.material.userData.paint.uCamoMix.value === 1 && m.geometry.attributes.position.count > 20000) || M.airframeMeshes[0];
  mesh.updateMatrixWorld(true);
  const add = (d) => { d.castShadow = false; M.group.add(d); return d; };
  V.bortCanvas = boardNumberCanvas("23");
  V.bortTex = texFromCanvas(V.bortCanvas);
  const bortMat = decalMaterial(V.bortTex, 0.5);
  for (const s of [1, -1]) {
    const p = NAC(1.25), z = (p.cz + p.w) * s;
    add(decal(mesh, new THREE.Vector3(1.25, p.cy + 0.08, z), new THREE.Vector3(0, 0, s), new THREE.Vector3(s, 0, 0), 0.8, 0.42, bortMat, 0.4));
    // флаги на килях
    const c = Math.cos(FIN.cant), sn = Math.sin(FIN.cant), sv = 1.15;
    const fp = new THREE.Vector3(-5.35, FIN.y0 + sv * c, (FIN.z + sv * sn) * s), fn = new THREE.Vector3(0, -sn, c * s);
    add(decal(mesh, fp, fn, new THREE.Vector3(s, 0, 0), 0.95, 0.52, decalMaterial(texFromCanvas(flagCanvas())), 0.4));
    // трафареты
    const st = (k) => decalMaterial(texFromCanvas(stencilCanvas(k)));
    add(decal(mesh, new THREE.Vector3(3.95, 2.42, 0.64 * s), new THREE.Vector3(0, 0.1, s), new THREE.Vector3(s, 0, 0), 0.22, 0.11, st("danger")));
    add(decal(mesh, new THREE.Vector3(3.3, 2.48, 0.64 * s), new THREE.Vector3(0, 0.15, s), new THREE.Vector3(s, 0, 0), 0.5, 0.25, st("rescue")));
    add(decal(mesh, new THREE.Vector3(2.05, 1.95, (NAC(2.05).cz + NAC(2.05).w) * s), new THREE.Vector3(0, 0, s), new THREE.Vector3(s, 0, 0), 0.5, 0.25, st("intake")));
    add(decal(mesh, new THREE.Vector3(-3.85, 2.25, 3.0 * s), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -s), 0.7, 0.35, st("nostep"), 0.3));
    add(decal(mesh, new THREE.Vector3(1.4, 2.42, 1.15 * s), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), 0.8, 0.4, st("walk"), 0.3));
  }
  add(decal(mesh, new THREE.Vector3(-3.0, 2.64, 0.2), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), 0.34, 0.17, decalMaterial(texFromCanvas(stencilCanvas("fuel"))), 0.3));
  // технические трафареты у точек обслуживания
  const stm = {}; const st2 = (k) => (stm[k] = stm[k] || decalMaterial(texFromCanvas(stencilCanvas(k))));
  for (const s of [1, -1]) {
    const nz = (x) => (NAC(x).cz + NAC(x).w) * s;
    add(decal(mesh, new THREE.Vector3(-0.35, 1.62, nz(-0.35)), new THREE.Vector3(0, 0, s), new THREE.Vector3(s, 0, 0), 0.26, 0.13, st2("nitrogen"), 0.3));
    add(decal(mesh, new THREE.Vector3(-2.3, 1.7, nz(-2.3)), new THREE.Vector3(0, 0, s), new THREE.Vector3(s, 0, 0), 0.26, 0.13, st2("oil"), 0.3));
    add(decal(mesh, new THREE.Vector3(1.7, 1.95, nz(1.7)), new THREE.Vector3(0, 0, s), new THREE.Vector3(s, 0, 0), 0.34, 0.12, st2("noEntry"), 0.3));
    add(decal(mesh, new THREE.Vector3(2.85, 2.5, 0.6 * s), new THREE.Vector3(0, 0.2, s), new THREE.Vector3(s, 0, 0), 0.24, 0.12, st2("pyro"), 0.3));
    add(decal(mesh, new THREE.Vector3(1.4, 2.43, 0.95 * s), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), 1.3, 0.62, st2("walkLine"), 0.3));
  }
  add(decal(mesh, new THREE.Vector3(4.35, 2.4, 0.63), new THREE.Vector3(0, 0.1, 1), new THREE.Vector3(1, 0, 0), 0.24, 0.12, st2("canopyEmerg"), 0.3));
  add(decal(mesh, new THREE.Vector3(2.2, 2.62, 0.5), new THREE.Vector3(0, 0.45, 1), new THREE.Vector3(1, 0, 0), 0.26, 0.13, st2("oxygen"), 0.3));
  add(decal(mesh, new THREE.Vector3(-0.5, 1.67, 0.25), new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), 0.34, 0.17, st2("hydro"), 0.3));
  add(decal(mesh, new THREE.Vector3(3.6, 1.6, 0.2), new THREE.Vector3(0, -1, 0.2), new THREE.Vector3(1, 0, 0), 0.3, 0.15, st2("tow"), 0.3));
  add(decal(mesh, new THREE.Vector3(-4.3, 1.95, 1.55), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), 0.22, 0.11, st2("serial"), 0.3));
  const ag = new THREE.MeshStandardMaterial({ map: texFromCanvas(stencilCanvas("antiglare")), transparent: true, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
  add(decal(mesh, new THREE.Vector3(5.45, 2.75, 0), new THREE.Vector3(0.25, 1, 0), new THREE.Vector3(-1, 0, 0), 1.0, 0.72, ag, 0.5));
}

/* ═════════════ контактная тень под самолётом (запекается сверху вниз и размывается) ═════════════ */
function buildContactShadow() {
  const W = 23, D = 17, res = 512, camH = 3.6;
  const rt = new THREE.WebGLRenderTarget(res, res), rtB = new THREE.WebGLRenderTarget(res, res);
  rt.texture.generateMipmaps = rtB.texture.generateMipmaps = false;
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, D / 2, -D / 2, 0, camH);
  cam.rotation.x = Math.PI / 2; cam.position.set(-0.5, -H.lift + 0.01, 0); cam.layers.set(2);
  V.M.group.add(cam);
  const dm = new THREE.MeshDepthMaterial(); dm.depthTest = false; dm.depthWrite = false; dm.side = THREE.DoubleSide;
  dm.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );", "gl_FragColor = vec4( vec3( 0.0 ), clamp( pow( 1.0 - fragCoordZ, 1.3 ) * 1.5, 0.0, 1.0 ) );"); };
  const hb = new THREE.ShaderMaterial(HorizontalBlurShader), vb = new THREE.ShaderMaterial(VerticalBlurShader);
  hb.depthTest = vb.depthTest = false;
  const quad = new FullScreenQuad();
  const geo = new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, depthWrite: false, opacity: 1, polygonOffset: true, polygonOffsetFactor: -1 });
  const mesh = new THREE.Mesh(geo, mat); mesh.scale.y = -1; mesh.position.set(-0.5, -H.lift + 0.006, 0); mesh.renderOrder = 1;
  V.M.group.add(mesh); V.contactShadow = mesh; V._csRT = rt;
  V.M.group.traverse((o) => { if (o.isMesh && o !== mesh) o.layers.enable(2); });
  const blur = (amt) => {
    quad.material = hb; hb.uniforms.tDiffuse.value = rt.texture; hb.uniforms.h.value = amt / 256;
    V.R.renderer.setRenderTarget(rtB); quad.render(V.R.renderer);
    quad.material = vb; vb.uniforms.tDiffuse.value = rtB.texture; vb.uniforms.v.value = amt / 256;
    V.R.renderer.setRenderTarget(rt); quad.render(V.R.renderer);
  };
  V.updateContactShadow = () => {
    const r = V.R.renderer, sc = V.scene, bg = sc.background, ov = sc.overrideMaterial, env = sc.environment, fog = sc.fog;
    const pos = V.M.group.position.clone(), rot = V.M.group.rotation.y;
    V.M.group.position.set(0, H.lift, 0); V.M.group.rotation.y = 0; V.M.group.updateMatrixWorld(true);
    mesh.visible = false; sc.background = null; sc.overrideMaterial = dm; sc.fog = null;
    const cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha(); r.setClearColor(0x000000, 0);
    r.setRenderTarget(rt); r.clear(); r.render(sc, cam);
    sc.overrideMaterial = ov; blur(1.0); blur(0.45);
    r.setRenderTarget(null); r.setClearColor(cc, ca);
    sc.background = bg; sc.environment = env; sc.fog = fog; mesh.visible = true;
    V.M.group.position.copy(pos); V.M.group.rotation.y = rot; V.M.group.updateMatrixWorld(true);
  };
  V.updateContactShadow();
}

/* ═════════════ работники цеха ═════════════ */
function buildNPCs(TX) {
  V.npcs = [];
  const p2 = V.plane2;
  const at = (lx, lz) => (p2 ? p2.localToWorld(new THREE.Vector3(lx, 0, lz)) : new THREE.Vector3(-17.5 + lx * 0.3, 0, -9.5 + lz));
  const list = [
    { name: "Мастер участка Жук", pos: new THREE.Vector3(-12.2, 0, -20.35), face: new THREE.Vector3(0, 0, -1), work: 1, crouch: 0, suit: "#2e3a48" },
    { name: "Слесарь Ковалёв", pos: at(7.6, 0.75), faceTo: at(6.6, 0.1), work: 1, crouch: 0, suit: "#34424f" },
    { name: "Техник Лукашевич", pos: at(-0.9, 2.45), faceTo: at(-0.75, 1.6), work: 0.6, crouch: 1, suit: "#2b3542" },
    { name: "Контролёр ОТК Савицкая", pos: new THREE.Vector3(-26.4, 0, 14.6), face: new THREE.Vector3(0.2, 0, -1), work: 0, crouch: 0, suit: "#d9dcdc", cap: "#e6e8e8" },
  ];
  for (const n of list) {
    if (!p2 && n.faceTo) continue;            // без второго самолёта этим двоим нечего делать
    const t = buildTechnician(TX, { suit: n.suit, cap: n.cap });
    const f = n.face ? n.face.clone() : n.faceTo.clone().sub(n.pos).setY(0).normalize();
    t.root.position.copy(n.pos); t.root.rotation.y = Math.atan2(f.x, f.z);
    V.scene.add(t.root);
    V.W.colliders.push(new THREE.CylinderGeometry(0.32, 0.32, 1.7, 10).translate(n.pos.x, 0.85, n.pos.z));
    V.W.spots.push({ key: "npc", label: "Поговорить: " + n.name, npc: n.name, box: new THREE.Box3().setFromCenterAndSize(n.pos.clone().setY(1.0), new THREE.Vector3(0.7, 1.9, 0.7)) });
    V.npcs.push({ ...n, t, yaw: t.root.rotation.y, phase: Math.random() * 10 });
  }
}
export function updateNPCs(dt, eye) {
  for (const n of V.npcs || []) {
    n.phase += dt;
    const near = eye && n.t.root.position.distanceTo(eye) < 5;
    n.t.animate({ speed: 0, crouch: n.crouch, work: near && n.work < 1 ? 0 : n.work * (0.6 + 0.4 * Math.max(0, Math.sin(n.phase * 0.3))), dt, lookPitch: 0 });
    const h = n.t.parts.head;
    if (near) {
      const d = eye.clone().sub(n.t.root.position); let a = Math.atan2(d.x, d.z) - n.yaw;
      while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
      h.rotation.y += (THREE.MathUtils.clamp(a, -1.1, 1.1) - h.rotation.y) * Math.min(1, dt * 4);
    } else h.rotation.y *= 1 - Math.min(1, dt * 2);
  }
}

/* ═════════════ свет ═════════════ */
function buildLights() {
  const s = V.scene, q = V.R.q;
  const sun = V.sun = new THREE.DirectionalLight("#fff0da", 7);
  sun.castShadow = q.sunShadow;
  sun.shadow.mapSize.set(q.shadow, q.shadow); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 2;
  s.add(sun, sun.target);
  const key = V.key = new THREE.DirectionalLight("#fff5e8", 2.1);
  key.castShadow = true; key.shadow.mapSize.set(q.shadow, q.shadow); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.03; key.shadow.radius = 5;
  Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
  key.position.set(-3, 24, 5); s.add(key, key.target);
  V.hemi = new THREE.HemisphereLight("#dfe8ee", "#4a453e", 0.3); s.add(V.hemi);
  // тёплые светильники над рабочими местами
  V.spots = [];
  for (const [x, z] of [[-12.5, -19], [4.5, -19], [-26, 16]]) {
    const sp = new THREE.SpotLight("#ffd9a8", 30, 9, 0.9, 0.8, 1.5); sp.position.set(x, 4.5, z); sp.target.position.set(x, 0, z + 0.8); s.add(sp, sp.target); V.spots.push(sp);
  }
  // фонарик игрока
  const fl = V.flashlight = new THREE.SpotLight("#fff6e6", 0, 22, 0.42, 0.55, 1.4);
  fl.castShadow = q.ao; fl.shadow.mapSize.set(1024, 1024); fl.shadow.bias = -0.0005; fl.shadow.camera.near = 0.1;
  s.add(fl, fl.target);
}
function placeSun(center, half) {
  const sun = V.sun; sun.target.position.copy(center); sun.position.copy(center).addScaledVector(SUN_DIR, 90);
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 20, far: 190 });
  sun.shadow.camera.updateProjectionMatrix();
}

/* ═════════════ эффекты ═════════════ */
function buildFx() {
  const M = V.M, fx = V.fx;
  fx.flames = {};
  for (const s of ["L", "R"]) {
    const f = makeFlame(); const n = M.anchors["nozzle" + s];
    f.group.position.set(n.x - 0.05, n.y, n.z); M.group.add(f.group); fx.flames[s] = f;
  }
  fx.fire = new Particles(260, "fire"); fx.smoke = new Particles(220, "smoke");
  V.scene.add(fx.fire.points, fx.smoke.points);
  fx.wind = new THREE.Vector3(0.6, 0, 0.2);
  // лучи из окон (+Z стена) и ворот
  const beams = [], beamInfo = [];
  const d = SUN_DIR.clone().negate();
  if (V.R.q.dust) {
    for (let k = 0; k < 10; k++) {
      const xa = H.x0 + k * 6 + 0.6, xb = xa + 4.8, z = H.z - 0.2, y0 = 7.45, y1 = 10.15;
      const len = y1 / -d.y * 0.95;
      const b = makeBeam([new THREE.Vector3(xa, y1, z), new THREE.Vector3(xb, y1, z), new THREE.Vector3(xb, y0, z), new THREE.Vector3(xa, y0, z)], d, len, 0.05);
      V.W.hangar.add(b); beams.push(b);
      beamInfo.push({ a: new THREE.Vector3((xa + xb) / 2, (y0 + y1) / 2, z), b: new THREE.Vector3((xa + xb) / 2, (y0 + y1) / 2, z).addScaledVector(d, len * 0.8), w: 4.5, h: 2.5 });
    }
    const door = makeBeam([new THREE.Vector3(H.x1 + 0.3, H.doorH, -H.doorW), new THREE.Vector3(H.x1 + 0.3, H.doorH, H.doorW), new THREE.Vector3(H.x1 + 0.3, 0.3, H.doorW), new THREE.Vector3(H.x1 + 0.3, 0.3, -H.doorW)], d, 16, 0.012);
    V.W.hangar.add(door); beams.push(door);
    fx.dust = makeDust(beamInfo, 1800); V.W.hangar.add(fx.dust);
  }
  fx.beams = beams;
  // метка-ориентир
  const mk = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: "#e8c04a", transparent: true, opacity: 0.85, depthTest: false }));
  mk.renderOrder = 10; mk.visible = false; V.scene.add(mk); V.marker = mk;
}

function captureEnvs() {
  const hide = [V.M.group, V.tech ? V.tech.root : null, V.fx.fire.points, V.fx.smoke.points, V.marker, ...(V.fx.beams || []), V.fx.dust, V.plane2].filter(Boolean);
  // ангар: ворота открыты, солнечные пятна на полу
  placeSun(new THREE.Vector3(0, 0, 0), 40); V.sun.intensity = 7; V.key.intensity = 2.1;
  V.scene.environment = null;
  V.envHangar = V.R.captureEnv(new THREE.Vector3(2, 4.5, 0), hide, 256);
  placeSun(new THREE.Vector3(PAD.x, 0, PAD.z), 26);
  V.envPad = V.R.captureEnv(new THREE.Vector3(PAD.x, 3, PAD.z), hide, 256);
  V.envHangar = envSanity(V.envHangar, new THREE.Vector3(2, 4.5, 0));
  V.envPad = envSanity(V.envPad, new THREE.Vector3(PAD.x, 3, PAD.z));
}
/* страховка: если в кубокарту попали NaN/Infinity (драйвер, экзотичный GPU) — нейтральное окружение */
function envSanity(env, at) {
  const r = V.R.renderer, rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
  const probe = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ envMap: env, roughness: 0.3, metalness: 1 }));
  const sc = new THREE.Scene(); sc.add(probe);
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 10); cam.position.set(0, 0, 2.2); cam.lookAt(0, 0, 0);
  r.setRenderTarget(rt); r.render(sc, cam);
  const b = new Uint16Array(16 * 16 * 4); let bad = false;
  try { r.readRenderTargetPixels(rt, 0, 0, 16, 16, b); for (let i = 0; i < b.length; i++) if ((b[i] & 0x7c00) === 0x7c00) { bad = true; break; } } catch (e) { /* чтение не поддерживается — считаем, что всё в порядке */ }
  r.setRenderTarget(null); rt.dispose(); probe.geometry.dispose(); probe.material.dispose(); void at;
  if (!bad) return env;
  console.warn("envSanity: NaN в карте окружения, используем RoomEnvironment");
  return V.R.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
}
export function recaptureHangarEnv() {
  if (V.world !== "hangar") return;
  const hide = [V.M.group, V.tech.root, V.fx.fire.points, V.fx.smoke.points, V.marker, ...(V.fx.beams || []), V.fx.dust, V.plane2].filter(Boolean);
  const old = V.envHangar; V.envHangar = envSanity(V.R.captureEnv(new THREE.Vector3(2, 4.5, 0), hide, 256), null);
  V.scene.environment = V.envHangar; if (old) old.dispose();
}

/* ═════════════ мир: ангар / газовочная площадка ═════════════ */
export function setWorld(w, force) {
  if (V.world === w && !force) return;
  V.world = w;
  const M = V.M;
  if (w === "pad") {
    M.group.position.set(PAD.x, 0, PAD.z); M.group.rotation.y = PAD.ry;
    placeSun(new THREE.Vector3(PAD.x, 0, PAD.z), 26);
    V.sun.intensity = 4.6; V.key.intensity = 0; V.key.castShadow = false; V.hemi.intensity = 0.35; V.hemi.color.set("#cfe0f2"); V.hemi.groundColor.set("#6d6a60");
    V.scene.environment = V.envPad; V.scene.environmentIntensity = 0.8; V.R.exposure = 0.46;
    V.spots.forEach((s) => (s.visible = false));
    V.scene.fog = new THREE.Fog("#b9c9d6", 260, 1100);
  } else {
    M.group.position.set(0, H.lift, 0); M.group.rotation.y = 0;
    placeSun(new THREE.Vector3(0, 0, 0), 40);
    V.sun.intensity = V.R.q.sunShadow ? 7 : 0; V.key.intensity = 2.1; V.key.castShadow = true; V.hemi.intensity = 0.22; V.hemi.color.set("#dfe8ee"); V.hemi.groundColor.set("#4a453e");
    V.scene.environment = V.envHangar; V.scene.environmentIntensity = 0.72; V.R.exposure = 1.12;
    V.spots.forEach((s) => (s.visible = true));
    V.scene.fog = null;
  }
  M.group.updateMatrixWorld(true);
}

/* ═════════════ состояние деталей ═════════════ */
const TINT = { ok: new THREE.Color("#1f8a4c"), warn: new THREE.Color("#b8631c"), crit: new THREE.Color("#b21f1f"), unk: new THREE.Color("#2a4a66"), off: new THREE.Color("#2a4a66") };
const DAMAGE = new THREE.Color("#4a2c1c"), HOVER = new THREE.Color("#8a6d10"), SEL = new THREE.Color("#c99a18"), BLACK = new THREE.Color(0, 0, 0);
/* status(id) → {cls, on, damaged} — задаётся игровой логикой */
export function paintPart(id) {
  const p = V.parts[id]; if (!p) return;
  const st = V.status ? V.status(id) : null;
  let em = BLACK, ei = 0;
  if (V.inspect && st && st.on) { em = TINT[st.cls] || TINT.unk; ei = 0.9; }
  if (V.hovered === id) { em = HOVER; ei = 1; }
  if (V.selected === id) { em = SEL; ei = 1; }
  for (const m of p.meshes) {
    const mat = m.material;
    mat.emissive.copy(em).multiplyScalar(ei * 0.55);
    mat.color.copy(mat.userData.base); if (st && st.damaged) mat.color.lerp(DAMAGE, 0.45);
  }
}
export function paintAll() { for (const id in V.parts) paintPart(id); }
export function setXray(on) {
  for (const m of V.airframeMats) { m.transparent = on; m.opacity = on ? 0.16 : 1; m.depthWrite = !on; m.needsUpdate = true; }
}
export function setHover(id) { if (id === V.hovered) return; const o = V.hovered; V.hovered = id; if (o) paintPart(o); if (id) paintPart(id); }
export function setSelected(id) { const o = V.selected; V.selected = id; if (o) paintPart(o); if (id) paintPart(id); }

export function syncPlane(isOn, bort) {
  V.isOn = isOn;
  V.anims.length = 0;
  for (const id in V.parts) {
    const p = V.parts[id]; p.group.position.set(0, 0, 0); p.group.visible = isOn(id);
    for (const m of p.meshes) { m.material.opacity = 1; m.material.transparent = false; }
  }
  setBort(bort || "23");
  paintAll();
  if (V.updateContactShadow) V.updateContactShadow();
}
export function setBort(txt) {
  if (V._bort === txt) return; V._bort = txt;
  const c = boardNumberCanvas(txt), g = V.bortCanvas.getContext("2d");
  g.clearRect(0, 0, c.width, c.height); g.drawImage(c, 0, 0); V.bortTex.needsUpdate = true;
}
export function animPart(id, removing) {
  const p = V.parts[id]; p.group.visible = true;
  for (const m of p.meshes) m.material.transparent = true;
  V.anims = V.anims.filter((a) => a.id !== id);
  V.anims.push({ id, t: 0, dur: 0.9, removing });
}
/* ПВД стоит на носке обтекателя: без обтекателя его не видно, при снятии обтекателя он уезжает вместе с ним */
function syncPitot() {
  const r = V.parts.radome, p = V.parts.pitot; if (!r || !p) return;
  if (V.anims.some((a) => a.id === "pitot")) return;
  const pitotOn = V.isOn ? V.isOn("pitot") : true;
  p.group.visible = pitotOn && r.group.visible;
  p.group.position.copy(r.group.position);
  for (let i = 0; i < p.meshes.length; i++) { const rm = r.meshes[0].material; p.meshes[i].material.transparent = rm.transparent; p.meshes[i].material.opacity = rm.opacity; }
}
function stepAnims(dt) {
  for (let i = V.anims.length - 1; i >= 0; i--) {
    const a = V.anims[i], p = V.parts[a.id]; a.t += dt; const k = clamp(a.t / a.dur, 0, 1), e = k * k * (3 - 2 * k);
    const f = a.removing ? e : 1 - e;
    p.group.position.copy(p.dir).multiplyScalar(f);
    for (const m of p.meshes) m.material.opacity = 1 - Math.max(0, f - 0.35) / 0.65;
    if (k >= 1) {
      V.anims.splice(i, 1); p.group.visible = !a.removing; p.group.position.set(0, 0, 0);
      for (const m of p.meshes) { m.material.opacity = 1; m.material.transparent = false; }
      if (V.updateContactShadow && V.world === "hangar") V.updateContactShadow();
    }
  }
}
/* центр узла в мировых координатах */
const _box = new THREE.Box3();
export function partCenter(id, out = new THREE.Vector3()) {
  const p = V.parts[id]; if (!p) return null;
  const vis = p.group.visible; p.group.visible = true;
  _box.setFromObject(p.group); p.group.visible = vis;
  return _box.isEmpty() ? null : _box.getCenter(out);
}
export function partBox(id) { const p = V.parts[id]; const vis = p.group.visible; p.group.visible = true; const b = new THREE.Box3().setFromObject(p.group); p.group.visible = vis; return b; }

/* ═════════════ тележка со снятыми агрегатами ═════════════ */
const cartCache = new Map();
function cartModel(slotId) {
  if (cartCache.has(slotId)) return cartCache.get(slotId).clone();
  const p = V.parts[slotId]; if (!p) return null;
  const g = new THREE.Group(), box = new THREE.Box3();
  for (const m of p.meshes) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  for (const m of p.meshes) {
    const mat = cloneMat(m.material); if (mat.userData.base) mat.color.copy(mat.userData.base); mat.emissive && mat.emissive.set(0, 0, 0); mat.transparent = false; mat.opacity = 1;
    const mm = new THREE.Mesh(m.geometry, mat); mm.position.copy(c).negate(); mm.castShadow = true; mm.receiveShadow = true; g.add(mm);
  }
  const wrap = new THREE.Group(); wrap.add(g);
  const k = Math.min(1, 0.75 / Math.max(size.x, size.z, 0.01), 0.7 / Math.max(size.y, 0.01));
  wrap.scale.setScalar(k); wrap.userData.h = size.y * k;
  cartCache.set(slotId, wrap);
  return wrap.clone();
}
/* inv: предметы склада; показываем снятые с самолёта (до 6 шт.) */
export function syncRemoved(inv, slotOf) {
  const cart = V.W.dyn.cart; if (!cart) return;
  if (!V.cartGroup) { V.cartGroup = new THREE.Group(); V.W.hangar.add(V.cartGroup); }
  const key = inv.filter((i) => i.removed).map((i) => i.uid).join(",");
  if (key === V._cartKey) return; V._cartKey = key;
  V.cartGroup.clear();
  const items = inv.filter((i) => i.removed).slice(-6);
  items.forEach((it, i) => {
    const m = cartModel(slotOf(it.type)); if (!m) return;
    const col = i % 3, row = Math.floor(i / 3);
    m.position.set(cart.x - cart.w / 2 + 0.4 + col * 0.75, cart.y + m.userData.h / 2 + 0.01, cart.z - 0.28 + row * 0.56);
    m.rotation.y = (i % 2 ? 0.3 : -0.2);
    V.cartGroup.add(m);
  });
}

/* ═════════════ фонарь кабины, питание, ворота ═════════════ */
export function setCanopy(open) { V.canopyTarget = open ? 1 : 0; }
export function setPower(on) {
  V.power = on;
  const L = V.L, M = V.M;
  for (const k of ["navL", "navR", "tail"]) M.lights[k].material.emissiveIntensity = on ? 6 : 0;
}
export function setDoor(open) { V.doorTarget = open ? 1 : 0; }

/* ═════════════ огонь двигателя и авария ═════════════ */
export function engineFx(E, time) {
  const fx = V.fx; V.engineE = E;
  for (const s of ["L", "R"]) {
    const f = fx.flames[s], on = E && s === E.side && E.N > 20 && E.phase !== "dead";
    if (!on) { f.set(0, 0, time, 0); continue; }
    const n = E.N / 100, ab = E.stage === 3 && E.phase === "run" ? 1 : 0;
    f.set(0.3 + n * 0.7, ab, time, E.surge ? 1 : 0);
  }
  // марево над соплом
  const g = V.R.grade; if (!g) return;
  const hz = g.uniforms.uHaze.value;
  hz[0].set(0, 0, 0, 0); hz[1].set(0, 0, 0, 0);
  if (E && E.N > 30) {
    const n = V.M.anchors["nozzle" + E.side].clone(); n.x -= 1.2;
    const w = V.M.group.localToWorld(n).project(V.camera);
    if (w.z < 1) hz[0].set(w.x * 0.5 + 0.5, w.y * 0.5 + 0.5, 0.22, clamp(E.N / 100, 0, 1) * (E.stage === 3 ? 1.2 : 0.7));
  }
}
export function catastropheFx(side, on) {
  const fx = V.fx;
  fx.fire.rate = on ? 220 : 0; fx.smoke.rate = on ? 60 : 0;
  V.fireSide = side;
}

/* ═════════════ камера-облёт (режим обзора) ═════════════ */
export const orbit = { t: new THREE.Vector3(0, 1.6, 0), r: 21, th: 0.75, ph: 1.15, goal: null, auto: true };
export const CAMS = {
  all: [[0, 1.6, 0], 21, 0.75, 1.15], menu: [[0.6, 1.9, 0], 12.5, 0.95, 1.32], nose: [[7, 1.9, 0], 6.5, 0.7, 1.2], cockpit: [[2.8, 2.5, 0], 5.5, 1.35, 0.75], engL: [[-2.5, 1.3, -1.05], 6, -1.95, 1.3],
  engR: [[-2.5, 1.3, 1.05], 6, 1.95, 1.3], gear: [[-0.8, 0.9, 0], 7.5, -1.15, 1.42], top: [[-0.5, 2, 0], 19, -1.5708, 0.08], tail: [[-7, 1.5, 0], 7.5, 2.6, 1.3],
  engineRunL: [[-6.5, 1.4, -1], 17, -2.25, 1.2], engineRunR: [[-6.5, 1.4, 1], 17, 2.25, 1.2], engineCockpit: [[3.4, 3.05, 0], 0.01, 0, 1.5],
};
export function camTo(key) {
  const c = CAMS[key]; const t = V.M.group.localToWorld(new THREE.Vector3(...c[0]));
  orbit.goal = { t, r: c[1], th: c[2] - V.M.group.rotation.y, ph: c[3] }; orbit.auto = false;
}
export function focusOn(id) {
  const c = partCenter(id); if (!c) return;
  const b = partBox(id);
  orbit.goal = { t: c, r: clamp(b.getSize(new THREE.Vector3()).length() * 3.2, 3.5, 9), th: orbit.th, ph: orbit.ph }; orbit.auto = false;
}
export function stepOrbit(dt, reduceMotion) {
  const cam = V.camera;
  if (orbit.goal) {
    const k = 1 - Math.pow(0.004, dt);
    orbit.t.lerp(orbit.goal.t, k); orbit.r += (orbit.goal.r - orbit.r) * k;
    let dth = orbit.goal.th - orbit.th; while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
    orbit.th += dth * k; orbit.ph += (orbit.goal.ph - orbit.ph) * k;
    if (orbit.t.distanceTo(orbit.goal.t) < 0.01 && Math.abs(dth) < 0.002) orbit.goal = null;
  }
  if (orbit.auto && !reduceMotion) orbit.th += dt * 0.05;
  const sp = Math.sin(orbit.ph);
  cam.position.set(orbit.t.x + orbit.r * sp * Math.cos(orbit.th), orbit.t.y + orbit.r * Math.cos(orbit.ph), orbit.t.z + orbit.r * sp * Math.sin(orbit.th));
  if (cam.position.y < 0.25) cam.position.y = 0.25;
  if (V.world === "hangar") { cam.position.x = clamp(cam.position.x, H.x0 + 0.8, H.x1 + 60); cam.position.z = clamp(cam.position.z, -H.z + 0.8, H.z - 0.8); cam.position.y = Math.min(cam.position.y, H.eave - 0.5); }
  cam.up.set(0, 1, 0); cam.lookAt(orbit.t);
}

/* ═════════════ планарное отражение пола ангара ═════════════ */
const RF = { rt: null, cam: new THREE.PerspectiveCamera(), tm: new THREE.Matrix4(), n: new THREE.Vector3(0, 1, 0), p: new THREE.Vector3(),
  v: new THREE.Vector3(), rot: new THREE.Matrix4(), look: new THREE.Vector3(), tgt: new THREE.Vector3(), plane: new THREE.Plane(), clip: new THREE.Vector4(), q: new THREE.Vector4() };
export function updateReflection() {
  const floor = V.W.dyn.floor, u = floor.material.userData.refl, q = V.R.q, cam = V.camera;
  const on = !!q.reflect && V.world === "hangar" && cam.position.y > 0.05;
  u.uReflOn.value = on ? 1 : 0;
  if (!on) return;
  const r = V.R.renderer, size = r.getDrawingBufferSize(new THREE.Vector2()).multiplyScalar(q.reflect);
  const w = Math.max(64, Math.round(size.x)), h = Math.max(64, Math.round(size.y));
  if (!RF.rt || RF.rt.width !== w || RF.rt.height !== h) {
    if (RF.rt) RF.rt.dispose();
    RF.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    u.uReflTex.value = RF.rt.texture;
  }
  // виртуальная камера, отражённая относительно плоскости пола (как в Reflector.js)
  const vc = RF.cam, cp = cam.getWorldPosition(RF.v.set(0, 0, 0));
  RF.rot.extractRotation(cam.matrixWorld);
  RF.look.set(0, 0, -1).applyMatrix4(RF.rot).add(cp);
  const mirror = (p) => p.set(p.x, -p.y, p.z);
  vc.position.copy(cp); mirror(vc.position);
  RF.tgt.copy(RF.look); mirror(RF.tgt);
  vc.up.set(0, 1, 0).applyMatrix4(RF.rot).reflect(RF.n);
  vc.lookAt(RF.tgt);
  vc.near = cam.near; vc.far = cam.far; vc.fov = cam.fov; vc.aspect = cam.aspect;
  vc.updateMatrixWorld(); vc.projectionMatrix.copy(cam.projectionMatrix);
  RF.tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  RF.tm.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
  u.uReflMat.value.copy(RF.tm);
  // косое отсечение ниже пола
  RF.plane.setFromNormalAndCoplanarPoint(RF.n, RF.p.set(0, 0, 0)).applyMatrix4(vc.matrixWorldInverse);
  RF.clip.set(RF.plane.normal.x, RF.plane.normal.y, RF.plane.normal.z, RF.plane.constant);
  const pm = vc.projectionMatrix, e = pm.elements;
  RF.q.x = (Math.sign(RF.clip.x) + e[8]) / e[0]; RF.q.y = (Math.sign(RF.clip.y) + e[9]) / e[5]; RF.q.z = -1.0; RF.q.w = (1.0 + e[10]) / e[14];
  RF.clip.multiplyScalar(2.0 / RF.clip.dot(RF.q));
  e[2] = RF.clip.x; e[6] = RF.clip.y; e[10] = RF.clip.z + 1.0 - 0.001; e[14] = RF.clip.w;
  // рендер без пола, пыли, лучей и рук; карты теней переиспользуются
  const hidden = [floor, V.fx.dust, ...(V.fx.beams || []), V.hands && V.hands.root, V.marker].filter(Boolean), vis = hidden.map((o) => o.visible);
  hidden.forEach((o) => (o.visible = false));
  const sm = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
  const prevT = r.getRenderTarget();
  r.setRenderTarget(RF.rt); r.clear(); r.render(V.scene, vc);
  r.setRenderTarget(prevT); r.shadowMap.autoUpdate = sm;
  hidden.forEach((o, i) => (o.visible = vis[i]));
}

/* ═════════════ кадр ═════════════ */
const _v = new THREE.Vector3();
export function frameView(dt, time) {
  stepAnims(dt);
  syncPitot();
  const M = V.M;
  // фонарь кабины
  if (Math.abs(V.canopy - V.canopyTarget) > 1e-4) {
    V.canopy += clamp(V.canopyTarget - V.canopy, -dt * 0.5, dt * 0.5);
    const e = V.canopy * V.canopy * (3 - 2 * V.canopy);
    M.canopy.rotation.z = e * 0.92;
  }
  // ворота
  const W = V.W;
  if (W.dyn.doors) for (const d of W.dyn.doors) { const tz = V.doorTarget ? d.userData.openZ : d.userData.closedZ; d.position.z += clamp(tz - d.position.z, -dt * 1.6, dt * 1.6); }
  if (W.dyn.doorMoving !== undefined) void 0;
  // маячки при питании
  if (V.power) { const on = (time * 1.1) % 1 < 0.12; for (const b of M.lights.beacons) b.material.emissiveIntensity = on ? 12 : 0; }
  else for (const b of M.lights.beacons) b.material.emissiveIntensity = 0;
  // частицы аварии
  const fx = V.fx;
  if (fx.fire.rate > 0 || fx.fire.points.visible || fx.smoke.points.visible) {
    const n = M.anchors["nozzle" + (V.fireSide || "L")];
    const o = M.group.localToWorld(_v.set(-2.5, 1.4, n.z));
    fx.fire.emit(dt, o, new THREE.Vector3(3.5, 0.6, 0.8), 1.8); fx.smoke.emit(dt, o.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(3, 0.5, 1), 1.4);
    fx.fire.update(dt, fx.wind); fx.smoke.update(dt, fx.wind);
  }
  if (fx.dust) { fx.dust.material.uniforms.uTime.value = time; fx.dust.visible = V.world === "hangar"; }
  for (const b of fx.beams || []) { b.material.uniforms.uTime.value = time; b.visible = V.world === "hangar" && V.doorTarget > 0.5; }
  // приборы кабины: питание, двигатель, курс, часы
  if (M.cockpit) {
    const d = new Date(), sec = d.getSeconds() + d.getMilliseconds() / 1000, min = d.getMinutes() + sec / 60;
    M.cockpit.update({ power: V.power, E: V.engineE, canopy: V.canopy, dt, heading: Math.PI / 2 - M.group.rotation.y, clock: { h: (d.getHours() % 12) + min / 60, m: min, s: Math.floor(sec) } });
  }
  // стабилизаторы «дышат» при работе гидросистемы — задаётся извне через V.stabDeflect
  const sd = V.stabDeflect || 0;
  M.stabs.L.rotation.z += (sd - M.stabs.L.rotation.z) * Math.min(1, dt * 4); M.stabs.R.rotation.z = M.stabs.L.rotation.z;
}
export { H, PAD, CANOPY };
