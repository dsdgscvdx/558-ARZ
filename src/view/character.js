/* Процедурная модель авиатехника (комбинезон, кепка, ботинки, перчатки) с процедурной анимацией:
   ходьба/бег по фазе шага, присед, работа ключом, дыхание, подъём по лестнице. */
import * as THREE from "three";

function capsule(r, len, mat, seg = 10) {
  const g = new THREE.CapsuleGeometry(r, len, 4, seg);
  g.translate(0, -len / 2 - r * 0.2, 0);     // точка крепления сверху (сустав)
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
function joint(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

export function buildTechnician(T) {
  const suit = new THREE.MeshStandardMaterial({ color: "#2e3a48", roughness: 0.92, normalMap: T.fabric.normal, normalScale: new THREE.Vector2(0.9, 0.9) });
  const suitDark = new THREE.MeshStandardMaterial({ color: "#232c37", roughness: 0.95, normalMap: T.fabric.normal });
  const refl = new THREE.MeshStandardMaterial({ color: "#c9cdc6", roughness: 0.35, metalness: 0.2, emissive: "#3a3c38", emissiveIntensity: 0.4 });
  const skin = new THREE.MeshStandardMaterial({ color: "#c49a7c", roughness: 0.62 });
  const boot = new THREE.MeshStandardMaterial({ color: "#161718", roughness: 0.5, metalness: 0.05 });
  const glove = new THREE.MeshStandardMaterial({ color: "#6d5b3e", roughness: 0.85 });
  const capM = new THREE.MeshStandardMaterial({ color: "#1f2a36", roughness: 0.9, normalMap: T.fabric.normal });
  const badge = new THREE.MeshStandardMaterial({ color: "#c8313e", roughness: 0.6 });
  const toolM = new THREE.MeshStandardMaterial({ color: "#b8bec2", roughness: 0.25, metalness: 1 });

  const root = new THREE.Group(); root.name = "technician";
  const hips = joint(root, 0, 0.98, 0);
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), suit); pelvis.scale.set(1.05, 0.7, 0.75); pelvis.castShadow = true; hips.add(pelvis);
  const spine = joint(hips, 0, 0.08, 0);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 4, 14), suit); torso.position.y = 0.24; torso.scale.set(1.12, 1, 0.72); torso.castShadow = true; spine.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.182, 0.182, 0.05, 20), suitDark); belt.position.y = 0.02; belt.scale.set(1.0, 1, 0.72); spine.add(belt);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.005), badge); flag.position.set(-0.11, 0.38, 0.12); spine.add(flag);
  const chest = joint(spine, 0, 0.42, 0);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.06, 14), suit); collar.position.y = 0.04; chest.add(collar);
  const neck = joint(chest, 0, 0.07, 0);
  const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.1, 12), skin); neckM.position.y = 0.03; neck.add(neckM);
  const head = joint(neck, 0, 0.1, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16), skin); skull.scale.set(0.9, 1.08, 1.0); skull.position.y = 0.08; skull.castShadow = true; head.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), skin); jaw.position.set(0, 0.02, 0.025); jaw.scale.set(0.95, 0.8, 1); head.add(jaw);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 8), skin); nose.rotation.x = Math.PI / 2 + 0.3; nose.position.set(0, 0.075, 0.105); head.add(nose);
  for (const s of [1, -1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), skin); ear.scale.set(0.5, 1, 0.8); ear.position.set(s * 0.093, 0.08, 0); head.add(ear); }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.108, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), capM); cap.position.y = 0.105; cap.scale.set(0.95, 0.8, 1.04); cap.castShadow = true; head.add(cap);
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), capM); visor.position.set(0, 0.11, 0.07); visor.scale.set(1, 1, 1.1); visor.rotation.x = 0.12; head.add(visor);

  const arms = {}, legs = {};
  for (const s of [1, -1]) {
    const sh = joint(chest, s * 0.2, -0.02, 0);
    const shM = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), suit); sh.add(shM);
    const upper = joint(sh, 0, 0, 0); upper.add(capsule(0.058, 0.2, suit));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.061, 0.061, 0.03, 12), refl); band.position.y = -0.16; upper.add(band);
    const fore = joint(upper, 0, -0.29, 0); fore.add(capsule(0.048, 0.19, suit));
    const hand = joint(fore, 0, -0.27, 0);
    const hm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.035), glove); hm.position.y = -0.04; hm.castShadow = true; hand.add(hm);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.035, 2, 6), glove); thumb.position.set(-s * 0.035, -0.03, 0.02); thumb.rotation.z = s * 0.6; hand.add(thumb);
    arms[s > 0 ? "R" : "L"] = { sh, upper, fore, hand };
    const hip = joint(hips, s * 0.1, -0.04, 0);
    const thigh = joint(hip, 0, 0, 0); thigh.add(capsule(0.082, 0.34, suit));
    const knee = joint(thigh, 0, -0.45, 0); knee.add(capsule(0.066, 0.34, suit));
    const band2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.035, 12), refl); band2.position.y = -0.26; knee.add(band2);
    const ankle = joint(knee, 0, -0.44, 0);
    const bootM = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.27), boot); bootM.position.set(0, -0.035, 0.05); bootM.castShadow = true; ankle.add(bootM);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), boot); toe.scale.set(1, 0.9, 1.1); toe.position.set(0, -0.08, 0.15); ankle.add(toe);
    legs[s > 0 ? "R" : "L"] = { hip, thigh, knee, ankle };
  }
  // гаечный ключ в правой руке (виден при работе)
  const wrench = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.22, 0.008), toolM); shaft.position.y = -0.1; wrench.add(shaft);
  const jawW = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.009, 6, 12, Math.PI * 1.5), toolM); jawW.position.y = -0.22; wrench.add(jawW);
  wrench.position.set(0, -0.07, 0.02); wrench.visible = false; arms.R.hand.add(wrench);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const st = { phase: 0, t: 0 };

  /* p: {speed, crouch, work, ladder, dt, lookPitch} */
  function animate(p) {
    st.t += p.dt;
    const sp = p.speed || 0, run = THREE.MathUtils.clamp((sp - 2) / 2, 0, 1), walk = THREE.MathUtils.clamp(sp / 1.2, 0, 1);
    st.phase += p.dt * (sp > 0.05 ? (4.6 + run * 3.2) * Math.min(1, sp / 1.4 + 0.3) : 0);
    const ph = st.phase, c = p.crouch || 0, w = p.work || 0, lad = p.ladder || 0;
    const A = (0.45 + run * 0.35) * walk;
    for (const [k, s] of [["L", 1], ["R", -1]]) {
      const L = legs[k], a = Math.sin(ph + (s > 0 ? 0 : Math.PI));
      let thighX = -a * A, kneeX = Math.max(0, Math.sin(ph + (s > 0 ? 0 : Math.PI) + 1.2)) * (0.9 + run * 0.6) * walk;
      thighX = THREE.MathUtils.lerp(thighX, -1.35, c); kneeX = THREE.MathUtils.lerp(kneeX, 2.25, c);
      if (lad) { const la = Math.sin(st.t * 4 + (s > 0 ? 0 : Math.PI)); thighX = -0.6 - la * 0.35; kneeX = 0.9 + la * 0.3; }
      L.thigh.rotation.x = thighX; L.knee.rotation.x = kneeX; L.ankle.rotation.x = THREE.MathUtils.lerp(-kneeX * 0.35 - thighX * 0.3, -0.9, c);
      L.thigh.rotation.z = s * 0.03;
      const Ar = arms[k], b = Math.sin(ph + (s > 0 ? Math.PI : 0));
      let ux = -b * A * 0.8, fx = -0.25 - Math.max(0, b) * 0.4 * walk - run * 0.9;
      ux = THREE.MathUtils.lerp(ux, -0.3, c * 0.5);
      if (w > 0) {
        const wk = s < 0 ? Math.sin(st.t * 9) * 0.25 : Math.sin(st.t * 3) * 0.08;
        ux = THREE.MathUtils.lerp(ux, -1.2 + wk, w); fx = THREE.MathUtils.lerp(fx, -0.9 + wk * 0.5, w);
      }
      if (lad) { const la = Math.sin(st.t * 4 + (s > 0 ? Math.PI : 0)); ux = -2.2 - la * 0.3; fx = -0.5; }
      Ar.upper.rotation.x = ux; Ar.fore.rotation.x = fx; Ar.upper.rotation.z = s * (0.08 + run * 0.05);
    }
    const breath = Math.sin(st.t * 1.6) * 0.01;
    hips.position.y = 0.98 - Math.abs(Math.sin(ph)) * 0.035 * walk + THREE.MathUtils.lerp(0, -0.42, c) + (lad ? 0.0 : 0);
    hips.position.z = THREE.MathUtils.lerp(0, -0.12, c);
    spine.rotation.x = THREE.MathUtils.lerp(0.04 * walk + run * 0.18, 0.45, c) + w * 0.15 + breath;
    chest.rotation.y = Math.sin(ph) * 0.12 * walk;
    head.rotation.x = THREE.MathUtils.clamp(-(p.lookPitch || 0) * 0.6, -0.5, 0.6) - spine.rotation.x * 0.6;
    wrench.visible = w > 0.3;
  }
  return { root, animate, parts: { head, hips, arms, legs } };
}

