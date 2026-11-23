import { showToast } from '@devvit/web/client';
import type { CompleteRequest, CompleteResponse, InitResponse, NightStats } from '../shared/api';
import { levelForNight, nightForDate } from '../shared/levels';
import {
  type Action,
  type Dir,
  type GameState,
  type Level,
  type Pos,
  canThrowCoin,
  initialState,
  ruleMet,
  starsFor,
  step,
} from '../shared/sim';
import { Sound } from './sound';
import { Board3D, type BoardInput } from './three/scene3d';

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
};

const $btn = (id: string): HTMLButtonElement => {
  const el = $(id);
  if (!(el instanceof HTMLButtonElement)) throw new Error(`#${id} is not a button`);
  return el;
};

const ui = {
  night: $('hud-night'),
  job: $('hud-job'),
  moves: $('hud-moves'),
  par: $('hud-par'),
  painting: $('hud-painting'),
  rule: $('hud-rule'),
  wait: $btn('btn-wait'),
  coin: $btn('btn-coin'),
  coinCount: $('coin-count'),
  restart: $btn('btn-restart'),
  sound: $btn('btn-sound'),
  hint: $('hint'),
  intro: $('intro'),
  introNight: $('intro-night'),
  introTitle: $('intro-title'),
  introBrief: $('intro-brief'),
  introRule: $('intro-rule'),
  start: $btn('btn-start'),
  caught: $('caught'),
  caughtText: $('caught-text'),
  retry: $btn('btn-retry'),
  result: $('result'),
  resultNight: $('result-night'),
  resultStars: $('result-stars'),
  resultChecks: $('result-checks'),
  resultMoves: $('result-moves'),
  resultStreak: $('result-streak'),
  resultCommunity: $('result-community'),
  resultClue: $('result-clue'),
  resultNext: $('result-next'),
  again: $btn('btn-again'),
  copy: $btn('btn-copy'),
};

const HINT_KEY = 'hush.seenHint';

type Session = {
  night: number;
  level: Level;
  state: GameState;
  aimingCoin: boolean;
  busy: boolean;
  lastStars: number;
};

const scene = new Board3D($('board'));
const sound = new Sound();
scene.onLightning = () => sound.thunder();
scene.onRain = (amount) => sound.setRain(amount);

let session: Session | null = null;

const show = (el: HTMLElement, visible: boolean) => {
  el.hidden = !visible;
};

const readFlag = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

const writeFlag = (key: string) => {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Storage can be blocked; the hint just shows again next time.
  }
};

const hint = (text: string | null) => {
  ui.hint.textContent = text ?? '';
  show(ui.hint, text !== null);
};

const coinTargets = (s: Session): Pos[] => {
  const out: Pos[] = [];
  const rows = s.level.map.length;
  const cols = s.level.map[0]?.length ?? 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (canThrowCoin(s.level, s.state, { x, y })) out.push({ x, y });
    }
  }
  return out;
};

const renderHud = () => {
  if (!session) return;
  const { level, state, night } = session;
  ui.night.textContent = `Night ${night}`;
  ui.job.textContent = level.title;
  ui.moves.textContent = String(state.moves);
  ui.par.textContent = String(level.par);
  const extras = [
    ...state.keys.map((k) => `${k[0]?.toUpperCase() ?? ''}${k.slice(1)} key`),
    ...(state.disguised ? ['In uniform'] : []),
  ];
  ui.painting.textContent =
    (state.hasPainting ? 'Painting: taken' : 'Painting: not yet') +
    (extras.length ? ` · ${extras.join(' · ')}` : '');
  ui.painting.classList.toggle('got', state.hasPainting);
  ui.rule.textContent = `Tonight’s rule: ${level.ruleText}`;
  ui.coin.hidden = level.coins === 0;
  ui.coinCount.textContent = `×${state.coinsLeft}`;
  ui.coin.disabled = state.coinsLeft === 0 || state.status !== 'playing';
  ui.coin.setAttribute('aria-pressed', String(session.aimingCoin));
  ui.wait.disabled = state.status !== 'playing';
};

const setAiming = (on: boolean) => {
  if (!session) return;
  session.aimingCoin = on;
  scene.setCoinTargets(on ? coinTargets(session) : []);
  hint(on ? 'Tap a gold ring to toss the coin. Guards nearby turn to look.' : null);
  renderHud();
};

