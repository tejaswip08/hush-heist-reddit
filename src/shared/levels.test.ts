import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, initialState, step, findTile, isWall, countTiles } from './sim.ts';
import { LEVELS, levelForNight, nightForDate } from './levels.ts';

for (const level of LEVELS) {
  test(`${level.id}: map is well formed`, () => {
    const width = level.map[0]?.length ?? 0;
    for (const row of level.map) assert.equal(row.length, width, 'map rows differ in width');
    assert.equal(level.light.length, level.map.length, 'light rows != map rows');
    for (const row of level.light) assert.equal(row.length, width, 'light rows differ in width');
    for (const ch of ['S', 'E']) findTile(level, ch);
    // Each job needs its own pieces on the map.
    const job = level.job ?? 'painting';
    if (job === 'painting' || job === 'swap') findTile(level, 'P');
    if (job === 'swap') findTile(level, 'F');
    if (job === 'safe') findTile(level, 'B');
    if (job === 'evidence') findTile(level, 'D');
    if (job === 'cash') assert.ok(countTiles(level, '$') >= (level.cashNeeded ?? 1), 'not enough cash on the map');
    if (job === 'boss') assert.equal(level.guards.filter((g) => g.boss).length, 1, 'a boss job needs one boss');
    for (const d of [...(level.doors ?? []), ...(level.keys ?? [])]) {
      assert.ok(!isWall(level, d.at), 'doors and keys sit on floor tiles');
    }
    for (const d of level.doors ?? []) {
      assert.ok(level.keys?.some((k) => k.color === d.color), `no key for the ${d.color} door`);
    }
    for (const g of level.guards) {
      const tiles = g.kind === 'patrol' ? g.route : [g.at];
      for (const t of tiles) assert.ok(!isWall(level, t), `${g.id} stands in a wall`);
    }
  });

  test(`${level.id}: is solvable, par is exact, rule is keepable`, () => {
    const result = solve(level);
    assert.notEqual(result.best, null, 'level cannot be solved');
    assert.equal(level.par, result.best, `par should be ${result.best}`);
    assert.notEqual(result.bestWithRule, null, 'the rule cannot be kept');
  });

  test(`${level.id}: the start position is safe on turn one`, () => {
    const s = initialState(level);
    const waited = step(level, s, { type: 'wait' });
    assert.ok(waited);
  });
}

test('nights cycle through the level list', () => {
  assert.equal(nightForDate(new Date(Date.UTC(2026, 10, 23, 12))), 1);
  assert.equal(nightForDate(new Date(Date.UTC(2026, 10, 24, 0))), 2);
  assert.equal(levelForNight(1).id, LEVELS[0]?.id);
  assert.equal(levelForNight(LEVELS.length + 1).id, LEVELS[0]?.id);
});
