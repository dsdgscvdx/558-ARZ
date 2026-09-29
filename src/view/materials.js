/* Материалы: PBR-библиотека и шейдер окраски планера.
   Окраска планера — MeshPhysicalMaterial с доработанным шейдером: камуфляж, разделка панелей,
   заклёпки, грязь, копоть и потёртости краски проецируются из общих карт «вид сверху» и «вид сбоку»
   в координатах самолёта, поэтому швы непрерывно переходят между фюзеляжем, крылом и съёмными люками. */
import * as THREE from "three";

export const PAINT = {
  camo: null, plan: null, side: null,
  planBox: new THREE.Vector4(), sideBox: new THREE.Vector4(),
  camoScale: 0.2, bump: 1.0, grime: 1.0,
  under: new THREE.Color("#b3bfc6"),
};

const paintVert = {
  pars: /* glsl */ `varying vec3 vOP; varying vec3 vON;`,
  main: /* glsl */ `vOP = position; vON = normal;`,
};
const paintFragPars = /* glsl */ `
uniform sampler2D uCamo; uniform sampler2D uPlan; uniform sampler2D uSide;
uniform vec4 uPlanBox; uniform vec4 uSideBox;
uniform float uCamoScale; uniform float uCamoMix; uniform float uBump; uniform float uGrime; uniform float uUnder; uniform float uSootK;
uniform vec3 uUnderColor; uniform vec3 uTint;
varying vec3 vOP; varying vec3 vON;
vec3 triW(vec3 n){ vec3 w = pow(abs(n), vec3(6.0)); return w / (w.x + w.y + w.z + 1e-5); }
vec2 planUV(vec3 p){ return vec2((p.x - uPlanBox.x) * uPlanBox.z, (p.z - uPlanBox.y) * uPlanBox.w); }
vec2 sideUV(vec3 p){ return vec2((p.x - uSideBox.x) * uSideBox.z, (p.y - uSideBox.y) * uSideBox.w); }
float panelH(vec3 p, vec3 w, float up){
  vec4 a = texture2D(uPlan, planUV(p)); vec4 b = texture2D(uSide, sideUV(p));
  return mix(a.g, a.r, up) * w.y + b.r * w.z + 0.5 * w.x;
}
vec3 perturbPaint(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir){
  vec3 vSigmaX = normalize(dFdx(surf_pos)); vec3 vSigmaY = normalize(dFdy(surf_pos));
  vec3 R1 = cross(vSigmaY, surf_norm); vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
float gSeam, gGrime, gWear, gSoot, gHC, gUp; vec3 gTW;
`;
const paintColor = /* glsl */ `
{
  vec3 nO = normalize(vON);
  gTW = triW(nO); gUp = step(0.0, nO.y);
  vec4 PL = texture2D(uPlan, planUV(vOP));
  vec4 SD = texture2D(uSide, sideUV(vOP));
  gHC = mix(PL.g, PL.r, gUp) * gTW.y + SD.r * gTW.z + 0.5 * gTW.x;
  gGrime = PL.b * gTW.y + SD.g * (gTW.z + gTW.x);
  gWear = PL.a * gTW.y + SD.a * (gTW.z + gTW.x);
  gSoot = SD.b * uSootK;
  vec3 cc = texture2D(uCamo, vOP.xz * uCamoScale).rgb * gTW.y + texture2D(uCamo, vOP.xy * uCamoScale + 0.37).rgb * gTW.z + texture2D(uCamo, vOP.zy * uCamoScale + 0.71).rgb * gTW.x;
  vec3 base = mix(uTint, cc, uCamoMix);
  float under = smoothstep(-0.12, -0.5, nO.y) * uUnder;
  base = mix(base, uUnderColor, under);
  gSeam = clamp((0.5 - gHC) * 5.0, 0.0, 1.0);
  base *= 1.0 - 0.5 * gSeam;
  base *= 1.0 - gGrime * uGrime * 0.32;
  base = mix(base, vec3(0.035, 0.032, 0.03), clamp(gSoot, 0.0, 1.0) * 0.88);
  base = mix(base, vec3(0.58, 0.59, 0.6), gWear);
  diffuseColor.rgb *= base;
}
`;
const paintRough = /* glsl */ `roughnessFactor = clamp(roughnessFactor + gGrime * 0.12 * uGrime + gSoot * 0.3 + gSeam * 0.15 - gWear * 0.2, 0.04, 1.0);`;
const paintMetal = /* glsl */ `metalnessFactor = mix(metalnessFactor, 0.9, gWear);`;
const paintNormal = /* glsl */ `
{
  vec3 dpx = dFdx(vOP), dpy = dFdy(vOP);
  float hx = panelH(vOP + dpx, gTW, gUp), hy = panelH(vOP + dpy, gTW, gUp);
  vec2 dHdxy = vec2(hx - gHC, hy - gHC) * uBump;
  normal = perturbPaint(-vViewPosition, normal, dHdxy, faceDirection);
}
`;

