import * as THREE from 'three';
import { type CharacterRig, character } from './assets';
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

// Figurines with proper anatomy: jointed legs and arms, hands, a shaped torso,
// and a face. Built facing +X, standing on a 0.05-high base; right is +Z.

type Mats = {
  legs: THREE.Material;
  shoes: THREE.Material;
  torso: THREE.Material;
  sleeves: THREE.Material;
  hands: THREE.Material;
};

const skin = MAT.skin;
const eyeMat = varnish(0x111111, 0.2, 1);
const glove = varnish(0x141416, 0.45, 0.7);
const leather = varnish(0x3a2616, 0.5, 0.5);

const limb = (r1: number, r2: number, len: number, mat: THREE.Material) =>
  new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 18), mat);

const ball = (r: number, mat: THREE.Material) => new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat);

/** Thighs, knees, shins and shoes. Hips sit at y ≈ 0.485. */
const legs = (m: Mats) => {
  const g = new THREE.Group();
  for (const z of [-0.043, 0.043]) {
    const thigh = limb(0.037, 0.03, 0.2, m.legs);
    thigh.position.set(0, 0.385, z);
    const knee = ball(0.031, m.legs);
    knee.position.set(0.004, 0.285, z);
    const shin = limb(0.03, 0.024, 0.2, m.legs);
    shin.position.set(0, 0.185, z);
    const shoe = new THREE.Mesh(rbox(0.105, 0.036, 0.052, 0.014), m.shoes);
    shoe.position.set(0.022, 0.068, z);
    g.add(thigh, knee, shin, shoe);
  }
  return g;
};

/** Shaped torso from hips to shoulders, a little deeper than wide. */
const torso = (mat: THREE.Material) => {
  const t = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0, 0.47],
        [0.082, 0.47],
        [0.078, 0.55],
        [0.088, 0.64],
        [0.104, 0.705],
        [0.07, 0.755],
        [0, 0.76],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      32
    ),
    mat
  );
  t.scale.set(0.66, 1, 1);
  return t;
};

type Arm = { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Object3D };

/** An arm hanging from a shoulder pivot; rotate `shoulder.rotation.z` to raise it forward. */
const arm = (side: 1 | -1, m: Mats, raise: number, bend: number): Arm => {
  const shoulder = new THREE.Group();
  shoulder.position.set(0, 0.715, side * 0.108);
  const cap = ball(0.04, m.sleeves);
  const upper = limb(0.029, 0.025, 0.17, m.sleeves);
  upper.position.y = -0.085;
  const elbow = new THREE.Group();
  elbow.position.y = -0.17;
  const joint = ball(0.025, m.sleeves);
  const fore = limb(0.025, 0.021, 0.16, m.sleeves);
  fore.position.y = -0.08;
  const hand = ball(0.025, m.hands);
  hand.scale.set(0.8, 1.25, 0.62);
  hand.position.y = -0.175;
  elbow.add(joint, fore, hand);
  shoulder.add(cap, upper, elbow);
  shoulder.rotation.z = raise;
  shoulder.rotation.x = -side * 0.08;
  elbow.rotation.z = bend;
  return { shoulder, elbow, hand };
};

/** Head with eyes, nose and ears, on a neck. Returns the head group (at y 0.855). */
const head = (neckMat: THREE.Material) => {
  const g = new THREE.Group();
  const neck = limb(0.022, 0.026, 0.06, neckMat);
  neck.position.y = 0.785;
  g.add(neck);
  const h = new THREE.Group();
  h.position.y = 0.858;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.06, 32, 24), skin);
  skull.scale.set(0.98, 1.1, 0.9);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.046, 20, 14), skin);
  jaw.position.set(0.014, -0.03, 0);
  jaw.scale.set(1, 0.8, 0.95);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.03, 10), skin);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(0.064, -0.004, 0);
  h.add(skull, jaw, nose);
  for (const z of [-0.022, 0.022]) {
    const eye = ball(0.0075, eyeMat);
    eye.position.set(0.052, 0.012, z);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.022), varnish(0x2a1d14, 0.6, 0.2));
    brow.position.set(0.055, 0.027, z);
    const ear = ball(0.014, skin);
    ear.scale.set(0.6, 1, 0.5);
    ear.position.set(-0.004, 0.0, z * 2.75);
    h.add(eye, brow, ear);
  }
  g.add(h);
  return { group: g, head: h };
};

/* ---------------------------------------------------------------- Wren */

