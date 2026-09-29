/* Звук целиком синтезируется Web Audio: гул ангара, шаги по бетону/металлу/обшивке, инструмент,
   привод фонаря и ворот, двигатель РД-33 (свист компрессора, рёв, форсаж), хлопки и сигналы. */
export const AU = { ctx: null, on: true, vol: 0.8, master: null, nodes: null, amb: null, noise: null };

function ctx() {
  if (!AU.ctx) {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    AU.ctx = new C();
    AU.master = AU.ctx.createGain(); AU.master.gain.value = AU.vol; AU.master.connect(AU.ctx.destination);
    // общий буфер коричневого шума
    const c = AU.ctx, buf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), d = buf.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; }
    AU.noise = buf;
    const wb = c.createBuffer(1, c.sampleRate, c.sampleRate), wd = wb.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    AU.white = wb;
  }
  return AU.ctx;
}
export function audioUnlock() { const c = ctx(); if (c && c.state !== "running") c.resume(); }
export function setVolume(v) { AU.vol = v; if (AU.master) AU.master.gain.value = AU.on ? v : 0; }
export function setSound(on) { AU.on = on; if (AU.master) AU.master.gain.value = on ? AU.vol : 0; }

function src(buf, loop = true) { const s = AU.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; }
function filt(type, f, q = 0.7) { const x = AU.ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }
function gain(v = 0) { const g = AU.ctx.createGain(); g.gain.value = v; return g; }

/* ---------- фон ангара ---------- */
export function ambienceStart() {
  const c = ctx(); if (!c || AU.amb) return;
  const out = gain(0); out.connect(AU.master); out.gain.setTargetAtTime(0.22, c.currentTime, 1.5);
  const s = src(AU.noise), f = filt("lowpass", 180), g = gain(0.5); s.connect(f); f.connect(g); g.connect(out); s.start();
  const hum = c.createOscillator(); hum.frequency.value = 50; const hg = gain(0.012); hum.connect(hg); hg.connect(out); hum.start();
  const hum2 = c.createOscillator(); hum2.frequency.value = 100; const hg2 = gain(0.006); hum2.connect(hg2); hg2.connect(out); hum2.start();
  AU.amb = { out, s, hum, hum2, timer: 0 };
}
export function ambienceLevel(v) { if (AU.amb) AU.amb.out.gain.setTargetAtTime(0.22 * v, AU.ctx.currentTime, 0.8); }
/* редкие дальние звуки цеха: удары, звон, пневмогайковёрт */
export function ambienceTick(dt) {
  const a = AU.amb; if (!a || !AU.on) return;
  a.timer -= dt;
  if (a.timer <= 0) {
    a.timer = 3 + Math.random() * 9;
    const r = Math.random();
    if (r < 0.4) clank(0.05 + Math.random() * 0.05, 400 + Math.random() * 900, true);
    else if (r < 0.7) impact(0.04, 0.4 + Math.random() * 0.6, true);
    else ratchet(0.03, 6 + Math.floor(Math.random() * 8), true);
  }
}

/* ---------- шаги ---------- */
export function footstep(surface, speed) {
  const c = ctx(); if (!c || !AU.on) return;
  const t = c.currentTime, s = src(AU.white, false);
  const base = { concrete: [900, 0.18], apron: [700, 0.16], metal: [2400, 0.2], airframe: [1500, 0.13], ladder: [2000, 0.18] }[surface] || [900, 0.18];
  const f = filt("bandpass", base[0] * (0.85 + Math.random() * 0.3), surface === "metal" || surface === "ladder" ? 6 : 1.2);
  const g = gain(0); const v = base[1] * Math.min(1.4, 0.6 + speed * 0.25);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + (surface === "metal" ? 0.22 : 0.12));
  s.connect(f); f.connect(g); g.connect(AU.master); s.start(t, Math.random() * 0.5, 0.3);
  if (surface === "metal" || surface === "ladder" || surface === "airframe") { const o = c.createOscillator(); o.frequency.value = surface === "airframe" ? 180 : 310 + Math.random() * 60; const og = gain(0); og.gain.setValueAtTime(0.05, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(og); og.connect(AU.master); o.start(t); o.stop(t + 0.2); }
}

