import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type Level, canMove, initialState, objectiveDone, ruleMet, step } from './sim.ts';

const base = (overrides: Partial<Level>): Level => ({
  id: 't',
  title: 't',
  theme: 'gallery',
  brief: '',
  clue: '',
  map: ['#######', '#S...P#', '#.....#', '#E....#', '#######'],
  light: ['0000000', '0000000', '0000000', '0000000', '0000000'],
  guards: [],
  vents: [],
  switches: [],
  coins: 0,
  rule: 'none',
  ruleText: '',
  par: 0,
  ...overrides,
});

test('stepping onto a guard from behind knocks them out', () => {
  const level = base({
    guards: [{ id: 'g', kind: 'sentry', at: { x: 2, y: 1 }, facings: ['right'], turnEvery: 1 }],
    rule: 'noTakedown',
  });
  const s = step(level, initialState(level), { type: 'move', dir: 'right' });
  assert.ok(s);
  assert.equal(s.status, 'playing');
  assert.equal(s.guards[0]?.out, true);
  assert.equal(s.takedowns, 1);
  assert.equal(ruleMet(level, s), false);
});

test('a guard facing you cannot be taken down', () => {
  const level = base({
    guards: [{ id: 'g', kind: 'sentry', at: { x: 2, y: 1 }, facings: ['left'], turnEvery: 1 }],
  });
  assert.equal(canMove(level, initialState(level), 'right'), false);
});

test('a potted plant hides you from a lit sight line', () => {
  // A guard at (5,1) looks left down a lit row; the plant is at (3,1).
  const level = base({
    map: ['#######', '#S.H..#', '#....P#', '#E....#', '#######'],
    light: ['0000000', '0111110', '0000000', '0000000', '0000000'],
    guards: [{ id: 'w', kind: 'sentry', at: { x: 5, y: 1 }, facings: ['left'], turnEvery: 1 }],
  });
  const exposed = step(level, initialState(level), { type: 'move', dir: 'right' });
  assert.equal(exposed?.status, 'caught', 'a lit tile in sight, no cover');

  const nextToPlant = { ...initialState(level), player: { x: 3, y: 2 } };
  const hidden = step(level, nextToPlant, { type: 'move', dir: 'up' });
  assert.equal(hidden?.status, 'playing', 'inside the plant');
});

test('a dog smells you two tiles away in the dark', () => {
  const level = base({
    guards: [{ id: 'd', kind: 'sentry', at: { x: 4, y: 1 }, facings: ['left'], turnEvery: 1, dog: true }],
  });
  const s = step(level, initialState(level), { type: 'move', dir: 'right' });
  assert.ok(s);
  assert.equal(s.status, 'caught');

  const guard: Level = { ...level, guards: [{ ...level.guards[0]!, dog: false }] };
  const t = step(guard, initialState(guard), { type: 'move', dir: 'right' });
  assert.ok(t);
  assert.equal(t.status, 'playing', 'a person cannot see two tiles into the dark');
});

test('a uniform fools guards but not dogs', () => {
  const lit = ['0000000', '0111110', '0000000', '0000000', '0000000'];
  const guard = base({
    map: ['#######', '#SU...#', '#....P#', '#E....#', '#######'],
    light: lit,
    guards: [{ id: 'g', kind: 'sentry', at: { x: 5, y: 1 }, facings: ['left'], turnEvery: 1 }],
  });
  const dressed = step(guard, initialState(guard), { type: 'move', dir: 'right' });
  assert.equal(dressed?.disguised, true);
  const walk = dressed && step(guard, dressed, { type: 'move', dir: 'right' });
  assert.equal(walk?.status, 'playing', 'guards look straight past a uniform');

  const dog = base({ ...guard, guards: [{ ...guard.guards[0]!, at: { x: 4, y: 1 }, dog: true }] });
  const sniffed = step(dog, initialState(dog), { type: 'move', dir: 'right' });
  assert.equal(sniffed?.status, 'caught', 'the dog still smells you');
});