/* Руки от первого лица (видны во время работы): перчатки, рукава комбинезона, ключ или тестер. */
export function buildViewmodel(T) {
  const suit = new THREE.MeshStandardMaterial({ color: "#2e3a48", roughness: 0.92, normalMap: T.fabric.normal });
  const glove = new THREE.MeshStandardMaterial({ color: "#6d5b3e", roughness: 0.85 });
  const toolM = new THREE.MeshStandardMaterial({ color: "#c3c8cc", roughness: 0.22, metalness: 1 });
  const box = new THREE.MeshStandardMaterial({ color: "#d9b12a", roughness: 0.5 });
  const led = new THREE.MeshStandardMaterial({ color: "#000", emissive: "#44ff88", emissiveIntensity: 3 });
  const root = new THREE.Group(); root.visible = false;
  const arm = (s) => {
    const g = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.28, 4, 10), suit); sleeve.rotation.x = Math.PI / 2; sleeve.position.z = 0.16; g.add(sleeve);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.045, 0.1), glove); hand.position.z = -0.02; g.add(hand);
    const fingers = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.05, 2, 8), glove); fingers.rotation.z = Math.PI / 2; fingers.position.set(0, -0.01, -0.075); g.add(fingers);
    g.position.set(s * 0.17, -0.2, -0.36); g.rotation.set(0.25, -s * 0.18, 0);
    root.add(g); return g;
  };
  const R = arm(1), Lh = arm(-1);
  const wrench = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.2), toolM); shaft.position.z = -0.12; wrench.add(shaft);
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.008, 6, 14, Math.PI * 1.5), toolM); head.rotation.x = Math.PI / 2; head.position.z = -0.23; wrench.add(head);
  wrench.position.set(0, 0.01, -0.03); R.add(wrench);
  const tester = new THREE.Group();
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.11), box); tester.add(tb);
  const tl = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), led); tl.position.set(0.02, 0.017, -0.03); tester.add(tl);
  const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 6), toolM); probe.rotation.x = Math.PI / 2; probe.position.set(-0.02, 0, -0.11); tester.add(probe);
  tester.position.set(0, 0.02, -0.05); Lh.add(tester);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  let t = 0, show = 0;
  function update(dt, kind) {
    t += dt;
    show += ((kind ? 1 : 0) - show) * Math.min(1, dt * 8);
    root.visible = show > 0.02;
    if (!root.visible) return;
    const slide = (1 - show) * 0.25;
    wrench.visible = kind !== "inspect"; tester.visible = kind === "inspect";
    const k = kind === "inspect" ? 0 : 1;
    R.position.set(0.15, -0.15 - slide + Math.sin(t * 9) * 0.012 * k, -0.34 + Math.sin(t * 9) * 0.015 * k);
    R.rotation.set(0.25 + Math.sin(t * 9) * 0.25 * k, -0.18, Math.sin(t * 9) * 0.35 * k);
    Lh.position.set(-0.14, -0.15 - slide + Math.sin(t * 2.3) * 0.005, -0.32);
    Lh.rotation.set(kind === "inspect" ? 0.55 : 0.2, 0.18, 0);
    tl.material.emissiveIntensity = kind === "inspect" ? (Math.sin(t * 12) > 0 ? 4 : 0.3) : 0;
  }
  return { root, update };
}
