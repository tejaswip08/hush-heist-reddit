import {
  type Action,
  type GameState,
  type Level,
  type Pos,
  initialState,
  isLit,
  isWall,
  objectiveDone,
  sightTiles,
  step,
  tileAt,
} from '../shared/sim';

// A light, looping preview of tonight's level for the feed card, drawn on a
// 2D canvas (no 3D engine). It must never give the puzzle away: Wren only
// waits at the start while the guards run their real patrols and turns.
// (No solver here; replaying the best route would spoil tonight's job.)

const STEP_MS = 620;
/** Guard turns per loop before the board resets. */
const LOOP_STEPS = 24;
const PAUSE_MS = 1400;

type Colors = { floor: string; floorAlt: string; wall: string; wallTop: string; ink: string };

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const SHIRTS = ['#e8912e', '#2f9e9a', '#d8b23a', '#4a7fc1'];

export class DemoBoard {
  private ctx: CanvasRenderingContext2D;
  private plan: Action[];
  private state: GameState;
  private prev: GameState;
  private index = 0;
  private stepAt = 0;
  private pausedUntil = 0;
  private raf = 0;
  private trail: { p: Pos; t: number }[] = [];
  private visible = true;
  private tile = 40;
  private dark: HTMLCanvasElement;
  private darkCtx: CanvasRenderingContext2D;
  private nextFlash = 0;
  private flashStart = -1e9;
  private near = false;

  /** A lightning flash just started. */
  onFlash: () => void = () => {};
  /** A guard came within two tiles of Wren (true) or moved away (false). */
  onDanger: (near: boolean) => void = () => {};

  constructor(
    private canvas: HTMLCanvasElement,
    private level: Level,
    private colors: Colors
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    // Wren just waits; the guards do all the moving.
    this.plan = Array.from({ length: LOOP_STEPS }, (): Action => ({ type: 'wait' }));
    this.state = initialState(level);
    this.prev = this.state;
    this.dark = document.createElement('canvas');
    const dctx = this.dark.getContext('2d');
    if (!dctx) throw new Error('Canvas 2D is not available');
    this.darkCtx = dctx;
    this.size();
    this.nextFlash = performance.now() + 3500 + Math.random() * 3000;
  }

