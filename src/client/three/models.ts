import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { type Level, type Pos, isWall, tileAt } from '../../shared/sim';
import { makeCanvas, rng } from '../art';
import type { CharacterRig } from './assets';
import { bakeInPlace, keepDynamic } from './bake';

// Scale-model diorama style: matte materials, clean shapes, figurines on
// black bases. Pieces face +X, stand on y = 0 and fit inside a 1×1 tile.

export const WALL_HEIGHT = 0.55;
export const TERRACE_HEIGHT = 0.1;
const TILE_PX = 128;

export const canvasTexture = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

export const shadowed = <T extends THREE.Object3D>(obj: T): T => {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
};

export const matte = (color: number, roughness = 0.85, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Painted-miniature finish: a satin clear coat over the paint. */
export const varnish = (color: number, roughness = 0.5, clearcoat = 0.6) =>
  new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat, clearcoatRoughness: 0.28 });

/** A box with softly rounded edges, so nothing looks razor-cut. */
export const rbox = (w: number, h: number, d: number, r = 0.02) =>
  // One bevel segment: a soft chamfer is plenty at this camera distance and
  // costs a fraction of the triangles of a fully rounded edge.
  new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2));

/* ------------------------------------------------------------- materials */

export const MAT = {
  gold: matte(0xd6ac4c, 0.22, 1.0),
  brass: matte(0xb8913f, 0.3, 1.0),
  baseBlack: new THREE.MeshPhysicalMaterial({ color: 0x0c0d0f, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }),
  ironBlack: matte(0x1c1d20, 0.5, 0.4),
  marble: matte(0xf0ece6, 0.3),
  marbleShade: matte(0xdcd6cc, 0.35),
  plaster: matte(0xe9e1d2, 0.9),
  plasterBase: matte(0xf6f2ea, 0.8),
  terrace: matte(0xd9d2c6, 0.85),
  slab: matte(0xcbb9a2, 0.9),
  slabDark: matte(0x8f7c66, 0.9),
  wood: matte(0x7a5233, 0.7),
  terracotta: matte(0xb5643c, 0.9),
  leaf: matte(0x4f7a3a, 0.8),
  leafDark: matte(0x3a5e2b, 0.85),
  // Wren
  coat: varnish(0x34363d, 0.6),
  coatDark: varnish(0x23252a, 0.65),
  scarf: varnish(0xa8283a, 0.55),
  skin: varnish(0xdcae8e, 0.55, 0.3),
  boots: varnish(0x1a1a1c, 0.35, 0.8),
  // Guards
  // The guards' uniform (orange shirt); Wren wears it when disguised.
  jacket: varnish(0xe8912e, 0.55),
  shirt: varnish(0xc4d8ec, 0.6),
  trousers: varnish(0x2b2d33, 0.6),
  cap: varnish(0x1d2c4a, 0.45),
  visor: matte(0x0b0c10, 0.3, 0.2),
  steel: matte(0xa9b0b8, 0.35, 0.85),
  dangerRim: new THREE.MeshStandardMaterial({
    color: 0x8a1616,
    emissive: 0xff2a1f,
    emissiveIntensity: 0.7,
    roughness: 0.4,
  }),
  lanternGlow: new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb54a, emissiveIntensity: 2.4 }),
  lampGlow: new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffc46b, emissiveIntensity: 2.2 }),
  lens: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 3 }),
  velvet: matte(0x8a1a24, 0.9),
};

/* ----------------------------------------------------------------- floor */

export type FloorPainter = (ctx: CanvasRenderingContext2D, level: Level, s: number) => void;

/** Marble gallery floor, one slab per tile. */
export const paintMarble: FloorPainter = (ctx, level, s) => {
  const cols = level.map[0]?.length ?? 1;
  const rows = level.map.length;
  const r = rng(42);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * s;
      const py = y * s;
      const light = (x + y) % 2 === 0;
      const base = light ? [236, 232, 225] : [222, 216, 207];
      const jitter = Math.floor(r() * 8) - 4;
      ctx.fillStyle = `rgb(${base[0]! + jitter},${base[1]! + jitter},${base[2]! + jitter})`;
      ctx.fillRect(px, py, s, s);
      // Marble veins
      for (let v = 0; v < 3; v++) {
        ctx.strokeStyle = `rgba(150,140,128,${0.08 + r() * 0.12})`;
        ctx.lineWidth = 0.8 + r() * 1.2;
        ctx.beginPath();
        let vx = px + r() * s;
        let vy = py;
        ctx.moveTo(vx, vy);
        for (let i = 0; i < 6; i++) {
          vx += (r() - 0.5) * s * 0.35;
          vy += s / 6;
          ctx.lineTo(vx, vy);
        }
        ctx.stroke();
      }
      // Grout
      ctx.strokeStyle = 'rgba(120,110,98,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
    }
  }
};

