import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Static batching. Scenery and figurines are built from many small meshes,
// and every mesh is a draw call (twice, with shadows). Baking merges all the
// meshes that never change into one mesh per material, which looks the same
// and is far cheaper to draw. Anything flagged `userData.dynamic`, plus
// lights, sprites, instanced meshes and multi-material meshes, is kept as is.

/** Mark an object (and its subtree) as moving or changing: never merged. */
export const keepDynamic = <T extends THREE.Object3D>(o: T): T => {
  o.userData.dynamic = true;
  return o;
};

/** A copy of a geometry with plain float position, normal and uv only. */
const normalise = (src: THREE.BufferGeometry): THREE.BufferGeometry => {
  const g = src.index ? src.toNonIndexed() : src.clone();
  const out = new THREE.BufferGeometry();
  const pos = g.getAttribute('position');
  const count = pos.count;
  const copy = (name: string, size: number) => {
    const a = g.getAttribute(name);
    const arr = new Float32Array(count * size);
    if (a) {
      for (let i = 0; i < count; i++) {
        arr[i * size] = a.getX(i);
        if (size > 1) arr[i * size + 1] = a.getY(i);
        if (size > 2) arr[i * size + 2] = a.getZ(i);
      }
    }
    return new THREE.BufferAttribute(arr, size);
  };
  out.setAttribute('position', copy('position', 3));
  if (g.getAttribute('normal')) out.setAttribute('normal', copy('normal', 3));
  else {
    out.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  }
  out.setAttribute('uv', copy('uv', 2));
  if (!g.getAttribute('normal')) out.computeVertexNormals();
  g.dispose();
  return out;
};

const isKept = (o: THREE.Object3D) =>
  o.userData.dynamic === true ||
  o instanceof THREE.Light ||
  o instanceof THREE.Sprite ||
  o instanceof THREE.InstancedMesh ||
  (o instanceof THREE.Mesh && Array.isArray(o.material));

/**
 * Merge the static meshes under `root` into one mesh per material, in
 * place. Kept objects are moved under `root` with their placement intact.
 */
export const bakeInPlace = (root: THREE.Object3D, shadows = true): void => {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const kept: THREE.Object3D[] = [];
  const m = new THREE.Matrix4();

  const visit = (o: THREE.Object3D) => {
    if (!o.visible) return;
    if (isKept(o)) {
      kept.push(o);
      return;
    }
    if (o instanceof THREE.Mesh && o.material instanceof THREE.Material) {
      const geo = normalise(o.geometry);
      geo.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
      const list = buckets.get(o.material) ?? [];
      list.push(geo);
      buckets.set(o.material, list);
    }
    for (const child of o.children) visit(child);
  };
  for (const child of root.children) visit(child);

  // Re-home kept objects directly under root, keeping where they were.
  for (const k of kept) {
    m.multiplyMatrices(inv, k.matrixWorld);
    m.decompose(k.position, k.quaternion, k.scale);
  }
  root.clear();
  for (const k of kept) root.add(k);

  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    for (const geo of geos) geo.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
};
