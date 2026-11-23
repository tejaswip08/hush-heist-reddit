// Hush game rules. Pure functions, no imports, so the client, the server and
// the level-solver test can all share them.

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Pos = { x: number; y: number };

/** `dog: true` makes a guard dog: it sniffs 2 tiles ahead, light or dark. */
export type GuardDef =
  | { id: string; kind: 'patrol'; route: Pos[]; dog?: boolean }
  | { id: string; kind: 'sentry'; at: Pos; facings: Dir[]; turnEvery: number; dog?: boolean };

export type SwitchDef = { at: Pos; group: string };

/** A locked door on a floor tile. It blocks moves and sight until you hold its key. */
export type DoorDef = { at: Pos; color: string };
/** A key lying on a floor tile; picking it up opens every door of its colour. */
export type KeyDef = { at: Pos; color: string };

export type Rule = 'none' | 'noCoin' | 'noVent' | 'shadowsOnly' | 'noTakedown';

/** The setting a level is dressed as. Purely visual; rules are the same. */
export type Theme = 'gallery' | 'mansion' | 'library' | 'garden' | 'cellar';

export type Level = {
  id: string;
  title: string;
  theme: Theme;
  brief: string;
  clue: string;
  /**
   * '#' wall, '.' floor, 'S' start, 'P' painting, 'E' exit,
   * 'H' potted plant to hide in, 'U' guard uniform (disguise)
   */
  map: string[];
  /** '1' lit, '0' dark, a letter = lit while that switch group is on */
  light: string[];
  guards: GuardDef[];
  vents: [Pos, Pos][];
  switches: SwitchDef[];
  doors?: DoorDef[];
  keys?: KeyDef[];
  coins: number;
  rule: Rule;
  ruleText: string;
  /** Fewest moves to escape. Checked by the solver test. */
  par: number;
};

export type GuardState = {
  id: string;
  x: number;
  y: number;
  facing: Dir;
  step: number;
  /** Turns left looking at a coin instead of following orders */
  stunned: number;
  /** Knocked out by a takedown; off the board for the rest of the run */
  out: boolean;
};

export type Status = 'playing' | 'caught' | 'escaped';

export type GameState = {
  player: Pos;
  hasPainting: boolean;
  switchesOff: string[];
  guards: GuardState[];
  coinsLeft: number;
  moves: number;
  status: Status;
  usedVent: boolean;
  touchedLight: boolean;
  takedowns: number;
  /** Key colours picked up (their doors are open) */
  keys: string[];
  /** Wearing a guard uniform: guards don't recognise you, dogs still do */
  disguised: boolean;
  caughtBy: string | null;
  noise: Pos | null;
};

export type Action =
  | { type: 'move'; dir: Dir }
  | { type: 'wait' }
  | { type: 'coin'; target: Pos };

export const SIGHT_RANGE = 3;
export const DOG_RANGE = 2;
export const COIN_RANGE = 3;
export const COIN_HEARING = 3;
const COIN_STUN = 2;

export const DELTA: Record<Dir, Pos> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const samePos = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;
export const manhattan = (a: Pos, b: Pos): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const tileAt = (level: Level, p: Pos): string => {
  const row = level.map[p.y];
  if (row === undefined) return '#';
  return row[p.x] ?? '#';
};

export const isWall = (level: Level, p: Pos): boolean => tileAt(level, p) === '#';

export const doorAt = (level: Level, p: Pos): DoorDef | undefined =>
  level.doors?.find((d) => samePos(d.at, p));

export const keyAt = (level: Level, p: Pos): KeyDef | undefined =>
  level.keys?.find((k) => samePos(k.at, p));

/** Walls, and doors whose key you don't hold yet. */
export const isBlocked = (level: Level, keys: string[], p: Pos): boolean => {
  if (isWall(level, p)) return true;
  const door = doorAt(level, p);
  return door !== undefined && !keys.includes(door.color);
};