/**
 * A level's floor: the theme's surface with the board-game path drawn on
 * top, a thin line between neighbouring walkable tiles and a ring on each.
 */
export const floorCanvas = (
  level: Level,
  paint: FloorPainter = paintMarble,
  ink = 'rgba(30,30,34,0.72)'
): HTMLCanvasElement => {
  const cols = level.map[0]?.length ?? 1;
  const rows = level.map.length;
  const s = TILE_PX;
  const [canvas, ctx] = makeCanvas(cols * s, rows * s);
  paint(ctx, level, s);

  // Path network
  const walk = (x: number, y: number) => !isWall(level, { x, y });
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!walk(x, y)) continue;
      const cx = x * s + s / 2;
      const cy = y * s + s / 2;
      if (walk(x + 1, y)) {
        ctx.beginPath();
        ctx.moveTo(cx + 12, cy);
        ctx.lineTo(cx + s - 12, cy);
        ctx.stroke();
      }
      if (walk(x, y + 1)) {
        ctx.beginPath();
        ctx.moveTo(cx, cy + 12);
        ctx.lineTo(cx, cy + s - 12);
        ctx.stroke();
      }
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!walk(x, y)) continue;
      const ch = tileAt(level, { x, y });
      if (ch === 'P' || ch === 'E') continue;
      const cx = x * s + s / 2;
      const cy = y * s + s / 2;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return canvas;
};

/* ---------------------------------------------------------------- canvas */

export const textTexture = (text: string, color: string, bg: string, w = 256, h = 96) => {
  const [canvas, ctx] = makeCanvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.round(h * 0.62)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  return canvasTexture(canvas);
};

/** A small abstract or landscape oil painting, varied by seed. */
export const artTexture = (seed: number): THREE.CanvasTexture => {
  const r = rng(seed);
  const W = 160;
  const H = 120;
  const [canvas, ctx] = makeCanvas(W, H);
  const palettes = [
    ['#1d2f55', '#c9744a', '#f0b46c', '#2e3d2a'],
    ['#2b4a5e', '#8fb3c7', '#e8dcc0', '#556b3a'],
    ['#4a1f2b', '#b84a3c', '#e6b35c', '#2b2420'],
    ['#26304a', '#6f5f9e', '#d8b4c8', '#1d2230'],
  ];
  const pal = palettes[Math.floor(r() * palettes.length)] ?? palettes[0]!;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, pal[0]!);
  sky.addColorStop(0.6, pal[1]!);
  sky.addColorStop(1, pal[2]!);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = pal[3]!;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H * (0.6 + r() * 0.2));
  ctx.quadraticCurveTo(W * r(), H * (0.4 + r() * 0.3), W, H * (0.6 + r() * 0.2));
  ctx.lineTo(W, H);
  ctx.fill();
  for (let i = 0; i < 160; i++) {
    ctx.strokeStyle = `rgba(${r() < 0.5 ? '255,240,220' : '10,10,10'},0.06)`;
    ctx.lineWidth = 2;
    const x = r() * W;
    const y = r() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 5 + r() * 6, y + (r() - 0.5) * 3);
    ctx.stroke();
  }
  return canvasTexture(canvas);
};

/* ------------------------------------------------------------ figurines */

export const pieceBase = (rim: THREE.Material) => {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 28), MAT.baseBlack);
  base.position.y = 0.025;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.01, 6, 28), rim);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  g.add(base, ring);
  return g;
};

const limb = (r1: number, r2: number, len: number, mat: THREE.Material) =>
  new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 20), mat);

export type Thief = {
  group: THREE.Group;
  lantern: THREE.PointLight;
  /** Swap Wren's coat for a guard uniform and cap. */
  setDisguise: (on: boolean) => void;
  /** Animated character rigs inside the group (empty for code-built figures). */
  rigs: CharacterRig[];
};

export type Guard = {
  group: THREE.Group;
  beam: THREE.Mesh;
  spot: THREE.SpotLight;
  alert: THREE.Sprite;
  dog: boolean;
  rigs: CharacterRig[];
};