/* Материал окраски планера. o: {camo:0..1, tint, rough, metal, clearcoat, under, soot} */
export function paintMaterial(o = {}) {
  const make = () => {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: o.rough ?? 0.52, metalness: o.metal ?? 0.05,
      clearcoat: o.clearcoat ?? 0.18, clearcoatRoughness: o.ccRough ?? 0.45,
      side: o.side ?? THREE.FrontSide,
    });
    const u = {
      uCamo: { value: PAINT.camo }, uPlan: { value: PAINT.plan }, uSide: { value: PAINT.side },
      uPlanBox: { value: PAINT.planBox }, uSideBox: { value: PAINT.sideBox },
      uCamoScale: { value: PAINT.camoScale }, uCamoMix: { value: o.camo ?? 1 }, uBump: { value: (o.bump ?? 1) * PAINT.bump },
      uGrime: { value: PAINT.grime * (o.grime ?? 1) }, uUnder: { value: o.under ?? 1 }, uSootK: { value: o.soot ?? 1 },
      uUnderColor: { value: PAINT.under }, uTint: { value: new THREE.Color(o.tint || "#9aa5ad") },
    };
    m.userData.paint = u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + paintVert.pars)
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + paintVert.main);
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + paintFragPars)
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + paintColor)
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n" + paintRough)
        .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\n" + paintMetal)
        .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + paintNormal);
    };
    m.customProgramCacheKey = () => "paint-v1";
    m.userData.factory = make;
    return m;
  };
  return make();
}

/* клонирование с сохранением шейдерных доработок */
export function cloneMat(m) {
  if (m.userData && m.userData.factory) {
    const c = m.userData.factory();
    c.side = m.side; c.transparent = m.transparent; c.opacity = m.opacity;
    return c;
  }
  return m.clone();
}

