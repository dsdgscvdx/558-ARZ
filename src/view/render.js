/* Рендер: WebGL2, HDR-композитинг (MSAA), GTAO, bloom, тональная компрессия AgX, финальная
   цветокоррекция (виньетка, зерно, хроматическая аберрация, марево от сопел, вспышки/затемнения).
   Пресеты качества переключаются на лету. */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

export const QUALITY = {
  low:    { name: "Низкое",   pr: 0.75, maxPr: 1,   shadow: 1024, sunShadow: true,  ao: false, bloom: false, msaa: 0, aniso: 4,  tex: 0.5,  second: false, dust: false, glass: false },
  medium: { name: "Среднее",  pr: 1,    maxPr: 1.25, shadow: 2048, sunShadow: true,  ao: false, bloom: true,  msaa: 4, aniso: 8,  tex: 0.75, second: false, dust: true,  glass: false },
  high:   { name: "Высокое",  pr: 1,    maxPr: 1.5,  shadow: 2048, sunShadow: true,  ao: true,  bloom: true,  msaa: 4, aniso: 12, tex: 1,    second: true,  dust: true,  glass: true, aoScale: 0.5, reflect: 0.35 },
  ultra:  { name: "Ультра",   pr: 1,    maxPr: 2,    shadow: 4096, sunShadow: true,  ao: true,  bloom: true,  msaa: 4, aniso: 16, tex: 1,    second: true,  dust: true,  glass: true, aoScale: 1, reflect: 0.5 },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.32 }, uGrain: { value: 0.035 }, uCA: { value: 0.0018 },
    uHaze: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] },
    uFlash: { value: new THREE.Vector4(0, 0, 0, 0) }, uFade: { value: 0 }, uSat: { value: 1.04 }, uContrast: { value: 1.03 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes;
    uniform float uVignette; uniform float uGrain; uniform float uCA; uniform vec4 uHaze[2]; uniform vec4 uFlash; uniform float uFade;
    uniform float uSat; uniform float uContrast;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    void main(){
      vec2 uv = vUv;
      // марево горячих газов: эллипсы в экранных координатах (xy — центр, z — радиус, w — сила)
      for (int i = 0; i < 2; i++){
        vec4 h = uHaze[i];
        if (h.w > 0.0){
          vec2 d = (uv - h.xy) * vec2(uRes.x / uRes.y, 1.0);
          float k = smoothstep(h.z, 0.0, length(d)) * h.w;
          vec2 n = vec2(noise(uv * 38.0 + vec2(0.0, uTime * 9.0)), noise(uv * 38.0 + vec2(uTime * 7.0, 3.1))) - 0.5;
          uv += n * 0.012 * k;
        }
      }
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * uCA * r2 * 4.0).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * uCA * r2 * 4.0).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col *= 1.0 - uVignette * smoothstep(0.15, 0.85, r2 * 1.6);
      col += (hash(uv * uRes + fract(uTime * 13.7)) - 0.5) * uGrain;
      col = mix(col, uFlash.rgb, uFlash.a);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Render {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.AgXToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    this.maxAniso = r.capabilities.getMaxAnisotropy();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.q = QUALITY.high; this.qKey = "high";
    this.time = 0;
    this.exposure = 1;
  }
  detectDefault() {
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || matchMedia("(pointer:coarse)").matches;
    const gl = this.renderer.getContext();
    let gpu = "";
    try { const ext = gl.getExtension("WEBGL_debug_renderer_info"); if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || ""; } catch (e) { /* нет доступа */ }
    if (/swiftshader|llvmpipe|software/i.test(gpu)) return "low";
    if (mobile) return "low";
    if (/intel/i.test(gpu) && !/arc/i.test(gpu)) return "medium";
    return "high";
  }
  setupComposer() {
    const r = this.renderer, q = this.q;
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); if (this.gtao) this.gtao.dispose(); if (this.bloom) this.bloom.dispose(); }
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    // страховка: NaN/Infinity от любого материала не должны растекаться через размытие bloom
    this.composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0); gl_FragColor = vec4(min(c.rgb, vec3(60000.0)), c.a); }",
    }));
    this.gtao = null; this.bloom = null;
    if (q.ao) {
      const s = q.aoScale || 1;
      this.gtao = new GTAOPass(this.scene, this.camera, Math.round(size.x * s), Math.round(size.y * s));
      this.gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 1.6, scale: 1.15, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.gtao.blendIntensity = 0.85;
      this.composer.addPass(this.gtao);
    }
    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.14, 0.35, 6.0);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.resize(true);
  }
  setQuality(key) {
    this.qKey = QUALITY[key] ? key : "high"; this.q = QUALITY[this.qKey];
    this.setupComposer();
    if (this.onQuality) this.onQuality(this.q);
  }
  resize(force) {
    const c = this.canvas, w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight;
    const pr = Math.min(devicePixelRatio * this.q.pr, this.q.maxPr);
    if (!force && w === this._w && h === this._h && pr === this._pr) return;
    this._w = w; this._h = h; this._pr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
      const s = this.q.aoScale || 1;
      if (this.gtao) this.gtao.setSize(Math.round(w * pr * s), Math.round(h * pr * s));
      this.grade.uniforms.uRes.value.set(w * pr, h * pr);
    }
  }
  /* съёмка кубической карты окружения из точки (скрытые объекты не попадают в отражения) */
  captureEnv(pos, hide = [], size = 256) {
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    const cc = new THREE.CubeCamera(0.1, 400, rt);
    cc.position.copy(pos);
    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    const prevEnv = this.scene.environment; this.scene.environment = null;
    const sm = this.renderer.shadowMap.autoUpdate;
    cc.update(this.renderer, this.scene);
    this.renderer.shadowMap.autoUpdate = sm;
    hide.forEach((o, i) => (o.visible = vis[i]));
    const env = this.pmrem.fromCubemap(rt.texture).texture;
    rt.dispose();
    this.scene.environment = prevEnv;
    return env;
  }
  render(dt) {
    this.time += dt;
    if (this.grade) this.grade.uniforms.uTime.value = this.time;
    this.renderer.toneMappingExposure = this.exposure;
    this.composer.render(dt);
  }
}
