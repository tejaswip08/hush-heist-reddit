// Build the game's 3D models from the KayKit packs (CC0, by Kay Lousberg).
//
//   node tools/build-models.mjs <folder with the extracted KayKit repos>
//
// Writes compact, compressed .glb files to public/models/:
//   props-<pack>.glb  every prop Hush uses from that pack, one node per prop
//                     (named after the prop), sharing one texture
//   wren.glb, guard.glb  the two characters with only the animations we play
//
// Geometry is quantized and meshopt-compressed; three.js decodes it with the
// MeshoptDecoder (see src/client/three/assets.ts).

import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, quantize, resample, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('Usage: node tools/build-models.mjs <kaykit folder>');
  process.exit(1);
}
const out = fileURLToPath(new URL('../public/models/', import.meta.url));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

/** Find a file by name anywhere under the source folder. */
const find = (dir, name) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      const hit = find(p, name);
      if (hit) return hit;
    } else if (entry === name && p.includes('gltf')) {
      return p;
    }
  }
  return null;
};

// Keep in sync with PACKS in src/client/three/assets.ts.
const PACKS = {
  halloween: [
    'grave_A', 'grave_B', 'gravestone', 'gravemarker_A', 'tree_dead_large', 'tree_dead_medium',
    'tree_dead_small', 'fence', 'fence_broken', 'fence_pillar', 'crypt', 'lantern_standing',
    'candle_triple', 'skull_candle', 'coffin', 'coffin_decorated', 'pumpkin_orange_jackolantern',
    'post_lantern', 'bench_decorated', 'shrine_candles', 'bone_A', 'skull',
  ],
  city: [
    'building_A_withoutBase', 'building_B_withoutBase', 'building_C_withoutBase', 'building_D_withoutBase',
    'building_E_withoutBase', 'building_F_withoutBase', 'building_G_withoutBase', 'building_H_withoutBase',
    'streetlight', 'car_sedan', 'car_taxi', 'car_police', 'car_hatchback', 'dumpster', 'firehydrant',
    'trash_A', 'watertower', 'bush',
  ],
  furniture: [
    'armchair', 'armchair_pillows', 'couch_pillows', 'cabinet_medium_decorated', 'cabinet_small_decorated',
    'lamp_standing', 'pictureframe_standing_A', 'pictureframe_standing_B', 'book_set', 'table_medium',
    'shelf_B_large_decorated', 'shelf_A_big', 'rug_oval_A', 'chair_A_wood',
  ],
};

const CHARACTERS = { Rogue_Hooded: 'wren', Knight: 'guard' };
const KEEP_ANIMS = new Set(['Idle', 'Walking_A', 'Death_A', 'Death_A_Pose', 'PickUp', 'Cheer', 'Interact']);

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

/** Shrink: share duplicates, drop unused data, quantize, meshopt-compress. */
const compress = (doc) =>
  doc.transform(
    dedup(),
    prune(),
    unpartition(),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' })
  );

const report = [];

for (const [pack, names] of Object.entries(PACKS)) {
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene('props');
  for (const name of names) {
    const file = find(src, `${name}.gltf`);
    if (!file) {
      console.warn(`missing prop ${name}`);
      continue;
    }
    const part = await io.read(file);
    mergeDocuments(doc, part);
    // Each merged file arrives as its own scene; gather it under one named node.
    const merged = doc.getRoot().listScenes().find((s) => s !== scene && s.listChildren().length > 0);
    if (!merged) continue;
    const holder = doc.createNode(name);
    for (const child of merged.listChildren()) {
      merged.removeChild(child);
      holder.addChild(child);
    }
    merged.dispose();
    scene.addChild(holder);
  }
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
  doc.getRoot().setDefaultScene(scene);
  await compress(doc);
  const dest = join(out, `props-${pack}.glb`);
  await io.write(dest, doc);
  report.push([`props-${pack}.glb`, statSync(dest).size]);
}

for (const [name, as] of Object.entries(CHARACTERS)) {
  const file = find(src, `${name}.glb`);
  if (!file) {
    console.warn(`missing character ${name}`);
    continue;
  }
  const doc = await io.read(file);
  for (const anim of doc.getRoot().listAnimations()) {
    if (KEEP_ANIMS.has(anim.getName())) continue;
    // Dispose the samplers too; prune() then drops keyframe data nothing uses.
    for (const sampler of anim.listSamplers()) sampler.dispose();
    for (const channel of anim.listChannels()) channel.dispose();
    anim.dispose();
  }
  await doc.transform(resample());
  await compress(doc);
  const dest = join(out, `${as}.glb`);
  await io.write(dest, doc);
  report.push([`${as}.glb`, statSync(dest).size]);
}

let total = 0;
for (const [file, size] of report) {
  total += size;
  console.log(`${file.padEnd(22)} ${(size / 1024).toFixed(0).padStart(5)} KB`);
}
console.log(`${'total'.padEnd(22)} ${(total / 1024).toFixed(0).padStart(5)} KB`);