/** Code-built Wren, used if the model files are missing. */
const builtThief = (): Thief => {
  const g = new THREE.Group();
  g.add(pieceBase(MAT.gold));

  const coatMats: Mats = { legs: MAT.coatDark, shoes: MAT.boots, torso: MAT.coat, sleeves: MAT.coat, hands: glove };
  g.add(legs(coatMats));

  // Long coat: flared tails over the thighs, then the body
  const tails = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0.0, 0.24],
        [0.12, 0.24],
        [0.1, 0.36],
        [0.085, 0.5],
        [0.0, 0.5],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      32,
      Math.PI * 0.15,
      Math.PI * 1.7
    ),
    MAT.coat
  );
  tails.scale.set(0.85, 1, 1);
  tails.rotation.y = Math.PI;
  const body = torso(MAT.coat);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 32), leather);
  belt.scale.set(0.66, 1, 1);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.5;
  const pouch = new THREE.Mesh(rbox(0.04, 0.045, 0.03, 0.008), leather);
  pouch.position.set(0.035, 0.485, -0.068);
  const satchel = new THREE.Mesh(rbox(0.05, 0.12, 0.13, 0.015), leather);
  satchel.position.set(-0.075, 0.63, 0);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.075, 0.06, 24, 1, true), MAT.coat);
  collar.position.y = 0.775;
  g.add(tails, body, belt, pouch, satchel, collar);

  const left = arm(-1, coatMats, 0.12, 0.15);
  const right = arm(1, coatMats, 0.6, 0.35);
  g.add(left.shoulder, right.shoulder);

  const { group: headGroup, head: h } = head(MAT.coatDark);
  g.add(headGroup);
  // Cloth mask over the lower face, and a deep hood
  const mask = new THREE.Mesh(
    new THREE.SphereGeometry(0.064, 24, 12, -Math.PI / 2, Math.PI, Math.PI * 0.52, Math.PI * 0.4),
    MAT.coatDark
  );
  mask.scale.set(1.02, 1.12, 0.94);
  const hood = new THREE.Mesh(
    new THREE.SphereGeometry(0.078, 28, 18, Math.PI * 0.62, Math.PI * 1.76, 0, Math.PI * 0.72),
    MAT.coatDark
  );
  hood.position.set(-0.008, 0.008, 0);
  hood.scale.set(1, 1.12, 0.98);
  h.add(mask, hood);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.016, 10, 24), MAT.scarf);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.79;
  const tail = new THREE.Mesh(rbox(0.03, 0.14, 0.014, 0.006), MAT.scarf);
  tail.position.set(-0.06, 0.72, 0.03);
  tail.rotation.z = 0.25;
  g.add(scarf, tail);

  // Lantern hanging from the right hand
  const lanternGroup = new THREE.Group();
  const cage = new THREE.Mesh(rbox(0.05, 0.07, 0.05, 0.008), MAT.brass);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.048, 0.056), MAT.lanternGlow);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 12, Math.PI), MAT.brass);
  handle.position.y = 0.045;
  lanternGroup.add(cage, glass, handle);
  lanternGroup.position.set(0.225, 0.43, 0.108);
  g.add(lanternGroup);
  const lantern = new THREE.PointLight(0xffb45a, 1.2, 2.2, 1.6);
  lantern.position.set(0.24, 0.45, 0.108);
  g.add(lantern);

  // Disguise: a guard cap replaces the hood and mask; the coat turns navy
  const cap = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.062, 0.045, 24), MAT.cap);
  crown.position.y = 0.062;
  const peak = new THREE.Mesh(
    new THREE.CylinderGeometry(0.072, 0.072, 0.008, 24, 1, false, -Math.PI / 2, Math.PI),
    MAT.visor
  );
  peak.position.set(0.026, 0.042, 0);
  cap.add(crown, peak);
  cap.visible = false;
  h.add(cap);

  const coatMeshes: THREE.Mesh[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === MAT.coat) coatMeshes.push(o);
  });
  const setDisguise = (on: boolean) => {
    cap.visible = on;
    hood.visible = !on;
    mask.visible = !on;
    for (const m of coatMeshes) m.material = on ? MAT.jacket : MAT.coat;
  };

  return { group: shadowed(g), lantern, setDisguise, rigs: [] };
};

/* --------------------------------------------------------------- guards */

