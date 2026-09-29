/* Эффекты: факел форсажа с «бриллиантами» скачков уплотнения, выхлоп, огонь и дым аварии,
   пылинки в лучах света, объёмные лучи из окон и ворот. */
import * as THREE from "three";
import { mulberry32 } from "./tex.js";

/* ---------- факел двигателя ---------- */
const flameVert = /* glsl */ `
  varying vec3 vL; varying vec3 vN; varying vec3 vV;
  void main(){ vL = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const flameFrag = /* glsl */ `
  uniform float uTime; uniform float uPower; uniform float uAB; uniform float uLen; uniform float uLayer; uniform vec3 uColA; uniform vec3 uColB; uniform float uSurge;
  varying vec3 vL; varying vec3 vN; varying vec3 vV;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  void main(){
    float t = clamp(-vL.y / uLen, 0.0, 1.0);          // 0 — срез сопла, 1 — конец факела
    float ang = atan(vL.x, vL.z);
    float n = noise(vec2(ang * 2.0, t * 9.0 - uTime * 26.0)) * 0.6 + noise(vec2(ang * 5.0, t * 22.0 - uTime * 41.0)) * 0.4;
    float fres = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
    float along = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.35, 1.0, t));
    // скачки уплотнения: периодические яркие зоны
    float diam = 0.0;
    for (int i = 0; i < 6; i++){ float c = 0.09 + float(i) * 0.095; diam += exp(-pow((t - c) * 38.0, 2.0)) * (1.0 - float(i) * 0.14); }
    vec3 col = mix(uColA, uColB, smoothstep(0.1, 0.8, t));
    float I = along * (0.55 + 0.45 * n) * fres;
    I += diam * uAB * 1.6 * fres * uLayer;
    I *= mix(0.25, 1.0, uAB) * uPower * (1.0 + uSurge * 1.5 * n);
    gl_FragColor = vec4(col * I * mix(2.0, 9.0, uAB), 1.0);
  }`;

export function makeFlame() {
  const g = new THREE.Group();
  const layers = [];
  const mk = (r0, r1, len, a, b, layer) => {
    const geo = new THREE.CylinderGeometry(r1, r0, len, 32, 24, true); geo.translate(0, -len / 2, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uAB: { value: 0 }, uLen: { value: len }, uLayer: { value: layer }, uColA: { value: new THREE.Color(a) }, uColB: { value: new THREE.Color(b) }, uSurge: { value: 0 } },
      vertexShader: flameVert, fragmentShader: flameFrag, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: true,
    });
    const mesh = new THREE.Mesh(geo, m); mesh.rotation.z = Math.PI / 2; mesh.frustumCulled = false; g.add(mesh); layers.push({ mesh, len });
    return mesh;
  };
  mk(0.36, 0.2, 5.5, "#ff8a2a", "#ff4a10", 0.35);     // внешний оранжевый
  mk(0.3, 0.08, 3.6, "#9fb8ff", "#ffc060", 1.0);      // ядро с «бриллиантами»
  mk(0.18, 0.02, 2.2, "#ffffff", "#ffd27a", 0.8);     // горячая сердцевина
  const light = new THREE.PointLight("#ff8a3a", 0, 22, 1.6); light.position.x = -2.0; g.add(light);
  g.visible = false;
  return {
    group: g, light,
    set(power, ab, time, surge) {
      g.visible = power > 0.05;
      for (const { mesh } of layers) { const u = mesh.material.uniforms; u.uTime.value = time; u.uPower.value = power; u.uAB.value = ab; u.uSurge.value = surge; }
      const s = 0.55 + ab * 0.45 + surge * 0.3;
      g.scale.set(0.5 + ab * 0.5 + power * 0.1, 1, 1); g.scale.y = g.scale.z = 0.8 + ab * 0.35;
      layers[0].mesh.scale.y = s; layers[1].mesh.scale.y = 0.6 + ab * 0.4;
      light.intensity = ab * (18 + Math.random() * 6) + power * 1.5;
    },
  };
}

/* ---------- частицы: огонь и дым ---------- */
const partVert = /* glsl */ `
  attribute float aLife; attribute float aSize; attribute float aSeed;
  uniform float uScale; varying float vLife; varying float vSeed;
  void main(){ vLife = aLife; vSeed = aSeed; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const fireFrag = /* glsl */ `
  varying float vLife; varying float vSeed;
  void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d) * (1.0 - vLife) * smoothstep(0.0, 0.08, vLife);
    vec3 col = mix(vec3(1.0, 0.85, 0.45), vec3(1.0, 0.3, 0.05), smoothstep(0.0, 0.6, vLife));
    gl_FragColor = vec4(col * a * 6.0, 1.0); }`;
const smokeFrag = /* glsl */ `
  varying float vLife; varying float vSeed;
  void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.1, d) * smoothstep(0.0, 0.15, vLife) * (1.0 - vLife) * 0.55;
    vec3 col = mix(vec3(0.16, 0.14, 0.13), vec3(0.42, 0.42, 0.43), vLife);
    gl_FragColor = vec4(col, a); }`;

export class Particles {
  constructor(n, kind) {
    this.n = n; this.kind = kind;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.size = new Float32Array(n); this.seed = new Float32Array(n); this.ttl = new Float32Array(n);
    this.life.fill(1);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3)); g.setAttribute("aLife", new THREE.BufferAttribute(this.life, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1)); g.setAttribute("aSeed", new THREE.BufferAttribute(this.seed, 1));
    const m = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 600 } }, vertexShader: partVert, fragmentShader: kind === "fire" ? fireFrag : smokeFrag,
      transparent: true, depthWrite: false, blending: kind === "fire" ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.visible = false;
    this.emitter = null; this.rate = 0; this.acc = 0; this.i = 0;
  }
  emit(dt, origin, spread, up) {
    this.acc += dt * this.rate;
    while (this.acc >= 1) {
      this.acc -= 1; const i = this.i = (this.i + 1) % this.n;
      this.pos[i * 3] = origin.x + (Math.random() - 0.5) * spread.x; this.pos[i * 3 + 1] = origin.y + (Math.random() - 0.5) * spread.y; this.pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * spread.z;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.8; this.vel[i * 3 + 1] = up * (0.6 + Math.random() * 0.8); this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
      this.life[i] = 0; this.ttl[i] = this.kind === "fire" ? 0.6 + Math.random() * 0.7 : 2.5 + Math.random() * 2.5;
      this.size[i] = this.kind === "fire" ? 0.5 + Math.random() * 0.7 : 1.2 + Math.random() * 1.2; this.seed[i] = Math.random();
    }
  }
  update(dt, wind) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] >= 1) continue; any = true;
      this.life[i] = Math.min(1, this.life[i] + dt / this.ttl[i]);
      this.pos[i * 3] += (this.vel[i * 3] + wind.x) * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + wind.z) * dt;
      if (this.kind === "smoke") this.size[i] += dt * 1.1;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aLife.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
    this.points.visible = any || this.rate > 0;
  }
}