const restart = () => {
  if (!session) return;
  session.state = initialState(session.level);
  session.aimingCoin = false;
  session.busy = false;
  show(ui.caught, false);
  show(ui.result, false);
  scene.setLevel(session.level, session.state);
  hint(null);
  renderHud();
};

/** Pick the sounds for what just changed. */
const playSounds = (prev: GameState, next: GameState, action: Action) => {
  if (action.type === 'move') sound.step();
  else if (action.type === 'wait') sound.wait();
  else {
    sound.coin();
    if (next.guards.some((g, i) => g.stunned > 0 && (prev.guards[i]?.stunned ?? 0) === 0)) sound.alert();
  }
  if (next.takedowns > prev.takedowns) sound.takedown();
  if (next.keys.length > prev.keys.length) {
    sound.key();
    sound.door();
  }
  if (next.disguised && !prev.disguised) sound.rustle();
  if (next.hasPainting && !prev.hasPainting) sound.painting();
  if (next.switchesOff.join() !== prev.switchesOff.join()) sound.lightSwitch();
  if (action.type === 'move' && next.usedVent && Math.abs(next.player.x - prev.player.x) + Math.abs(next.player.y - prev.player.y) > 1) {
    sound.vent();
  }
  if (next.status === 'caught') sound.caught();
  else if (
    next.status === 'playing' &&
    next.guards.some((g) => !g.out && Math.abs(g.x - next.player.x) + Math.abs(g.y - next.player.y) <= 2)
  ) {
    sound.heartbeat();
  }
  if (next.status === 'escaped') sound.escape();
};

const renderSound = () => {
  ui.sound.textContent = sound.muted ? 'Sound off' : 'Sound on';
  ui.sound.setAttribute('aria-pressed', String(!sound.muted));
};

const act = (action: Action) => {
  if (!session || session.busy || session.state.status !== 'playing') return;
  const prev = session.state;
  const next = step(session.level, prev, action);
  if (!next) {
    if (action.type === 'move') hint('Something’s in the way.');
    return;
  }
  playSounds(prev, next, action);
  session.state = next;
  session.aimingCoin = false;
  hint(null);
  scene.setState(next);
  renderHud();

  if (next.status === 'caught') {
    session.busy = true;
    ui.caughtText.textContent = 'A guard saw you. Watch where they’ll look next, and stay in the dark.';
    window.setTimeout(() => show(ui.caught, true), 450);
  } else if (next.status === 'escaped') {
    session.busy = true;
    void finish();
  }
};

const communityLine = (stats: NightStats, level: Level): string => {
  if (stats.escapes === 0) return 'You’re the first thief out tonight.';
  const pct = Math.round((stats.parEscapes / stats.escapes) * 100);
  const thieves = stats.escapes === 1 ? 'thief has' : 'thieves have';
  return `${stats.escapes} ${thieves} escaped tonight. ${pct}% did it in ${level.par} moves.`;
};

const msUntilNextNight = (): number => {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
};

const finish = async () => {
  if (!session) return;
  const { level, state, night } = session;
  const stars = starsFor(level, state);
  session.lastStars = stars;

  ui.resultNight.textContent = `Night ${night} · ${level.title}`;
  ui.resultStars.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  ui.resultStars.setAttribute('aria-label', `${stars} of 3 stars`);
  ui.resultChecks.replaceChildren(
    ...[
      { ok: true, text: 'Escaped with the painting' },
      { ok: state.moves <= level.par, text: `Par: ${level.par} moves or fewer` },
      { ok: ruleMet(level, state), text: level.ruleText },
    ].map(({ ok, text }) => {
      const li = document.createElement('li');
      li.textContent = text;
      li.classList.toggle('ok', ok);
      return li;
    })
  );
  ui.resultMoves.textContent = String(state.moves);
  ui.resultStreak.textContent = '…';
  ui.resultCommunity.textContent = '';
  ui.resultClue.textContent = `Clue: ${level.clue}`;
  const hours = Math.max(1, Math.round(msUntilNextNight() / 3_600_000));
  ui.resultNext.textContent = `Next job in about ${hours}h.`;
  window.setTimeout(() => show(ui.result, true), 350);

  try {
    const body: CompleteRequest = { night, moves: state.moves, stars };
    const res = await fetch('/api/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: CompleteResponse = await res.json();
    ui.resultStreak.textContent = `${data.streak} ${data.streak === 1 ? 'night' : 'nights'}`;
    ui.resultCommunity.textContent = communityLine(data.stats, level);
  } catch (error) {
    console.error('Could not save escape', error);
    ui.resultStreak.textContent = '–';
    ui.resultCommunity.textContent = 'Couldn’t save this run, so it won’t count toward your streak.';
  }
};

const copyResult = async () => {
  if (!session) return;
  const { night, level, state } = session;
  const stars = '★'.repeat(session.lastStars) + '☆'.repeat(3 - session.lastStars);
  const text = `Hush · Night ${night}: ${level.title}\n${stars} · ${state.moves} moves (par ${level.par})`;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Result copied. Paste it in the comments.');
  } catch {
    showToast('Couldn’t copy. Your browser blocked the clipboard.');
  }
};

