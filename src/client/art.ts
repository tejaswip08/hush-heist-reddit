// Canvas 2D helpers and the painted wood floor used by the 3D board.

type Ctx = CanvasRenderingContext2D;

/** Small deterministic RNG so the floor looks the same every redraw. */
export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const makeCanvas = (w: number, h: number): [HTMLCanvasElement, Ctx] => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  return [canvas, ctx];
};

const shade = (hex: string, amt: number): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amt));
  const b = Math.min(255, Math.max(0, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
};

/* ------------------------------------------------------------------ floor */

/** Polished walnut planks across the whole board, continuous between tiles. */
export const paintFloor = (ctx: Ctx, w: number, h: number, s: number) => {
  const r = rng(1337);
  const plankH = s / 4;
  const bases = ['#4a3222', '#563a27', '#3f2a1c', '#5c4029', '#4e3524'];
  for (let y = 0, row = 0; y < h; y += plankH, row++) {
    let x = -r() * s * 1.5;
    while (x < w) {
      const len = s * (1.1 + r() * 1.6);
      const base = bases[Math.floor(r() * bases.length)] ?? '#4a3222';
      const g = ctx.createLinearGradient(0, y, 0, y + plankH);
      g.addColorStop(0, shade(base, 14));
      g.addColorStop(0.5, base);
      g.addColorStop(1, shade(base, -16));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, len, plankH);

      // Grain
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, len, plankH);
      ctx.clip();
      for (let i = 0; i < 5; i++) {
        const gy = y + r() * plankH;
        const amp = 1 + r() * 2.5;
        const freq = 0.02 + r() * 0.04;
        const phase = r() * 10;
        ctx.strokeStyle = `rgba(20,10,4,${0.12 + r() * 0.18})`;
        ctx.lineWidth = 0.6 + r() * 1.2;
        ctx.beginPath();
        for (let gx = x; gx <= x + len; gx += 6) {
          const yy = gy + Math.sin(gx * freq + phase) * amp;
          if (gx === x) ctx.moveTo(gx, yy);
          else ctx.lineTo(gx, yy);
        }
        ctx.stroke();
      }
      // Occasional knot
      if (r() < 0.12) {
        const kx = x + r() * len;
        const ky = y + plankH / 2;
        const kg = ctx.createRadialGradient(kx, ky, 0, kx, ky, plankH * 0.35);
        kg.addColorStop(0, 'rgba(25,12,5,0.55)');
        kg.addColorStop(1, 'rgba(25,12,5,0)');
        ctx.fillStyle = kg;
        ctx.beginPath();
        ctx.ellipse(kx, ky, plankH * 0.5, plankH * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Seams
      ctx.fillStyle = 'rgba(12,6,2,0.85)';
      ctx.fillRect(x, y, 1.5, plankH);
      ctx.fillStyle = 'rgba(255,220,180,0.05)';
      ctx.fillRect(x + 1.5, y, 1, plankH);
      x += len;
    }
    ctx.fillStyle = 'rgba(12,6,2,0.8)';
    ctx.fillRect(0, y, w, 1.2);
  }

  // Varnish sheen
  const sheen = ctx.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, 'rgba(255,235,200,0.06)');
  sheen.addColorStop(0.5, 'rgba(255,235,200,0)');
  sheen.addColorStop(1, 'rgba(255,235,200,0.04)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
};