export const beamMaterial = (() => {
  let mat: THREE.MeshBasicMaterial | null = null;
  return () => {
    if (mat) return mat;
    const [canvas, ctx] = makeCanvas(4, 128);
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    // Canvas top maps to the cone's tip (at the lens): bright there, fading out.
    g.addColorStop(0, 'rgba(255,245,220,0.55)');
    g.addColorStop(0.4, 'rgba(255,240,205,0.22)');
    g.addColorStop(1, 'rgba(255,240,205,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 128);
    mat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    return mat;
  };
})();

/** The curator's hound: a sitting-ready dog figurine on a red base. */
export const makeDog = (): Guard => {
  const g = new THREE.Group();
  g.add(pieceBase(MAT.dangerRim));
  const fur = matte(0x6b4a2e, 0.85);
  const furDark = matte(0x3b2818, 0.9);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.2, 6, 12), fur);
  body.rotation.z = Math.PI / 2;
  body.position.set(-0.02, 0.27, 0);
  g.add(body);
  for (const [x, z] of [
    [0.08, 0.05],
    [0.08, -0.05],
    [-0.12, 0.05],
    [-0.12, -0.05],
  ] as const) {
    const leg = limb(0.02, 0.018, 0.2, fur);
    leg.position.set(x, 0.15, z);
    g.add(leg);
  }
  const neck = limb(0.04, 0.05, 0.12, fur);
  neck.position.set(0.12, 0.36, 0);
  neck.rotation.z = -0.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), fur);
  head.position.set(0.17, 0.43, 0);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.05), furDark);
  snout.position.set(0.23, 0.415, 0);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), MAT.visor);
  nose.position.set(0.272, 0.425, 0);
  g.add(neck, head, snout, nose);
  for (const z of [-0.035, 0.035]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.015), furDark);
    ear.position.set(0.15, 0.48, z);
    ear.rotation.z = 0.3;
    g.add(ear);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 16), MAT.dangerRim);
  collar.position.set(0.14, 0.38, 0);
  collar.rotation.y = Math.PI / 2;
  const tail = limb(0.012, 0.008, 0.14, fur);
  tail.position.set(-0.18, 0.34, 0);
  tail.rotation.z = 0.8;
  g.add(collar, tail);

  // Dogs carry no flashlight; keep the same shape as a guard with these off.
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1, 8, 1, true), beamMaterial());
  beam.visible = false;
  const spot = new THREE.SpotLight(0xffffff, 0);
  const alert = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textTexture('?', '#f2c14e', 'rgba(0,0,0,0)', 96, 96),
      depthTest: false,
      transparent: true,
    })
  );
  alert.scale.set(0.3, 0.3, 1);
  alert.position.set(0, 0.8, 0);
  alert.visible = false;
  alert.renderOrder = 10;
  g.add(beam, alert);
  shadowed(g);
  keepDynamic(beam);
  bakeInPlace(g);
  return { group: g, beam, spot, alert, dog: true, rigs: [] };
};

/** How many tiles the beam reaches (0 hides it). `scale` is the figurine's scale. */
export const setBeamReach = (guard: Guard, tiles: number, scale = 1) => {
  // The beam lives inside the scaled figurine, so convert tiles to local units.
  if (guard.dog) {
    guard.beam.visible = false;
    return;
  }
  const length = Math.max(0, tiles + 0.2) / scale;
  const width = Math.min(1, 0.45 + length * 0.18);
  guard.beam.visible = tiles > 0;
  guard.beam.scale.set(width, length, width);
  const tip = typeof guard.beam.userData.tipX === 'number' ? guard.beam.userData.tipX : 0.3;
  guard.beam.position.x = tip + length / 2;
  guard.spot.distance = tiles + 0.8;
};

/* ------------------------------------------------------------- the target */

export type PaintingProp = { group: THREE.Group; canvas: THREE.Mesh; light: THREE.PointLight };

