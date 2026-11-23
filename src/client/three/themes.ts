import * as THREE from 'three';
import type { Theme } from '../../shared/sim';
import { type PropName, prop } from './assets';
import type { Palette } from './architecture';
import { makeCanvas, paintFloor, rng } from '../art';
import {
  type FloorPainter,
  type Sides,
  MAT,
  TERRACE_HEIGHT,
  WALL_HEIGHT,
  canvasTexture,
  makeDisplayWall,
  makePlant,
  makeStatue,
  matte,
  paintMarble,
  rbox,
  shadowed,
} from './models';

// Each level is dressed as one of five settings. Same rules, different look:
// floor, the obstacles that stand in for walls, the terrace stone and the
// decor around the edge.

/** A KayKit prop on the terrace, randomly turned; null if it didn't load. */
const kk = (
  name: PropName,
  size: number,
  seed: number,
  by: 'footprint' | 'height' = 'footprint',
  maxHeight = Infinity
): THREE.Object3D | null => {
  const o = prop(name, size, by, maxHeight);
  if (!o) return null;
  o.position.y += TERRACE_HEIGHT;
  o.rotation.y = rng(seed)() * Math.PI * 2;
  return o;
};

/** Pick a maker at random, falling back to `fallback` if a model is missing. */
const choose = (
  seed: number,
  makers: ((seed: number) => THREE.Object3D | null)[],
  fallback: () => THREE.Object3D | null
): THREE.Object3D | null => {
  const r = rng(seed * 3 + 1);
  const f = makers[Math.floor(r() * makers.length)];
  return (f ? f(seed) : null) ?? fallback();
};

/** A KayKit fence along one edge, standing in for the balustrade. */
const fenceRail = (rot: number, broken: boolean): THREE.Object3D | null => {
  const f = prop(broken ? 'fence_broken' : 'fence', 1, 'footprint', 0.45);
  if (!f) return null;
  const box = new THREE.Box3().setFromObject(f);
  const size = box.getSize(new THREE.Vector3());
  const holder = new THREE.Group();
  if (size.x > size.z) f.rotation.y = Math.PI / 2;
  f.position.set(0.44, TERRACE_HEIGHT, 0);
  holder.add(f);
  holder.rotation.y = rot;
  return holder;
};

export type ThemeStyle = {
  floor: FloorPainter;
  /** Colour of the path lines and node rings drawn over the floor */
  ink: string;
  terrace: THREE.Material;
  obstacle: (open: Sides, seed: number) => THREE.Object3D;
  /** Decor for an edge tile. `tall` is false on the camera side. */
  decor: (seed: number, tall: boolean) => THREE.Object3D | null;
  /** Edge railing facing the floor; null keeps the default balustrade. */
  rail?: (rot: number, seed: number) => THREE.Object3D | null;
  /** The building around the level */
  palette: Palette;
};

const lift = (o: THREE.Object3D) => {
  o.position.y += TERRACE_HEIGHT;
  return o;
};

/* ----------------------------------------------------------------- floors */

const paintParquet: FloorPainter = (ctx, level, s) => {
  const w = (level.map[0]?.length ?? 1) * s;
  const h = level.map.length * s;
  paintFloor(ctx, w, h, s);
  ctx.fillStyle = 'rgba(20,10,5,0.25)';
  ctx.fillRect(0, 0, w, h);
};

