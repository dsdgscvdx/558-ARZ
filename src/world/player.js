/* Персонаж-авиатехник: ходьба от первого/третьего лица, бег, присед, прыжок, лестницы,
   посадка в кабину. Коллизии — капсула против BVH. */
import * as THREE from "three";
import { resolveCapsule, raycastColliders } from "./physics.js";

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _seg = new THREE.Line3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();

export class Player {
  constructor(colliders) {
    this.cols = colliders;
    this.pos = new THREE.Vector3(8, 0, -10);
    this.vel = new THREE.Vector3();
    this.yaw = 2.4; this.pitch = -0.08;
    this.radius = 0.28; this.hStand = 1.8; this.hCrouch = 1.0; this.h = 1.8;
    this.crouch = 0; this.wantCrouch = false;
    this.onGround = false; this.mode = "walk";           // walk | ladder | seat | frozen
    this.third = false; this.speed = 0; this.moveDir = new THREE.Vector3();
    this.bob = 0; this.stepPhase = 0; this.onStep = null; this.surface = "concrete";
    this.ladder = null; this.ladderT = 0;
    this.seatAt = null; this.seatLook = { yaw: 0, pitch: 0 };
    this.eye = new THREE.Vector3(); this.bodyYaw = this.yaw;
    this.tpDist = 3.0; this.camPos = new THREE.Vector3();
    this.sens = 1; this.invertY = false;
  }
  get eyeHeight() { return this.h - 0.12; }
  look(dx, dy) {
    const k = 0.0022 * this.sens;
    this.yaw -= dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k * (this.invertY ? -1 : 1), -1.45, 1.45);
  }
  forward(out = _f) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  viewDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  teleport(p, yaw) { this.pos.copy(p); this.vel.set(0, 0, 0); if (yaw !== undefined) { this.yaw = yaw; this.bodyYaw = yaw; } this.mode = "walk"; }

  capsuleFits(h) {
    _seg.start.copy(this.pos).y += this.radius; _seg.end.copy(this.pos).y += h - this.radius;
    const before = _seg.start.clone();
    for (const c of this.cols) if (c.enabled) resolveCapsule(c, _seg, this.radius - 0.02);
    return before.distanceTo(_seg.start) < 0.01;
  }

  update(dt, inp) {
    if (this.mode === "frozen") { this.vel.set(0, 0, 0); this.speed = 0; return; }
    if (this.mode === "seat") { this.speed = 0; return; }
    if (this.mode === "ladder") { this.updateLadder(dt, inp); return; }
    // присед
    const want = inp.crouch || this.wantCrouch;
    if (want) this.crouch = Math.min(1, this.crouch + dt * 5);
    else if (this.crouch > 0) { if (this.capsuleFits(this.hStand)) this.crouch = Math.max(0, this.crouch - dt * 4); }
    this.h = THREE.MathUtils.lerp(this.hStand, this.hCrouch, this.crouch);
    // желаемая скорость
    const f = this.forward(), r = _r.set(-f.z, 0, f.x);
    _w.set(0, 0, 0).addScaledVector(f, inp.fwd - inp.back).addScaledVector(r, inp.right - inp.left);
    if (_w.lengthSq() > 1) _w.normalize();
    const vmax = this.crouch > 0.5 ? 1.0 : inp.sprint ? 4.2 : 1.75;
    _w.multiplyScalar(vmax);
    const acc = this.onGround ? 12 : 2.5;
    const k = 1 - Math.exp(-acc * dt);
    this.vel.x += (_w.x - this.vel.x) * k; this.vel.z += (_w.z - this.vel.z) * k;
    if (inp.jump && this.onGround && this.crouch < 0.3) { this.vel.y = 3.4; this.onGround = false; }
    // интегрирование с подшагами
    const steps = 4, h = dt / steps;
    let grounded = false;
    for (let i = 0; i < steps; i++) {
      this.vel.y -= 9.81 * h;
      this.pos.addScaledVector(this.vel, h);
      _seg.start.copy(this.pos).y += this.radius; _seg.end.copy(this.pos).y += this.h - this.radius;
      const st = _seg.start.clone();
      for (const c of this.cols) if (c.enabled) resolveCapsule(c, _seg, this.radius);
      _v.subVectors(_seg.start, st);
      const pushedUp = _v.y > Math.abs(h * this.vel.y) * 0.25 && _v.y > 1e-5;
      if (pushedUp) grounded = true;
      this.pos.add(_v);
      if (_v.lengthSq() > 1e-10) {
        const n = _v.clone().normalize();
        if (pushedUp || n.y > 0.55) { if (this.vel.y < 0) this.vel.y = 0; }
        else this.vel.addScaledVector(n, -Math.min(0, n.dot(this.vel)));
      }
    }
    this.onGround = grounded || (this.onGround && Math.abs(this.vel.y) < 0.05);
    if (this.pos.y < -5) this.teleport(new THREE.Vector3(8, 0.2, -10));
    // скорость и шаги
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed > 0.1) this.moveDir.set(this.vel.x, 0, this.vel.z).normalize();
    if (this.onGround && this.speed > 0.3) {
      const prev = this.stepPhase;
      this.stepPhase += dt * this.speed * (inp.sprint ? 1.35 : 1.7);
      if (Math.floor(prev / Math.PI) !== Math.floor(this.stepPhase / Math.PI) && this.onStep) this.onStep(this.surfaceType(), this.speed);
    }
    this.bob = THREE.MathUtils.lerp(this.bob, this.onGround ? Math.min(1, this.speed / 2) : 0, 1 - Math.exp(-8 * dt));
    // тело разворачивается по направлению движения (для вида от 3-го лица)
    const target = this.speed > 0.2 ? Math.atan2(-this.moveDir.x, -this.moveDir.z) : this.bodyYaw;
    let d = target - this.bodyYaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.bodyYaw += d * (1 - Math.exp(-10 * dt));
    if (!this.third) this.bodyYaw = this.yaw;
  }
  surfaceType() {
    if (this.pos.y > 1.9) return this.pos.y > 2.25 ? "airframe" : "metal";
    if (this.pos.x > 30.3) return "apron";
    return "concrete";
  }

  /* ---------- лестницы ---------- */
  tryLadder(ladders, force = false) {
    for (const L of ladders) {
      const lenV = _v.subVectors(L.top, L.bottom), len = lenV.length();
      const t = THREE.MathUtils.clamp(_w.subVectors(this.pos, L.bottom).dot(lenV) / (len * len), 0, 1);
      const p = L.bottom.clone().lerp(L.top, t);
      const dh = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (dh < 0.9 && (force || Math.abs(p.y - this.pos.y) < 0.6)) { this.ladder = L; this.ladderT = t; this.mode = "ladder"; this.vel.set(0, 0, 0); return true; }
    }
    return false;
  }
  updateLadder(dt, inp) {
    const L = this.ladder, len = L.top.distanceTo(L.bottom);
    const dirIn = inp.fwd - inp.back;
    this.ladderT = THREE.MathUtils.clamp(this.ladderT + (dirIn * 0.9 * dt) / len, 0, 1);
    const p = L.bottom.clone().lerp(L.top, this.ladderT);
    // отступ от лестницы в сторону от самолёта
    const out = new THREE.Vector3(L.dir.x, 0, L.dir.z).normalize().multiplyScalar(-0.32);
    this.pos.copy(p).add(out); this.pos.y = p.y - 0.15;
    this.speed = Math.abs(dirIn) * 0.6; this.h = this.hStand; this.crouch = 0;
    if (dirIn !== 0) { const prev = this.stepPhase; this.stepPhase += dt * 4; if (Math.floor(prev / Math.PI) !== Math.floor(this.stepPhase / Math.PI) && this.onStep) this.onStep("ladder", 1); }
    if (this.ladderT >= 1 && dirIn > 0 && L.exitTo) { this.teleport(L.exitTo.clone()); this.ladder = null; }
    else if (this.ladderT <= 0 && dirIn < 0) { this.teleport(L.bottom.clone().add(out.multiplyScalar(2))); this.ladder = null; }
    if (inp.jump) { this.mode = "walk"; this.ladder = null; this.pos.add(out); }
  }

  /* ---------- камера ---------- */
  applyCamera(cam, colliders, dt) {
    const eyeY = this.eyeHeight;
    if (this.mode === "seat" && this.seatAt) {
      this.seatAt(this.eye);
      cam.position.copy(this.eye);
      cam.rotation.set(0, 0, 0, "YXZ"); cam.rotation.order = "YXZ";
      cam.rotation.y = this.yaw; cam.rotation.x = this.pitch;
      return;
    }
    const bobA = this.bob * (this.third ? 0 : 1);
    const by = Math.abs(Math.sin(this.stepPhase)) * 0.035 * bobA, bx = Math.cos(this.stepPhase) * 0.018 * bobA;
    this.eye.set(this.pos.x, this.pos.y + eyeY + by, this.pos.z);
    const r = _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.eye.addScaledVector(r, bx);
    cam.rotation.order = "YXZ";
    if (!this.third) {
      cam.position.copy(this.eye);
      cam.rotation.set(this.pitch, this.yaw, Math.cos(this.stepPhase) * 0.004 * bobA);
      return;
    }
    // вид от третьего лица: за правым плечом, с отталкиванием от стен
    const dir = this.viewDir(_v).negate();
    const shoulder = _w.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(0.45);
    const pivot = this.eye.clone().add(shoulder).add(new THREE.Vector3(0, 0.1, 0));
    const hit = raycastColliders(colliders, pivot, dir, this.tpDist + 0.3);
    const d = Math.min(this.tpDist, hit - 0.25);
    const want = pivot.clone().addScaledVector(dir, Math.max(0.3, d));
    this.camPos.lerp(want, this.camPos.lengthSq() ? 1 - Math.exp(-20 * dt) : 1);
    cam.position.copy(this.camPos);
    cam.rotation.set(this.pitch, this.yaw, 0);
  }
}