/** The night's target: a large gilt-framed canvas on an easel behind ropes. */
/** The night's target on its easel; `picture` is the painted canvas (see paintings.ts). */
export const makePainting = (picture: HTMLCanvasElement): PaintingProp => {
  const g = new THREE.Group();
  for (const [x, z, rz, rx] of [
    [-0.15, 0.05, 0.12, -0.12],
    [0.15, 0.05, -0.12, -0.12],
    [0, -0.12, 0, 0.28],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.75, 0.025), MAT.wood);
    leg.position.set(x, 0.375, z);
    leg.rotation.set(rx, 0, rz);
    g.add(leg);
  }
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.025, 0.05), MAT.wood);
  ledge.position.set(0, 0.32, 0.07);
  g.add(ledge);

  const art = new THREE.Group();
  art.position.set(0, 0.53, 0.05);
  art.rotation.x = -0.12;
  const frame = new THREE.Mesh(rbox(0.54, 0.42, 0.04, 0.012), MAT.gold);
  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(0.44, 0.32),
    new THREE.MeshStandardMaterial({ map: canvasTexture(picture), roughness: 0.6 })
  );
  canvas.position.z = 0.021;
  art.add(frame, canvas);
  g.add(art);

  for (const x of [-0.36, 0.36]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.3, 12), MAT.brass);
    post.position.set(x, 0.15, 0.36);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), MAT.brass);
    knob.position.set(x, 0.31, 0.36);
    g.add(post, knob);
  }
  const rope = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.36, 0.28, 0.36),
        new THREE.Vector3(0, 0.13, 0.4),
        new THREE.Vector3(0.36, 0.28, 0.36)
      ),
      16,
      0.012,
      6
    ),
    MAT.velvet
  );
  g.add(rope);

  // Kept for the setter but not added: a light per prop is costly.
  const light = new THREE.PointLight(0xffd9a0, 1.0, 1.6, 1.5);
  shadowed(g);
  return { group: g, canvas, light };
};

export const setPaintingTaken = (p: PaintingProp, taken: boolean) => {
  p.canvas.visible = !taken;
  p.light.intensity = taken ? 0.2 : 1.0;
};

/* ----------------------------------------------------------------- exit */

export type ExitProp = {
  group: THREE.Group;
  sign: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  mat: THREE.MeshStandardMaterial;
};

/** The way out: a brass-edged mat and a standing EXIT sign. */
export const makeExit = (): ExitProp => {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1f4a33,
    emissive: 0x1fbf66,
    emissiveIntensity: 0.1,
    roughness: 0.95,
  });
  const border = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.016, 0.74), MAT.brass);
  border.position.y = 0.008;
  const rug = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.02, 0.66), mat);
  rug.position.y = 0.01;
  g.add(border, rug);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 8), MAT.ironBlack);
  pole.position.set(0, 0.3, -0.3);
  const sign = new THREE.MeshStandardMaterial({
    map: textTexture('EXIT', '#5dff9d', '#0b1a12'),
    emissive: 0xffffff,
    emissiveMap: textTexture('EXIT', '#5dff9d', '#000000'),
    emissiveIntensity: 0.4,
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.025), [
    MAT.baseBlack,
    MAT.baseBlack,
    MAT.baseBlack,
    MAT.baseBlack,
    sign,
    MAT.baseBlack,
  ]);
  board.position.set(0, 0.64, -0.3);
  g.add(pole, board);

  // Kept for the setter but not added: the sign glows through its material.
  const light = new THREE.PointLight(0x3dff8f, 0.3, 1.6, 1.6);
  shadowed(g);
  rug.castShadow = false;
  border.castShadow = false;
  return { group: g, sign, light, mat };
};

export const setExitActive = (e: ExitProp, active: boolean) => {
  e.sign.emissiveIntensity = active ? 1.6 : 0.35;
  e.light.intensity = active ? 1.2 : 0.2;
  e.mat.emissiveIntensity = active ? 0.35 : 0.05;
};

/* ------------------------------------------------------- vents, switches */

export const makeVent = (): THREE.Group => {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.025, 0.56), MAT.steel);
  plate.position.y = 0.013;
  g.add(plate);
  for (let i = 0; i < 6; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.015, 0.03), MAT.visor);
    slat.position.set(0, 0.027, -0.2 + i * 0.08);
    g.add(slat);
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.receiveShadow = true;
  });
  return g;
};

export type SwitchProp = { group: THREE.Group; lever: THREE.Object3D; lamp: THREE.MeshStandardMaterial };