/** Code-built guard, used if the model files are missing. */
const builtGuard = (): Guard => {
  const g = new THREE.Group();
  g.add(pieceBase(MAT.dangerRim));
  const mats: Mats = { legs: MAT.trousers, shoes: MAT.boots, torso: MAT.jacket, sleeves: MAT.jacket, hands: skin };
  g.add(legs(mats));

  const body = torso(MAT.jacket);
  const shirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0, 0.034, 0.12, 3, 1, false, -Math.PI / 6, Math.PI / 3 + 0.0001),
    MAT.shirt
  );
  shirt.rotation.z = Math.PI;
  shirt.position.set(0.064, 0.7, 0);
  const tie = new THREE.Mesh(rbox(0.008, 0.11, 0.018, 0.003), varnish(0x16203a, 0.4));
  tie.position.set(0.07, 0.68, 0);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.011, 8, 32), varnish(0x0c0c0e, 0.3, 0.9));
  belt.scale.set(0.66, 1, 1);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.49;
  const buckle = new THREE.Mesh(rbox(0.008, 0.022, 0.03, 0.003), MAT.gold);
  buckle.position.set(0.054, 0.49, 0);
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.006, 6), MAT.gold);
  badge.rotation.z = Math.PI / 2;
  badge.position.set(0.064, 0.665, -0.05);
  const radio = new THREE.Mesh(rbox(0.026, 0.04, 0.02, 0.005), varnish(0x111111, 0.4));
  radio.position.set(0.03, 0.72, -0.085);
  g.add(body, shirt, tie, belt, buckle, badge, radio);
  for (const y of [0.6, 0.55]) {
    const button = ball(0.006, MAT.gold);
    button.position.set(0.058, y, 0.012);
    g.add(button);
  }
  for (const z of [-0.1, 0.1]) {
    const ep = new THREE.Mesh(rbox(0.05, 0.012, 0.04, 0.004), MAT.gold);
    ep.position.set(0, 0.758, z);
    g.add(ep);
  }

  const left = arm(-1, mats, 0.08, 0.1);
  const right = arm(1, mats, 1.0, 0.4);
  g.add(left.shoulder, right.shoulder);

  const { group: headGroup, head: h } = head(skin);
  g.add(headGroup);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.063, 24, 14, Math.PI * 0.6, Math.PI * 1.8, 0, Math.PI * 0.55),
    varnish(0x2a1d14, 0.7, 0.2)
  );
  hair.scale.set(1, 1.1, 0.93);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.063, 0.048, 24), MAT.cap);
  crown.position.y = 0.062;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0635, 0.0635, 0.016, 24), varnish(0x0b0c10, 0.3));
  band.position.y = 0.04;
  const peak = new THREE.Mesh(
    new THREE.CylinderGeometry(0.074, 0.074, 0.008, 24, 1, false, -Math.PI / 2, Math.PI),
    MAT.visor
  );
  peak.position.set(0.028, 0.036, 0);
  peak.rotation.z = -0.12;
  const capBadge = new THREE.Mesh(rbox(0.006, 0.022, 0.02, 0.003), MAT.gold);
  capBadge.position.set(0.066, 0.062, 0);
  h.add(hair, crown, band, peak, capBadge);

  // Flashlight in the raised right hand
  const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.1, 14), MAT.steel);
  torch.rotation.z = -Math.PI / 2;
  torch.position.set(0.33, 0.585, 0.108);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16), MAT.lens);
  lens.rotation.y = Math.PI / 2;
  lens.position.set(0.381, 0.585, 0.108);
  g.add(torch, lens);

  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1, 32, 1, true), beamMaterial());
  beam.rotation.z = Math.PI / 2;
  beam.position.set(0.38, 0.5, 0.1);
  beam.userData.tipX = 0.38;
  beam.renderOrder = 5;
  g.add(beam);

  const spot = new THREE.SpotLight(0xfff0d0, 7, 3.6, 0.42, 0.55, 1.2);
  spot.position.set(0.39, 0.585, 0.108);
  spot.target.position.set(2.5, 0, 0.108);
  g.add(spot, spot.target);

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
  return { group: g, beam, spot, alert, dog: false, rigs: [] };
};

/* ------------------------------------------------- KayKit characters */

/** Height of a character inside its (later scaled) figurine group. */
const FIGURE_HEIGHT = 0.82;

/**
 * Attach `obj` to a bone so it follows the animation, cancelling the bone's
 * scale so `obj` keeps the size it has in the figurine's own units.
 */
