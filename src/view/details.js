/* Мелкие внешние детали МиГ-29: пилоны с пусковыми устройствами, статические разрядники,
   датчики углов атаки, дополнительные ПВД, амбразура пушки ГШ-30-1 с газоотводами,
   дренажные трубки и заборники охлаждения, перфорированные створки воздухозаборников,
   красные флажки «снять перед полётом». */
import * as THREE from "three";
import { airfoilSurface, nacaT, mergeAll, mirrorZ, box, rbox, cyl, place, latheX, tube, gridSurface, range, sePoint } from "./geo.js";
import { WING_SECTIONS, CORE, NAC, FIN, STAB, DEG } from "./mig29dims.js";
import { canvas, texFromCanvas } from "./tex.js";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/* сечение крыла на полуразмахе z */
export function wingSec(z) {
  const S = WING_SECTIONS; let i = 0; while (i < S.length - 2 && S[i + 1].s < z) i++;
  const a = S[i], b = S[i + 1], k = clamp((z - a.s) / (b.s - a.s), 0, 1);
  const L = (n) => a[n] + (b[n] - a[n]) * k;
  return { le: L("le"), c: L("c"), t: L("t"), off: L("off") };
}
export const wingBotY = (x, z) => { const s = wingSec(z), xc = clamp((s.le - x) / s.c, 0.002, 1); return s.off - nacaT(xc, s.t) * s.c; };
export const wingTopAt = (x, z) => { const s = wingSec(z), xc = clamp((s.le - x) / s.c, 0.002, 1); return s.off + nacaT(xc, s.t) * s.c; };

/* текстура перфорированной створки (дырки в сетке) */
export function perforatedMaterial(base = "#8b9194") {
  const c = canvas(128, 128), g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const cx = 16 + x * 32 + (y % 2) * 16, cy = 16 + y * 32;
    g.fillStyle = "#101112"; g.beginPath(); g.arc(cx % 128, cy, 8, 0, 7); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 1.5; g.beginPath(); g.arc(cx % 128, cy, 9, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  }
  const t = texFromCanvas(c); t.repeat.set(18, 24);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide });
}
/* красная лента «снять перед полётом» */
export function removeFlagMaterial() {
  const c = canvas(64, 512), g = c.getContext("2d");
  g.fillStyle = "#c21d18"; g.fillRect(0, 0, 64, 512);
  g.fillStyle = "rgba(0,0,0,0.12)"; for (let y = 0; y < 512; y += 6) g.fillRect(0, y, 64, 2);
  g.save(); g.translate(32, 256); g.rotate(-Math.PI / 2); g.fillStyle = "#f4efe6"; g.font = "700 30px 'IBM Plex Sans Condensed','Arial Narrow',Arial,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("СНЯТЬ ПЕРЕД ПОЛЁТОМ", 0, 0); g.restore();
  return new THREE.MeshStandardMaterial({ map: texFromCanvas(c, { clamp: true }), roughness: 0.85, side: THREE.DoubleSide });
}
/* флажок, свисающий из точки p (слегка развёрнутый по ходу) */
export function streamer(p, len = 0.26, w = 0.034, yaw = 0) {
  const g = new THREE.PlaneGeometry(w, len, 1, 4);
  const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), t = (len / 2 - y) / len; pos.setZ(i, Math.sin(t * 2.2) * 0.025 * t); }
  g.computeVertexNormals(); g.translate(0, -len / 2, 0); g.rotateY(yaw); g.translate(p[0], p[1], p[2]);
  return g;
}

/* разрядники на задней кромке законцовки стабилизатора (правый, в координатах самолёта) */
export function stabDischargers() {
  const out = [];
  for (const zz of [3.45, 3.82]) {
    const S = STAB.sections; let i = 0; while (i < S.length - 2 && S[i + 1].s < zz) i++;
    const a = S[i], b = S[i + 1], k = clamp((zz - a.s) / (b.s - a.s), 0, 1), te = a.le + (b.le - a.le) * k - (a.c + (b.c - a.c) * k);
    const y = STAB.y0 + (zz - STAB.z0) * Math.tan(STAB.anh), len = 0.1;
    const g = new THREE.CylinderGeometry(0.0022, 0.004, len, 6); g.rotateZ(Math.PI / 2); g.translate(te - len / 2 + 0.01, y, zz); out.push(g);
  }
  return mergeAll(out);
}