export const makeSwitch = (): SwitchProp => {
  const g = new THREE.Group();
  const post = new THREE.Mesh(rbox(0.2, 0.4, 0.14, 0.02), MAT.ironBlack);
  post.position.y = 0.2;
  g.add(post);
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.3, 0.08);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.15, 8), MAT.brass);
  lever.position.y = 0.075;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), MAT.gold);
  knob.position.y = 0.15;
  pivot.add(lever, knob);
  g.add(pivot);
  const lamp = new THREE.MeshStandardMaterial({ color: 0x332200, emissive: 0xffc04a, emissiveIntensity: 2 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), lamp);
  bulb.position.set(0, 0.11, 0.075);
  g.add(bulb);
  shadowed(g);
  return { group: g, lever: pivot, lamp };
};

export const setSwitchOn = (s: SwitchProp, on: boolean) => {
  s.lever.rotation.x = on ? -0.6 : 0.6;
  s.lamp.emissiveIntensity = on ? 2 : 0;
  s.lamp.color.set(on ? 0x332200 : 0x111111);
};

/* ------------------------------------------------- disguise, key, door */

export type RackProp = { group: THREE.Group; uniform: THREE.Group };

/** A coat stand with a spare guard uniform and cap hanging on it. */
export const makeCoatRack = (): RackProp => {
  const g = new THREE.Group();
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.03, 16), MAT.wood);
  foot.position.y = 0.015;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.82, 10), MAT.wood);
  pole.position.y = 0.43;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), MAT.brass);
  knob.position.y = 0.85;
  g.add(foot, pole, knob);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 6), MAT.brass);
    hook.position.set(Math.cos(a) * 0.04, 0.78, Math.sin(a) * 0.04);
    hook.rotation.set(0, -a, Math.PI / 2 - 0.5);
    g.add(hook);
  }
  const uniform = new THREE.Group();
  const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.32, 14), MAT.jacket);
  jacket.scale.set(1, 1, 0.55);
  jacket.position.set(0.07, 0.6, 0);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 8), MAT.jacket);
  sleeve.position.set(0.12, 0.6, 0.04);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.054, 0.04, 16), MAT.cap);
  cap.position.set(-0.05, 0.8, 0);
  cap.rotation.z = 0.4;
  uniform.add(jacket, sleeve, cap);
  g.add(uniform);
  shadowed(g);
  return { group: g, uniform };
};

export type KeyProp = { group: THREE.Group; key: THREE.Group };

/** A gold key spinning above a small pedestal. */
export const makeKey = (): KeyProp => {
  const g = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 16), MAT.marble);
  ped.position.y = 0.08;
  g.add(ped);
  const key = new THREE.Group();
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 20), MAT.gold);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), MAT.gold);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 0.12;
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.015), MAT.gold);
  bit.position.set(0.18, -0.03, 0);
  key.add(bow, shaft, bit);
  key.position.set(-0.04, 0.34, 0);
  g.add(key);
  shadowed(g);
  return { group: g, key };
};

export type DoorProp = { group: THREE.Group; leaves: THREE.Object3D[] };

/**
 * Gold-trimmed double doors filling a doorway. `acrossX` lays the doors
 * across the X axis (walls on the left and right); otherwise across Z.
 */
export const makeDoor = (acrossX: boolean): DoorProp => {
  const g = new THREE.Group();
  const leaves: THREE.Object3D[] = [];
  const doorMat = matte(0x5a3a22, 0.7);
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * 0.47, 0, 0);
    const leaf = new THREE.Mesh(rbox(0.46, WALL_HEIGHT - 0.02, 0.05, 0.012), doorMat);
    leaf.position.set(-side * 0.235, (WALL_HEIGHT - 0.02) / 2, 0);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.06), MAT.gold);
    panel.position.set(-side * 0.235, 0.3, 0);
    panel.scale.z = 0.3;
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), MAT.brass);
    handle.position.set(-side * 0.42, 0.28, 0.035);
    hinge.add(leaf, panel, handle);
    hinge.userData.side = side;
    leaves.push(hinge);
    g.add(hinge);
  }
  if (!acrossX) g.rotation.y = Math.PI / 2;
  shadowed(g);
  return { group: g, leaves };
};

/** Swing the doors open (or shut). */
export const setDoorOpen = (d: DoorProp, open: boolean) => {
  for (const hinge of d.leaves) {
    const side = typeof hinge.userData.side === 'number' ? hinge.userData.side : 1;
    hinge.rotation.y = open ? side * 1.45 : 0;
  }
};

/* -------------------------------------------------------- architecture */

export type Sides = { up: boolean; down: boolean; left: boolean; right: boolean };