const paintCarpet: FloorPainter = (ctx, level, s) => {
  const w = (level.map[0]?.length ?? 1) * s;
  const h = level.map.length * s;
  const r = rng(5);
  ctx.fillStyle = '#4a1418';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h * 0.004; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,200,160,0.05)';
    ctx.fillRect(r() * w, r() * h, 2, 2);
  }
  // Damask medallion on every tile
  for (let y = 0; y < level.map.length; y++) {
    for (let x = 0; x < (level.map[0]?.length ?? 0); x++) {
      const cx = x * s + s / 2;
      const cy = y * s + s / 2;
      ctx.strokeStyle = 'rgba(200,150,70,0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 0.32, s * 0.2, Math.PI / 4, 0, Math.PI * 2);
      ctx.ellipse(cx, cy, s * 0.32, s * 0.2, -Math.PI / 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(200,150,70,0.5)';
  ctx.lineWidth = 10;
  ctx.strokeRect(s * 0.9, s * 0.9, w - s * 1.8, h - s * 1.8);
};

const paintGrass: FloorPainter = (ctx, level, s) => {
  const cols = level.map[0]?.length ?? 1;
  const rows = level.map.length;
  const w = cols * s;
  const h = rows * s;
  const r = rng(13);
  ctx.fillStyle = '#26331f';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h * 0.02; i++) {
    const g = 40 + Math.floor(r() * 40);
    ctx.strokeStyle = `rgba(${g - 10},${g + 25},${g - 15},0.6)`;
    ctx.lineWidth = 1;
    const x = r() * w;
    const y = r() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 5);
    ctx.stroke();
  }
  // Worn stepping stones on every tile
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = x * s + s / 2 + (r() - 0.5) * 8;
      const cy = y * s + s / 2 + (r() - 0.5) * 8;
      ctx.fillStyle = `rgb(${110 + r() * 20},${108 + r() * 20},${100 + r() * 15})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 0.36, s * 0.3, r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
};

const paintFlagstone: FloorPainter = (ctx, level, s) => {
  const cols = level.map[0]?.length ?? 1;
  const rows = level.map.length;
  const r = rng(21);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const g = 78 + Math.floor(r() * 22);
      ctx.fillStyle = `rgb(${g},${g - 3},${g - 8})`;
      ctx.fillRect(x * s, y * s, s, s);
      for (let i = 0; i < 120; i++) {
        ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)';
        ctx.fillRect(x * s + r() * s, y * s + r() * s, 3, 3);
      }
      // A crack and a little moss
      ctx.strokeStyle = 'rgba(20,18,15,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let cx = x * s + r() * s;
      let cy = y * s;
      ctx.moveTo(cx, cy);
      for (let i = 0; i < 4; i++) {
        cx += (r() - 0.5) * s * 0.4;
        cy += s / 4;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
      if (r() < 0.4) {
        ctx.fillStyle = 'rgba(70,95,45,0.4)';
        ctx.beginPath();
        ctx.arc(x * s + r() * s, y * s + r() * s, 6 + r() * 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(15,12,10,0.8)';
      ctx.lineWidth = 4;
      ctx.strokeRect(x * s + 2, y * s + 2, s - 4, s - 4);
    }
  }
};

/* -------------------------------------------------------------- textures */

const woodPanelTexture = (() => {
  let tex: THREE.CanvasTexture | null = null;
  return () => {
    if (tex) return tex;
    const [canvas, ctx] = makeCanvas(128, 128);
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, '#3a2414');
    g.addColorStop(0.5, '#4e321c');
    g.addColorStop(1, '#36210f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, 100, 46);
    ctx.strokeRect(14, 70, 100, 46);
    ctx.strokeStyle = 'rgba(255,200,140,0.12)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(16, 16, 100, 46);
    ctx.strokeRect(16, 72, 100, 46);
    tex = canvasTexture(canvas);
    return tex;
  };
})();

const hedgeTexture = (() => {
  let tex: THREE.CanvasTexture | null = null;
  return () => {
    if (tex) return tex;
    const [canvas, ctx] = makeCanvas(128, 128);
    const r = rng(77);
    ctx.fillStyle = '#1f3319';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const g = 50 + Math.floor(r() * 60);
      ctx.fillStyle = `rgba(${g - 20},${g + 10},${g - 30},0.9)`;
      ctx.beginPath();
      ctx.ellipse(r() * 128, r() * 128, 2 + r() * 3, 1 + r() * 2, r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    tex = canvasTexture(canvas);
    return tex;
  };
})();

const crateTexture = (() => {
  let tex: THREE.CanvasTexture | null = null;
  return () => {
    if (tex) return tex;
    const [canvas, ctx] = makeCanvas(128, 128);
    ctx.fillStyle = '#7a5a36';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? '#6d4f2e' : '#85633d';
      ctx.fillRect(0, i * 25.6, 128, 25.6);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, i * 25.6, 128, 2);
    }
    ctx.strokeStyle = '#4a3420';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 118, 118);
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(120, 120);
    ctx.stroke();
    tex = canvasTexture(canvas);
    return tex;
  };
})();

/* ------------------------------------------------------------- obstacles */

const flame = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa040, emissiveIntensity: 3 });

const candle = (x: number, y: number, z: number) => {
  const g = new THREE.Group();
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.07, 8), MAT.marble);
  wax.position.set(x, y + 0.035, z);
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), flame);
  f.scale.y = 1.8;
  f.position.set(x, y + 0.085, z);
  g.add(wax, f);
  return g;
};

/** Mansion: a dark panelled wall with a gilt cap and candle sconces. */
const panelWall = (open: Sides): THREE.Object3D => {
  const g = new THREE.Group();
  const block = new THREE.Mesh(
    rbox(0.94, WALL_HEIGHT, 0.94, 0.02),
    new THREE.MeshStandardMaterial({ map: woodPanelTexture(), roughness: 0.55 })
  );
  block.position.y = WALL_HEIGHT / 2;
  const cap = new THREE.Mesh(rbox(0.98, 0.035, 0.98, 0.01), MAT.gold);
  cap.position.y = WALL_HEIGHT + 0.015;
  g.add(block, cap);
  const faces: [boolean, number, number][] = [
    [open.down, 0, 0.5],
    [open.up, 0, -0.5],
    [open.right, 0.5, 0],
    [open.left, -0.5, 0],
  ];
  for (const [isOpen, x, z] of faces) {
    if (isOpen) g.add(candle(x * 0.98, 0.32, z * 0.98));
  }
  return shadowed(g);
};

/** Library: a bookshelf with rows of books on every side that faces the floor. */
const bookshelf = (open: Sides, seed: number): THREE.Object3D => {
  const r = rng(seed);
  const g = new THREE.Group();
  const frame = new THREE.Mesh(rbox(0.94, WALL_HEIGHT + 0.08, 0.94, 0.015), matte(0x2e1c10, 0.6));
  frame.position.y = (WALL_HEIGHT + 0.08) / 2;
  g.add(frame);
  const faces: [boolean, number][] = [
    [open.down, 0],
    [open.right, Math.PI / 2],
    [open.up, Math.PI],
    [open.left, -Math.PI / 2],
  ];
  const palette = [0x6b1e1e, 0x1e3b5c, 0x2f4a26, 0x5a4a20, 0x3d2b4a, 0x7a5a2a, 0x222222];
  const count = faces.filter(([o]) => o).length * 3 * 14;
  if (count === 0) return shadowed(g);
  const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), matte(0xffffff, 0.7), count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  let i = 0;
  for (const [isOpen, rot] of faces) {
    if (!isOpen) continue;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    for (let shelf = 0; shelf < 3; shelf++) {
      let x = -0.42;
      for (let b = 0; b < 14 && x < 0.42; b++) {
        const w = 0.035 + r() * 0.025;
        const h = 0.11 + r() * 0.05;
        const pos = new THREE.Vector3(x + w / 2, 0.07 + shelf * 0.2 + h / 2, 0.47).applyQuaternion(q);
        m.compose(pos, q, new THREE.Vector3(w, h, 0.08));
        books.setMatrixAt(i, m);
        books.setColorAt(i, c.setHex(palette[Math.floor(r() * palette.length)] ?? 0x333333));
        i += 1;
        x += w + 0.004;
      }
    }
  }
  books.count = i;
  g.add(books);
  for (let shelf = 0; shelf < 4; shelf++) {
    const board = new THREE.Mesh(rbox(0.98, 0.02, 0.98, 0.006), matte(0x3a2414, 0.6));
    board.position.y = 0.06 + shelf * 0.2;
    g.add(board);
  }
  return shadowed(g);
};

/** Garden: a clipped hedge on a stone kerb. */
const hedge = (): THREE.Object3D => {
  const g = new THREE.Group();
  const kerb = new THREE.Mesh(rbox(0.98, 0.07, 0.98, 0.015), matte(0x6f6a60, 0.9));
  kerb.position.y = 0.035;
  const bush = new THREE.Mesh(
    rbox(0.9, WALL_HEIGHT - 0.04, 0.9, 0.08),
    new THREE.MeshStandardMaterial({ map: hedgeTexture(), roughness: 0.95 })
  );
  bush.position.y = 0.07 + (WALL_HEIGHT - 0.04) / 2;
  g.add(kerb, bush);
  return shadowed(g);
};

const crate = (size: number) =>
  new THREE.Mesh(rbox(size, size, size, 0.012), new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.8 }));

const barrel = () => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0, 0],
        [0.13, 0],
        [0.15, 0.12],
        [0.13, 0.26],
        [0, 0.26],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      18
    ),
    matte(0x5a3a1e, 0.7)
  );
  g.add(body);
  for (const y of [0.04, 0.22]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.008, 6, 24), MAT.ironBlack);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    g.add(hoop);
  }
  return g;
};

/** Cellar: a stack of crates with a barrel. */
const crateStack = (seed: number): THREE.Object3D => {
  const r = rng(seed);
  const g = new THREE.Group();
  const a = crate(0.46);
  a.position.set(-0.2, 0.23, -0.18);
  a.rotation.y = (r() - 0.5) * 0.3;
  const b = crate(0.42);
  b.position.set(0.22, 0.21, 0.12);
  b.rotation.y = (r() - 0.5) * 0.4;
  const c = crate(0.36);
  c.position.set(-0.18, 0.64, -0.15);
  c.rotation.y = (r() - 0.5) * 0.5;
  const br = barrel();
  br.position.set(0.22, 0, -0.24);
  const d = crate(0.38);
  d.position.set(-0.2, 0.19, 0.24);
  g.add(a, b, c, br, d);
  return shadowed(g);
};

/* ---------------------------------------------------------------- decor */

const candelabra = (): THREE.Object3D => {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.05, 0.5, 10), MAT.brass);
  stem.position.y = 0.25;
  const arms = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.008, 6, 16, Math.PI), MAT.brass);
  arms.position.y = 0.5;
  arms.rotation.z = Math.PI;
  g.add(stem, arms, candle(0, 0.5, 0), candle(-0.08, 0.48, 0), candle(0.08, 0.48, 0));
  return shadowed(lift(g));
};

const deadTree = (seed: number): THREE.Object3D => {
  const r = rng(seed);
  const g = new THREE.Group();
  const bark = matte(0x2a221c, 0.95);
  const branch = (len: number, rad: number, depth: number): THREE.Object3D => {
    const node = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.6, rad, len, 6), bark);
    m.position.y = len / 2;
    node.add(m);
    if (depth > 0) {
      const kids = 2 + Math.floor(r() * 2);
      for (let i = 0; i < kids; i++) {
        const child = branch(len * (0.55 + r() * 0.2), rad * 0.6, depth - 1);
        child.position.y = len * (0.6 + r() * 0.35);
        child.rotation.set((r() - 0.5) * 1.4, r() * Math.PI * 2, (r() - 0.5) * 1.4);
        node.add(child);
      }
    }
    return node;
  };
  g.add(branch(0.55, 0.05, 3));
  return shadowed(lift(g));
};

const gravestone = (seed: number): THREE.Object3D => {
  const r = rng(seed);
  const g = new THREE.Group();
  const stone = matte(0x6b6a66, 0.95);
  const slab = new THREE.Mesh(rbox(0.26, 0.34, 0.06, 0.02), stone);
  slab.position.y = 0.17;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 16, 1, false, 0, Math.PI), stone);
  top.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  top.position.y = 0.34;
  g.add(slab, top);
  g.rotation.set((r() - 0.5) * 0.15, (r() - 0.5) * 0.6, (r() - 0.5) * 0.2);
  return shadowed(lift(g));
};

const globe = (): THREE.Object3D => {
  const g = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.08, 0.35, 10), MAT.wood);
  stand.position.y = 0.175;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), matte(0x2c4a5a, 0.5));
  ball.position.y = 0.46;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.006, 6, 32), MAT.brass);
  ring.position.y = 0.46;
  ring.rotation.set(0.4, 0, 0.4);
  g.add(stand, ball, ring);
  return shadowed(lift(g));
};

/* ---------------------------------------------------------------- table */

export const THEMES: Record<Theme, ThemeStyle> = {
  gallery: {
    palette: { wall: 0xe6cbbb, trim: 0xf7efe7, litChance: 0.25 },
    floor: paintMarble,
    ink: 'rgba(30,30,34,0.72)',
    terrace: MAT.terrace,
    obstacle: (open, seed) => makeDisplayWall(open, seed),
    decor: (seed, tall) => {
      const r = rng(seed);
      if (!tall) return r() < 0.3 ? makePlant(false, seed) : null;
      if (r() < 0.4) return null;
      return choose(
        seed,
        [
          (n) => kk('pictureframe_standing_A', 0.5, n, 'height', 0.75),
          (n) => kk('pictureframe_standing_B', 0.5, n, 'height', 0.75),
          (n) => kk('armchair_pillows', 0.6, n),
          () => makeStatue(),
          () => makePlant(true, seed),
        ],
        () => makeStatue()
      );
    },
  },
  mansion: {
    palette: { wall: 0x6e7b5d, trim: 0xdcd6c3, litChance: 0.45 },
    floor: paintParquet,
    ink: 'rgba(235,215,170,0.55)',
    terrace: matte(0x3b3632, 0.85),
    obstacle: (open) => panelWall(open),
    decor: (seed, tall) => {
      const r = rng(seed);
      if (!tall) return r() < 0.3 ? choose(seed, [(n) => kk('candle_triple', 0.35, n, 'height')], () => candelabra()) : null;
      if (r() < 0.35) return null;
      return choose(
        seed,
        [
          (n) => kk('armchair_pillows', 0.62, n),
          (n) => kk('couch_pillows', 0.85, n),
          (n) => kk('lamp_standing', 0.95, n, 'height'),
          (n) => kk('cabinet_small_decorated', 0.6, n),
          () => candelabra(),
        ],
        () => candelabra()
      );
    },
  },
  library: {
    palette: { wall: 0xb9705a, trim: 0xf1e4d2, litChance: 0.35 },
    floor: paintCarpet,
    ink: 'rgba(230,190,120,0.6)',
    terrace: matte(0x2e2119, 0.75),
    obstacle: (open, seed) => bookshelf(open, seed),
    decor: (seed, tall) => {
      const r = rng(seed);
      if (!tall) return r() < 0.3 ? choose(seed, [(n) => kk('book_set', 0.35, n)], () => globe()) : null;
      if (r() < 0.35) return null;
      return choose(
        seed,
        [
          (n) => kk('shelf_B_large_decorated', 0.85, n),
          (n) => kk('lamp_standing', 0.95, n, 'height'),
          (n) => kk('armchair', 0.6, n),
          (n) => kk('cabinet_medium_decorated', 0.75, n),
          () => globe(),
        ],
        () => globe()
      );
    },
  },
  garden: {
    palette: { wall: 0x5f6668, trim: 0xc2bcaf, litChance: 0.3 },
    floor: paintGrass,
    ink: 'rgba(230,225,210,0.55)',
    terrace: matte(0x3d4236, 0.95),
    obstacle: () => hedge(),
    decor: (seed, tall) => {
      const r = rng(seed);
      if (!tall) {
        if (r() < 0.55) return null;
        return choose(
          seed,
          [
            (n) => kk('gravestone', 0.42, n, 'height'),
            (n) => kk('gravemarker_A', 0.42, n, 'height'),
            (n) => kk('pumpkin_orange_jackolantern', 0.3, n),
          ],
          () => gravestone(seed)
        );
      }
      if (r() < 0.25) return null;
      return choose(
        seed,
        [
          (n) => kk('tree_dead_large', 1.5, n, 'height'),
          (n) => kk('tree_dead_medium', 1.1, n, 'height'),
          (n) => kk('grave_A', 0.6, n),
          (n) => kk('grave_B', 0.6, n),
          (n) => kk('crypt', 0.9, n),
          (n) => kk('lantern_standing', 0.8, n, 'height'),
        ],
        () => deadTree(seed)
      );
    },
    rail: (rot, seed) => fenceRail(rot, rng(seed)() < 0.3),
  },
  cellar: {
    palette: { wall: 0x6b6056, trim: 0xb3a797, litChance: 0.3 },
    floor: paintFlagstone,
    ink: 'rgba(230,220,200,0.5)',
    terrace: matte(0x45403a, 0.95),
    obstacle: (_open, seed) => crateStack(seed),
    decor: (seed, tall) => {
      const r = rng(seed);
      if (r() < (tall ? 0.3 : 0.55)) return null;
      if (!tall) {
        return choose(seed, [(n) => kk('skull_candle', 0.25, n, 'height'), (n) => kk('bone_A', 0.3, n)], () => null);
      }
      return choose(
        seed,
        [
          (n) => kk('coffin', 0.8, n),
          (n) => kk('coffin_decorated', 0.8, n),
          (n) => kk('shrine_candles', 0.6, n),
          () => lift(barrel()),
          () => {
            const c = crate(0.34);
            c.position.y = TERRACE_HEIGHT + 0.17;
            return shadowed(c);
          },
        ],
        () => lift(barrel())
      );
    },
  },
};
