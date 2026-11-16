// Duskfall Bazaar — all sound is synthesised with WebAudio, no audio files.
export function createAudio() {
  let ctx = null, master = null, muted = false, ambientNodes = null;
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    return ctx;
  }
  function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); startAmbient(); }
  function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }
  function env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function noiseBuffer(dur) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function burst(dur, filterFreq, peak, type = 'lowpass') {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain(); env(g, t, 0.004, peak, dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.05);
  }
  function tone(freq, dur, peak, type = 'sine', slideTo = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain(); env(g, t, 0.006, peak, dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  const SHOT_TONE = { pistol: [900, 0.09, 0.5], smg: [700, 0.08, 0.45], rifle: [520, 0.12, 0.6], dmr: [320, 0.22, 0.8], shotgun: [240, 0.2, 0.85], melee: [0, 0, 0] };
  function shot(kind) {
    const s = SHOT_TONE[kind] || SHOT_TONE.rifle;
    if (s[0]) { burst(0.09, 1800, 0.55); tone(s[0], s[1], s[2], 'square', s[0] * 0.35); }
    else burst(0.06, 1200, 0.25);
  }
  function dryFire() { tone(1400, 0.03, 0.12, 'square'); }
  function reload() { tone(900, 0.04, 0.15, 'square'); setTimeout(() => tone(650, 0.04, 0.15, 'square'), 160); setTimeout(() => tone(1100, 0.04, 0.18, 'square'), 420); }
  function hit(kill) { tone(kill ? 1560 : 1180, 0.07, 0.22, 'sine'); if (kill) setTimeout(() => tone(1980, 0.1, 0.2, 'sine'), 70); }
  function hurt() { tone(180, 0.15, 0.35, 'sawtooth', 90); }
  function step() { burst(0.05, 500, 0.06); }
  function click() { tone(2000, 0.03, 0.12, 'square'); }
  function beep(n = 1, freq = 880) { for (let i = 0; i < n; i++) setTimeout(() => tone(freq, 0.09, 0.25, 'sine'), i * 160); }
  function plantStart() { beep(2, 660); }
  function explosion() {
    burst(1.4, 300, 1.0); tone(70, 1.1, 0.9, 'sine', 28); tone(48, 0.9, 0.6, 'triangle', 24);
    setTimeout(() => burst(0.5, 900, 0.4), 120);
  }
  function win() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.25, 'triangle'), i * 130)); }
  function lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.25, 0.22, 'triangle'), i * 150)); }
  function throwWhoosh() { burst(0.25, 900, 0.2, 'bandpass'); }
  function startAmbient() {
    if (!ctx || ambientNodes || muted) return;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(3); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240;
    const g = ctx.createGain(); g.gain.value = 0.035;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 0.015; lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(master); src.start(); lfo.start();
    ambientNodes = { src, lfo };
  }
  return { unlock, setMuted, shot, dryFire, reload, hit, hurt, step, click, beep, plantStart, explosion, win, lose, throwWhoosh };
}