/**
 * A gallery wall block: cream plaster on a white plinth, with a small framed
 * painting hung on every face that looks onto open floor.
 */
export const makeDisplayWall = (open: Sides, seed: number): THREE.Group => {
  const g = new THREE.Group();
  const base = new THREE.Mesh(rbox(0.98, 0.06, 0.98, 0.015), MAT.plasterBase);
  base.position.y = 0.03;
  const block = new THREE.Mesh(rbox(0.94, WALL_HEIGHT - 0.06, 0.94, 0.03), MAT.plaster);
  block.position.y = 0.06 + (WALL_HEIGHT - 0.06) / 2;
  const cap = new THREE.Mesh(rbox(0.97, 0.03, 0.97, 0.012), MAT.plasterBase);
  cap.position.y = WALL_HEIGHT + 0.015;
  g.add(base, block, cap);

  const faces: [boolean, number, number, number][] = [
    [open.down, 0, 0.471, 0],
    [open.up, 0, -0.471, Math.PI],
    [open.right, 0.471, 0, Math.PI / 2],
    [open.left, -0.471, 0, -Math.PI / 2],
  ];
  let i = 0;
  for (const [isOpen, x, z, rot] of faces) {
    if (!isOpen) continue;
    const art = new THREE.Group();
    const frame = new THREE.Mesh(rbox(0.36, 0.26, 0.02, 0.008), MAT.gold);
    const canvas = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.2),
      new THREE.MeshStandardMaterial({ map: artTexture(seed * 7 + i++), roughness: 0.6 })
    );
    canvas.position.z = 0.011;
    art.add(frame, canvas);
    art.position.set(x, 0.33, z);
    art.rotation.y = rot;
    g.add(art);
  }
  return shadowed(g);
};

/** The raised stone terrace around the gallery (the out-of-bounds ring). */
export const makeTerrace = (): THREE.Mesh => {
  const slab = new THREE.Mesh(rbox(0.995, TERRACE_HEIGHT, 0.995, 0.018), MAT.terrace);
  slab.position.y = TERRACE_HEIGHT / 2;
  slab.receiveShadow = true;
  slab.castShadow = true;
  return slab;
};

/** A low balustrade along one edge of a terrace tile. `rot` turns it to face the floor. */
export const makeRailing = (rot: number): THREE.Group => {
  const g = new THREE.Group();
  const rail = new THREE.Mesh(rbox(0.06, 0.035, 1.0, 0.012), MAT.plasterBase);
  rail.position.set(0.44, TERRACE_HEIGHT + 0.24, 0);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 1.0), MAT.plasterBase);
  plinth.position.set(0.44, TERRACE_HEIGHT + 0.02, 0);
  g.add(rail, plinth);
  for (let i = 0; i < 6; i++) {
    const baluster = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          [0.0, 0],
          [0.022, 0],
          [0.016, 0.06],
          [0.026, 0.11],
          [0.014, 0.18],
          [0.02, 0.2],
          [0.0, 0.2],
        ].map(([x, y]) => new THREE.Vector2(x, y)),
        10
      ),
      MAT.plasterBase
    );
    baluster.position.set(0.44, TERRACE_HEIGHT + 0.03, -0.42 + i * 0.168);
    g.add(baluster);
  }
  g.rotation.y = rot;
  return shadowed(g);
};

/** A marble bust on a pedestal. */
export const makeStatue = (): THREE.Group => {
  const g = new THREE.Group();
  const ped = new THREE.Mesh(rbox(0.26, 0.42, 0.26, 0.02), MAT.marble);
  ped.position.y = TERRACE_HEIGHT + 0.21;
  const top = new THREE.Mesh(rbox(0.3, 0.03, 0.3, 0.01), MAT.marbleShade);
  top.position.y = TERRACE_HEIGHT + 0.435;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.marble);
  chest.scale.set(1.1, 0.9, 0.7);
  chest.position.y = TERRACE_HEIGHT + 0.45;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.07, 12), MAT.marble);
  neck.position.y = TERRACE_HEIGHT + 0.57;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), MAT.marble);
  head.scale.set(0.9, 1.1, 0.95);
  head.position.y = TERRACE_HEIGHT + 0.64;
  g.add(ped, top, chest, neck, head);
  return shadowed(g);
};

