import { makeCanvas, rng } from './art';

// Every night's target is a different "stolen masterpiece": a small oil
// landscape painted from a seed, with a title. The same picture hangs on the
// easel in the 3D scene and appears on the briefing and result cards.

const TITLES = [
  'Harbour at Dusk',
  'The Lantern Bearer',
  'Orchard in the Rain',
  'Night Ferry to Lisbon',
  'Still Life with Keys',
  'The Gilded Shore',
  'Moon over the Vineyard',
  'Lighthouse, Winter',
  'The Quiet Hills',
  'Evening at the Mill',
  'Red Sails',
  'Fog on the Canal',
];

const PALETTES: [string, string, string, string, string][] = [
  ['#1d2f55', '#c9744a', '#f0b46c', '#2e3d2a', '#fff0c8'],
  ['#2b4a5e', '#8fb3c7', '#e8dcc0', '#556b3a', '#ffffff'],
  ['#4a1f2b', '#b84a3c', '#e6b35c', '#2b2420', '#ffe2a8'],
  ['#26304a', '#6f5f9e', '#d8b4c8', '#1d2230', '#f6e7ff'],
  ['#0f2a2e', '#2f6b6e', '#9cc7b8', '#13201c', '#e8fff4'],
  ['#3a2a14', '#a8742c', '#f2d39a', '#3b2f1d', '#fff6d8'],
];

/** A stable number for a level id. */
export const paintingSeed = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

export const paintingTitle = (id: string): string => TITLES[paintingSeed(id) % TITLES.length] ?? TITLES[0]!;

/** Paint the night's target. Same id → same picture. */
export const paintTarget = (id: string, W = 240, H = 180): HTMLCanvasElement => {
  const seed = paintingSeed(id);
  const r = rng(seed);
  const [canvas, ctx] = makeCanvas(W, H);
  const pal = PALETTES[seed % PALETTES.length] ?? PALETTES[0]!;

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, pal[0]);
  sky.addColorStop(0.55, pal[1]);
  sky.addColorStop(1, pal[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Sun or moon with a halo
  const cx = W * (0.25 + r() * 0.5);
  const cy = H * (0.25 + r() * 0.2);
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.35);
  halo.addColorStop(0, pal[4]);
  halo.addColorStop(0.15, pal[4]);
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // Two layers of hills
  for (const [base, shade] of [
    [0.62, 0.55],
    [0.78, 1],
  ] as const) {
    ctx.fillStyle = pal[3];
    ctx.globalAlpha = shade;
    ctx.beginPath();
    ctx.moveTo(0, H);
    let x = 0;
    ctx.lineTo(0, H * (base + (r() - 0.5) * 0.1));
    while (x < W) {
      x += W * (0.15 + r() * 0.2);
      ctx.quadraticCurveTo(x - W * 0.08, H * (base - r() * 0.12), x, H * (base + (r() - 0.5) * 0.08));
    }
    ctx.lineTo(W, H);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // A small motif: a house with a lit window, a lighthouse, or a sail
  const motif = seed % 3;
  ctx.fillStyle = pal[3];
  if (motif === 0) {
    const hx = W * (0.55 + r() * 0.25);
    const hy = H * 0.72;
    ctx.fillRect(hx, hy - 18, 26, 18);
    ctx.beginPath();
    ctx.moveTo(hx - 4, hy - 18);
    ctx.lineTo(hx + 13, hy - 32);
    ctx.lineTo(hx + 30, hy - 18);
    ctx.fill();
    ctx.fillStyle = pal[4];
    ctx.fillRect(hx + 9, hy - 12, 7, 7);
  } else if (motif === 1) {
    const lx = W * (0.15 + r() * 0.2);
    const ly = H * 0.68;
    ctx.fillRect(lx, ly - 40, 10, 40);
    ctx.fillStyle = pal[4];
    ctx.fillRect(lx - 2, ly - 48, 14, 9);
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(lx + 5, ly - 44);
    ctx.lineTo(W, ly - 70);
    ctx.lineTo(W, ly - 30);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    const sx = W * (0.4 + r() * 0.3);
    const sy = H * 0.8;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 30, sy);
    ctx.lineTo(sx + 24, sy + 6);
    ctx.lineTo(sx + 6, sy + 6);
    ctx.fill();
    ctx.fillStyle = '#a8302c';
    ctx.beginPath();
    ctx.moveTo(sx + 14, sy - 30);
    ctx.lineTo(sx + 14, sy - 2);
    ctx.lineTo(sx + 30, sy - 4);
    ctx.fill();
  }

  // Brush strokes and varnish
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = `rgba(${r() < 0.5 ? '255,240,220' : '10,10,10'},0.07)`;
    ctx.lineWidth = 2;
    const x = r() * W;
    const y = r() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 6 + r() * 8, y + (r() - 0.5) * 4);
    ctx.stroke();
  }
  const varnish = ctx.createLinearGradient(0, 0, W, H);
  varnish.addColorStop(0, 'rgba(255,240,200,0.12)');
  varnish.addColorStop(1, 'rgba(60,30,0,0.18)');
  ctx.fillStyle = varnish;
  ctx.fillRect(0, 0, W, H);
  return canvas;
};