export const findTile = (level: Level, ch: string): Pos => {
  for (let y = 0; y < level.map.length; y++) {
    const x = (level.map[y] ?? '').indexOf(ch);
    if (x >= 0) return { x, y };
  }
  throw new Error(`Level ${level.id} has no '${ch}' tile`);
};

export const isLit = (level: Level, switchesOff: string[], p: Pos): boolean => {
  const ch = (level.light[p.y] ?? '')[p.x] ?? '0';
  if (ch === '1') return true;
  if (ch === '0') return false;
  return !switchesOff.includes(ch);
};

const dirToward = (from: Pos, to: Pos, fallback: Dir): Dir => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
};

const routePoint = (route: Pos[], i: number): Pos => {
  const p = route[((i % route.length) + route.length) % route.length];
  if (!p) throw new Error('Empty patrol route');
  return p;
};

const sentryFacing = (def: Extract<GuardDef, { kind: 'sentry' }>, step: number): Dir =>
  def.facings[Math.floor(step / def.turnEvery) % def.facings.length] ?? 'down';

const guardDef = (level: Level, id: string): GuardDef => {
  const def = level.guards.find((g) => g.id === id);
  if (!def) throw new Error(`Unknown guard ${id}`);
  return def;
};

export const initialState = (level: Level): GameState => ({
  player: findTile(level, 'S'),
  hasPainting: false,
  switchesOff: [],
  guards: level.guards.map((def): GuardState => {
    if (def.kind === 'patrol') {
      const at = routePoint(def.route, 0);
      return {
        id: def.id,
        x: at.x,
        y: at.y,
        facing: dirToward(at, routePoint(def.route, 1), 'down'),
        step: 0,
        stunned: 0,
        out: false,
      };
    }
    return {
      id: def.id,
      x: def.at.x,
      y: def.at.y,
      facing: sentryFacing(def, 0),
      step: 0,
      stunned: 0,
      out: false,
    };
  }),
  coinsLeft: level.coins,
  moves: 0,
  status: 'playing',
  usedVent: false,
  touchedLight: false,
  takedowns: 0,
  keys: [],
  disguised: false,
  caughtBy: null,
  noise: null,
});

export const isDog = (level: Level, g: GuardState): boolean =>
  level.guards.find((d) => d.id === g.id)?.dog === true;

export const isHidingSpot = (level: Level, p: Pos): boolean => tileAt(level, p) === 'H';

/**
 * Tiles a guard can currently see, nearest first. Walls and closed doors
 * block the view; knocked-out guards see nothing.
 */
export const sightTiles = (level: Level, g: GuardState, keys: string[] = []): Pos[] => {
  if (g.out) return [];
  const d = DELTA[g.facing];
  const out: Pos[] = [];
  const range = isDog(level, g) ? DOG_RANGE : SIGHT_RANGE;
  for (let i = 1; i <= range; i++) {
    const p = { x: g.x + d.x * i, y: g.y + d.y * i };
    if (isBlocked(level, keys, p)) break;
    out.push(p);
  }
  return out;
};

/**
 * A guard spots you on a lit tile in its sight line, or anywhere right in
 * front of it. Dogs smell you in the dark too. Nobody sees into a potted
 * plant, and guards don't recognise you in uniform (dogs do), but walking
 * into your tile always catches you.
 */
const spotter = (level: Level, s: GameState): string | null => {
  const hidden = isHidingSpot(level, s.player);
  for (const g of s.guards) {
    if (g.out) continue;
    if (g.x === s.player.x && g.y === s.player.y) return g.id;
    if (hidden) continue;
    const dog = isDog(level, g);
    if (s.disguised && !dog) continue;
    const seen = sightTiles(level, g, s.keys);
    for (let i = 0; i < seen.length; i++) {
      const p = seen[i];
      if (p && samePos(p, s.player) && (i === 0 || dog || isLit(level, s.switchesOff, p))) {
        return g.id;
      }
    }
  }
  return null;
};