/** A potted palm. Tall when `tall`, a small shrub otherwise. */
export const makePlant = (tall: boolean, seed: number): THREE.Group => {
  const r = rng(seed);
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.18, 16), MAT.terracotta);
  pot.position.y = TERRACE_HEIGHT + 0.09;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.01, 16), MAT.slabDark);
  soil.position.y = TERRACE_HEIGHT + 0.18;
  g.add(pot, soil);
  if (tall) {
    const trunkH = 0.9 + r() * 0.3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, trunkH, 8), MAT.wood);
    trunk.position.y = TERRACE_HEIGHT + 0.18 + trunkH / 2;
    trunk.rotation.z = (r() - 0.5) * 0.15;
    g.add(trunk);
    const crownY = TERRACE_HEIGHT + 0.18 + trunkH;
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.42, 6), i % 2 ? MAT.leaf : MAT.leafDark);
      const a = (i / 7) * Math.PI * 2 + r() * 0.3;
      leaf.position.set(Math.cos(a) * 0.17, crownY - 0.04, Math.sin(a) * 0.17);
      leaf.rotation.set(0, -a, Math.PI / 2 + 0.5);
      leaf.scale.set(1, 1, 0.35);
      g.add(leaf);
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.09 + r() * 0.04, 10, 8), i % 2 ? MAT.leaf : MAT.leafDark);
      bush.position.set((r() - 0.5) * 0.12, TERRACE_HEIGHT + 0.25 + r() * 0.08, (r() - 0.5) * 0.12);
      g.add(bush);
    }
  }
  return shadowed(g);
};

/** A gallery bench. */
export const makeBench = (): THREE.Group => {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(rbox(0.6, 0.04, 0.2, 0.012), MAT.wood);
  seat.position.y = TERRACE_HEIGHT + 0.2;
  g.add(seat);
  for (const x of [-0.25, 0.25]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.18), MAT.ironBlack);
    leg.position.set(x, TERRACE_HEIGHT + 0.09, 0);
    g.add(leg);
  }
  return shadowed(g);
};

export type LampPost = { group: THREE.Group; light: THREE.PointLight; glow: THREE.MeshStandardMaterial };

/** A black iron lamp post with a warm lantern head; lights its room. */
export const makeLampPost = (): LampPost => {
  const g = new THREE.Group();
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 12), MAT.ironBlack);
  foot.position.y = TERRACE_HEIGHT + 0.03;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 1.0, 10), MAT.ironBlack);
  pole.position.y = TERRACE_HEIGHT + 0.5;
  const glow = MAT.lampGlow.clone();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.11, 8), glow);
  head.position.y = TERRACE_HEIGHT + 1.06;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.06, 8), MAT.ironBlack);
  roof.position.y = TERRACE_HEIGHT + 1.14;
  g.add(foot, pole, head, roof);
  const light = new THREE.PointLight(0xffb066, 0, 4.5, 1.3);
  light.position.y = TERRACE_HEIGHT + 1.02;
  g.add(light);
  shadowed(g);
  head.castShadow = false;
  return { group: g, light, glow };
};

export const tileKey = (p: Pos) => `${p.x},${p.y}`;

/* ------------------------------------------------------- job objectives */

const bills = matte(0x5f8f5a, 0.7);
const billsEdge = matte(0xe9e4cf, 0.8);

/** A small pile of banded cash stacks. Hidden once taken. */
export const makeCash = (): THREE.Group => {
  const g = new THREE.Group();
  const spots: [number, number, number][] = [
    [-0.07, 0, 0.05],
    [0.08, 0, -0.04],
    [0.0, 0.055, 0.0],
  ];
  for (const [x, y, z] of spots) {
    const stack = new THREE.Mesh(rbox(0.16, 0.05, 0.09, 0.008), bills);
    stack.position.set(x, 0.03 + y, z);
    stack.rotation.y = x * 4;
    const band = new THREE.Mesh(rbox(0.03, 0.052, 0.094, 0.004), MAT.gold);
    band.position.copy(stack.position);
    band.rotation.y = stack.rotation.y;
    const edge = new THREE.Mesh(rbox(0.162, 0.01, 0.092, 0.003), billsEdge);
    edge.position.set(x, 0.03 + y + 0.02, z);
    edge.rotation.y = stack.rotation.y;
    g.add(stack, band, edge);
  }
  return shadowed(g);
};

export type SafeProp = { group: THREE.Group; door: THREE.Object3D; dial: THREE.MeshStandardMaterial };