test('a locked door blocks you and the guards’ view until you hold its key', () => {
  const level = base({
    map: ['#######', '#S...P#', '#.....#', '#E....#', '#######'],
    light: ['0000000', '0111110', '0000000', '0000000', '0000000'],
    doors: [{ at: { x: 3, y: 1 }, color: 'gold' }],
    keys: [{ at: { x: 1, y: 2 }, color: 'gold' }],
    guards: [{ id: 'g', kind: 'sentry', at: { x: 5, y: 1 }, facings: ['left'], turnEvery: 1 }],
  });
  let s = { ...initialState(level), player: { x: 2, y: 1 } };
  assert.equal(canMove(level, s, 'right'), false, 'the door is locked');
  // The door hides (2,1) from the guard at (5,1).
  const waited = step(level, s, { type: 'wait' });
  assert.equal(waited?.status, 'playing');

  s = initialState(level);
  const withKey = step(level, s, { type: 'move', dir: 'down' });
  assert.deepEqual(withKey?.keys, ['gold']);
  const back = withKey && step(level, withKey, { type: 'move', dir: 'up' });
  assert.ok(back);
  assert.equal(canMove(level, { ...back, player: { x: 2, y: 1 } }, 'right'), true, 'the door is open');
});

test('cash job: the exit opens once enough stacks are taken', () => {
  const level = base({
    job: 'cash',
    cashNeeded: 1,
    rule: 'allCash',
    map: ['#######', '#S$$..#', '#.....#', '#E....#', '#######'],
  });
  const one = step(level, initialState(level), { type: 'move', dir: 'right' });
  assert.equal(one?.cash.length, 1);
  assert.ok(one && objectiveDone(level, one), 'one stack is enough');
  assert.ok(one && !ruleMet(level, one), 'but the star wants both');
});

test('safe job: two turns standing on the safe cracks it, leaving resets', () => {
  const level = base({ job: 'safe', map: ['#######', '#SB...#', '#.....#', '#E....#', '#######'] });
  let s = step(level, initialState(level), { type: 'move', dir: 'right' });
  assert.ok(s);
  s = step(level, s, { type: 'wait' });
  assert.equal(s?.safeOpen, false);
  const away = s && step(level, s, { type: 'move', dir: 'right' });
  assert.equal(away?.safeTurns, 0, 'stepping off resets the count');
  s = s && step(level, s, { type: 'wait' });
  assert.equal(s?.safeOpen, true);
});

test('swap job: the painting only comes off the wall with the forgery in hand', () => {
  const level = base({ job: 'swap', map: ['#######', '#SPF..#', '#.....#', '#E....#', '#######'] });
  const early = step(level, initialState(level), { type: 'move', dir: 'right' });
  assert.equal(early?.hasPainting, false);
  const forged = early && step(level, early, { type: 'move', dir: 'right' });
  assert.equal(forged?.forgery, true);
  const swapped = forged && step(level, forged, { type: 'move', dir: 'left' });
  assert.equal(swapped?.hasPainting, true);
});

test('evidence job: the file is only planted while nobody watches the desk', () => {
  const level = base({
    job: 'evidence',
    map: ['#######', '#SD...#', '#.....#', '#E....#', '#######'],
    guards: [{ id: 'g', kind: 'sentry', at: { x: 2, y: 3 }, facings: ['up', 'right'], turnEvery: 1 }],
  });
  // Turn one: the guard faces up at the desk, so planting fails.
  const watchedStep = step(level, initialState(level), { type: 'move', dir: 'right' });
  assert.equal(watchedStep?.planted, false);
  // Next turn the guard has turned away, so waiting on the desk plants it.
  const later = watchedStep && step(level, watchedStep, { type: 'wait' });
  assert.equal(later?.planted, true);
});

test('boss job: tagging the boss from behind opens the exit', () => {
  const level = base({
    job: 'boss',
    guards: [{ id: 'b', kind: 'sentry', at: { x: 2, y: 1 }, facings: ['right'], turnEvery: 1, boss: true }],
  });
  const tagged = step(level, initialState(level), { type: 'move', dir: 'right' });
  assert.ok(tagged && objectiveDone(level, tagged));
});
