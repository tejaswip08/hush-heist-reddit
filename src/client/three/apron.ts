import * as THREE from 'three';
import type { Theme } from '../../shared/sim';
import { makeCanvas, rng } from '../art';
import { prop } from './assets';
import { type Civilian, makeCivilian } from './figures';
import { MAT, TERRACE_HEIGHT, makeLampPost, makePlant, matte, rbox, shadowed } from './models';

// The non-playable part of the model, like the party lawns and pavements in
// Hitman GO: a strip along the front and right of the board with bystanders,
// café tables, palms, lamps and a parked car. Items stand far enough from the
// board that, seen from the camera, they never hide a playable tile.

export const APRON = 1.7;
/** How far from the board's edge decor stands (keeps the board unblocked). */
const SET_BACK = 1.15;
export const CIVILIAN_SCALE = 1.45;
/** Width of the corner kept clear for knocked-out guards. */
const HOLD_WIDTH = 2.5;
const HOLD_SPACING = 0.6;

/** Where the i-th knocked-out piece stands, in the front-left corner. */
export const holdingSpot = (cols: number, rows: number, i: number) =>
  new THREE.Vector3(-cols / 2 + 0.45 + (i % 4) * HOLD_SPACING, 0, rows / 2 + APRON * 0.55 - Math.floor(i / 4) * 0.5);

const PAVING: Record<Theme, number> = {
  gallery: 0xcfc6b8,
  mansion: 0x8f8a80,
  library: 0xa9998a,
  garden: 0x46603b,
  cellar: 0x7d756b,
};

const canopy = (seed: number) => {
  const colors = [0xf2ede3, 0xb3261e, 0x2f6b6e, 0xd8b23a];
  const m = matte(colors[seed % colors.length] ?? 0xf2ede3, 0.8);
  m.side = THREE.DoubleSide;
  return m;
};

/** A round café table under a parasol, with a guest seated beside it. */
const cafe = (seed: number, civilians: Civilian[]) => {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20), MAT.plasterBase);
  top.position.y = 0.34;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.06, 0.34, 8), MAT.ironBlack);
  leg.position.y = 0.17;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.95, 8), MAT.ironBlack);
  pole.position.y = 0.48;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.17, 8, 1, true), canopy(seed));
  shade.position.y = 0.95;
  g.add(top, leg, pole, shade);
  const chair = prop('chair_A_wood', 0.28);
  const guest = makeCivilian(seed % 2 === 0 ? 2 : 1, seed, true);
  const seat = new THREE.Group();
  if (chair) seat.add(chair);
  guest.group.position.y = 0.02;
  seat.add(guest.group);
  // Seated guest faces the table
  seat.position.set(-0.36, 0, 0);
  g.add(seat);
  civilians.push(guest);
  // The whole set is built at figurine scale, then scaled with the people.
  g.scale.setScalar(CIVILIAN_SCALE);
  return shadowed(g);
};

/** Two bystanders chatting, turned towards each other. */
const pair = (seed: number, civilians: Civilian[]) => {
  const g = new THREE.Group();
  const r = rng(seed);
  for (const side of [-1, 1]) {
    const c = makeCivilian(Math.floor(r() * 6), seed + side + 3);
    c.group.scale.setScalar(CIVILIAN_SCALE);
    c.group.position.set(side * 0.18, 0, (r() - 0.5) * 0.1);
    c.group.rotation.y = side > 0 ? Math.PI : 0;
    g.add(c.group);
    civilians.push(c);
  }
  return g;
};

const single = (seed: number, civilians: Civilian[]) => {
  const c = makeCivilian(seed % 2 === 0 ? 3 : 0, seed);
  c.group.scale.setScalar(CIVILIAN_SCALE);
  c.group.rotation.y = rng(seed)() * Math.PI * 2;
  civilians.push(c);
  return c.group;
};

const palm = (seed: number) => {
  const p = makePlant(true, seed);
  p.position.y -= TERRACE_HEIGHT;
  p.scale.setScalar(1.15);
  return p;
};