export function buildDetails({ air, L, colliders, wingTopY }) {
  const railMat = new THREE.MeshStandardMaterial({ color: "#8a9296", roughness: 0.55, metalness: 0.35, normalMap: L.gearPaint.normalMap, normalScale: new THREE.Vector2(0.4, 0.4) });
  const R = [];            // правая сторона — зеркалится
  const push = (list, g) => list.push(g);

  /* ── пилоны: внутренний с балочным держателем, средний и внешний с АПУ ── */
  const pyl = [], rails = [], dark = [];
  const pylons = [{ z: 2.55, x0: -0.35, len: 1.45, h: 0.24, holder: "bd" }, { z: 3.27, x0: -0.95, len: 1.15, h: 0.2, holder: "apu" }, { z: 3.97, x0: -1.45, len: 0.95, h: 0.17, holder: "apu" }];
  for (const P of pylons) {
    const yTop = wingBotY(P.x0 - P.len * 0.45, P.z) + 0.04, yBot = yTop - P.h;
    const secs = [{ s: yBot, le: P.x0, c: P.len, t: 0.07 }, { s: yTop, le: P.x0 + 0.04, c: P.len + 0.05, t: 0.07 }];
    push(pyl, airfoilSurface(secs, (x, t, s) => [x, s, P.z + t], { M: 16, capStart: true, capEnd: false }));
    const cx = P.x0 - P.len / 2;
    if (P.holder === "apu") {
      // АПУ-73: корпус с закруглённым носком, направляющая снизу, разъём
      const L2 = P.len * 1.3, top = yBot + 0.012, xc = cx - 0.08, hh = 0.115;
      push(rails, rbox(L2, hh, 0.1, 0.03, xc, top - hh / 2, P.z));
      push(rails, latheX([[xc + L2 / 2 + 0.2, 0.0], [xc + L2 / 2 + 0.14, 0.026], [xc + L2 / 2 + 0.05, 0.046], [xc + L2 / 2 - 0.02, 0.05]], 16, { cy: top - hh / 2, cz: P.z }));
      push(dark, box(L2 * 0.9, 0.014, 0.036, xc - 0.03, top - hh - 0.005, P.z));
      push(rails, box(L2 * 0.9, 0.012, 0.06, xc - 0.03, top - hh - 0.016, P.z));
      push(dark, box(0.12, 0.03, 0.102, xc + L2 * 0.3, top - hh * 0.45, P.z));
      for (const dx of [-0.4, 0.2]) push(rails, cyl(0.012, 0.012, 0.03, "y", xc + dx, top - hh - 0.03, P.z, 8));
    } else {
      const top = yBot + 0.005;
      push(rails, rbox(0.95, 0.09, 0.1, 0.02, cx, top - 0.045, P.z));
      for (const dx of [-0.36, -0.22, 0.22, 0.36]) for (const dz of [-1, 1]) push(rails, cyl(0.009, 0.009, 0.06, "y", cx + dx, top - 0.1, P.z + dz * 0.04, 8));
      push(dark, box(0.3, 0.02, 0.05, cx, top - 0.092, P.z));
    }
  }
  const pylG = mergeAll(pyl), railG = mergeAll(rails), darkG = mergeAll(dark);
  air(pylG, L.paintDouble, { collide: true }); air(mirrorZ(pylG), L.paintDouble, { collide: true });
  air(railG, railMat); air(mirrorZ(railG), railMat); air(darkG, L.black); air(mirrorZ(darkG), L.black);

  /* ── статические разрядники на задних кромках законцовок и килей ── */
  const dis = [];
  const rodBack = (x, y, z, len = 0.11, up = 0) => { const g = new THREE.CylinderGeometry(0.0022, 0.004, len, 6); g.rotateZ(Math.PI / 2 - up); g.translate(x - len / 2 * Math.cos(up), y - len / 2 * Math.sin(up), z); return g; };
  for (const z of [4.95, 5.3, 5.62]) { const s = wingSec(z); dis.push(rodBack(s.le - s.c + 0.01, s.off, z)); }
  {
    const c = Math.cos(FIN.cant), sn = Math.sin(FIN.cant);
    for (const sv of [2.15, 2.4]) { const i = sv > 2.2 ? 5 : 4, sec = FIN.sections[i]; dis.push(rodBack(sec.le - sec.c + 0.01, FIN.y0 + sv * c, FIN.z + sv * sn, 0.12)); }
  }
  const disG = mergeAll(dis);
  air(disG, L.black, { noShadow: true }); air(mirrorZ(disG), L.black, { noShadow: true });

  /* ── нос: датчики углов атаки ДУА и дополнительные ПВД по бортам ── */
  const vane = [], probes = [];
  {
    const x = 5.55, p = CORE(x), [y, z] = sePoint(p, 80 * DEG);
    vane.push(cyl(0.034, 0.034, 0.008, "z", x, y, z + 0.002, 16));
    const sh = new THREE.Shape(); sh.moveTo(0.03, 0); sh.lineTo(-0.07, 0); sh.lineTo(-0.075, 0.042); sh.lineTo(-0.02, 0.042); sh.closePath();
    const vg = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false }); vg.rotateX(Math.PI / 2); vg.translate(x, y + 0.002, z + 0.008);
    vane.push(place(vg, 0, 0, 0));
    const px = 6.05, pp = CORE(px), [py, pz] = sePoint(pp, 118 * DEG);
    probes.push(tube([[px - 0.02, py, pz - 0.005], [px, py - 0.02, pz + 0.05], [px + 0.02, py - 0.03, pz + 0.075]], 0.009, 8, 8));
    probes.push(cyl(0.008, 0.011, 0.2, "x", px + 0.12, py - 0.03, pz + 0.075, 10));
    probes.push(cyl(0.005, 0.005, 0.02, "x", px + 0.23, py - 0.03, pz + 0.075, 8));
  }
  const vaneG = mergeAll(vane), probeG = mergeAll(probes);
  air(vaneG, L.steelDark, { noShadow: true }); air(mirrorZ(vaneG), L.steelDark, { noShadow: true });
  air(probeG, L.steel, { noShadow: true }); air(mirrorZ(probeG), L.steel, { noShadow: true });

  /* ── пушка ГШ-30-1 в корне левого наплыва: амбразура, отражатель газов, жалюзи газоотвода ── */
  {
    const mx = 2.72, my = 2.265, mz = -0.78;
    air(mergeAll([cyl(0.03, 0.034, 0.34, "x", mx - 0.16, my, mz, 14)]), L.steelDark);
    air(mergeAll([cyl(0.052, 0.058, 0.03, "x", mx + 0.012, my, mz, 16)]), L.black);
    air(place(new THREE.CircleGeometry(0.024, 14), mx + 0.03, my, mz, 0, Math.PI / 2, 0), L.black);
    const slots = [];
    for (let k = 0; k < 6; k++) { const x = 2.42 - k * 0.075, y = wingTopY(x, 0.78) + 0.003; slots.push(box(0.045, 0.004, 0.13, x, y, mz, 0, 0, 0.12)); }
    air(mergeAll(slots), L.black, { noShadow: true });
    const plate = gridSurface((x, zz) => [x, wingTopY(x, Math.abs(zz)) + 0.0025, zz], range(2.2, 2.75, 6), range(-0.9, -0.66, 4), { flip: true });
    air(plate, L.titanium);
  }

  /* ── мотогондолы: заборники охлаждения коробки приводов и дренажные трубки ── */
  const scoops = [], drains = [];
  for (const x of [-0.9, -2.6]) {
    const p = NAC(x), [y, z] = sePoint({ ...p, cz: 0 }, 128 * DEG);
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(-0.22, 0); sh.lineTo(-0.22, 0.05); sh.quadraticCurveTo(-0.08, 0.05, 0, 0);
    const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 });
    sg.translate(0, 0, -0.03); sg.rotateX(-38 * DEG); sg.translate(x, y, p.cz + z - 0.005);
    scoops.push(sg);
  }
  for (const x of [-3.6, -4.1]) { const p = NAC(x); drains.push(cyl(0.008, 0.01, 0.1, "y", x, p.cy - p.hb - 0.04, p.cz, 8)); }
  const scG = mergeAll(scoops), drG = mergeAll(drains);
  air(scG, L.paintDouble); air(mirrorZ(scG), L.paintDouble); air(drG, L.steel, { noShadow: true }); air(mirrorZ(drG), L.steel, { noShadow: true });
  // воздухозаборники системы кондиционирования на гаргроте
  const naca = [];
  for (const s of [1, -1]) {
    const x = 1.05, z = s * 0.28, y = CORE(x).cy + CORE(x).ht * 0.93;
    naca.push(place(new THREE.PlaneGeometry(0.22, 0.05), x, y + 0.004, z, -Math.PI / 2, 0, 0));
  }
  air(mergeAll(naca), L.black, { noShadow: true });
  void R; void colliders;
}