/* ---------- библиотека PBR ---------- */
export function buildLibrary(T) {
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const pm = T.paintedMetal;
  const painted = (color, rough = 1, extra = {}) => S({ color, map: pm.albedo, roughnessMap: pm.orm, normalMap: pm.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: rough, metalness: 0.25, ...extra });
  const L = {
    paint: paintMaterial({}),
    paintDouble: paintMaterial({ side: THREE.DoubleSide }),
    radome: paintMaterial({ camo: 0, tint: "#b9c0c2", rough: 0.42, clearcoat: 0.35, under: 0, grime: 0.6 }),
    dielectric: paintMaterial({ camo: 0, tint: "#b8bdb3", rough: 0.5, under: 0, grime: 0.5 }),
    antiglare: paintMaterial({ camo: 0, tint: "#2b3033", rough: 0.75, clearcoat: 0, under: 0 }),
    primer: S({ color: "#7d8a64", roughness: 0.7, metalness: 0.1, normalMap: pm.normal, normalScale: new THREE.Vector2(0.4, 0.4) }),
    primerGrey: S({ color: "#8c9396", roughness: 0.65, metalness: 0.15, normalMap: pm.normal, normalScale: new THREE.Vector2(0.4, 0.4) }),
    bay: S({ color: "#6d7a5a", roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide }),
    intakeDark: S({ color: "#3a3f41", roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }),
    alu: S({ color: "#b9bec2", roughness: 0.32, metalness: 1, roughnessMap: T.brushed.orm, normalMap: T.brushed.normal, normalScale: new THREE.Vector2(0.2, 0.2) }),
    aluDark: S({ color: "#7f868b", roughness: 0.42, metalness: 1, roughnessMap: T.brushed.orm }),
    chrome: S({ color: "#e8ecee", roughness: 0.06, metalness: 1 }),
    steel: S({ color: "#8f969b", roughness: 0.35, metalness: 1, roughnessMap: T.brushed.orm }),
    steelDark: S({ color: "#4a4f53", roughness: 0.45, metalness: 0.9 }),
    gearPaint: painted("#c5cacb", 0.9, { metalness: 0.2 }),
    gearGreen: painted("#6f7d63", 1),
    titanium: S({ map: T.heat.map, roughnessMap: T.heat.orm, metalnessMap: T.heat.orm, roughness: 1, metalness: 1, color: "#9a968f", side: THREE.DoubleSide }),
    jetpipe: S({ color: "#2e2b28", roughness: 0.75, metalness: 0.7, side: THREE.DoubleSide }),
    bronze: S({ color: "#9c7a4f", roughness: 0.38, metalness: 1 }),
    burnt: S({ color: "#6e5c4a", roughness: 0.55, metalness: 0.9 }),
    tire: S({ color: "#1d1d1e", roughness: 1, metalness: 0, roughnessMap: T.tire.orm, normalMap: T.tire.normal, normalScale: new THREE.Vector2(1.2, 1.2) }),
    rubber: S({ color: "#161616", roughness: 0.88, metalness: 0 }),
    hose: S({ color: "#1b1b1b", roughness: 0.62, metalness: 0.15, normalMap: T.fabric.normal, normalScale: new THREE.Vector2(0.8, 0.8) }),
    wireOrange: S({ color: "#d2742c", roughness: 0.55, metalness: 0 }),
    wireWhite: S({ color: "#d9d6cc", roughness: 0.55, metalness: 0 }),
    wireBlack: S({ color: "#222", roughness: 0.5, metalness: 0 }),
    olive: painted("#5d6a4a", 1),
    unitGrey: painted("#7b8487", 1),
    battery: S({ color: "#2a2b2c", roughness: 0.55, metalness: 0.1 }),
    brass: S({ color: "#b99552", roughness: 0.3, metalness: 1 }),
    yellowStripe: S({ color: "#e0b020", roughness: 0.5 }),
    black: S({ color: "#101112", roughness: 0.6 }),
    cockpit: painted("#557f84", 1, { metalness: 0.1, side: THREE.DoubleSide }),       // бирюзовая окраска кабины
    cockpitDark: S({ color: "#1d2224", roughness: 0.7, metalness: 0.1 }),
    seatGreen: S({ color: "#4b5a4a", roughness: 0.85, metalness: 0.05, normalMap: T.fabric.normal }),
    canopy: P({ color: "#ffffff", metalness: 0, roughness: 0.02, roughnessMap: T.smudge, transmission: 1, thickness: 0.012, ior: 1.5,
      specularIntensity: 1, envMapIntensity: 1.2, transparent: false, side: THREE.DoubleSide, attenuationColor: new THREE.Color("#c9dfe6"), attenuationDistance: 0.6 }),
    canopyFallback: P({ color: "#b8d0dc", metalness: 0.1, roughness: 0.03, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    lens: P({ color: "#223", metalness: 0.2, roughness: 0.05, clearcoat: 1 }),
    navRed: S({ color: "#400", emissive: "#ff1a10", emissiveIntensity: 0, roughness: 0.2 }),
    navGreen: S({ color: "#030", emissive: "#20ff40", emissiveIntensity: 0, roughness: 0.2 }),
    navWhite: S({ color: "#444", emissive: "#fff5e0", emissiveIntensity: 0, roughness: 0.2 }),
    // ангар
    red: painted("#a3262c", 0.9, { metalness: 0.3 }),
    redDark: painted("#7c1c20", 0.9),
    yellow: painted("#d9a624", 0.9, { metalness: 0.2 }),
    orange: painted("#c9531f", 0.9),
    blueGrey: painted("#4f6270", 1),
    greyProp: painted("#6d767b", 1),
    darkProp: painted("#33393d", 1),
    greenProp: painted("#4c5e45", 1),
    whiteProp: painted("#d4d7d6", 0.9),
    wood: S({ map: T.wood, roughness: 0.8, metalness: 0 }),
    cardboard: S({ color: "#a98458", roughness: 0.95 }),
    concreteWall: S({ color: "#8d8f8b", roughness: 0.92, metalness: 0 }),
    lampLit: S({ color: "#000", emissive: "#fff3e0", emissiveIntensity: 18 }),
    screenGreen: S({ color: "#000", emissive: "#6bff9a", emissiveIntensity: 1.4 }),
    glassDark: P({ color: "#1d2a30", metalness: 0, roughness: 0.05, transparent: true, opacity: 0.55 }),
  };
  return L;
}