  private size() {
    const cols = this.level.map[0]?.length ?? 1;
    const rows = this.level.map.length;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cols * this.tile * dpr);
    this.canvas.height = Math.round(rows * this.tile * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dark.width = this.canvas.width;
    this.dark.height = this.canvas.height;
    this.darkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Start looping. Draws one still frame instead if the player prefers less motion. */
  start() {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.draw(performance.now());
      return;
    }
    // Only animate while the card is on screen.
    const io = new IntersectionObserver((entries) => {
      this.visible = entries.some((e) => e.isIntersecting);
      if (this.visible && !this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
    });
    io.observe(this.canvas);
    this.stepAt = performance.now() + 800;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** Stop animating (e.g. when switching to another night). */
  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.visible = false;
  }

  private reset(now: number) {
    this.state = initialState(this.level);
    this.prev = this.state;
    this.index = 0;
    this.trail = [];
    this.stepAt = now + 600;
  }

  private frame(now: number) {
    this.raf = 0;
    if (!this.visible) return;
    if (now >= this.stepAt && now >= this.pausedUntil) {
      if (this.state.status !== 'playing' || this.index >= this.plan.length) {
        this.reset(now);
      } else {
        const action = this.plan[this.index++];
        const next = action ? step(this.level, this.state, action) : null;
        if (next) {
          const moved = next.player.x !== this.state.player.x || next.player.y !== this.state.player.y;
          if (moved) this.trail.push({ p: { ...this.state.player }, t: now });
          this.prev = this.state;
          this.state = next;
        }
        this.stepAt = now + STEP_MS;
        if (this.state.status !== 'playing') this.pausedUntil = now + PAUSE_MS;
      }
    }
    if (now > this.nextFlash) {
      this.flashStart = now;
      this.nextFlash = now + 7000 + Math.random() * 7000;
      this.onFlash();
    }
    const near = this.state.guards.some(
      (g) => !g.out && Math.abs(g.x - this.state.player.x) + Math.abs(g.y - this.state.player.y) <= 2
    );
    if (near !== this.near) {
      this.near = near;
      this.onDanger(near);
    }
    this.draw(now);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** 0…1 brightness of the current lightning flash (a double strike). */
  private flash(now: number) {
    const t = now - this.flashStart;
    if (t < 70) return 1;
    if (t < 150) return 0.1;
    if (t < 230) return 0.7;
    if (t < 600) return 0.7 * (1 - (t - 230) / 370);
    return 0;
  }

  private center(p: Pos) {
    return { x: p.x * this.tile + this.tile / 2, y: p.y * this.tile + this.tile / 2 };
  }

  private draw(now: number) {
    const { ctx, level, state, prev, tile: t, colors } = this;
    const cols = level.map[0]?.length ?? 1;
    const rows = level.map.length;
    const k = ease(1 - (this.stepAt - now) / STEP_MS);

    ctx.clearRect(0, 0, cols * t, rows * t);

    // Floor and lamp-lit tiles
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const p = { x, y };
        if (isWall(level, p)) continue;
        ctx.fillStyle = (x + y) % 2 ? colors.floor : colors.floorAlt;
        ctx.fillRect(x * t, y * t, t, t);
        if (isLit(level, state.switchesOff, p)) {
          const c = this.center(p);
          const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, t * 0.9);
          g.addColorStop(0, 'rgba(255,190,110,0.55)');
          g.addColorStop(1, 'rgba(255,190,110,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x * t - t / 2, y * t - t / 2, t * 2, t * 2);
        }
      }
    }

    // Path network
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1.5;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (isWall(level, { x, y })) continue;
        const c = this.center({ x, y });
        ctx.beginPath();
        if (!isWall(level, { x: x + 1, y })) {
          ctx.moveTo(c.x + 4, c.y);
          ctx.lineTo(c.x + t - 4, c.y);
        }
        if (!isWall(level, { x, y: y + 1 })) {
          ctx.moveTo(c.x, c.y + 4);
          ctx.lineTo(c.x, c.y + t - 4);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Walls, raised with a drop shadow
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!isWall(level, { x, y })) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x * t + 4, y * t + 5, t, t);
        ctx.fillStyle = colors.wall;
        ctx.fillRect(x * t, y * t, t, t);
        ctx.fillStyle = colors.wallTop;
        ctx.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
      }
    }

    // Painting and exit
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = tileAt(level, { x, y });
        const c = this.center({ x, y });
        if (ch === 'P' && !state.hasPainting) {
          ctx.fillStyle = '#b98d36';
          ctx.fillRect(c.x - 9, c.y - 7, 18, 14);
          ctx.fillStyle = '#6b2b2b';
          ctx.fillRect(c.x - 6, c.y - 4, 12, 8);
        } else if (ch === 'E') {
          ctx.fillStyle = objectiveDone(level, state) ? 'rgba(60,220,130,0.85)' : 'rgba(60,160,110,0.45)';
          ctx.fillRect(c.x - 11, c.y - 11, 22, 22);
        } else if (ch === '$' && !state.cash.includes(`${x},${y}`)) {
          ctx.fillStyle = '#5f8f5a';
          ctx.fillRect(c.x - 8, c.y - 5, 16, 10);
          ctx.fillStyle = '#d6ac4c';
          ctx.fillRect(c.x - 2, c.y - 5, 4, 10);
        } else if (ch === 'B') {
          ctx.fillStyle = '#3c4148';
          ctx.fillRect(c.x - 10, c.y - 10, 20, 20);
          ctx.fillStyle = '#d6ac4c';
          ctx.beginPath();
          ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (ch === 'F' && !state.forgery) {
          ctx.fillStyle = '#a77b4f';
          ctx.fillRect(c.x - 9, c.y - 7, 18, 14);
        } else if (ch === 'D') {
          ctx.fillStyle = '#6b4a2e';
          ctx.fillRect(c.x - 12, c.y - 7, 24, 14);
        }
      }
    }

    // Danger tiles and flashlight beams
    state.guards.forEach((g, i) => {
      if (g.out) return;
      const dog = level.guards.find((d) => d.id === g.id)?.dog === true;
      const from = prev.guards[i] ?? g;
      const gx = lerp(from.x, g.x, k) * t + t / 2;
      const gy = lerp(from.y, g.y, k) * t + t / 2;
      const seen = sightTiles(level, g, state.keys);
      if (!dog && seen.length) {
        const end = this.center(seen[seen.length - 1] ?? g);
        const dx = end.x - gx;
        const dy = end.y - gy;
        const len = Math.hypot(dx, dy) + t / 2;
        const ang = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(ang);
        const beam = ctx.createLinearGradient(0, 0, len, 0);
        beam.addColorStop(0, 'rgba(255,245,215,0.6)');
        beam.addColorStop(1, 'rgba(255,245,215,0)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(6, -3);
        ctx.lineTo(len, -t * 0.5);
        ctx.lineTo(len, t * 0.5);
        ctx.lineTo(6, 3);
        ctx.fill();
        ctx.restore();
      }
    });

    // Wren's footprints
    for (const f of this.trail) {
      const age = (now - f.t) / 2500;
      if (age > 1) continue;
      const c = this.center(f.p);
      ctx.fillStyle = `rgba(30,20,15,${0.35 * (1 - age)})`;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Darkness: only lamp light, Wren's lantern and flashlight beams cut through.
    const flash = this.flash(now);
    this.shade(now, k, flash);

    // Where you'd be caught, pulsing above the dark
    state.guards.forEach((g) => {
      if (g.out) return;
      const dog = level.guards.find((d) => d.id === g.id)?.dog === true;
      sightTiles(level, g, state.keys).forEach((p, j) => {
        if (j === 0 || dog || isLit(level, state.switchesOff, p)) {
          ctx.strokeStyle = `rgba(235,55,45,${0.6 + Math.sin(now / 150) * 0.3})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(p.x * t + 4, p.y * t + 4, t - 8, t - 8);
        }
      });
    });

    // Pieces
    state.guards.forEach((g, i) => {
      if (g.out) return;
      const from = prev.guards[i] ?? g;
      const x = lerp(from.x, g.x, k) * t + t / 2;
      const y = lerp(from.y, g.y, k) * t + t / 2;
      const def = level.guards.find((d) => d.id === g.id);
      const dog = def?.dog === true;
      if (def?.boss) this.piece(x, y, '#d6ac4c', '#f2ede3');
      else this.piece(x, y, '#c0392b', dog ? '#6b4a2e' : (SHIRTS[i % SHIRTS.length] ?? '#e8912e'));
      if (dog) {
        // Red eyes glowing in the dark
        ctx.fillStyle = `rgba(255,60,40,${0.75 + Math.sin(now / 90) * 0.25})`;
        ctx.shadowColor = '#ff3020';
        ctx.shadowBlur = 8;
        for (const dx of [-3, 3]) {
          ctx.beginPath();
          ctx.arc(x + dx, y - 3, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
    });
    const px = lerp(prev.player.x, state.player.x, k) * t + t / 2;
    const py = lerp(prev.player.y, state.player.y, k) * t + t / 2 - Math.sin(Math.PI * k) * 4;
    const glow = ctx.createRadialGradient(px, py, 0, px, py, t);
    glow.addColorStop(0, 'rgba(255,200,110,0.45)');
    glow.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(px - t, py - t, t * 2, t * 2);
    this.piece(px, py, '#d6ac4c', '#2b2d33', true);

    if (flash > 0) {
      ctx.fillStyle = `rgba(210,225,255,${flash * 0.45})`;
      ctx.fillRect(0, 0, cols * t, rows * t);
    }
  }

  /** Paint the darkness layer and lay it over the board. */
  private shade(now: number, k: number, flash: number) {
    const { level, state, prev, tile: t } = this;
    const d = this.darkCtx;
    const cols = level.map[0]?.length ?? 1;
    const rows = level.map.length;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, cols * t, rows * t);
    d.fillStyle = `rgba(3,5,12,${0.78 * (1 - flash)})`;
    d.fillRect(0, 0, cols * t, rows * t);
    d.globalCompositeOperation = 'destination-out';

    const hole = (x: number, y: number, r: number, a: number) => {
      const g = d.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(x - r, y - r, r * 2, r * 2);
    };

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const p = { x, y };
        if (isWall(level, p) || !isLit(level, state.switchesOff, p)) continue;
        const c = this.center(p);
        hole(c.x, c.y, t * 1.05, 0.9);
      }
    }
    // Wren's lantern, flickering
    const px = lerp(prev.player.x, state.player.x, k) * t + t / 2;
    const py = lerp(prev.player.y, state.player.y, k) * t + t / 2;
    hole(px, py, t * (1.35 + Math.sin(now / 70) * 0.06 + Math.sin(now / 23) * 0.03), 0.95);

    // Flashlight beams and a faint ring round each guard
    state.guards.forEach((g, i) => {
      if (g.out) return;
      const from = prev.guards[i] ?? g;
      const gx = lerp(from.x, g.x, k) * t + t / 2;
      const gy = lerp(from.y, g.y, k) * t + t / 2;
      hole(gx, gy, t * 0.6, 0.6);
      const dog = level.guards.find((dd) => dd.id === g.id)?.dog === true;
      const seen = sightTiles(level, g, state.keys);
      if (dog || !seen.length) return;
      const end = this.center(seen[seen.length - 1] ?? g);
      const len = Math.hypot(end.x - gx, end.y - gy) + t / 2;
      d.save();
      d.translate(gx, gy);
      d.rotate(Math.atan2(end.y - gy, end.x - gx));
      const beam = d.createLinearGradient(0, 0, len, 0);
      beam.addColorStop(0, 'rgba(0,0,0,0.95)');
      beam.addColorStop(1, 'rgba(0,0,0,0.15)');
      d.fillStyle = beam;
      d.beginPath();
      d.moveTo(4, -4);
      d.lineTo(len, -t * 0.55);
      d.lineTo(len, t * 0.55);
      d.lineTo(4, 4);
      d.fill();
      d.restore();
    });

    d.globalCompositeOperation = 'source-over';
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.dark, 0, 0);
    this.ctx.restore();
  }

  /** A board-game piece: shadow, black base with a coloured rim, coloured body. */
  private piece(x: number, y: number, rim: string, body: string, thief = false) {
    const { ctx, tile: t } = this;
    const r = t * 0.3;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 4, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y - 2, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    if (thief) {
      // Fedora brim and a red scarf
      ctx.fillStyle = '#0f0f11';
      ctx.beginPath();
      ctx.ellipse(x, y - 5, r * 0.65, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a3202d';
      ctx.fillRect(x - r * 0.5, y + 1, r, 3);
    }
  }
}