const onBoardInput = (input: BoardInput) => {
  if (!session || session.busy) return;
  if (input.kind === 'swipe') {
    if (session.aimingCoin) setAiming(false);
    act({ type: 'move', dir: input.dir });
    return;
  }
  if (session.aimingCoin) {
    if (canThrowCoin(session.level, session.state, input.tile)) {
      act({ type: 'coin', target: input.tile });
    } else {
      setAiming(false);
    }
    return;
  }
  const rel = scene.isNextTo(input.tile);
  if (rel === 'self') act({ type: 'wait' });
  else if (rel) act({ type: 'move', dir: rel });
};

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

document.addEventListener('keydown', (e) => {
  if (!session) return;
  const dir = KEYS[e.key];
  if (dir) {
    e.preventDefault();
    act({ type: 'move', dir });
  } else if (e.key === ' ') {
    e.preventDefault();
    act({ type: 'wait' });
  } else if (e.key === 'c' && session.level.coins > 0) {
    setAiming(!session.aimingCoin);
  } else if (e.key === 'r') {
    restart();
  } else if (e.key === 'Escape' && session.aimingCoin) {
    setAiming(false);
  }
});

ui.wait.addEventListener('click', () => act({ type: 'wait' }));
ui.coin.addEventListener('click', () => session && setAiming(!session.aimingCoin));
ui.restart.addEventListener('click', restart);
ui.sound.addEventListener('click', () => {
  sound.unlock();
  sound.setMuted(!sound.muted);
  renderSound();
});
// Browsers only allow audio after the player interacts.
document.addEventListener('pointerdown', () => sound.unlock(), { once: true });
document.addEventListener('keydown', () => sound.unlock(), { once: true });
renderSound();
ui.retry.addEventListener('click', restart);
ui.again.addEventListener('click', restart);
ui.copy.addEventListener('click', () => void copyResult());
ui.start.addEventListener('click', () => {
  sound.unlock();
  show(ui.intro, false);
  if (!readFlag(HINT_KEY)) {
    hint('Tap a tile next to you to move. Red tiles are where guards are looking.');
    writeFlag(HINT_KEY);
  }
});

const loadNight = async (): Promise<number> => {
  try {
    const res = await fetch('/api/init');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: InitResponse = await res.json();
    return data.night;
  } catch (error) {
    console.error('Could not load the night from the server', error);
    // Local preview only (no Reddit server): ?night=7 picks a level to test.
    const asked = Number.parseInt(new URLSearchParams(window.location.search).get('night') ?? '', 10);
    if (Number.isFinite(asked) && asked > 0) return asked;
    return nightForDate(new Date());
  }
};

const boot = async () => {
  const [night] = await Promise.all([loadNight(), scene.ready]);
  const level = levelForNight(night);
  session = {
    night,
    level,
    state: initialState(level),
    aimingCoin: false,
    busy: false,
    lastStars: 0,
  };
  scene.onInput = onBoardInput;
  scene.setLevel(level, session.state);
  renderHud();

  ui.introNight.textContent = `Night ${night}`;
  ui.introTitle.textContent = level.title;
  ui.introBrief.textContent = level.brief;
  ui.introRule.textContent = `Tonight’s rule: ${level.ruleText}`;
  show(ui.intro, true);
};

void boot();
