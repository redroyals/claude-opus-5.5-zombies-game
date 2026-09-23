// Procedurally synthesised, layered audio via WebAudio. Initialised on the first user gesture.
// Positional sounds use cheap distance attenuation + stereo panning relative to the listener.
import { easterSong } from './melody';
import { PERF, WEAPONS, weaponArch, type WeaponId } from '../config';
import type { Surface } from '../world/Collision';

interface Listener { x: number; y: number; z: number; yaw: number }

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private noiseBuf!: AudioBuffer;
  private brownBuf!: AudioBuffer;
  private voices = 0;
  private listener: Listener = { x: 0, y: 0, z: 0, yaw: 0 };
  private heli: { gain: GainNode; chop: GainNode; lfo: OscillatorNode; src: AudioBufferSourceNode; hum: OscillatorNode; pan: StereoPannerNode } | null = null;
  private ambNodes: AudioNode[] = [];
  private heartbeatT = 0;
  private sirenT = 20;
  volume = 0.8;
  available = true;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) { this.available = false; return; }
      this.ctx = new Ctor();
    } catch {
      this.available = false;
      return;
    }
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.5;
    this.amb.connect(this.master);
    // White and brown noise buffers shared by all voices.
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  suspend(): void { if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend(); }
  resume(): void { if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume(); }

  setListener(x: number, y: number, z: number, yaw: number): void {
    this.listener.x = x; this.listener.y = y; this.listener.z = z; this.listener.yaw = yaw;
  }

  // ------------------------------------------------------------------------------------------
  // Voice helpers
  // ------------------------------------------------------------------------------------------
  private ok(priority = false): boolean {
    if (!this.ctx || this.ctx.state !== 'running') return false;
    if (!priority && this.voices >= PERF.maxAudioVoices) return false;
    return true;
  }

  /** Output node for a sound at a world position (or non-positional if pos is null). */
  private out(pos: { x: number; y?: number; z: number } | null, gain: number, dur: number, refDist = 6): GainNode | null {
    const ctx = this.ctx!;
    let g = gain;
    let pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
      const dist = Math.hypot(dx, dz);
      g *= refDist / Math.max(refDist, dist);
      if (g < 0.01) return null;
      // Rotate into listener space: forward is -Z at yaw 0.
      const s = Math.sin(this.listener.yaw), c = Math.cos(this.listener.yaw);
      const rx = dx * c - dz * s;
      pan = Math.max(-1, Math.min(1, dist > 0.5 ? rx / dist : 0)) * 0.85;
    }
    const node = ctx.createGain();
    node.gain.value = g;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    p.connect(this.sfx);
    this.voices++;
    window.setTimeout(() => { this.voices--; try { p.disconnect(); } catch { /* already gone */ } }, (dur + 0.1) * 1000);
    return node;
  }

  private noise(dest: AudioNode, t: number, dur: number, opts: { type?: BiquadFilterType; freq: number; q?: number; freqEnd?: number; attack?: number; gain?: number; brown?: boolean }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = opts.brown ? this.brownBuf : this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 1, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(dest: AudioNode, t: number, dur: number, opts: { type?: OscillatorType; freq: number; freqEnd?: number; gain?: number; attack?: number }): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(opts.freq, t);
    if (opts.freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(10, opts.freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 1, t + (opts.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------------------------------
  // Weapons
  // ------------------------------------------------------------------------------------------
  shot(id: WeaponId, tier: number): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const v = 0.94 + Math.random() * 0.12;
    const o = this.out(null, 0.9, 0.8)!;
    const def = WEAPONS[id];
    const arch = weaponArch(id);
    if (def.special === 'arc' || def.special === 'singularity' || def.special === 'cryo') {
      if (def.special === 'arc') {
        this.noise(o, t, 0.5, { type: 'highpass', freq: 3000, gain: 0.7 });
        this.tone(o, t, 0.35, { type: 'sawtooth', freq: 1800, freqEnd: 120, gain: 0.3 });
        for (let i = 0; i < 6; i++) this.tone(o, t + i * 0.04, 0.03, { type: 'square', freq: 400 + Math.random() * 2400, gain: 0.12 });
      } else if (def.special === 'singularity') {
        this.tone(o, t, 0.9, { type: 'sine', freq: 90, freqEnd: 30, gain: 1 });
        this.tone(o, t, 0.6, { type: 'sawtooth', freq: 600, freqEnd: 60, gain: 0.2 });
        this.noise(o, t, 0.8, { type: 'lowpass', freq: 900, freqEnd: 60, gain: 0.5, brown: true });
      } else {
        this.noise(o, t, 0.16, { type: 'highpass', freq: 5000 * v, gain: 0.35 });
        this.noise(o, t, 0.12, { type: 'bandpass', freq: 1400, q: 3, gain: 0.25 });
      }
      if (tier > 0) this.tone(o, t, 0.18, { type: 'sawtooth', freq: 1320, freqEnd: 520, gain: 0.05 });
      return;
    }
    if (def.cls === 'launcher') {
      this.noise(o, t, 0.5, { type: 'lowpass', freq: 1200, freqEnd: 200, gain: 0.8 });
      this.tone(o, t, 0.3, { freq: 70, freqEnd: 30, gain: 0.9 });
      this.noise(o, t, 0.9, { type: 'bandpass', freq: 600, q: 0.6, gain: 0.35, attack: 0.05 });
      return;
    }
    const pitch = def.cls === 'smg' ? 1.25 : def.cls === 'lmg' ? 0.85 : def.cls === 'sniper' || def.cls === 'dmr' ? 0.7 : 1;
    if (arch === 'rifle') {
      const vv = v * pitch;
      this.noise(o, t, 0.09, { type: 'bandpass', freq: 2400 * vv, q: 0.7, gain: 0.9 });
      this.noise(o, t, 0.32 / pitch, { type: 'lowpass', freq: 1400 * vv, freqEnd: 300, gain: 0.55 });
      this.tone(o, t, 0.11, { freq: 150 * vv, freqEnd: 45, gain: 0.9 });
      this.noise(o, t + 0.02, 0.5 / pitch, { type: 'lowpass', freq: 500, freqEnd: 120, gain: 0.18, brown: true, attack: 0.02 });
      if (def.cls === 'sniper') this.noise(o, t + 0.05, 1.2, { type: 'lowpass', freq: 400, freqEnd: 60, gain: 0.4, brown: true, attack: 0.04 });
    } else if (arch === 'pistol') {
      this.noise(o, t, 0.06, { type: 'highpass', freq: 2200 * v, gain: 0.8 });
      this.noise(o, t, 0.22, { type: 'bandpass', freq: 1100 * v, q: 0.8, freqEnd: 400, gain: 0.5 });
      this.tone(o, t, 0.08, { freq: 220 * v, freqEnd: 70, gain: 0.6 });
      this.tone(o, t + 0.07, 0.04, { type: 'square', freq: 1800, gain: 0.04 }); // slide clack
    } else {
      this.noise(o, t, 0.12, { type: 'bandpass', freq: 1500 * v, q: 0.5, gain: 1 });
      this.noise(o, t, 0.7, { type: 'lowpass', freq: 1800 * v, freqEnd: 150, gain: 0.8 });
      this.tone(o, t, 0.25, { freq: 95 * v, freqEnd: 32, gain: 1.1 });
      this.noise(o, t + 0.03, 0.9, { type: 'lowpass', freq: 400, freqEnd: 80, gain: 0.3, brown: true, attack: 0.03 });
      // Pump action
      if (def.rpm < 120) { this.mech(t + 0.38, 900, 0.3); this.mech(t + 0.52, 700, 0.35); }
    }
    if (tier > 0) this.tone(o, t, 0.18, { type: 'sawtooth', freq: tier === 1 ? 880 : 1320, freqEnd: tier === 1 ? 440 : 520, gain: 0.05 });
  }

  private mech(t: number, freq: number, gain: number): void {
    const o = this.out(null, gain, 0.2);
    if (!o) return;
    this.noise(o, t, 0.05, { type: 'bandpass', freq, q: 3, gain: 1 });
    this.tone(o, t, 0.03, { type: 'square', freq: freq * 2.2, gain: 0.15 });
  }

  reloadPart(kind: 'magOut' | 'magIn' | 'bolt' | 'shell' | 'pump' | 'slide'): void {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    switch (kind) {
      case 'magOut': this.mech(t, 700, 0.25); this.mech(t + 0.05, 1100, 0.12); break;
      case 'magIn': this.mech(t, 1300, 0.35); this.mech(t + 0.03, 500, 0.25); break;
      case 'bolt': this.mech(t, 1600, 0.35); this.mech(t + 0.12, 900, 0.4); break;
      case 'shell': this.mech(t, 1900, 0.2); this.mech(t + 0.04, 600, 0.25); break;
      case 'pump': this.mech(t, 900, 0.35); this.mech(t + 0.14, 700, 0.4); break;
      case 'slide': this.mech(t, 2000, 0.3); this.mech(t + 0.08, 1200, 0.35); break;
    }
  }

  empty(): void {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    const o = this.out(null, 0.3, 0.1)!;
    this.tone(o, t, 0.03, { type: 'square', freq: 2400, gain: 0.3 });
    this.noise(o, t, 0.03, { type: 'highpass', freq: 3000, gain: 0.4 });
  }

  weaponSwitch(): void {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    this.mech(t, 500, 0.2);
    this.mech(t + 0.1, 1200, 0.15);
  }

  hitmarker(kind: 'body' | 'head' | 'kill' | 'armor'): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const o = this.out(null, 0.35, 0.3)!;
    if (kind === 'head') {
      this.tone(o, t, 0.14, { type: 'triangle', freq: 2600, freqEnd: 2200, gain: 0.5 });
      this.tone(o, t, 0.1, { type: 'sine', freq: 5200, gain: 0.15 });
    } else if (kind === 'kill') {
      this.tone(o, t, 0.09, { type: 'triangle', freq: 1500, gain: 0.35 });
      this.noise(o, t, 0.12, { type: 'lowpass', freq: 600, gain: 0.5 });
    } else if (kind === 'armor') {
      this.tone(o, t, 0.12, { type: 'square', freq: 3100, freqEnd: 2800, gain: 0.12 });
    } else {
      this.noise(o, t, 0.04, { type: 'bandpass', freq: 3500, q: 2, gain: 0.35 });
    }
  }

  impact(surface: Surface | 'flesh', pos: { x: number; z: number }): void {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    const o = this.out(pos, 0.35, 0.3, 4);
    if (!o) return;
    switch (surface) {
      case 'metal':
        this.tone(o, t, 0.15, { type: 'triangle', freq: 1800 + Math.random() * 1500, freqEnd: 900, gain: 0.25 });
        this.noise(o, t, 0.05, { type: 'highpass', freq: 3000, gain: 0.3 });
        break;
      case 'flesh':
        this.noise(o, t, 0.08, { type: 'lowpass', freq: 700, gain: 0.8 });
        this.tone(o, t, 0.06, { freq: 120, freqEnd: 60, gain: 0.5 });
        break;
      case 'wood':
        this.noise(o, t, 0.07, { type: 'bandpass', freq: 900, q: 2, gain: 0.6 });
        break;
      case 'glass':
        this.noise(o, t, 0.25, { type: 'highpass', freq: 4000, gain: 0.4 });
        break;
      default:
        this.noise(o, t, 0.06, { type: 'bandpass', freq: 1600, q: 1.2, gain: 0.5 });
    }
  }

  explosion(pos: { x: number; z: number }): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const o = this.out(pos, 1.3, 2.2, 14)!;
    if (!o) return;
    this.tone(o, t, 0.8, { freq: 70, freqEnd: 22, gain: 1.2 });
    this.noise(o, t, 0.25, { type: 'lowpass', freq: 3000, freqEnd: 500, gain: 1 });
    this.noise(o, t, 2.0, { type: 'lowpass', freq: 600, freqEnd: 60, gain: 0.8, brown: true, attack: 0.01 });
    for (let i = 0; i < 5; i++) this.noise(o, t + 0.2 + Math.random() * 0.8, 0.08, { type: 'highpass', freq: 2500, gain: 0.15 });
  }

  grenadeBounce(pos: { x: number; z: number }): void {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    const o = this.out(pos, 0.25, 0.2, 4);
    if (!o) return;
    this.tone(o, t, 0.08, { type: 'triangle', freq: 900 + Math.random() * 300, gain: 0.4 });
  }

  grenadePin(): void {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    this.mech(t, 2400, 0.25);
    this.mech(t + 0.15, 1500, 0.15);
  }

  // ------------------------------------------------------------------------------------------
  // Player
  // ------------------------------------------------------------------------------------------
  footstep(surface: Surface, sprint: boolean, crouch: boolean): void {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    const g = crouch ? 0.08 : sprint ? 0.3 : 0.2;
    const o = this.out(null, g, 0.25)!;
    const f = surface === 'metal' ? 2200 : surface === 'wood' ? 700 : surface === 'dirt' ? 500 : 1100;
    this.noise(o, t, 0.09, { type: 'bandpass', freq: f * (0.85 + Math.random() * 0.3), q: 1.3, gain: 0.9 });
    this.noise(o, t + 0.02, 0.07, { type: 'lowpass', freq: 300, gain: 0.6 });
    if (surface === 'metal') this.tone(o, t, 0.1, { type: 'triangle', freq: 400 + Math.random() * 200, gain: 0.08 });
  }

  land(): void {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    const o = this.out(null, 0.35, 0.3)!;
    this.noise(o, t, 0.15, { type: 'lowpass', freq: 500, gain: 1 });
    this.mech(t + 0.02, 800, 0.1);
  }

  hurt(heavy: boolean): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const o = this.out(null, heavy ? 0.6 : 0.4, 0.4)!;
    this.noise(o, t, 0.18, { type: 'lowpass', freq: 400, gain: 1 });
    this.tone(o, t, 0.2, { freq: 90, freqEnd: 50, gain: 0.6 });
  }

  armorBreak(): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const o = this.out(null, 0.5, 0.5)!;
    this.noise(o, t, 0.3, { type: 'highpass', freq: 2500, gain: 0.8 });
    this.tone(o, t, 0.35, { type: 'square', freq: 700, freqEnd: 180, gain: 0.12 });
  }

  plate(stage: 'start' | 'done'): void {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    const o = this.out(null, 0.4, 0.4)!;
    if (stage === 'start') { this.noise(o, t, 0.2, { type: 'bandpass', freq: 600, q: 1.5, gain: 0.6 }); }
    else { this.mech(t, 1100, 0.4); this.noise(o, t, 0.15, { type: 'bandpass', freq: 2000, q: 2, gain: 0.3 }); }
  }

  heartbeat(dt: number, intensity: number): void {
    if (intensity <= 0) return;
    this.heartbeatT -= dt;
    if (this.heartbeatT > 0 || !this.ok()) return;
    this.heartbeatT = 0.9 - intensity * 0.35;
    const t = this.ctx!.currentTime;
    const o = this.out(null, 0.4 * intensity, 0.5)!;
    this.tone(o, t, 0.12, { freq: 60, freqEnd: 40, gain: 1 });
    this.tone(o, t + 0.18, 0.1, { freq: 55, freqEnd: 38, gain: 0.7 });
  }

  // ------------------------------------------------------------------------------------------
  // Zombies
  // ------------------------------------------------------------------------------------------
  zombieVoice(pos: { x: number; z: number }, kind: 'groan' | 'scream' | 'attack' | 'death' | 'elite', pitch = 1): void {
    if (!this.ok(kind === 'elite')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dur = kind === 'groan' ? 0.9 + Math.random() * 0.8 : kind === 'scream' ? 0.9 : kind === 'attack' ? 0.4 : kind === 'elite' ? 1.8 : 0.7;
    const o = this.out(pos, kind === 'elite' ? 1.1 : kind === 'scream' ? 0.5 : 0.4, dur, kind === 'elite' ? 12 : 5);
    if (!o) return;
    const base = (kind === 'scream' ? 280 : kind === 'elite' ? 55 : kind === 'attack' ? 170 : 105) * pitch * (0.85 + Math.random() * 0.3);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base, t);
    if (kind === 'scream') osc.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.25), osc.frequency.exponentialRampToValueAtTime(base * 0.8, t + dur);
    else if (kind === 'death') osc.frequency.exponentialRampToValueAtTime(base * 0.5, t + dur);
    else osc.frequency.linearRampToValueAtTime(base * (0.8 + Math.random() * 0.4), t + dur);
    // Vibrato for a wet, unstable voice
    const vib = ctx.createOscillator();
    vib.frequency.value = 5 + Math.random() * 6;
    const vibG = ctx.createGain();
    vibG.gain.value = base * 0.06;
    vib.connect(vibG); vibG.connect(osc.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = kind === 'elite' ? 300 : 550 + Math.random() * 200; f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = kind === 'elite' ? 700 : 1100 + Math.random() * 400; f2.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.08);
    g.gain.setValueAtTime(1, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f1); osc.connect(f2); f1.connect(g); f2.connect(g); g.connect(o);
    osc.start(t); vib.start(t);
    osc.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
    this.noise(o, t, dur * 0.8, { type: 'bandpass', freq: 900, q: 0.7, gain: kind === 'attack' ? 0.6 : 0.25, attack: 0.05 });
    if (kind === 'elite') this.tone(o, t, dur, { freq: 38, freqEnd: 30, gain: 0.9, attack: 0.1 });
  }

  zombieSwipe(pos: { x: number; z: number }): void {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    const o = this.out(pos, 0.4, 0.3, 4);
    if (!o) return;
    this.noise(o, t, 0.18, { type: 'bandpass', freq: 500, freqEnd: 2000, q: 1, gain: 0.6, attack: 0.05 });
  }

  eliteSlam(pos: { x: number; z: number }): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const o = this.out(pos, 1.0, 1.2, 10);
    if (!o) return;
    this.tone(o, t, 0.6, { freq: 55, freqEnd: 25, gain: 1 });
    this.noise(o, t, 0.8, { type: 'lowpass', freq: 800, freqEnd: 80, gain: 0.9, brown: true });
  }

  // ------------------------------------------------------------------------------------------
  // UI / mission cues
  // ------------------------------------------------------------------------------------------
  ui(kind: 'buy' | 'deny' | 'loot' | 'cash' | 'contract' | 'complete' | 'alert' | 'radio' | 'upgrade' | 'pickup' | 'click'): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const o = this.out(null, 0.35, 1.6)!;
    switch (kind) {
      case 'buy': this.tone(o, t, 0.08, { type: 'square', freq: 880, gain: 0.12 }); this.tone(o, t + 0.08, 0.12, { type: 'square', freq: 1320, gain: 0.12 }); this.mech(t + 0.05, 700, 0.3); break;
      case 'deny': this.tone(o, t, 0.12, { type: 'square', freq: 180, gain: 0.2 }); this.tone(o, t + 0.13, 0.16, { type: 'square', freq: 140, gain: 0.2 }); break;
      case 'loot': this.mech(t, 500, 0.4); this.noise(o, t + 0.05, 0.3, { type: 'bandpass', freq: 1500, q: 0.8, gain: 0.3 }); this.tone(o, t + 0.2, 0.2, { type: 'triangle', freq: 1046, gain: 0.15 }); break;
      case 'cash': this.tone(o, t, 0.06, { type: 'triangle', freq: 1760, gain: 0.08 }); break;
      case 'pickup': this.mech(t, 900, 0.3); this.tone(o, t + 0.04, 0.1, { type: 'triangle', freq: 1400, gain: 0.12 }); break;
      case 'contract': [523, 659, 784].forEach((f, i) => this.tone(o, t + i * 0.12, 0.25, { type: 'triangle', freq: f, gain: 0.25 })); break;
      case 'complete': [523, 659, 784, 1046].forEach((f, i) => this.tone(o, t + i * 0.1, 0.5, { type: 'triangle', freq: f, gain: 0.25 })); break;
      case 'alert': for (let i = 0; i < 3; i++) this.tone(o, t + i * 0.35, 0.25, { type: 'sawtooth', freq: 440, freqEnd: 330, gain: 0.12 }); break;
      case 'radio':
        this.noise(o, t, 0.6, { type: 'bandpass', freq: 1800, q: 1.5, gain: 0.25 });
        for (let i = 0; i < 4; i++) this.tone(o, t + 0.1 + i * 0.1, 0.06, { type: 'square', freq: 1200 + (i % 2) * 400, gain: 0.08 });
        break;
      case 'upgrade':
        this.tone(o, t, 1.2, { type: 'sawtooth', freq: 110, freqEnd: 880, gain: 0.12 });
        this.noise(o, t, 1.2, { type: 'bandpass', freq: 400, freqEnd: 4000, q: 2, gain: 0.3 });
        this.tone(o, t + 1.1, 0.4, { type: 'triangle', freq: 1760, gain: 0.25 });
        break;
      case 'click': this.tone(o, t, 0.03, { type: 'square', freq: 1400, gain: 0.08 }); break;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Loops: ambience and helicopter
  // ------------------------------------------------------------------------------------------
  startAmbience(): void {
    if (!this.ctx || this.ambNodes.length) return;
    const ctx = this.ctx;
    // Wind: brown noise through a slowly modulated lowpass
    const src = ctx.createBufferSource();
    src.buffer = this.brownBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 220;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    const g = ctx.createGain(); g.gain.value = 0.55;
    src.connect(lp); lp.connect(g); g.connect(this.amb);
    // Low industrial drone
    const drone = ctx.createOscillator(); drone.type = 'sawtooth'; drone.frequency.value = 43;
    const drone2 = ctx.createOscillator(); drone2.type = 'sine'; drone2.frequency.value = 64.3;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 140;
    const dg = ctx.createGain(); dg.gain.value = 0.07;
    drone.connect(dl); drone2.connect(dl); dl.connect(dg); dg.connect(this.amb);
    // Electrical hum
    const hum = ctx.createOscillator(); hum.type = 'square'; hum.frequency.value = 60;
    const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 120; hf.Q.value = 8;
    const hg = ctx.createGain(); hg.gain.value = 0.012;
    hum.connect(hf); hf.connect(hg); hg.connect(this.amb);
    src.start(); lfo.start(); drone.start(); drone2.start(); hum.start();
    this.ambNodes = [src, lfo, drone, drone2, hum, g, dg, hg];
  }

  stopAmbience(): void {
    for (const n of this.ambNodes) {
      try { (n as AudioScheduledSourceNode).stop?.(); } catch { /* not a source */ }
      try { n.disconnect(); } catch { /* ignore */ }
    }
    this.ambNodes = [];
  }

  /** Occasional distant sirens / metal groans for atmosphere. */
  updateAmbience(dt: number): void {
    if (!this.ok()) return;
    this.sirenT -= dt;
    if (this.sirenT > 0) return;
    this.sirenT = 18 + Math.random() * 25;
    const t = this.ctx!.currentTime;
    const o = this.out({ x: this.listener.x + (Math.random() - 0.5) * 300, z: this.listener.z + (Math.random() - 0.5) * 300 }, 1.4, 6, 60);
    if (!o) return;
    if (Math.random() < 0.5) {
      const osc = this.ctx!.createOscillator();
      osc.type = 'triangle';
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
      for (let i = 0; i < 5; i++) {
        osc.frequency.setValueAtTime(600, t + i * 1.1);
        osc.frequency.linearRampToValueAtTime(900, t + i * 1.1 + 0.55);
        osc.frequency.linearRampToValueAtTime(600, t + i * 1.1 + 1.1);
      }
      osc.connect(g); g.connect(o);
      osc.start(t); osc.stop(t + 5.6);
    } else {
      this.tone(o, t, 2.5, { type: 'sawtooth', freq: 70, freqEnd: 40, gain: 0.08, attack: 0.3 });
      this.noise(o, t, 2.2, { type: 'bandpass', freq: 300, q: 4, gain: 0.15, attack: 0.4 });
    }
  }

  startHeli(): void {
    if (!this.ctx || this.heli) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const chop = ctx.createGain(); chop.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 15;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.45;
    lfo.connect(lfoG); lfoG.connect(chop.gain);
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 90;
    const hl = ctx.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 300;
    const hg = ctx.createGain(); hg.gain.value = 0.08;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    src.connect(lp); lp.connect(chop); chop.connect(gain);
    hum.connect(hl); hl.connect(hg); hg.connect(gain);
    gain.connect(pan); pan.connect(this.sfx);
    src.start(); lfo.start(); hum.start();
    this.heli = { gain, chop, lfo, src, hum, pan };
  }

  updateHeli(pos: { x: number; y: number; z: number } | null, rotorRate: number): void {
    if (!this.heli || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (!pos) { this.heli.gain.gain.setTargetAtTime(0, t, 0.3); return; }
    const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z, dy = pos.y - this.listener.y;
    const dist = Math.hypot(dx, dz, dy);
    const g = Math.min(1.2, 30 / Math.max(15, dist)) * rotorRate;
    this.heli.gain.gain.setTargetAtTime(g, t, 0.1);
    this.heli.lfo.frequency.setTargetAtTime(9 + rotorRate * 7, t, 0.2);
    const s = Math.sin(this.listener.yaw), c = Math.cos(this.listener.yaw);
    const rx = dx * c - dz * s;
    this.heli.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, rx / Math.max(1, Math.hypot(dx, dz)))), t, 0.1);
  }

  stopHeli(): void {
    if (!this.heli) return;
    const h = this.heli;
    try { h.src.stop(); h.lfo.stop(); h.hum.stop(); h.gain.disconnect(); } catch { /* ignore */ }
    this.heli = null;
  }


  // ------------------------------------------------------------------------------------------
  // Zombies: jingles, stings, power-up announcer, barricades, ambience
  // ------------------------------------------------------------------------------------------
  private jingleT = 0;
  private zAmbT = 6;

  /** Music-box arpeggio for the Cache spin (non-positional so it reads over the horde). */
  boxJingle(pos: { x: number; z: number }): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const o = this.out(pos, 0.5, 4.2, 8);
    if (!o) return;
    const notes = [659, 784, 988, 784, 659, 523, 587, 659, 784, 659, 587, 523, 494, 523, 659, 784];
    notes.forEach((f, i) => {
      this.tone(o, t + i * 0.24, 0.5, { type: 'triangle', freq: f, gain: 0.18 });
      this.tone(o, t + i * 0.24, 0.3, { type: 'sine', freq: f * 2, gain: 0.05 });
    });
  }

  /** Short diegetic perk jingle near a lit machine; each perk has its own motif. */
  perkJingle(pos: { x: number; z: number }, index: number): void {
    if (!this.ok()) return;
    this.jingleT -= 1;
    const t = this.ctx!.currentTime;
    const o = this.out(pos, 0.45, 5, 5);
    if (!o) return;
    const motifs = [[392, 494, 587, 784, 587, 494], [523, 659, 523, 784, 698, 659], [330, 392, 330, 294, 262, 330], [440, 554, 659, 880, 659, 554]];
    const m = motifs[index % motifs.length];
    m.forEach((f, i) => {
      this.tone(o, t + i * 0.28, 0.35, { type: 'square', freq: f, gain: 0.05 });
      this.tone(o, t + i * 0.28, 0.5, { type: 'triangle', freq: f / 2, gain: 0.08 });
    });
  }

  /** Round change: a low brass-like swell and a bell toll (start), or a rising resolve (end). */
  roundSting(start: boolean): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const o = this.out(null, 0.7, 6)!;
    if (start) {
      for (const [f, d] of [[55, 0], [82.4, 0.05], [110, 0.1]] as const) {
        this.tone(o, t + d, 3.2, { type: 'sawtooth', freq: f, freqEnd: f * 0.98, gain: 0.16, attack: 0.5 });
      }
      for (let i = 0; i < 3; i++) {
        this.tone(o, t + 0.4 + i * 1.1, 2.2, { type: 'sine', freq: 196, gain: 0.3 });
        this.tone(o, t + 0.4 + i * 1.1, 1.8, { type: 'sine', freq: 196 * 2.76, gain: 0.08 });
      }
      this.noise(o, t, 3, { type: 'lowpass', freq: 300, gain: 0.2, brown: true, attack: 0.6 });
    } else {
      [220, 262, 330, 440].forEach((f, i) => this.tone(o, t + i * 0.18, 1.6, { type: 'triangle', freq: f, gain: 0.14, attack: 0.05 }));
      this.tone(o, t + 0.7, 2.2, { type: 'sine', freq: 880, gain: 0.08, attack: 0.2 });
    }
  }

  /** Announcer-style stinger: formant "voice" chord + whoosh (no samples, no real words). */
  powerupVoice(kind: 'max_ammo' | 'insta_kill' | 'double_points' | 'nuke' | 'carpenter'): void {
    if (!this.ok(true)) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = this.out(null, 0.8, 2.2)!;
    const syll = { max_ammo: [2, 110], insta_kill: [3, 95], double_points: [3, 120], nuke: [1, 70], carpenter: [3, 105] }[kind];
    const vowels = [[700, 1200], [400, 2000], [600, 1000], [300, 2300]];
    for (let i = 0; i < syll[0]; i++) {
      const st = t + i * 0.28;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(syll[1] * (1 + (i % 2) * 0.12), st);
      osc.frequency.linearRampToValueAtTime(syll[1] * 0.85, st + 0.26);
      const v = vowels[(i + kind.length) % vowels.length];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.9, st + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.26);
      for (const f of v) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 8;
        osc.connect(bp); bp.connect(g);
      }
      g.connect(o);
      osc.start(st); osc.stop(st + 0.3);
    }
    this.noise(o, t, 0.6, { type: 'bandpass', freq: 600, freqEnd: 3000, q: 1.5, gain: 0.3, attack: 0.1 });
    if (kind === 'nuke') { this.tone(o, t + 0.3, 1.5, { freq: 60, freqEnd: 25, gain: 1 }); this.noise(o, t + 0.3, 1.6, { type: 'lowpass', freq: 1200, freqEnd: 80, gain: 0.9, brown: true }); }
  }

  powerupSpawn(pos: { x: number; z: number }): void {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    const o = this.out(pos, 0.5, 1.2, 6);
    if (!o) return;
    [1046, 1318, 1568].forEach((f, i) => this.tone(o, t + i * 0.07, 0.6, { type: 'sine', freq: f, gain: 0.12 }));
  }

  plank(kind: 'tear' | 'repair', pos: { x: number; z: number }): void {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    const o = this.out(pos, kind === 'tear' ? 0.7 : 0.5, 0.6, 6);
    if (!o) return;
    if (kind === 'tear') {
      this.noise(o, t, 0.25, { type: 'bandpass', freq: 700, q: 2, gain: 0.8 });
      this.tone(o, t, 0.2, { type: 'sawtooth', freq: 180, freqEnd: 90, gain: 0.3 });
      this.noise(o, t + 0.15, 0.3, { type: 'lowpass', freq: 500, gain: 0.4 });
    } else {
      this.mech(t, 1400, 0.35);
      this.mech(t + 0.12, 1500, 0.35);
      this.noise(o, t, 0.15, { type: 'bandpass', freq: 900, q: 1.5, gain: 0.4 });
    }
  }

  doorOpen(debris: boolean): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const o = this.out(null, 0.6, 1.8)!;
    if (debris) { this.noise(o, t, 1.2, { type: 'lowpass', freq: 900, freqEnd: 120, gain: 0.8, brown: true }); for (let i = 0; i < 5; i++) this.mech(t + i * 0.12, 300 + i * 80, 0.3); }
    else { this.tone(o, t, 1.2, { type: 'sawtooth', freq: 80, freqEnd: 140, gain: 0.15 }); this.noise(o, t, 1.2, { type: 'bandpass', freq: 400, freqEnd: 1600, q: 3, gain: 0.35 }); this.mech(t + 1.1, 600, 0.5); }
  }

  powerOn(): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const o = this.out(null, 0.8, 4)!;
    this.mech(t, 500, 0.8);
    this.tone(o, t + 0.1, 3.5, { type: 'sawtooth', freq: 30, freqEnd: 120, gain: 0.25, attack: 0.8 });
    this.noise(o, t + 0.1, 3, { type: 'bandpass', freq: 200, freqEnd: 2400, q: 4, gain: 0.3, attack: 1 });
    for (let i = 0; i < 6; i++) this.mech(t + 1.5 + i * 0.15, 900 + i * 120, 0.25);
  }

  chime(): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const o = this.out(null, 0.5, 3)!;
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(o, t + i * 0.15, 1.8, { type: 'sine', freq: f, gain: 0.12 }));
  }

  /** The Cache surfaces for the first time: a rising shimmer over a low boom (non-positional) plus the music box where it landed. */
  cacheReveal(pos: { x: number; z: number }): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const o = this.out(null, 0.7, 4)!;
    this.tone(o, t, 2.4, { type: 'sine', freq: 55, freqEnd: 40, gain: 0.5, attack: 0.05 });
    this.noise(o, t, 2.8, { type: 'bandpass', freq: 400, freqEnd: 5000, q: 2, gain: 0.25, attack: 0.9 });
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(o, t + 0.5 + i * 0.12, 1.6, { type: 'triangle', freq: f, gain: 0.12, attack: 0.02 }));
    this.boxJingle(pos);
  }

  /** A trap switched on: a charge-up whine and crackle (electric) or a whoomph of flame (fire). */
  trapStart(pos: { x: number; z: number }, kind: 'electric' | 'fire'): void {
    if (!this.ok(true)) return;
    const t = this.ctx!.currentTime;
    const o = this.out(pos, 0.8, 2.5, 10);
    if (!o) return;
    if (kind === 'electric') {
      this.tone(o, t, 1.2, { type: 'sawtooth', freq: 60, freqEnd: 240, gain: 0.25, attack: 0.3 });
      for (let i = 0; i < 8; i++) this.noise(o, t + 0.9 + i * 0.13, 0.12, { type: 'highpass', freq: 3000, gain: 0.5 });
    } else {
      this.noise(o, t, 2, { type: 'lowpass', freq: 200, freqEnd: 1800, gain: 0.9, brown: true, attack: 0.15 });
      this.tone(o, t, 1, { freq: 70, freqEnd: 40, gain: 0.6 });
    }
  }

  /**
   * A hidden song (side-quest reward): a ~24 s procedural piece. Each map passes its own name; the name seeds the
   * key and the melody so the maps sound different without any sample files.
   */
  easterTrack(name: string): void {
    if (!this.ok(true)) return;
    const t0 = this.ctx!.currentTime + 0.2;
    const o = this.out(null, 0.55, 26)!;
    for (const n of easterSong(name)) {
      const t = t0 + n.t;
      if (n.voice === 'hat') this.noise(o, t, n.dur, { type: 'highpass', freq: n.freq, gain: 0.12 });
      else if (n.voice === 'kick') this.tone(o, t, n.dur, { freq: n.freq, freqEnd: 40, gain: 0.35 });
      else if (n.voice === 'bass') this.tone(o, t, n.dur, { type: 'sawtooth', freq: n.freq, gain: 0.06, attack: 0.05 });
      else if (n.voice === 'pad') this.tone(o, t, n.dur, { type: 'triangle', freq: n.freq, gain: 0.04, attack: 0.3 });
      else this.tone(o, t, n.dur, { type: 'square', freq: n.freq, gain: 0.035 });
    }
  }

  /** Zombies ambience: distant horde groans and a slow heartbeat-like pulse. */
  updateZombieAmbience(dt: number, horde: number): void {
    if (!this.ok()) return;
    this.zAmbT -= dt;
    if (this.zAmbT > 0) return;
    this.zAmbT = 3 + Math.random() * (horde > 5 ? 3 : 8);
    const a = Math.random() * Math.PI * 2;
    this.zombieVoice({ x: this.listener.x + Math.cos(a) * 22, z: this.listener.z + Math.sin(a) * 22 }, Math.random() < 0.2 ? 'scream' : 'groan', 0.7 + Math.random() * 0.4);
  }

  // ------------------------------------------------------------------------------------------
  // Per-map ambience beds (Zombies). 'lahore': tanpura-like drone, dusk birds, distant naqqara drums
  // that become a slow march once the power (the drums themselves) is on.
  // ------------------------------------------------------------------------------------------
  private mapStyle: string | null = null;
  private mapNodes: AudioNode[] = [];
  private mapDrone: { g: GainNode; lp: BiquadFilterNode } | null = null;
  private mapT = { bird: 4, drum: 12, beat: 0, beatN: 0 };
  private mapPower = false;

  private mapWant: string | null | undefined = undefined;

  setMapAmbience(style: string | null): void {
    if (!this.ctx) { this.mapWant = style; return; }
    if (style === this.mapStyle) return;
    for (const n of this.mapNodes) {
      try { (n as AudioScheduledSourceNode).stop?.(); } catch { /* not a source */ }
      try { n.disconnect(); } catch { /* ignore */ }
    }
    this.mapNodes = []; this.mapDrone = null; this.mapStyle = style; this.mapPower = false;
    if (!this.ctx || style !== 'lahore') return;
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0.0;
    g.gain.setTargetAtTime(0.05, ctx.currentTime, 3);
    lp.connect(g); g.connect(this.amb);
    // Sa (D2), Pa (A2), upper Sa and a detuned Sa: a slow-beating tanpura-ish bed.
    for (const [f, type, gain] of [[73.4, 'sawtooth', 0.5], [110, 'sawtooth', 0.35], [146.8, 'triangle', 0.4], [73.9, 'sawtooth', 0.3]] as const) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = gain;
      o.connect(og); og.connect(lp); o.start();
      this.mapNodes.push(o, og);
    }
    // "Jawari" shimmer: a slow LFO sweeping the drone filter.
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lg = ctx.createGain(); lg.gain.value = 260;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    this.mapNodes.push(lp, g, lfo, lg);
    this.mapDrone = { g, lp };
  }

  /** Big naqqara hit: a pitched-down sine thump with a skin slap. */
  naqqara(t: number, gain = 1, far = false): void {
    if (!this.ctx) return;
    const o = this.out(null, (far ? 0.35 : 0.8) * gain, 2.2)!;
    this.tone(o, t, 1.4, { type: 'sine', freq: far ? 62 : 78, freqEnd: 38, gain: 0.9 });
    this.tone(o, t, 0.5, { type: 'triangle', freq: 150, freqEnd: 70, gain: 0.25 });
    this.noise(o, t, far ? 0.9 : 0.35, { type: 'lowpass', freq: far ? 300 : 900, freqEnd: 90, gain: far ? 0.35 : 0.6, brown: true });
  }

  updateMapAmbience(dt: number, power: boolean): void {
    if (this.mapWant !== undefined && this.ctx) { const w = this.mapWant; this.mapWant = undefined; this.setMapAmbience(w); }
    if (this.mapStyle !== 'lahore' || !this.ok()) return;
    const t0 = this.ctx!.currentTime;
    if (power !== this.mapPower) {
      this.mapPower = power;
      if (power) { this.naqqara(t0, 1.3); this.naqqara(t0 + 0.55, 1.1); this.naqqara(t0 + 1.4, 1.4); this.mapT.beat = 3; }
      if (this.mapDrone) this.mapDrone.lp.frequency.setTargetAtTime(power ? 900 : 520, t0, 2);
    }
    const T = this.mapT;
    T.bird -= dt; T.drum -= dt;
    if (T.bird <= 0 && !power) {
      T.bird = 5 + Math.random() * 9;
      const a = Math.random() * Math.PI * 2;
      const o = this.out({ x: this.listener.x + Math.cos(a) * 25, z: this.listener.z + Math.sin(a) * 25 }, 0.25, 1.2, 10);
      if (o) for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
        const f = 2400 + Math.random() * 1400;
        this.tone(o, t0 + i * 0.16, 0.12, { type: 'sine', freq: f, freqEnd: f * 1.25, gain: 0.12 });
      }
    }
    if (!power && T.drum <= 0) { T.drum = 20 + Math.random() * 20; this.naqqara(t0, 1, true); this.naqqara(t0 + 0.7, 0.8, true); }
    if (power) {
      // A slow processional march: DUM . dum . DUM dum . . (one bar every 4.8 s), quiet under the action.
      T.beat -= dt;
      if (T.beat <= 0) {
        T.beat = 4.8;
        for (const [d, gn] of [[0, 0.5], [1.2, 0.3], [2.4, 0.45], [3.0, 0.3]] as const) this.naqqara(t0 + d, gn, true);
      }
    }
  }

  stopAll(): void {
    this.stopHeli();
    this.setMapAmbience(null);
  }
}