const guardsAct = (level: Level, guards: GuardState[]): GuardState[] =>
  guards.map((g) => {
    if (g.out) return g;
    if (g.stunned > 0) return { ...g, stunned: g.stunned - 1 };
    const def = guardDef(level, g.id);
    const step = g.step + 1;
    if (def.kind === 'sentry') return { ...g, step, facing: sentryFacing(def, step) };
    const at = routePoint(def.route, step);
    const next = routePoint(def.route, step + 1);
    return { ...g, step, x: at.x, y: at.y, facing: dirToward(at, next, g.facing) };
  });

export const canThrowCoin = (level: Level, s: GameState, target: Pos): boolean =>
  s.status === 'playing' &&
  s.coinsLeft > 0 &&
  !isBlocked(level, s.keys, target) &&
  !samePos(target, s.player) &&
  manhattan(target, s.player) <= COIN_RANGE;

/** An active guard standing on a tile, if any. */
export const guardAt = (s: GameState, p: Pos): GuardState | undefined =>
  s.guards.find((g) => !g.out && samePos(g, p));

/**
 * You can step onto a guard to knock them out, unless they're looking
 * straight at you. (If they were, they'd already have caught you.)
 */
export const canMove = (level: Level, s: GameState, dir: Dir): boolean => {
  const d = DELTA[dir];
  const to = { x: s.player.x + d.x, y: s.player.y + d.y };
  if (s.status !== 'playing' || isBlocked(level, s.keys, to)) return false;
  const guard = guardAt(s, to);
  if (!guard) return true;
  const f = DELTA[guard.facing];
  return !(guard.x + f.x === s.player.x && guard.y + f.y === s.player.y);
};

/**
 * Apply one player action, then let the guards take their turn.
 * Returns null if the action isn't allowed (it doesn't cost a move).
 */
export const step = (level: Level, s: GameState, action: Action): GameState | null => {
  if (s.status !== 'playing') return null;

  let next: GameState = { ...s, noise: null, moves: s.moves + 1 };

  if (action.type === 'move') {
    if (!canMove(level, s, action.dir)) return null;
    const d = DELTA[action.dir];
    let to: Pos = { x: s.player.x + d.x, y: s.player.y + d.y };

    const target = guardAt(s, to);
    if (target) {
      next.guards = next.guards.map((g) => (g.id === target.id ? { ...g, out: true, stunned: 0 } : g));
      next.takedowns = s.takedowns + 1;
    }

    const vent = level.vents.find(([a, b]) => samePos(a, to) || samePos(b, to));
    if (vent) {
      const other = samePos(vent[0], to) ? vent[1] : vent[0];
      if (!guardAt(next, other)) {
        to = other;
        next.usedVent = true;
      }
    }

    next.player = to;
    if (tileAt(level, to) === 'P') next.hasPainting = true;
    if (tileAt(level, to) === 'U') next.disguised = true;
    const key = keyAt(level, to);
    if (key && !next.keys.includes(key.color)) next.keys = [...next.keys, key.color];

    const sw = level.switches.find((w) => samePos(w.at, to));
    if (sw) {
      next.switchesOff = next.switchesOff.includes(sw.group)
        ? next.switchesOff.filter((g) => g !== sw.group)
        : [...next.switchesOff, sw.group];
    }

    if (tileAt(level, to) === 'E' && next.hasPainting) {
      return { ...next, status: 'escaped' };
    }
  } else if (action.type === 'coin') {
    if (!canThrowCoin(level, s, action.target)) return null;
    const target = action.target;
    next.coinsLeft = s.coinsLeft - 1;
    next.noise = target;
    next.guards = next.guards.map((g) =>
      !g.out && manhattan(g, target) <= COIN_HEARING
        ? { ...g, facing: dirToward(g, target, g.facing), stunned: COIN_STUN }
        : g
    );
  }

  if (isLit(level, next.switchesOff, next.player)) next.touchedLight = true;

  const early = spotter(level, next);
  if (early) return { ...next, status: 'caught', caughtBy: early };

  next = { ...next, guards: guardsAct(level, next.guards) };

  const late = spotter(level, next);
  if (late) return { ...next, status: 'caught', caughtBy: late };

  return next;
};