const holdIn = (group: THREE.Object3D, bone: THREE.Object3D | undefined, obj: THREE.Object3D) => {
  if (!bone) {
    group.add(obj);
    return;
  }
  group.updateMatrixWorld(true);
  const s = bone.getWorldScale(new THREE.Vector3()).x / group.getWorldScale(new THREE.Vector3()).x;
  obj.scale.multiplyScalar(1 / s);
  obj.position.multiplyScalar(1 / s);
  bone.add(obj);
};

const rigIn = (g: THREE.Group, rig: CharacterRig) => {
  // KayKit characters face +Z; Hush pieces face +X.
  rig.root.rotation.y = Math.PI / 2;
  rig.root.position.y = 0.05;
  g.add(rig.root);
  return rig;
};

const lanternFor = () => {
  const lanternGroup = new THREE.Group();
  const cage = new THREE.Mesh(rbox(0.05, 0.07, 0.05, 0.008), MAT.brass);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.048, 0.056), MAT.lanternGlow);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 12, Math.PI), MAT.brass);
  handle.position.y = 0.045;
  lanternGroup.add(cage, glass, handle);
  lanternGroup.position.set(0, -0.06, 0);
  const light = new THREE.PointLight(0xffb45a, 1.2, 2.2, 1.6);
  light.position.set(0, -0.04, 0);
  lanternGroup.add(light);
  return { lanternGroup, light };
};

/** Wren: the hooded KayKit Rogue, lantern in hand; a Knight body for the disguise. */
export const makeThief = (): Thief => {
  const rogue = character('wren', FIGURE_HEIGHT);
  if (!rogue) return builtThief();
  const g = new THREE.Group();
  g.add(pieceBase(MAT.gold));
  rigIn(g, rogue);
  const { lanternGroup, light } = lanternFor();
  holdIn(g, rogue.bone('handslot.r'), lanternGroup);

  const disguise = character('guard', FIGURE_HEIGHT);
  const rigs = [rogue];
  if (disguise) {
    rigIn(g, disguise);
    disguise.root.visible = false;
    rigs.push(disguise);
  }
  const setDisguise = (on: boolean) => {
    if (!disguise) return;
    rogue.root.visible = !on;
    disguise.root.visible = on;
    const hand = (on ? disguise : rogue).bone('handslot.r');
    if (hand && lanternGroup.parent !== hand) {
      lanternGroup.removeFromParent();
      lanternGroup.scale.setScalar(1);
      lanternGroup.position.set(0, -0.06, 0);
      holdIn(g, hand, lanternGroup);
    }
  };
  return { group: shadowed(g), lantern: light, setDisguise, rigs };
};

/** A guard: the KayKit Knight with a flashlight in the right hand. */
export const makeGuard = (): Guard => {
  const knight = character('guard', FIGURE_HEIGHT);
  if (!knight) return builtGuard();
  const g = new THREE.Group();
  g.add(pieceBase(MAT.dangerRim));
  rigIn(g, knight);

  const torch = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.1, 14), MAT.steel);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16), MAT.lens);
  lens.position.y = 0.051;
  lens.rotation.x = -Math.PI / 2;
  torch.add(body, lens);
  holdIn(g, knight.bone('handslot.r'), torch);

  // Beam and spotlight live in the figurine's space at hand height, aimed forward.
  g.updateMatrixWorld(true);
  const hand = knight.bone('handslot.r')?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(0.2, 0.45, 0.1);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1, 32, 1, true), beamMaterial());
  beam.rotation.z = Math.PI / 2;
  beam.position.set(hand.x + 0.05, hand.y - 0.05, hand.z);
  beam.userData.tipX = hand.x + 0.05;
  beam.renderOrder = 5;
  const spot = new THREE.SpotLight(0xfff0d0, 7, 3.6, 0.42, 0.55, 1.2);
  spot.position.set(hand.x + 0.06, hand.y, hand.z);
  spot.target.position.set(2.5, 0, hand.z);
  g.add(beam, spot, spot.target);

  const alert = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textTexture('?', '#f2c14e', 'rgba(0,0,0,0)', 96, 96),
      depthTest: false,
      transparent: true,
    })
  );
  alert.scale.set(0.3, 0.3, 1);
  alert.position.set(0, FIGURE_HEIGHT + 0.25, 0);
  alert.visible = false;
  alert.renderOrder = 10;
  g.add(alert);

  shadowed(g);
  beam.castShadow = false;
  beam.receiveShadow = false;
  return { group: g, beam, spot, alert, dog: false, rigs: [knight] };
};