/* ---------- пылинки ---------- */
export function makeDust(beams, count = 1600) {
  const rnd = mulberry32(4), pos = new Float32Array(count * 3), ph = new Float32Array(count), br = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let p;
    if (beams.length && rnd() < 0.7) { const b = beams[Math.floor(rnd() * beams.length)]; const t = rnd(); p = b.a.clone().lerp(b.b, t).add(new THREE.Vector3((rnd() - 0.5) * b.w, (rnd() - 0.5) * b.h, (rnd() - 0.5) * b.w)); br[i] = 1; }
    else { p = new THREE.Vector3(-26 + rnd() * 54, 0.3 + rnd() * 9, -20 + rnd() * 40); br[i] = 0.25; }
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; ph[i] = rnd() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aPh", new THREE.BufferAttribute(ph, 1)); g.setAttribute("aBr", new THREE.BufferAttribute(br, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 500 } },
    vertexShader: /* glsl */ `attribute float aPh; attribute float aBr; uniform float uTime; uniform float uScale; varying float vA;
      void main(){ vec3 p = position + vec3(sin(uTime * 0.11 + aPh) * 0.6, sin(uTime * 0.07 + aPh * 1.7) * 0.4, cos(uTime * 0.09 + aPh * 0.7) * 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp(uScale * 0.012 / -mv.z, 1.0, 6.0); vA = aBr * (0.5 + 0.5 * sin(uTime * 1.3 + aPh)) * smoothstep(0.3, 2.0, -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * vA * 0.9 * smoothstep(0.5, 0.0, d), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false;
  return pts;
}

/* ---------- объёмные лучи света ---------- */
export function makeBeam(corners, dir, len, intensity = 0.06) {
  // corners: 4 вершины окна (по кругу), dir — направление света (единичный), len — длина
  const p = [];
  for (const c of corners) p.push(c.clone());
  for (const c of corners) p.push(c.clone().addScaledVector(dir, len));
  const idx = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  const along = [0, 0, 0, 0, 1, 1, 1, 1];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p.flatMap((v) => [v.x, v.y, v.z]), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    uniforms: { uI: { value: intensity }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `attribute float aAlong; varying float vA; varying vec3 vW; varying vec3 vN; varying vec3 vV;
      void main(){ vA = aAlong; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uI; uniform float uTime; varying float vA; varying vec3 vW;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9, 78.2, 37.7))) * 43758.5); }
      void main(){ float fade = smoothstep(0.0, 0.08, vA) * (1.0 - smoothstep(0.55, 1.0, vA));
        float n = 0.75 + 0.25 * sin(vW.x * 0.7 + vW.y * 0.3 + uTime * 0.2) * sin(vW.z * 0.5 - uTime * 0.13);
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * uI * fade * n, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5;
  return mesh;
}
