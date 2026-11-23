import * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// 3D models from the KayKit packs by Kay Lousberg (CC0), built into
// public/models by tools/build-models.mjs: three prop packs (one node per
// prop) and two characters, quantized and meshopt-compressed. Everything is
// preloaded once, then cloned wherever a level needs it.

export const PROP_NAMES = [
  'grave_A', 'grave_B', 'gravestone', 'gravemarker_A', 'tree_dead_large', 'tree_dead_medium',
  'tree_dead_small', 'fence', 'fence_broken', 'fence_pillar', 'crypt', 'lantern_standing',
  'candle_triple', 'skull_candle', 'coffin', 'coffin_decorated', 'pumpkin_orange_jackolantern',
  'post_lantern', 'bench_decorated', 'shrine_candles', 'bone_A', 'skull',
  'building_A_withoutBase', 'building_B_withoutBase', 'building_C_withoutBase', 'building_D_withoutBase',
  'building_E_withoutBase', 'building_F_withoutBase', 'building_G_withoutBase', 'building_H_withoutBase',
  'streetlight', 'car_sedan', 'car_taxi', 'car_police', 'car_hatchback', 'dumpster', 'firehydrant',
  'trash_A', 'watertower', 'bush',
  'armchair', 'armchair_pillows', 'couch_pillows', 'cabinet_medium_decorated', 'cabinet_small_decorated',
  'lamp_standing', 'pictureframe_standing_A', 'pictureframe_standing_B', 'book_set', 'table_medium',
  'shelf_B_large_decorated', 'shelf_A_big', 'rug_oval_A', 'chair_A_wood',
] as const;

export type PropName = (typeof PROP_NAMES)[number];

export type CharacterName = 'wren' | 'guard';

type Loaded = { scene: THREE.Object3D; animations: THREE.AnimationClip[] };

const props = new Map<string, THREE.Object3D>();
const characters = new Map<string, Loaded>();
let loading: Promise<void> | null = null;

const url = (name: string) => `models/${name}.glb`;

/** Load every model once. Missing files are skipped so the game still runs. */
export const loadAssets = (): Promise<void> => {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const character = (name: string) =>
    loader
      .loadAsync(url(name))
      .then((gltf) => {
        characters.set(name, { scene: gltf.scene, animations: gltf.animations });
      })
      .catch((error: unknown) => {
        console.warn(`Model ${name} failed to load`, error);
      });
  const pack = (file: string) =>
    loader
      .loadAsync(url(`props-${file}`))
      .then((gltf) => {
        // Each prop is a top-level node named after it.
        for (const name of PROP_NAMES) {
          const node = gltf.scene.getObjectByName(name);
          if (node && !props.has(name)) props.set(name, node);
        }
      })
      .catch((error: unknown) => {
        console.warn(`Prop pack ${file} failed to load`, error);
      });
  loading = Promise.all([pack('halloween'), pack('city'), pack('furniture'), character('wren'), character('guard')]).then(
    () => undefined
  );
  return loading;
};

const withShadows = <T extends THREE.Object3D>(obj: T): T => {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
};

/**
 * Scale an object so its footprint (or height) matches `size`, then stand it
 * on y = 0, centred. Wrapped in a group so callers can move/rotate freely.
 */
/** Bounds of the visible meshes only (hidden weapons would skew the centre). */
const visibleBox = (obj: THREE.Object3D) => {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh && shown(o)) box.union(new THREE.Box3().setFromObject(o));
  });
  return box.isEmpty() ? new THREE.Box3().setFromObject(obj) : box;
};

const fit = (obj: THREE.Object3D, size: number, by: 'footprint' | 'height', maxHeight = Infinity) => {
  const box = visibleBox(obj);
  const dim = box.getSize(new THREE.Vector3());
  let k = by === 'height' ? size / Math.max(dim.y, 1e-6) : size / Math.max(dim.x, dim.z, 1e-6);
  if (dim.y * k > maxHeight) k = maxHeight / dim.y;
  obj.scale.multiplyScalar(k);
  const centre = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
  obj.position.set(-centre.x, -box.min.y * k, -centre.z);
  const wrap = new THREE.Group();
  wrap.add(obj);
  return wrap;
};

export const hasProp = (name: PropName) => props.has(name);

/** A fresh copy of a prop, fitted to `size` (footprint by default). */
export const prop = (
  name: PropName,
  size: number,
  by: 'footprint' | 'height' = 'footprint',
  maxHeight = Infinity
): THREE.Object3D | null => {
  const src = props.get(name);
  if (!src) return null;
  const copy = src.clone(true);
  copy.position.set(0, 0, 0);
  copy.rotation.set(0, 0, 0);
  copy.updateMatrix();
  return withShadows(fit(copy, size, by, maxHeight));
};

export type CharacterRig = {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  play: (clip: string, opts?: { once?: boolean; fade?: number }) => void;
  bone: (name: string) => THREE.Object3D | undefined;
};

const WEAPONS = /knife|crossbow|sword|shield|bow|dagger|axe|staff|wand/i;

/** An animated character, fitted to `height`, with its weapons hidden. */
export const character = (name: CharacterName, height: number): CharacterRig | null => {
  const src = characters.get(name);
  if (!src) return null;
  const model = SkeletonUtils.clone(src.scene);
  model.traverse((o) => {
    if (WEAPONS.test(o.name)) o.visible = false;
  });
  const root = withShadows(fit(model, height, 'height'));
  const mixer = new THREE.AnimationMixer(model);
  let current: THREE.AnimationAction | null = null;
  const play: CharacterRig['play'] = (clipName, opts = {}) => {
    const clip = src.animations.find((c) => c.name === clipName);
    if (!clip) return;
    const action = mixer.clipAction(clip);
    if (action === current && !opts.once) return;
    action.reset();
    action.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = Boolean(opts.once);
    action.play();
    if (current && current !== action) current.crossFadeTo(action, opts.fade ?? 0.2, false);
    current = action;
  };
  play('Idle');
  return { root, mixer, play, bone: (n) => model.getObjectByName(n) };
};