/* ---------- инструмент и механика ---------- */
export function clank(v = 0.12, f = 800, far = false) {
  const c = ctx(); if (!c || !AU.on) return; const t = c.currentTime;
  for (const [mul, dec] of [[1, 0.5], [2.76, 0.3], [5.4, 0.18]]) {
    const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f * mul; const g = gain(0);
    g.gain.setValueAtTime(v / mul, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dec * (far ? 1.6 : 1));
    const fl = filt("lowpass", far ? 1200 : 6000); o.connect(g); g.connect(fl); fl.connect(AU.master); o.start(t); o.stop(t + dec * 2);
  }
}
export function ratchet(v = 0.1, n = 10, far = false) {
  const c = ctx(); if (!c || !AU.on) return; const t = c.currentTime;
  for (let i = 0; i < n; i++) {
    const s = src(AU.white, false), f = filt("bandpass", far ? 1500 : 3200, 4), g = gain(0), tt = t + i * 0.11 + Math.random() * 0.02;
    g.gain.setValueAtTime(v, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.03); s.connect(f); f.connect(g); g.connect(AU.master); s.start(tt, Math.random(), 0.05);
  }
}
export function impact(v = 0.12, dur = 0.8, far = false) {
  const c = ctx(); if (!c || !AU.on) return; const t = c.currentTime;
  const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(95, t);
  const lfo = c.createOscillator(); lfo.frequency.value = 38; const lg = gain(40); lfo.connect(lg); lg.connect(o.frequency);
  const f = filt("bandpass", far ? 700 : 1400, 1.5), g = gain(0);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.05); g.gain.setValueAtTime(v, t + dur - 0.1); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(f); f.connect(g); g.connect(AU.master); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
}
export function motor(dur = 2.5, v = 0.07, base = 120) {
  const c = ctx(); if (!c || !AU.on) return; const t = c.currentTime;
  const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(base * 0.6, t); o.frequency.linearRampToValueAtTime(base, t + 0.4); o.frequency.setValueAtTime(base, t + dur - 0.3); o.frequency.linearRampToValueAtTime(base * 0.5, t + dur);
  const f = filt("lowpass", 700), g = gain(0); g.gain.linearRampToValueAtTime(v, t + 0.2); g.gain.setValueAtTime(v, t + dur - 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(f); f.connect(g); g.connect(AU.master); o.start(t); o.stop(t + dur + 0.05);
}
export function toolWork(kind, dur) {
  // во время работы: чередование трещотки и гайковёрта
  if (kind === "inspect") { beep(1600, 0.05, 0.03); setTimeout(() => beep(2100, 0.05, 0.03), 180); return; }
  if (kind === "visual") return;
  ratchet(0.09, Math.max(4, Math.round(dur * 5)));
  if (dur > 1.2) setTimeout(() => impact(0.1, Math.min(1.2, dur * 0.4)), 400);
}

/* ---------- РД-33 ---------- */
export function engineAudioStart() {
  const c = ctx(); if (!c || !AU.on) return;
  if (AU.nodes) engineAudioStop();
  const master = gain(0); master.connect(AU.master);
  const mk = (type, f, q) => { const s = src(AU.noise); const fl = filt(type, f, q); const g = gain(0); s.connect(fl); fl.connect(g); g.connect(master); s.start(); return { s, fl, g }; };
  const roar = mk("bandpass", 400, 0.8), ab = mk("lowpass", 180, 0.7), hiss = mk("highpass", 3000, 0.7);
  const osc = c.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = 300; const og = gain(0); const of = filt("bandpass", 2400, 3);
  osc.connect(of); of.connect(og); og.connect(master); osc.start();
  const osc2 = c.createOscillator(); osc2.type = "triangle"; osc2.frequency.value = 900; const og2 = gain(0); osc2.connect(og2); og2.connect(master); osc2.start();
  master.gain.setTargetAtTime(0.55, c.currentTime, 0.4);
  AU.nodes = { master, roar, ab, hiss, osc, og, osc2, og2 };
  ambienceLevel(0.3);
}
export function engineAudioUpdate(N, abOn) {
  const n = AU.nodes; if (!n) return; const t = AU.ctx.currentTime, k = N / 100;
  n.roar.fl.frequency.setTargetAtTime(180 + k * 900, t, 0.2); n.roar.g.gain.setTargetAtTime(0.12 + k * 0.6, t, 0.2);
  n.hiss.g.gain.setTargetAtTime(k * 0.12, t, 0.3);
  n.osc.frequency.setTargetAtTime(140 + k * 820, t, 0.3); n.og.gain.setTargetAtTime(0.01 + k * 0.035, t, 0.3);
  n.osc2.frequency.setTargetAtTime(600 + k * 2600, t, 0.4); n.og2.gain.setTargetAtTime(0.004 + k * 0.012, t, 0.4);
  n.ab.g.gain.setTargetAtTime(abOn ? 1.4 : 0, t, 0.25);
}
export function engineAudioStop() {
  const n = AU.nodes; if (!n) return; const t = AU.ctx.currentTime; n.master.gain.setTargetAtTime(0, t, 0.5);
  setTimeout(() => { try { n.roar.s.stop(); n.ab.s.stop(); n.hiss.s.stop(); n.osc.stop(); n.osc2.stop(); } catch (e) { /* уже остановлены */ } }, 1600);
  AU.nodes = null; ambienceLevel(1);
}
export function beep(f = 880, d = 0.12, v = 0.15) {
  const c = ctx(); if (!c || !AU.on) return;
  try { const o = c.createOscillator(), g = gain(v); o.type = "square"; o.frequency.value = f; o.connect(g); g.connect(AU.master); o.start(); o.stop(c.currentTime + d); } catch (e) { /* нет звука */ }
}
export function boom() {
  const c = ctx(); if (!c || !AU.on) return;
  try {
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const s = c.createBufferSource(); s.buffer = buf; const f = filt("lowpass", 500); const g = gain(1.4);
    s.connect(f); f.connect(g); g.connect(AU.master); s.start();
  } catch (e) { /* нет звука */ }
}
