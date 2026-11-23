import * as THREE from 'three';
import { bakeInPlace, keepDynamic } from './bake';
import {
  type Guard,
  type Thief,
  MAT,
  beamMaterial,
  pieceBase,
  rbox,
  shadowed,
  textTexture,
  varnish,
} from './models';

// Hush's figurines, built like painted board-game pieces: realistic
// proportions, rounded limbs, bold silhouettes. Built facing +X, standing on
// a 0.05-high base; the figure's right is +Z.

const capsule = (r: number, len: number, mat: THREE.Material) =>
  new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 10), mat);
// Segment counts are kept low: figurines are small on screen, and phones
// have to draw a dozen of them plus shadows.
const sphere = (r: number, mat: THREE.Material) => new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
const cyl = (r1: number, r2: number, len: number, mat: THREE.Material, open = false) =>
  new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 14, 1, open), mat);
const lathe = (pts: [number, number][], mat: THREE.Material, depth = 0.66) => {
  const m = new THREE.Mesh(
    new THREE.LatheGeometry(
      pts.map(([x, y]) => new THREE.Vector2(x, y)),
      18
    ),
    mat
  );
  m.scale.set(depth, 1, 1);
  return m;
};

const eye = varnish(0x15100c, 0.2, 1);
const brow = varnish(0x2a1d14, 0.7, 0.1);
const black = varnish(0x0f0f11, 0.35, 0.9);
const glove = varnish(0x141416, 0.45, 0.7);
const leather = varnish(0x3a2616, 0.5, 0.5);
const crimson = varnish(0xa3202d, 0.5, 0.5);
const trousers = varnish(0x22242a, 0.6, 0.3);
const rib = varnish(0x1b1c20, 0.7, 0.2);

const SKINS = [0xdcae8e, 0xc58c64, 0x8d5a3b, 0xf0c9a8];
const skins = SKINS.map((c) => varnish(c, 0.6, 0.25));

/* ------------------------------------------------------------- anatomy */

/** Thighs, knees, shins and shoes. Hips at y ≈ 0.48. */
const legs = (pants: THREE.Material, shoes: THREE.Material) => {
  const g = new THREE.Group();
  const hips = sphere(0.085, pants);
  hips.scale.set(0.68, 0.5, 1);
  hips.position.y = 0.475;
  g.add(hips);
  for (const z of [-0.045, 0.045]) {
    const thigh = capsule(0.041, 0.15, pants);
    thigh.position.set(0, 0.375, z);
    const shin = capsule(0.034, 0.16, pants);
    shin.position.set(0.004, 0.175, z);
    const shoe = new THREE.Mesh(rbox(0.12, 0.042, 0.06, 0.018), shoes);
    shoe.position.set(0.026, 0.071, z);
    g.add(thigh, shin, shoe);
  }
  return g;
};

type Arm = { shoulder: THREE.Group; hand: THREE.Group };

/** An arm on a shoulder pivot. `raise` swings it forward, `bend` bends the elbow. */
const arm = (side: 1 | -1, sleeve: THREE.Material, hand: THREE.Material, raise: number, bend: number): Arm => {
  const shoulder = new THREE.Group();
  shoulder.position.set(0, 0.712, side * 0.118);
  const cap = sphere(0.046, sleeve);
  const upper = capsule(0.033, 0.12, sleeve);
  upper.position.y = -0.08;
  const elbow = new THREE.Group();
  elbow.position.y = -0.165;
  const fore = capsule(0.028, 0.11, sleeve);
  fore.position.y = -0.07;
  const handAnchor = new THREE.Group();
  handAnchor.position.y = -0.155;
  const palm = sphere(0.029, hand);
  palm.scale.set(0.82, 1.2, 0.62);
  handAnchor.add(palm);
  elbow.add(fore, handAnchor);
  shoulder.add(cap, upper, elbow);
  shoulder.rotation.z = raise;
  shoulder.rotation.x = -side * 0.1;
  elbow.rotation.z = bend;
  return { shoulder, hand: handAnchor };
};

/** Neck and head with a face. Returns the head group, centred at y 0.865. */
const headOn = (g: THREE.Group, skinMat: THREE.Material) => {
  const neck = cyl(0.026, 0.03, 0.06, skinMat);
  neck.position.y = 0.79;
  g.add(neck);
  const h = new THREE.Group();
  h.position.y = 0.868;
  const skull = sphere(0.064, skinMat);
  skull.scale.set(0.95, 1.08, 0.9);
  const jaw = sphere(0.049, skinMat);
  jaw.position.set(0.016, -0.032, 0);
  jaw.scale.set(1, 0.78, 0.92);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.032, 10), skinMat);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(0.066, -0.006, 0);
  h.add(skull, jaw, nose);
  for (const z of [-0.023, 0.023]) {
    const e = sphere(0.0078, eye);
    e.position.set(0.054, 0.012, z);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.007, 0.024), brow);
    b.position.set(0.058, 0.028, z);
    const ear = sphere(0.015, skinMat);
    ear.scale.set(0.55, 1, 0.5);
    ear.position.set(-0.004, 0, z * 2.7);
    h.add(e, b, ear);
  }
  g.add(h);
  return h;
};