export const ruleMet = (level: Level, s: GameState): boolean => {
  switch (level.rule) {
    case 'noCoin':
      return s.coinsLeft === level.coins;
    case 'noVent':
      return !s.usedVent;
    case 'shadowsOnly':
      return !s.touchedLight;
    case 'noTakedown':
      return s.takedowns === 0;
    case 'none':
      return true;
  }
};

/** Three stars: escaped, at or under par, and the night's rule kept. */
export const starsFor = (level: Level, s: GameState): number => {
  if (s.status !== 'escaped') return 0;
  return 1 + (s.moves <= level.par ? 1 : 0) + (ruleMet(level, s) ? 1 : 0);
};

const stateKey = (s: GameState): string =>
  [
    s.player.x,
    s.player.y,
    s.hasPainting ? 1 : 0,
    [...s.switchesOff].sort().join(''),
    s.coinsLeft,
    s.usedVent ? 1 : 0,
    s.touchedLight ? 1 : 0,
    s.takedowns > 0 ? 1 : 0,
    [...s.keys].sort().join(''),
    s.disguised ? 1 : 0,
    s.guards.map((g) => (g.out ? 'x' : `${g.x},${g.y},${g.facing},${g.step},${g.stunned}`)).join('|'),
  ].join(';');

const legalActions = (level: Level, s: GameState): Action[] => {
  const out: Action[] = [{ type: 'wait' }];
  for (const dir of ['up', 'down', 'left', 'right'] as const) out.push({ type: 'move', dir });
  if (s.coinsLeft > 0) {
    for (let dy = -COIN_RANGE; dy <= COIN_RANGE; dy++) {
      for (let dx = -COIN_RANGE; dx <= COIN_RANGE; dx++) {
        const target = { x: s.player.x + dx, y: s.player.y + dy };
        if (canThrowCoin(level, s, target)) out.push({ type: 'coin', target });
      }
    }
  }
  return out;
};

export type SolveResult = {
  /** Fewest moves to escape, or null if unsolvable within the limit */
  best: number | null;
  /** Fewest moves that also keep the night's rule */
  bestWithRule: number | null;
  solution: Action[] | null;
};

/** Breadth-first search over every reachable state. Used by tests to set par. */
export const solve = (level: Level, maxMoves = 40): SolveResult => {
  type Node = { s: GameState; path: Action[] };
  let frontier: Node[] = [{ s: initialState(level), path: [] }];
  const seen = new Set<string>([stateKey(frontier[0]!.s)]);
  let best: number | null = null;
  let bestWithRule: number | null = null;
  let solution: Action[] | null = null;

  for (let depth = 0; depth < maxMoves && frontier.length > 0; depth++) {
    const nextFrontier: Node[] = [];
    for (const { s, path } of frontier) {
      for (const a of legalActions(level, s)) {
        const n = step(level, s, a);
        if (!n || n.status === 'caught') continue;
        if (n.status === 'escaped') {
          if (best === null) {
            best = n.moves;
            solution = [...path, a];
          }
          if (bestWithRule === null && ruleMet(level, n)) bestWithRule = n.moves;
          if (best !== null && bestWithRule !== null) return { best, bestWithRule, solution };
          continue;
        }
        const key = stateKey(n);
        if (seen.has(key)) continue;
        seen.add(key);
        nextFrontier.push({ s: n, path: [...path, a] });
      }
    }
    frontier = nextFrontier;
  }
  return { best, bestWithRule, solution };
};
