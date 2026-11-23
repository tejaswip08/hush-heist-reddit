// Hush sound: every effect is synthesised with the Web Audio API, so the
// game ships no audio files. Audio starts on the first tap (browsers block
// sound until the player interacts) and remembers the mute setting.

const MUTE_KEY = 'hush.muted';

type Voice = { ctx: AudioContext; out: GainNode };

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private ambience: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private cricketTimer = 0;
  private rainGain: GainNode | null = null;
  private rainLevel = 0;
  muted: boolean;

  constructor() {
    let stored = false;
    try {
      stored = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // Storage blocked: default to sound on.
    }
    this.muted = stored;
  }

  /** Call from a tap or click. Safe to call more than once. */
  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    // A gentle compressor keeps overlapping effects from clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);
    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0.35;
    this.ambience.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.startAmbience();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Not saved; it still applies for this session.
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  /* ------------------------------------------------------------ helpers */

  private voice(): Voice | null {
    if (!this.ctx || !this.sfx || this.muted) return null;
    return { ctx: this.ctx, out: this.sfx };
  }

  private tone(
    v: Voice,
    type: OscillatorType,
    freq: number,
    start: number,
    dur: number,
    gain: number,
    endFreq?: number
  ) {
    const osc = v.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    const g = v.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(v.out);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private burst(
    v: Voice,
    start: number,
    dur: number,
    gain: number,
    filter: BiquadFilterType,
    freq: number,
    q = 1
  ) {
    if (!this.noise) return;
    const src = v.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = v.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = v.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(v.out);
    src.start(start, Math.random());
    src.stop(start + dur + 0.05);
  }

  /* ------------------------------------------------------------ effects */

  /** Soft-soled footstep on marble, slightly varied each time. */
  step() {
    const v = this.voice();
    if (!v) return;
    const t = v.ctx.currentTime;
    const pitch = 0.9 + Math.random() * 0.2;
    this.burst(v, t, 0.07, 0.35, 'bandpass', 1400 * pitch, 1.2);
    this.tone(v, 'sine', 140 * pitch, t, 0.08, 0.25, 70);
  }

  /** Waiting in place: a held breath. */
  wait() {
    const v = this.voice();
    if (!v) return;
    this.burst(v, v.ctx.currentTime, 0.35, 0.08, 'lowpass', 600);
  }

  takedown() {
    const v = this.voice();
    if (!v) return;
    const t = v.ctx.currentTime;
    this.tone(v, 'sine', 160, t, 0.35, 0.8, 40);
    this.burst(v, t, 0.18, 0.5, 'lowpass', 900);
    this.burst(v, t + 0.18, 0.25, 0.25, 'lowpass', 400);
  }

  key() {
    const v = this.voice();
    if (!v) return;
    const t = v.ctx.currentTime;
    for (const [f, d] of [
      [1318.5, 0],
      [1975.5, 0.08],
      [2637, 0.16],
    ] as const) {
      this.tone(v, 'sine', f, t + d, 0.9, 0.18);
      this.tone(v, 'sine', f * 2.01, t + d, 0.4, 0.04);
    }
  }

  /** Old hinges: a wobbling saw through a resonant filter. */
  door() {
    const v = this.voice();
    if (!v) return;
    const t = v.ctx.currentTime + 0.25;
    const osc = v.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.linearRampToValueAtTime(260, t + 0.35);
    osc.frequency.linearRampToValueAtTime(170, t + 0.8);
    const lfo = v.ctx.createOscillator();
    lfo.frequency.value = 23;
    const lfoGain = v.ctx.createGain();
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain).connect(osc.frequency);
    const f = v.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 6;
    const g = v.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    osc.connect(f).connect(g).connect(v.out);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.9);
    lfo.stop(t + 0.9);
    this.burst(v, t + 0.8, 0.2, 0.3, 'lowpass', 300);
  }

  /** Changing into the uniform. */
  rustle() {
    const v = this.voice();
    if (!v) return;
    const t = v.ctx.currentTime;
    for (let i = 0; i < 4; i++) this.burst(v, t + i * 0.09, 0.12, 0.2, 'highpass', 2500 + i * 400);
  }

  coin() {
    const v = this.voice();
    if (!v) return;
    const t = v.ctx.currentTime;
    for (const [d, g] of [
      [0.15, 0.25],
      [0.32, 0.15],
      [0.43, 0.08],
    ] as const) {
      this.tone(v, 'sine', 2400, t + d, 0.25, g);
      this.tone(v, 'sine', 3320, t + d, 0.15, g * 0.6);
    }
  }

  lightSwitch() {
    const v = this.voice();
    if (!v) return;
    const t = v.ctx.currentTime;
    this.burst(v, t, 0.03, 0.6, 'highpass', 3000);
    this.tone(v, 'square', 90, t + 0.02, 0.12, 0.1, 50);
  }

  vent() {
    const v = this.voice();
    if (!v) return;
    const t = v.ctx.currentTime;
    this.burst(v, t, 0.3, 0.3, 'bandpass', 1500, 3);
    this.tone(v, 'triangle', 310, t, 0.4, 0.15, 220);
    this.burst(v, t + 0.18, 0.25, 0.2, 'bandpass', 900, 2);
  }

  painting() {
    const v = this.voice();
    if (!v) return;
    const t = v.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(v, 'triangle', f, t + i * 0.07, 0.6, 0.16);
    });
  }

  /** A guard spots you: a short brass sting and a heartbeat thump. */
  caught() {
    const v = this.voice();
    if (!v) return;
    const t = v.ctx.currentTime;
    this.tone(v, 'sawtooth', 466, t, 0.5, 0.18, 233);
    this.tone(v, 'sawtooth', 440, t, 0.5, 0.18, 220);
    this.tone(v, 'sine', 70, t + 0.05, 0.3, 0.7, 40);
    this.tone(v, 'sine', 70, t + 0.32, 0.3, 0.5, 40);
  }

  escape() {
    const v = this.voice();
    if (!v) return;
    const t = v.ctx.currentTime;
    const notes = [392, 523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(v, 'triangle', f, t + i * 0.09, 0.9, 0.16));
    this.tone(v, 'sine', 130.8, t, 1.4, 0.25);
  }

  /** Guards hear a noise: a little questioning blip. */
  alert() {
    const v = this.voice();
    if (!v) return;
    const t = v.ctx.currentTime;
    this.tone(v, 'sine', 660, t + 0.2, 0.12, 0.12, 880);
  }

  /** Rolling thunder, arriving a moment after the flash like a distant strike. */
  thunder() {
    const v = this.voice();
    if (!v || !this.noise) return;
    const t = v.ctx.currentTime + 0.5 + Math.random() * 1.2;
    const src = v.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = v.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 2.5);
    const g = v.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    src.connect(f).connect(g).connect(v.out);
    src.start(t);
    src.stop(t + 3.3);
    this.tone(v, 'sine', 48, t, 2.4, 0.5, 30);
  }

  /** Two thumps: a guard is close. */
  heartbeat() {
    const v = this.voice();
    if (!v) return;
    const t = v.ctx.currentTime + 0.05;
    this.tone(v, 'sine', 62, t, 0.18, 0.75, 40);
    this.tone(v, 'sine', 58, t + 0.22, 0.2, 0.55, 38);
  }

  /** Follow the shower on screen: 0 is silent, 1 a soft steady patter. */
  setRain(amount: number) {
    this.rainLevel = Math.max(0, Math.min(1, amount)) * 0.09;
    if (this.rainGain && this.ctx) this.rainGain.gain.setTargetAtTime(this.rainLevel, this.ctx.currentTime, 0.5);
  }

  /* ----------------------------------------------------------- ambience */

  /** Museum at night: low room tone, a slow drone, and distant crickets. */
  private startAmbience() {
    const ctx = this.ctx;
    const out = this.ambience;
    if (!ctx || !out || !this.noise) return;

    const room = ctx.createBufferSource();
    room.buffer = this.noise;
    room.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const rg = ctx.createGain();
    rg.gain.value = 0.18;
    room.connect(lp).connect(rg).connect(out);
    room.start();

    // Rain, muffled like it's on the windows; silent until a shower comes.
    const rain = ctx.createBufferSource();
    rain.buffer = this.noise;
    rain.loop = true;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1100;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 250;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = this.rainLevel;
    rain.connect(lowpass).connect(highpass).connect(this.rainGain).connect(out);
    rain.start(0, 0.7);

    for (const [f, detune] of [
      [41.2, 0],
      [61.7, 7],
      [87.3, -5],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.035;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + Math.random() * 0.05;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.025;
      lfo.connect(lfoGain).connect(g.gain);
      osc.connect(g).connect(out);
      osc.start();
      lfo.start();
    }

    const chirp = () => {
      if (!this.ctx || !this.ambience) return;
      if (!this.muted && this.ctx.state === 'running') {
        const t = this.ctx.currentTime;
        const pulses = 2 + Math.floor(Math.random() * 3);
        const f = 4200 + Math.random() * 600;
        for (let i = 0; i < pulses; i++) {
          const osc = this.ctx.createOscillator();
          osc.frequency.value = f;
          const g = this.ctx.createGain();
          const st = t + i * 0.06;
          g.gain.setValueAtTime(0.0001, st);
          g.gain.exponentialRampToValueAtTime(0.03, st + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, st + 0.045);
          osc.connect(g).connect(this.ambience);
          osc.start(st);
          osc.stop(st + 0.06);
        }
      }
      this.cricketTimer = window.setTimeout(chirp, 700 + Math.random() * 2200);
    };
    window.clearTimeout(this.cricketTimer);
    chirp();
  }
}
