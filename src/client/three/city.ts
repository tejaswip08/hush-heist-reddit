import * as THREE from 'three';
import { makeCanvas, rng } from '../art';
import { type PropName, prop } from './assets';
import { MAT, matte, rbox } from './models';

// The night city the house stands in: asphalt streets, a sidewalk around the
// lot, street lamps, and blocks of buildings with a few windows still lit.
// Buildings on the camera's side are left out so nothing hides the board.

/** Windows for one building, a few lit. Returns [colour map, glow map]. */
const facade = (cols: number, floors: number, seed: number): [THREE.CanvasTexture, THREE.CanvasTexture] => {
  const r = rng(seed);
  const cell = 16;
  const [canvas, ctx] = makeCanvas(cols * cell, floors * cell);
  const [glowCanvas, glow] = makeCanvas(cols * cell, floors * cell);
  const tones = ['#4a4e57', '#55504a', '#434a54', '#524a48'];
  ctx.fillStyle = tones[Math.floor(r() * tones.length)] ?? '#2a2c31';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  glow.fillStyle = '#000';
  glow.fillRect(0, 0, canvas.width, canvas.height);
  for (let f = 0; f < floors; f++) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, f * cell + cell - 2, canvas.width, 2);
    for (let c = 0; c < cols; c++) {
      const x = c * cell + 4;
      const y = f * cell + 3;
      const lit = r() < 0.12;
      const warm = r() < 0.75;
      ctx.fillStyle = lit ? (warm ? '#d9a95a' : '#9fb8d6') : '#0d0f13';
      ctx.fillRect(x, y, 8, 9);
      if (lit) {
        glow.fillStyle = warm ? '#ffb35c' : '#8fb4ff';
        glow.fillRect(x, y, 8, 9);
      }
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.NearestFilter;
  const emissive = new THREE.CanvasTexture(glowCanvas);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.magFilter = THREE.NearestFilter;
  return [map, emissive];
};

const asphaltTexture = () => {
  const [canvas, ctx] = makeCanvas(256, 256);
  const r = rng(3);
  ctx.fillStyle = '#16181c';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    const g = 20 + Math.floor(r() * 25);
    ctx.fillStyle = `rgb(${g},${g},${g + 3})`;
    ctx.fillRect(r() * 256, r() * 256, 2, 2);
  }
  // Puddles catch a little more light
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = 'rgba(70,80,95,0.25)';
    ctx.beginPath();
    ctx.ellipse(r() * 256, r() * 256, 10 + r() * 20, 5 + r() * 10, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
};

const streetLamp = () => {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.2, 8), MAT.ironBlack);
  pole.position.y = 1.1;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), MAT.ironBlack);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.22, 2.15, 0);
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 0.08, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe1a8, emissive: 0xffb860, emissiveIntensity: 2.5 })
  );
  head.position.set(0.45, 2.1, 0);
  g.add(pole, arm, head);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
};

/**
 * Build the city around a board of `cols` × `rows` tiles whose base sits at
 * `groundY`. `toCamera` is the horizontal direction the camera looks from.
 */