/* ----------------------------------------------------------------- Wren */

const COAT = varnish(0x30343c, 0.55, 0.5);
const COAT_DARK = varnish(0x24272d, 0.6, 0.4);

/**
 * Wren, a noir cat burglar: black fedora with a red band, belted charcoal
 * trench coat with lapels and a raised collar, red scarf, gloves, lantern.
 */
export const noirThief = (): Thief => {
  const g = new THREE.Group();
  g.add(pieceBase(MAT.gold));
  g.add(legs(trousers, black));

  // Trench coat in one piece: flared skirt to below the knee, up to the shoulders
  const coat = lathe(
    [
      [0, 0.2],
      [0.135, 0.2],
      [0.118, 0.32],
      [0.098, 0.48],
      [0.096, 0.58],
      [0.116, 0.69],
      [0.082, 0.765],
      [0, 0.77],
    ],
    COAT,
    0.72
  );
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.013, 6, 20), leather);
  belt.scale.set(0.72, 1, 1);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.5;
  const buckle = new THREE.Mesh(rbox(0.01, 0.028, 0.034, 0.004), MAT.gold);
  buckle.position.set(0.072, 0.5, 0);
  g.add(coat, belt, buckle);
  // Lapels in a V and two buttons
  for (const side of [-1, 1]) {
    const lapel = new THREE.Mesh(rbox(0.012, 0.13, 0.04, 0.005), COAT_DARK);
    lapel.position.set(0.075, 0.665, side * 0.03);
    lapel.rotation.x = side * 0.28;
    g.add(lapel);
  }
  for (const y of [0.56, 0.44]) {
    const button = sphere(0.007, black);
    button.position.set(0.07, y, 0.025);
    g.add(button);
  }
  const collar = cyl(0.058, 0.078, 0.075, COAT_DARK, true);
  collar.position.y = 0.79;
  g.add(collar);

  const leftArm = arm(-1, COAT, glove, 0.1, 0.12);
  const rightArm = arm(1, COAT, glove, 0.55, 0.3);
  g.add(leftArm.shoulder, rightArm.shoulder);

  const h = headOn(g, skins[0] ?? MAT.skin);
  const hair = sphere(0.066, varnish(0x1c1410, 0.7, 0.1));
  hair.scale.set(0.95, 0.7, 0.92);
  hair.position.set(-0.012, 0.02, 0);
  h.add(hair);

  // Fedora, tipped forward a touch
  const hat = new THREE.Group();
  const brim = cyl(0.112, 0.112, 0.008, black);
  const crown = cyl(0.062, 0.07, 0.07, black);
  crown.position.y = 0.036;
  const band = cyl(0.0705, 0.0705, 0.018, crimson);
  band.position.y = 0.012;
  const dent = new THREE.Mesh(rbox(0.06, 0.012, 0.014, 0.004), black);
  dent.position.y = 0.072;
  hat.add(brim, crown, band, dent);
  hat.position.set(0.004, 0.052, 0);
  hat.rotation.z = -0.1;
  h.add(hat);

  // Scarf with a tail blowing back
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.018, 6, 16), crimson);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.792;
  const tail = new THREE.Mesh(rbox(0.032, 0.15, 0.015, 0.006), crimson);
  tail.position.set(-0.07, 0.72, 0.03);
  tail.rotation.set(0.2, 0, 0.35);
  g.add(scarf, tail);

  // Lantern hanging from the right hand
  const lanternGroup = new THREE.Group();
  const cage = new THREE.Mesh(rbox(0.052, 0.072, 0.052, 0.008), MAT.brass);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.05, 0.058), MAT.lanternGlow);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 12, Math.PI), MAT.brass);
  handle.position.y = 0.045;
  lanternGroup.add(cage, glass, handle);
  lanternGroup.position.y = -0.065;
  rightArm.hand.add(lanternGroup);
  const lantern = new THREE.PointLight(0xffb45a, 1.2, 2.2, 1.6);
  lantern.position.y = -0.06;
  rightArm.hand.add(lantern);

  // Disguise: the guards' orange jacket, no hat
  const coatMeshes: THREE.Mesh[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === COAT) coatMeshes.push(o);
  });
  const setDisguise = (on: boolean) => {
    hat.visible = !on;
    for (const m of coatMeshes) m.material = on ? MAT.jacket : COAT;
  };

  return { group: shadowed(g), lantern, setDisguise, rigs: [] };
};