/** A heavy steel safe with a brass dial; the door swings open when cracked. */
export const makeSafe = (): SafeProp => {
  const g = new THREE.Group();
  const steel = matte(0x3c4148, 0.45, 0.6);
  const body = new THREE.Mesh(rbox(0.5, 0.52, 0.46, 0.03), steel);
  body.position.y = 0.26;
  const inside = new THREE.Mesh(rbox(0.42, 0.42, 0.02, 0.01), MAT.baseBlack);
  inside.position.set(0, 0.27, 0.22);
  const ledger = new THREE.Mesh(rbox(0.14, 0.04, 0.18, 0.006), MAT.velvet);
  ledger.position.set(0, 0.12, 0.12);
  g.add(body, inside, ledger);
  const hinge = new THREE.Group();
  hinge.position.set(-0.22, 0, 0.24);
  const door = new THREE.Mesh(rbox(0.44, 0.44, 0.04, 0.015), steel);
  door.position.set(0.22, 0.27, 0);
  const dialMat = new THREE.MeshStandardMaterial({ color: 0xb8913f, metalness: 1, roughness: 0.3, emissive: 0x000000 });
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 20), dialMat);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0.22, 0.3, 0.035);
  const handle = new THREE.Mesh(rbox(0.04, 0.14, 0.03, 0.008), MAT.brass);
  handle.position.set(0.36, 0.27, 0.035);
  hinge.add(door, dial, handle);
  g.add(hinge);
  return { group: shadowed(g), door: hinge, dial: dialMat };
};

/** Show safe-cracking progress (0…1) and swing the door open when cracked. */
export const setSafe = (s: SafeProp, progress: number, open: boolean) => {
  s.dial.emissive.setHex(progress > 0 || open ? 0xffb54a : 0x000000);
  s.dial.emissiveIntensity = open ? 1.5 : progress * 1.2;
  s.door.rotation.y = open ? -1.7 : 0;
};

/** The forgery: a canvas wrapped in brown paper and string. */
export const makeForgery = (): THREE.Group => {
  const g = new THREE.Group();
  const paper = matte(0xa77b4f, 0.9);
  const parcel = new THREE.Mesh(rbox(0.46, 0.34, 0.05, 0.01), paper);
  parcel.position.set(0, 0.2, 0);
  parcel.rotation.x = -0.25;
  const string = matte(0xe9e0c8, 0.8);
  for (const [w, h] of [
    [0.47, 0.012],
    [0.012, 0.35],
  ] as const) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.056), string);
    s.position.copy(parcel.position);
    s.rotation.copy(parcel.rotation);
    g.add(s);
  }
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.12), MAT.wood);
  prop.position.set(0, 0.015, -0.06);
  g.add(parcel, prop);
  return shadowed(g);
};

export type DeskProp = { group: THREE.Group; file: THREE.Object3D };

/** The director's desk with a green banker's lamp; the planted file appears on it. */
export const makeDesk = (): DeskProp => {
  const g = new THREE.Group();
  const top = new THREE.Mesh(rbox(0.7, 0.04, 0.42, 0.01), MAT.wood);
  top.position.y = 0.34;
  g.add(top);
  for (const [x, z] of [
    [-0.31, -0.17],
    [0.31, -0.17],
    [-0.31, 0.17],
    [0.31, 0.17],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.04), MAT.wood);
    leg.position.set(x, 0.16, z);
    g.add(leg);
  }
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.02, 12), MAT.brass);
  lampBase.position.set(0.22, 0.37, -0.1);
  const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), MAT.brass);
  lampStem.position.set(0.22, 0.43, -0.1);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.07, 0.05, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2f6b3a, emissive: 0x3a8a4a, emissiveIntensity: 0.6, side: THREE.DoubleSide })
  );
  shade.position.set(0.22, 0.49, -0.1);
  g.add(lampBase, lampStem, shade);
  const file = new THREE.Mesh(rbox(0.2, 0.02, 0.15, 0.004), matte(0xd9b66a, 0.8));
  file.position.set(-0.1, 0.37, 0.02);
  file.rotation.y = 0.3;
  const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.004, 0.03), MAT.velvet);
  stamp.position.set(-0.1, 0.382, 0.02);
  stamp.rotation.y = 0.3;
  const fileGroup = new THREE.Group();
  fileGroup.add(file, stamp);
  fileGroup.visible = false;
  g.add(fileGroup);
  return { group: shadowed(g), file: fileGroup };
};