export const makeCity = (cols: number, rows: number, groundY: number, toCamera: THREE.Vector2, mobile: boolean) => {
  const g = new THREE.Group();
  const r = rng(cols * 7 + rows);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 140),
    new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.55, metalness: 0.1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY - 0.002;
  ground.receiveShadow = true;
  g.add(ground);

  // Sidewalk around the lot, with a kerb
  const lotW = cols + 1.6;
  const lotD = rows + 1.6;
  const walk = new THREE.Mesh(rbox(lotW, 0.08, lotD, 0.03), matte(0x55555a, 0.9));
  walk.position.y = groundY + 0.04;
  walk.receiveShadow = true;
  g.add(walk);

  // Dashed road markings around the block
  const dashMat = new THREE.MeshBasicMaterial({ color: 0x8a8460 });
  const ringW = lotW / 2 + 1.6;
  const ringD = lotD / 2 + 1.6;
  for (let x = -ringW; x <= ringW; x += 0.9) {
    for (const z of [-ringD, ringD]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.06), dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, groundY + 0.001, z);
      g.add(d);
    }
  }
  for (let z = -ringD; z <= ringD; z += 0.9) {
    for (const x of [-ringW, ringW]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.45), dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, groundY + 0.001, z);
      g.add(d);
    }
  }

  // Street lamps on the sidewalk corners
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const lamp = streetLamp();
    lamp.position.set(sx * (lotW / 2 - 0.25), groundY + 0.08, sz * (lotD / 2 - 0.25));
    lamp.rotation.y = Math.atan2(sz, -sx);
    g.add(lamp);
  }

  // City blocks: a grid of lots, skipping the street ring and the camera side
  const roof = matte(0x1b1c20, 0.9);
  const lot = 3.2;
  const clearW = ringW + 1.3;
  const clearD = ringD + 1.3;
  const reach = mobile ? 20 : 28;
  for (let gx = -reach; gx <= reach; gx += lot) {
    for (let gz = -reach; gz <= reach; gz += lot) {
      if (Math.abs(gx) < clearW + lot / 2 && Math.abs(gz) < clearD + lot / 2) continue;
      const along = new THREE.Vector2(gx, gz).normalize().dot(toCamera);
      if (along > 0.35) continue;
      if (r() < 0.15) continue;
      // The first ring of lots gets detailed KayKit buildings.
      const inner = Math.abs(gx) < clearW + lot * 1.6 && Math.abs(gz) < clearD + lot * 1.6;
      if (inner) {
        const kind = BUILDINGS[Math.floor(r() * BUILDINGS.length)] ?? 'building_A_withoutBase';
        const bld = prop(kind, lot * 0.82);
        if (bld) {
          bld.position.set(gx, groundY, gz);
          // Face the street (toward the house).
          bld.rotation.y = Math.round(Math.atan2(-gx, -gz) / (Math.PI / 2)) * (Math.PI / 2);
          g.add(bld);
          continue;
        }
      }
      const w = lot * (0.6 + r() * 0.3);
      const d = lot * (0.6 + r() * 0.3);
      const far = Math.hypot(gx, gz);
      const h = 1.5 + r() * (far > 14 ? 9 : 6) * (along < -0.5 ? 1.2 : 0.8);
      const [map, emissiveMap] = facade(Math.max(2, Math.round(w * 3)), Math.max(2, Math.round(h * 3)), Math.round(gx * 97 + gz * 13));
      const wall = new THREE.MeshStandardMaterial({
        map,
        emissive: 0xffffff,
        emissiveMap,
        emissiveIntensity: 1.6,
        roughness: 0.85,
      });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wall, wall, roof, roof, wall, wall]);
      b.position.set(gx + (r() - 0.5) * 0.4, groundY + h / 2, gz + (r() - 0.5) * 0.4);
      b.castShadow = !mobile;
      b.receiveShadow = true;
      g.add(b);
      if (r() < 0.4) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 10), roof);
        tank.position.set(b.position.x + (r() - 0.5) * w * 0.5, groundY + h + 0.25, b.position.z + (r() - 0.5) * d * 0.5);
        g.add(tank);
      }
    }
  }
  // Parked cars along the far and side streets, and clutter on the sidewalk
  const cars: PropName[] = ['car_sedan', 'car_taxi', 'car_police', 'car_hatchback'];
  const spots: [number, number, number][] = [];
  for (let x = -ringW + 1; x < ringW - 1; x += 2.4) spots.push([x, -ringD + 0.55, 0]);
  for (let z = -ringD + 1.5; z < ringD - 1; z += 2.4) {
    spots.push([-ringW + 0.55, z, Math.PI / 2]);
    spots.push([ringW - 0.55, z, Math.PI / 2]);
  }
  for (const [x, z, rot] of spots) {
    const along = new THREE.Vector2(x, z).normalize().dot(toCamera);
    if (along > 0.2 || r() < 0.45) continue;
    const car = prop(cars[Math.floor(r() * cars.length)] ?? 'car_sedan', 1.1);
    if (!car) continue;
    car.position.set(x, groundY, z);
    car.rotation.y = rot + (r() < 0.5 ? 0 : Math.PI);
    g.add(car);
  }
  const clutter: [PropName, number, number, number][] = [
    ['dumpster', 0.7, -lotW / 2 + 0.5, -lotD / 2 - 0.35],
    ['trash_A', 0.3, -lotW / 2 + 1.2, -lotD / 2 - 0.3],
    ['firehydrant', 0.22, lotW / 2 - 0.9, -lotD / 2 - 0.3],
    ['trash_A', 0.3, -lotW / 2 - 0.3, -lotD / 2 + 1.4],
  ];
  for (const [name, size, x, z] of clutter) {
    const o = prop(name, size);
    if (!o) continue;
    o.position.set(x, groundY + 0.08, z);
    g.add(o);
  }
  return g;
};

const BUILDINGS: PropName[] = [
  'building_A_withoutBase',
  'building_B_withoutBase',
  'building_C_withoutBase',
  'building_D_withoutBase',
  'building_E_withoutBase',
  'building_F_withoutBase',
  'building_G_withoutBase',
  'building_H_withoutBase',
];

/** Slanted rain streaks that fall forever in a box around the board. */
export class Rain {
  readonly mesh: THREE.LineSegments;
  private positions: Float32Array;
  private count: number;
  private span = { x: 26, y: 14, z: 26 };

  constructor(count: number, private floorY: number) {
    this.count = count;
    this.positions = new Float32Array(count * 6);
    const r = rng(99);
    for (let i = 0; i < count; i++) this.reset(i, r() * this.span.y, r);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.mesh = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xa8b8d0, transparent: true, opacity: 0.32, depthWrite: false })
    );
    this.mesh.frustumCulled = false;
  }

  private reset(i: number, y: number, r: () => number) {
    const x = (r() - 0.5) * this.span.x;
    const z = (r() - 0.5) * this.span.z;
    const p = this.positions;
    p[i * 6] = x;
    p[i * 6 + 1] = this.floorY + y;
    p[i * 6 + 2] = z;
    p[i * 6 + 3] = x + 0.06;
    p[i * 6 + 4] = this.floorY + y + 0.38;
    p[i * 6 + 5] = z;
  }

  /** 0 = dry, 1 = full shower: fewer, fainter streaks as it eases off. */
  setAmount(amount: number) {
    const a = Math.max(0, Math.min(1, amount));
    this.mesh.visible = a > 0.01;
    this.mesh.geometry.setDrawRange(0, Math.floor(this.count * a) * 2);
    const mat = this.mesh.material;
    if (mat instanceof THREE.LineBasicMaterial) mat.opacity = 0.32 * Math.min(1, a * 1.5);
  }

  update(dt: number) {
    if (!this.mesh.visible) return;
    const p = this.positions;
    const fall = 16 * dt;
    for (let i = 0; i < this.count; i++) {
      p[i * 6 + 1]! -= fall;
      p[i * 6 + 4]! -= fall;
      p[i * 6]! -= fall * 0.06;
      p[i * 6 + 3]! -= fall * 0.06;
      if ((p[i * 6 + 1] ?? 0) < this.floorY) this.reset(i, this.span.y, Math.random);
    }
    const attr = this.mesh.geometry.getAttribute('position');
    attr.needsUpdate = true;
  }
}