/* --------------------------------------------------------------- guards */

const JACKETS = [0xe8912e, 0x2f9e9a, 0xd8b23a, 0x4a7fc1].map((c) => varnish(c, 0.5, 0.45));
const HAIR = [0x2a1d14, 0x4a3524, 0x111111, 0x6b6560].map((c) => varnish(c, 0.7, 0.1));

/**
 * A guard: broad build, bomber jacket in a strong solid colour with a zipper,
 * ribbed collar and cuffs, belt, radio, and a flashlight raised forward.
 * `variant` changes the jacket colour, skin tone and hairstyle.
 */
export const guardFigure = (variant = 0): Guard => {
  const g = new THREE.Group();
  g.add(pieceBase(MAT.dangerRim));
  const jacket = JACKETS[variant % JACKETS.length] ?? MAT.jacket;
  const skinMat = skins[(variant + 1) % skins.length] ?? MAT.skin;
  g.add(legs(trousers, black));

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.084, 0.012, 6, 20), black);
  belt.scale.set(0.66, 1, 1);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.47;
  const buckle = new THREE.Mesh(rbox(0.01, 0.024, 0.032, 0.004), MAT.steel);
  buckle.position.set(0.058, 0.47, 0);
  g.add(belt, buckle);

  // Bomber jacket: puffed body, ribbed hem and collar, zip down the front
  const body = lathe(
    [
      [0, 0.49],
      [0.09, 0.49],
      [0.1, 0.56],
      [0.104, 0.64],
      [0.122, 0.7],
      [0.082, 0.765],
      [0, 0.77],
    ],
    jacket,
    0.68
  );
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.014, 6, 20), rib);
  hem.scale.set(0.68, 1, 1);
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.5;
  const collar = cyl(0.05, 0.062, 0.04, rib, true);
  collar.position.y = 0.782;
  const zip = new THREE.Mesh(rbox(0.006, 0.26, 0.01, 0.002), rib);
  zip.position.set(0.07, 0.635, 0);
  const radio = new THREE.Mesh(rbox(0.024, 0.045, 0.02, 0.005), black);
  radio.position.set(0.055, 0.69, -0.065);
  const antenna = cyl(0.003, 0.003, 0.04, black);
  antenna.position.set(0.055, 0.73, -0.072);
  const badge = new THREE.Mesh(cyl(0.012, 0.012, 0.005, MAT.gold).geometry, MAT.gold);
  badge.rotation.z = Math.PI / 2;
  badge.position.set(0.072, 0.67, 0.04);
  g.add(body, hem, collar, zip, radio, antenna, badge);

  const leftArm = arm(-1, jacket, skinMat, 0.08, 0.12);
  const rightArm = arm(1, jacket, skinMat, 1.05, 0.38);
  for (const a of [leftArm, rightArm]) {
    const cuff = cyl(0.031, 0.031, 0.025, rib);
    cuff.position.y = -0.03;
    a.hand.add(cuff);
  }
  g.add(leftArm.shoulder, rightArm.shoulder);

  const h = headOn(g, skinMat);
  const hairMat = HAIR[variant % HAIR.length] ?? HAIR[0]!;
  const style = variant % 4;
  if (style === 0) {
    // Short crop
    const hair = sphere(0.067, hairMat);
    hair.scale.set(0.96, 0.72, 0.93);
    hair.position.set(-0.01, 0.024, 0);
    h.add(hair);
  } else if (style === 1) {
    // Buzz cut with a moustache
    const hair = sphere(0.066, hairMat);
    hair.scale.set(0.94, 0.62, 0.92);
    hair.position.set(-0.012, 0.028, 0);
    const tache = new THREE.Mesh(rbox(0.01, 0.01, 0.04, 0.004), hairMat);
    tache.position.set(0.063, -0.022, 0);
    h.add(hair, tache);
  } else if (style === 2) {
    // Side part with a quiff
    const hair = sphere(0.068, hairMat);
    hair.scale.set(0.97, 0.74, 0.94);
    hair.position.set(-0.008, 0.026, 0);
    const quiff = sphere(0.03, hairMat);
    quiff.scale.set(1.3, 0.7, 1.4);
    quiff.position.set(0.04, 0.062, -0.012);
    h.add(hair, quiff);
  } else {
    // Shaved head with a beard
    const beard = sphere(0.05, hairMat);
    beard.scale.set(0.9, 0.7, 0.95);
    beard.position.set(0.018, -0.036, 0);
    h.add(beard);
  }

  // Flashlight in the raised right hand, pointing forward
  const torch = new THREE.Group();
  const tube = cyl(0.016, 0.02, 0.1, MAT.steel);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16), MAT.lens);
  lens.position.y = 0.051;
  lens.rotation.x = -Math.PI / 2;
  torch.add(tube, lens);
  torch.rotation.z = -Math.PI / 2 + 1.43;
  rightArm.hand.add(torch);

  // The beam starts at the hand, in the figurine's own space.
  g.updateMatrixWorld(true);
  const handPos = rightArm.hand.getWorldPosition(new THREE.Vector3());
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1, 32, 1, true), beamMaterial());
  beam.rotation.z = Math.PI / 2;
  beam.position.set(handPos.x + 0.05, handPos.y - 0.04, handPos.z);
  beam.userData.tipX = handPos.x + 0.05;
  beam.renderOrder = 5;
  const spot = new THREE.SpotLight(0xfff0d0, 7, 3.6, 0.42, 0.55, 1.2);
  g.add(beam);

  const alert = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textTexture('?', '#f2c14e', 'rgba(0,0,0,0)', 96, 96),
      depthTest: false,
      transparent: true,
    })
  );
  alert.scale.set(0.3, 0.3, 1);
  alert.position.set(0, 1.12, 0);
  alert.visible = false;
  alert.renderOrder = 10;
  g.add(alert);

  shadowed(g);
  beam.castShadow = false;
  beam.receiveShadow = false;
  keepDynamic(beam);
  bakeInPlace(g);
  return { group: g, beam, spot, alert, dog: false, rigs: [] };
};

