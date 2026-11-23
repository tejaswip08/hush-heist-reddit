import * as THREE from 'three';
import { rng } from '../art';
import { type LampPost, MAT, matte, rbox, shadowed } from './models';

// The building around each level, Hitman GO style: tall facades with windows
// and doors along the back and left edges (away from the camera), and low
// balustrades along the front and right, so nothing hides the board.
// Each piece fills one border tile; its decorated face looks at the floor (+Z).

export const FACADE_HEIGHT = 1.45;
export const PARAPET_HEIGHT = 0.26;

export type Palette = {
  wall: number;
  trim: number;
  /** Chance a window is lit from inside */
  litChance: number;
};

const glassDark = new THREE.MeshStandardMaterial({ color: 0x1b2633, roughness: 0.15, metalness: 0.6 });
const glassLit = new THREE.MeshStandardMaterial({
  color: 0xffd9a0,
  emissive: 0xffb866,
  emissiveIntensity: 1.6,
  roughness: 0.4,
});
const doorWood = matte(0x3a2418, 0.6);

const cache = new Map<number, THREE.Material>();
const mat = (color: number) => {
  let m = cache.get(color);
  if (!m) {
    m = matte(color, 0.85);
    cache.set(color, m);
  }
  return m;
};

/** A tall facade tile with a window (or a door) on its inner face. */
export const facadeTile = (p: Palette, seed: number, door: boolean): THREE.Object3D => {
  const r = rng(seed);
  const g = new THREE.Group();
  const wall = mat(p.wall);
  const trim = mat(p.trim);

  const block = new THREE.Mesh(rbox(1, FACADE_HEIGHT, 1, 0.02), wall);
  block.position.y = FACADE_HEIGHT / 2;
  const plinth = new THREE.Mesh(rbox(1.0, 0.12, 1.04, 0.01), trim);
  plinth.position.set(0, 0.06, 0.02);
  const band = new THREE.Mesh(rbox(1.0, 0.05, 1.05, 0.01), trim);
  band.position.set(0, FACADE_HEIGHT * 0.62, 0.025);
  const cornice = new THREE.Mesh(rbox(1.0, 0.08, 1.1, 0.015), trim);
  // Sits just above the wall top so the two surfaces don't flicker.
  cornice.position.set(0, FACADE_HEIGHT - 0.03, 0.05);
  g.add(block, plinth, band, cornice);

  // Pilaster at the tile's right edge
  const pilaster = new THREE.Mesh(rbox(0.1, FACADE_HEIGHT - 0.1, 0.06, 0.01), trim);
  pilaster.position.set(0.46, FACADE_HEIGHT / 2, 0.52);
  g.add(pilaster);

  const face = 0.505;
  if (door) {
    const frame = new THREE.Mesh(rbox(0.46, 0.74, 0.04, 0.01), trim);
    frame.position.set(0, 0.47, face);
    const leaf = new THREE.Mesh(rbox(0.36, 0.66, 0.03, 0.008), doorWood);
    leaf.position.set(0, 0.45, face + 0.015);
    const step = new THREE.Mesh(rbox(0.56, 0.06, 0.16, 0.01), trim);
    step.position.set(0, 0.03, face + 0.07);
    g.add(frame, leaf, step);
  } else {
    // Ground-floor window with an arched top
    const lit = r() < p.litChance;
    const frame = new THREE.Mesh(rbox(0.42, 0.5, 0.04, 0.01), trim);
    frame.position.set(0, 0.5, face);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.4), lit ? glassLit : glassDark);
    pane.position.set(0, 0.5, face + 0.021);
    const arch = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16, 0, Math.PI), lit ? glassLit : glassDark);
    arch.position.set(0, 0.7, face + 0.021);
    const sill = new THREE.Mesh(rbox(0.5, 0.03, 0.08, 0.008), trim);
    sill.position.set(0, 0.24, face + 0.03);
    g.add(frame, pane, arch, sill);
  }
  // Upper-floor window
  const upLit = r() < p.litChance * 0.7;
  const upFrame = new THREE.Mesh(rbox(0.36, 0.36, 0.04, 0.01), trim);
  upFrame.position.set(0, 1.12, face);
  const upPane = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), upLit ? glassLit : glassDark);
  upPane.position.set(0, 1.12, face + 0.021);
  g.add(upFrame, upPane);

  shadowed(g);
  return g;
};

/** A plain corner pillar where two facades meet. */
export const facadeCorner = (p: Palette): THREE.Object3D => {
  const g = new THREE.Group();
  const block = new THREE.Mesh(rbox(1, FACADE_HEIGHT, 1, 0.02), mat(p.wall));
  block.position.y = FACADE_HEIGHT / 2;
  const cornice = new THREE.Mesh(rbox(1.08, 0.08, 1.08, 0.015), mat(p.trim));
  cornice.position.y = FACADE_HEIGHT - 0.03;
  g.add(block, cornice);
  return shadowed(g);
};

/** A low balustrade tile along the camera-side edges. */
export const parapetTile = (p: Palette): THREE.Object3D => {
  const g = new THREE.Group();
  const trim = mat(p.trim);
  const base = new THREE.Mesh(rbox(1, PARAPET_HEIGHT * 0.45, 1, 0.015), mat(p.wall));
  base.position.y = (PARAPET_HEIGHT * 0.45) / 2;
  const rail = new THREE.Mesh(rbox(1, 0.04, 0.22, 0.012), trim);
  rail.position.set(0, PARAPET_HEIGHT, 0.32);
  g.add(base, rail);
  const profile = [
    [0.0, 0],
    [0.03, 0],
    [0.022, 0.03],
    [0.034, 0.07],
    [0.018, 0.12],
    [0.026, 0.14],
    [0.0, 0.14],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(profile, 10);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(geo, trim);
    b.position.set(-0.4 + i * 0.2, PARAPET_HEIGHT * 0.45, 0.32);
    g.add(b);
  }
  return shadowed(g);
};

/** A brass lantern on a wall bracket; it lights the room it faces. */
export const wallLantern = (): LampPost => {
  const g = new THREE.Group();
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), MAT.ironBlack);
  bracket.position.set(0.32, 0.95, 0.58);
  const glow = MAT.lampGlow.clone();
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.14, 6), glow);
  cage.position.set(0.32, 0.86, 0.66);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.06, 6), MAT.ironBlack);
  cap.position.set(0.32, 0.96, 0.66);
  g.add(bracket, cage, cap);
  const light = new THREE.PointLight(0xffb066, 0, 4.5, 1.3);
  light.position.set(0.32, 0.86, 0.8);
  g.add(light);
  return { group: g, light, glow };
};