/** A decorative lamp post: glowing head, no real light (lights are costly). */
const lamp = () => {
  const l = makeLampPost();
  l.group.remove(l.light);
  l.glow.emissiveIntensity = 2.2;
  l.group.position.y = -TERRACE_HEIGHT;
  return l.group;
};

export type Apron = { group: THREE.Group; civilians: Civilian[] };

/** Build the apron for a `cols` × `rows` board centred on the origin. */
export const makeApron = (cols: number, rows: number, theme: Theme, slabDepth: number, seed: number): Apron => {
  const g = new THREE.Group();
  const civilians: Civilian[] = [];
  const r = rng(seed);
  const paving = matte(PAVING[theme], 0.9);

  // Paving slabs, flush with the board top
  const front = new THREE.Mesh(rbox(cols + APRON + 0.1, slabDepth, APRON, 0.04), paving);
  front.position.set(APRON / 2, -slabDepth / 2, rows / 2 + APRON / 2 + 0.05);
  const right = new THREE.Mesh(rbox(APRON, slabDepth, rows + 0.1, 0.04), paving);
  right.position.set(cols / 2 + APRON / 2 + 0.05, -slabDepth / 2, 0);
  for (const m of [front, right]) {
    m.receiveShadow = true;
    m.castShadow = true;
    g.add(m);
  }
  // Kerb lines between board and apron
  const kerbMat = MAT.plasterBase;
  const kerbF = new THREE.Mesh(rbox(cols + 0.1, 0.03, 0.06, 0.01), kerbMat);
  kerbF.position.set(0, 0.015, rows / 2 + 0.08);
  const kerbR = new THREE.Mesh(rbox(0.06, 0.03, rows + 0.1, 0.01), kerbMat);
  kerbR.position.set(cols / 2 + 0.08, 0.015, 0);
  g.add(kerbF, kerbR);

  const garden = theme === 'garden' || theme === 'cellar';
  const makers = garden
    ? [pair, single, palm, lamp, pair]
    : [pair, cafe, palm, single, lamp, cafe, pair];
  const place = (x: number, z: number, i: number) => {
    const make = makers[(i + Math.floor(r() * 2)) % makers.length];
    if (!make) return;
    const item = make(seed + i * 7, civilians);
    item.position.x += x;
    item.position.z += z;
    g.add(item);
  };

  // Along the front
  let i = 0;
  for (let x = -cols / 2 + HOLD_WIDTH + 0.5; x < cols / 2 + APRON - 0.5; x += 1.35) {
    place(x, rows / 2 + SET_BACK + 0.1, i++);
  }
  // Along the right, with a parked car if the street suits it
  for (let z = -rows / 2 + 0.8; z < rows / 2 - 0.4; z += 1.45) {
    place(cols / 2 + SET_BACK + 0.1, z, i++);
  }
  if (!garden) {
    const car = prop(r() < 0.5 ? 'car_sedan' : 'car_taxi', 1.25);
    if (car) {
      car.position.set(cols / 2 + APRON - 0.45, 0, -rows / 2 + 0.9);
      car.rotation.y = Math.PI / 2;
      g.add(car);
    }
  }
  // A painted box marks the holding area
  const [canvas, ctx] = makeCanvas(512, 200);
  ctx.strokeStyle = 'rgba(179,38,30,0.85)';
  ctx.lineWidth = 8;
  ctx.setLineDash([22, 14]);
  ctx.strokeRect(10, 10, 492, 180);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(179,38,30,0.85)';
  ctx.font = 'bold 44px Courier New, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('KNOCKED OUT', 256, 175);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mark = new THREE.Mesh(
    new THREE.PlaneGeometry(HOLD_WIDTH - 0.2, 0.98),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.9 })
  );
  mark.rotation.x = -Math.PI / 2;
  mark.position.set(-cols / 2 + (HOLD_WIDTH - 0.2) / 2 + 0.1, 0.004, rows / 2 + APRON * 0.55);
  mark.receiveShadow = true;
  g.add(mark);
  return { group: g, civilians };
};