/* ------------------------------------------------------------ civilians */

export type Civilian = {
  group: THREE.Group;
  /** Turned a little now and then so the crowd feels alive */
  head: THREE.Object3D;
};

const cloth = (c: number) => varnish(c, 0.6, 0.35);
const white = cloth(0xeeeae2);
const HAIRS = [0x2a1d14, 0x7a4a24, 0x111111, 0xc9a464, 0x6b6560].map((c) => varnish(c, 0.7, 0.1));

/** Hair: a cap of colour, optionally with a bun. */
const hairOn = (h: THREE.Object3D, mat: THREE.Material, bun = false) => {
  const hair = sphere(0.067, mat);
  hair.scale.set(0.96, 0.74, 0.93);
  hair.position.set(-0.01, 0.024, 0);
  h.add(hair);
  if (bun) {
    const b = sphere(0.03, mat);
    b.position.set(-0.05, 0.05, 0);
    h.add(b);
  }
};

/**
 * A bystander figurine — not part of the puzzle, just life on the model,
 * like the party guests in Hitman GO. Stands on the model with no base.
 * `kind` picks the outfit; `seated` bends the legs to sit on a chair.
 */
export const makeCivilian = (kind: number, seed = 0, seated = false): Civilian => {
  const g = new THREE.Group();
  const skinMat = skins[seed % skins.length] ?? MAT.skin;
  const hairMat = HAIRS[(seed + kind) % HAIRS.length] ?? HAIRS[0]!;
  const outfit = kind % 6;

  // Legs: standing, or bent at the hip and knee to sit
  const pantsMat =
    outfit === 1 ? white : outfit === 5 ? cloth(0xc9b48a) : outfit === 2 ? skinMat : trousers;
  if (seated) {
    const lg = new THREE.Group();
    for (const z of [-0.045, 0.045]) {
      const thigh = capsule(0.041, 0.14, pantsMat);
      thigh.rotation.z = Math.PI / 2;
      thigh.position.set(0.09, 0.3, z);
      const shin = capsule(0.034, 0.14, pantsMat);
      shin.position.set(0.18, 0.17, z);
      const shoe = new THREE.Mesh(rbox(0.11, 0.04, 0.06, 0.016), black);
      shoe.position.set(0.2, 0.04, z);
      lg.add(thigh, shin, shoe);
    }
    g.add(lg);
  } else {
    g.add(legs(pantsMat, black));
  }

  // Body by outfit
  let torsoMat: THREE.Material;
  if (outfit === 0) {
    // Lady in a long red coat
    torsoMat = cloth(0xb3261e);
    if (!seated) {
      g.add(lathe([[0, 0.22], [0.13, 0.22], [0.105, 0.48], [0.098, 0.6], [0.11, 0.7], [0.075, 0.765], [0, 0.77]], torsoMat, 0.72));
    }
  } else if (outfit === 1) {
    torsoMat = white;
  } else if (outfit === 2) {
    // Cocktail dress
    torsoMat = cloth([0x2f9e9a, 0xd8b23a, 0x6f5f9e][seed % 3] ?? 0x2f9e9a);
    if (!seated) g.add(lathe([[0, 0.3], [0.14, 0.3], [0.09, 0.5], [0.08, 0.6]], torsoMat, 0.8));
  } else if (outfit === 3) {
    // Waiter: white shirt, black waistcoat
    torsoMat = white;
  } else if (outfit === 4) {
    torsoMat = cloth(0x3a3f4a);
  } else {
    // Tourist in a loud shirt
    torsoMat = cloth(0xe8912e);
  }
  const body = lathe(
    [
      [0, 0.47],
      [0.085, 0.47],
      [0.08, 0.55],
      [0.092, 0.63],
      [0.112, 0.7],
      [0.078, 0.765],
      [0, 0.77],
    ],
    torsoMat,
    0.66
  );
  if (seated) body.position.y = -0.17;
  g.add(body);
  if (outfit === 3) {
    const vest = lathe([[0, 0.5], [0.09, 0.5], [0.095, 0.64], [0.1, 0.7], [0, 0.71]], black, 0.69);
    g.add(vest);
  }

  // Arms: the waiter holds a tray up; others hang or gesture
  const sleeve = outfit === 2 ? skinMat : torsoMat;
  const left = arm(-1, sleeve, skinMat, outfit === 3 ? 0.4 : 0.06, outfit === 3 ? 1.4 : 0.15);
  const right = arm(1, sleeve, skinMat, outfit === 5 ? 0.9 : 0.12, outfit === 5 ? 0.9 : 0.2);
  if (seated) {
    left.shoulder.position.y -= 0.17;
    right.shoulder.position.y -= 0.17;
  }
  g.add(left.shoulder, right.shoulder);
  if (outfit === 3) {
    const tray = cyl(0.07, 0.07, 0.008, MAT.steel);
    tray.position.y = 0.01;
    const glass = cyl(0.012, 0.009, 0.04, MAT.lanternGlow);
    glass.position.set(0.02, 0.03, 0);
    left.hand.add(tray, glass);
  }

  const headGroup = new THREE.Group();
  if (seated) headGroup.position.y = -0.17;
  g.add(headGroup);
  const h = headOn(headGroup, skinMat);
  hairOn(h, hairMat, outfit === 0 || outfit === 2);
  if (outfit === 1) {
    // Panama hat for the man in white
    const brim = cyl(0.1, 0.1, 0.008, cloth(0xe7dcc0));
    brim.position.y = 0.05;
    const crown = cyl(0.058, 0.064, 0.05, cloth(0xe7dcc0));
    crown.position.y = 0.075;
    const band = cyl(0.065, 0.065, 0.012, black);
    band.position.y = 0.06;
    h.add(brim, crown, band);
  }
  if (outfit === 5) {
    const shades = new THREE.Mesh(rbox(0.012, 0.018, 0.08, 0.004), black);
    shades.position.set(0.06, 0.012, 0);
    h.add(shades);
  }
  // Merge the figure's many small parts; the head stays separate so it can turn.
  shadowed(g);
  bakeInPlace(h);
  keepDynamic(h);
  bakeInPlace(g);
  keepDynamic(g);
  return { group: g, head: h };
};

/**
 * The boss: a Gilded Circle lieutenant in a white suit and panama, on a gold
 * and red base, with a gold target marker so players know who to catch.
 */
export const bossFigure = (): Guard => {
  const g = new THREE.Group();
  g.add(pieceBase(MAT.gold));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.012, 6, 28), MAT.dangerRim);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  const figure = makeCivilian(1, 3);
  figure.group.position.y = 0.05;
  g.add(figure.group);

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
  alert.position.set(0, 1.12, 0);
  alert.visible = false;
  alert.renderOrder = 10;
  // A gold target marker floating overhead
  const target = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textTexture('◎', '#f2c14e', 'rgba(0,0,0,0)', 96, 96),
      depthTest: false,
      transparent: true,
    })
  );
  target.name = 'target';
  target.scale.set(0.32, 0.32, 1);
  target.position.set(0, 1.18, 0);
  target.renderOrder = 10;
  g.add(beam, alert, target);
  keepDynamic(beam);
  shadowed(g);
  // `dog: true` here only means "no flashlight beam"; the boss sees like a guard.
  return { group: g, beam, spot, alert, dog: true, rigs: [] };
};
