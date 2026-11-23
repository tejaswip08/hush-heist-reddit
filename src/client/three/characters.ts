import * as THREE from 'three';
import { type CharacterRig, character } from './assets';
import { guardFigure, noirThief } from './figures';
import {
  type Guard,
  type Thief,
  MAT,
  beamMaterial,
  pieceBase,
  rbox,
  shadowed,
  textTexture,
} from './models';

// Character pieces. By default Hush uses the hand-built figurines in
// figures.ts; the animated KayKit models can be switched on below.

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

/**
 * Slim, realistic-proportioned figurines read like Hitman GO; the chunky
 * KayKit characters don't. Flip this to use the animated KayKit models.
 */
export const USE_CHARACTER_MODELS = false;

/** Wren: the hooded KayKit Rogue, lantern in hand; a Knight body for the disguise. */
export const makeThief = (): Thief => {
  if (!USE_CHARACTER_MODELS) return noirThief();
  const rogue = character('wren', FIGURE_HEIGHT);
  if (!rogue) return noirThief();
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
export const makeGuard = (variant = 0): Guard => {
  if (!USE_CHARACTER_MODELS) return guardFigure(variant);
  const knight = character('guard', FIGURE_HEIGHT);
  if (!knight) return guardFigure(variant);
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
  g.add(beam);

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
