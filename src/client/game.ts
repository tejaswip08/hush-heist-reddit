import { showToast } from '@devvit/web/client';
import type { CaughtRequest, CommentRequest, CommentResponse, CompleteRequest, CompleteResponse, InitResponse, Leaderboard, NightStats } from '../shared/api';
import { levelForNight, nightForDate } from '../shared/levels';
import {
  type Action,
  type Dir,
  type GameState,
  type Level,
  type Pos,
  canThrowCoin,
  initialState,
  SAFE_TURNS,
  countTiles,
  objectiveDone,
  ruleMet,
  starsFor,
  step,
} from '../shared/sim';
import { paintTarget, paintingTitle } from './paintings';
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

const $canvas = (id: string): HTMLCanvasElement => {
  const el = $(id);
  if (!(el instanceof HTMLCanvasElement)) throw new Error(`#${id} is not a canvas`);
  return el;
};

const ui = {
  night: $('hud-night'),
  job: $('hud-job'),
  moves: $('hud-moves'),
  par: $('hud-par'),
  rule: $('hud-rule'),
  chipPainting: $('chip-painting'),
  jobGoal: $('hud-job-goal'),
  chipPar: $('chip-par'),
  chipRule: $('chip-rule'),
  chipItems: $('chip-items'),
  wait: $btn('btn-wait'),
  coin: $btn('btn-coin'),
  coinCount: $('coin-count'),
  restart: $btn('btn-restart'),
  sound: $btn('btn-sound'),
  view: $btn('btn-view'),
  hint: $('hint'),
  intro: $('intro'),
  introNight: $('intro-night'),
  introTitle: $('intro-title'),
  introBrief: $('intro-brief'),
  introCase: $('intro-case'),
  introArt: $canvas('intro-art'),
  introArtName: $('intro-art-name'),
  introGoals: $('intro-goals'),
  introHowto: $('intro-howto'),
  start: $btn('btn-start'),
  caught: $('caught'),
  caughtText: $('caught-text'),
  caughtTip: $('caught-tip'),
  retry: $btn('btn-retry'),
  result: $('result'),
  resultNight: $('result-night'),
  resultStamp: $('result-stamp'),
  resultArt: $canvas('result-art'),
  resultArtName: $('result-art-name'),
  resultBar: $('result-bar'),
  resultPar: $('result-par'),
  resultStars: $('result-stars'),
  resultChecks: $('result-checks'),
  resultMoves: $('result-moves'),
  resultStreak: $('result-streak'),
  resultCommunity: $('result-community'),
  resultBoard: $('result-board'),
  resultBoardRows: $('result-board-rows'),
  resultClue: $('result-clue'),
  resultNext: $('result-next'),
  again: $btn('btn-again'),
  copy: $btn('btn-copy'),
  comment: $btn('btn-comment'),
  join: $btn('btn-join'),
  coach: $('coach'),
};

const HINT_KEY = 'hush.seenHint';
/** Set after a first escape: the coach tips stop showing. */
const TUTORIAL_KEY = 'hush.tutorialDone';
const JOINED_KEY = 'hush.joined';

type Session = {
  night: number;
  level: Level;
  state: GameState;
  aimingCoin: boolean;
  busy: boolean;
  lastStars: number;
  /** Coach tips already shown this session */
  coached: Set<string>;
  coachAge: number;
};

const scene = new Board3D($('board'));
const sound = new Sound();

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

const coaching = () => !readFlag(TUTORIAL_KEY);

const coach = (s: Session, id: string, text: string) => {
  if (s.coached.has(id)) return false;
  s.coached.add(id);
  s.coachAge = 0;
  ui.coach.textContent = text;
  show(ui.coach, true);
  return true;
};

const FACE: Record<string, Pos> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

/** Pick the one tip that fits this moment, for first-time players only. */
const coachTurn = (s: Session) => {
  if (!coaching()) return;
  const st = s.state;
  const lvl = s.level;
  s.coachAge += 1;
  if (st.moves === 1 && coach(s, 'turns', 'Every time you move, the guards move too. Red tiles show where you’d be spotted.')) return;
  const nextTo = st.guards.find((g) => !g.out && Math.abs(g.x - st.player.x) + Math.abs(g.y - st.player.y) === 1);
  if (nextTo) {
    const f = FACE[nextTo.facing];
    const facingYou = f !== undefined && nextTo.x + f.x === st.player.x && nextTo.y + f.y === st.player.y;
    if (!facingYou && lvl.rule !== 'noTakedown' && coach(s, 'takedown', 'A guard with its back to you: step onto it to knock it out.')) return;
  }
  const palm = [FACE.up, FACE.down, FACE.left, FACE.right].some(
    (d) => d !== undefined && lvl.map[st.player.y + d.y]?.[st.player.x + d.x] === 'H'
  );
  if (palm && coach(s, 'palm', 'Potted palms hide you completely, even right in front of a guard.')) return;
  if (objectiveDone(lvl, st) && coach(s, 'exit', `${jobText(lvl).caption}. Now slip out through the exit.`)) return;
  if (st.moves >= 3 && coach(s, 'wait', 'Not safe yet? Tap Wait to stay put while the guards turn.')) return;
  if (s.coachAge > 3) show(ui.coach, false);
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

/** What tonight's job is, in words, for each kind of job. */
const jobText = (level: Level) => {
  const cash = countTiles(level, '$');
  switch (level.job ?? 'painting') {
    case 'cash':
      return { goal: `Grab ${level.cashNeeded ?? cash} of ${cash} cash stacks and escape`, sub: 'The Circle’s laundered cash', chip: 'Cash', caption: 'The Circle’s cash, recovered' };
    case 'boss':
      return { goal: 'Tag the boss from behind and escape', sub: 'The ◎ target in the white suit', chip: 'Boss', caption: 'Lieutenant caught' };
    case 'safe':
      return { goal: `Crack the safe (wait ${SAFE_TURNS} turns on it) and escape`, sub: 'The ledger inside', chip: 'Safe', caption: 'The ledger, recovered' };
    case 'swap':
      return { goal: 'Pick up the forgery, swap it for the painting, escape', sub: paintingTitle(level.id), chip: 'Swap', caption: `“${paintingTitle(level.id)}”, swapped` };
    case 'evidence':
      return { goal: 'Plant the file on the desk while nobody watches, then escape', sub: 'Guards must not be looking at the desk', chip: 'Evidence', caption: 'Evidence planted' };
    case 'painting':
      return { goal: 'Steal the painting and escape', sub: paintingTitle(level.id), chip: 'Painting', caption: `“${paintingTitle(level.id)}”, recovered` };
  }
};

/** Live progress for the job chip, e.g. "Cash 2/3". */
const jobProgress = (level: Level, state: GameState) => {
  const { chip } = jobText(level);
  switch (level.job ?? 'painting') {
    case 'cash':
      return `${chip} ${state.cash.length}/${level.cashNeeded ?? countTiles(level, '$')}`;
    case 'safe':
      return state.safeOpen ? `${chip} open` : `${chip} ${state.safeTurns}/${SAFE_TURNS}`;
    case 'swap':
      return state.hasPainting ? `${chip} done` : state.forgery ? `${chip}: forgery in hand` : chip;
    default:
      return chip;
  }
};

/** Tonight's three star goals, ticked against the current run. */
const goalsFor = (level: Level, state: GameState) => [
  { text: jobText(level).goal, sub: jobText(level).sub, ok: state.status === 'escaped' },
  { text: `Escape in ${level.par} moves or fewer`, sub: 'The best possible route', ok: state.moves <= level.par },
  { text: level.rule === 'none' ? 'Get in, get out' : level.ruleText, sub: 'Tonight’s rule', ok: ruleMet(level, state) },
];

const fillGoals = (list: HTMLElement, level: Level, state: GameState, judged: boolean) => {
  list.replaceChildren(
    ...goalsFor(level, state).map(({ text, sub, ok }) => {
      const li = document.createElement('li');
      const body = document.createElement('div');
      body.append(text);
      const small = document.createElement('small');
      small.textContent = sub;
      body.append(small);
      li.append(body);
      if (judged) li.classList.add(ok ? 'ok' : 'miss');
      return li;
    })
  );
};

const renderHud = () => {
  if (!session) return;
  const { level, state, night } = session;
  ui.night.textContent = `Night ${night}`;
  ui.job.textContent = level.title;
  ui.moves.textContent = String(state.moves);
  ui.par.textContent = String(level.par);

  ui.jobGoal.textContent = jobProgress(level, state);
  ui.chipPainting.classList.toggle('done', objectiveDone(level, state));
  ui.chipPar.classList.toggle('fail', state.moves > level.par);
  ui.chipPar.classList.toggle('done', state.status === 'escaped' && state.moves <= level.par);
  ui.chipRule.hidden = level.rule === 'none';
  ui.rule.textContent = level.ruleText;
  const kept = ruleMet(level, state);
  ui.chipRule.classList.toggle('fail', !kept);
  ui.chipRule.classList.toggle('done', kept && state.status === 'escaped');

  const items = [
    ...state.keys.map((k) => `${k[0]?.toUpperCase() ?? ''}${k.slice(1)} key`),
    ...(state.disguised ? ['In uniform'] : []),
  ];
  ui.chipItems.hidden = items.length === 0;
  ui.chipItems.textContent = items.join(' · ');

  ui.coin.hidden = level.coins === 0;
  ui.coinCount.textContent = `×${state.coinsLeft}`;
  ui.coin.disabled = state.coinsLeft === 0 || state.status !== 'playing';
  ui.coin.setAttribute('aria-pressed', String(session.aimingCoin));
  ui.wait.disabled = state.status !== 'playing';
};

/** Copy the night's painting into a card's frame. */
const drawArt = (canvas: HTMLCanvasElement, level: Level) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(paintTarget(level.id), 0, 0, canvas.width, canvas.height);
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
  window.clearInterval(countdown);
  scene.setLevel(session.level, session.state, session.night);
  hint(null);
  show(ui.coach, false);
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
  if (next.cash.length > prev.cash.length) sound.coin();
  if (next.forgery && !prev.forgery) sound.rustle();
  if (next.safeTurns > prev.safeTurns && !next.safeOpen) sound.lightSwitch();
  if (next.safeOpen && !prev.safeOpen) {
    sound.key();
    sound.door();
  }
  if (next.planted && !prev.planted) sound.painting();
  if (next.switchesOff.join() !== prev.switchesOff.join()) sound.lightSwitch();
  if (action.type === 'move' && next.usedVent && Math.abs(next.player.x - prev.player.x) + Math.abs(next.player.y - prev.player.y) > 1) {
    sound.vent();
  }
  if (next.status === 'caught') sound.caught();
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
  if (next.status === 'playing') coachTurn(session);
  else show(ui.coach, false);

  if (next.status === 'caught') {
    session.busy = true;
    const def = session.level.guards.find((g) => g.id === next.caughtBy);
    ui.caughtText.textContent = def?.dog
      ? 'The hound caught your scent. Dogs smell two tiles ahead, light or dark.'
      : def?.kind === 'patrol'
        ? 'A patrolling guard walked right into you. Watch where their route goes next.'
        : 'A guard saw you. Their flashlight reaches three tiles, but only in the light.';
    ui.caughtTip.textContent = `Tip: ${TIPS[next.moves % TIPS.length] ?? TIPS[0]}`;
    reportCaught(session.night, next.moves);
    window.setTimeout(() => show(ui.caught, true), 450);
  } else if (next.status === 'escaped') {
    session.busy = true;
    void finish();
  }
};

const TIPS = [
  'Tap Wait to let a guard turn away before you cross.',
  'Red tiles show exactly where you would be caught right now.',
  'Sneak up from behind or the side to knock a guard out.',
  'Dark tiles are safe unless a guard is right next to you.',
  'Potted palms hide you, even in a guard’s line of sight.',
];

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

let countdown = 0;

/** Live "next job" timer on the result card. */
const startCountdown = () => {
  window.clearInterval(countdown);
  const tick = () => {
    const ms = msUntilNextNight();
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const sec = Math.floor((ms % 60_000) / 1000);
    ui.resultNext.textContent = [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
  };
  tick();
  countdown = window.setInterval(tick, 1000);
};

const STAMPS = ['', 'Escaped', 'Escaped', 'Flawless'];

const finish = async () => {
  if (!session) return;
  const { level, state, night } = session;
  const stars = starsFor(level, state);
  session.lastStars = stars;

  ui.resultNight.textContent = `Night ${night} · ${level.title}`;
  ui.resultStamp.textContent = STAMPS[stars] ?? 'Escaped';
  ui.resultStamp.classList.toggle('gold', stars === 3);
  drawArt(ui.resultArt, level);
  ui.resultArtName.textContent = jobText(level).caption;
  ui.resultStars.setAttribute('aria-label', `${stars} of 3 stars`);
  ui.resultStars.replaceChildren(
    ...[0, 1, 2].map((i) => {
      const star = document.createElement('span');
      star.className = 'star';
      if (i < stars) {
        star.style.animationDelay = `${0.55 + i * 0.28}s`;
        star.classList.add('on');
        window.setTimeout(() => sound.star(i), 900 + i * 280);
      }
      return star;
    })
  );
  fillGoals(ui.resultChecks, level, state, true);
  ui.resultMoves.textContent = String(state.moves);
  ui.resultPar.textContent = `Par ${level.par}`;
  ui.resultBar.style.width = '0';
  ui.resultBar.classList.toggle('over', state.moves > level.par);
  window.setTimeout(() => {
    ui.resultBar.style.width = `${Math.min(100, Math.round((level.par / Math.max(state.moves, 1)) * 100))}%`;
  }, 400);
  ui.resultStreak.textContent = '…';
  ui.resultCommunity.textContent = '';
  ui.resultBoard.hidden = true;
  writeFlag(TUTORIAL_KEY);
  ui.comment.disabled = false;
  ui.comment.textContent = 'Post to comments';
  ui.join.hidden = community === '' || readFlag(JOINED_KEY);
  if (community) ui.join.textContent = `Join r/${community} for tomorrow’s job`;
  ui.resultClue.textContent = level.clue;
  startCountdown();
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
    ui.resultStreak.textContent = String(data.streak);
    ui.resultCommunity.textContent = communityLine(data.stats, level);
    renderBoard(data.board);
  } catch (error) {
    console.error('Could not save escape', error);
    ui.resultStreak.textContent = '–';
    ui.resultCommunity.textContent = 'Couldn’t save this run, so it won’t count toward your streak.';
  }
};

const boardRow = (rank: number, name: string, stars: number, moves: number, mine: boolean) => {
  const li = document.createElement('li');
  li.className = mine ? 'mine' : '';
  const cells = [`#${rank}`, `u/${name}`, '★'.repeat(stars) + '☆'.repeat(3 - stars), `${moves} moves`];
  for (const text of cells) {
    const span = document.createElement('span');
    span.textContent = text;
    li.append(span);
  }
  return li;
};

const renderBoard = (board: Leaderboard) => {
  if (board.top.length === 0) return;
  const me = board.me;
  const rows = board.top.map((e) => boardRow(e.rank, e.username, e.stars, e.moves, e.username === me?.username));
  if (me && !board.top.some((e) => e.username === me.username)) {
    const gap = document.createElement('li');
    gap.className = 'gap';
    gap.textContent = '…';
    rows.push(gap, boardRow(me.rank, me.username, me.stars, me.moves, true));
  }
  ui.resultBoardRows.replaceChildren(...rows);
  ui.resultBoard.hidden = false;
};

/** Tell the server about a run that ended in a spot, for the mod stats. */
const reportCaught = (night: number, moves: number) => {
  const body: CaughtRequest = { night, moves };
  void fetch('/api/caught', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined);
};

const postComment = async () => {
  if (!session) return;
  ui.comment.disabled = true;
  ui.comment.textContent = 'Posting…';
  try {
    const body: CommentRequest = { night: session.night };
    const res = await fetch('/api/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: CommentResponse = await res.json();
    ui.comment.textContent = 'Posted ✓';
    showToast(data.posted ? 'Your result is in the comments.' : 'You already posted tonight’s result.');
  } catch (error) {
    console.error('Could not post comment', error);
    ui.comment.disabled = false;
    ui.comment.textContent = 'Post to comments';
    showToast('Couldn’t post. Try Copy result and paste it instead.');
  }
};

const joinCommunity = async () => {
  ui.join.disabled = true;
  try {
    const res = await fetch('/api/join', { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFlag(JOINED_KEY);
    ui.join.textContent = 'Joined ✓ See you tomorrow';
    showToast(`Joined r/${community}. A new job drops every night.`);
  } catch (error) {
    console.error('Could not join', error);
    ui.join.disabled = false;
    showToast('Couldn’t join right now.');
  }
};

const copyResult = async () => {
  if (!session) return;
  const { night, level, state } = session;
  const stars = '★'.repeat(session.lastStars) + '☆'.repeat(3 - session.lastStars);
  const text = `Hush · Night ${night}: ${level.title}\n${stars} · ${state.moves} moves (par ${level.par})\n${jobText(level).caption}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied. Paste it in the comments to share your heist.');
  } catch {
    showToast('Couldn’t copy. Your browser blocked the clipboard.');
  }
};

const onBoardInput = (input: BoardInput) => {
  if (!session || session.busy) return;
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
ui.view.addEventListener('click', () => scene.resetView());
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
  if (session && coaching()) {
    coach(session, 'move', 'Tap a glowing tile next to Wren to move. Drag to look around.');
  } else if (!readFlag(HINT_KEY)) {
    hint('Tap a tile next to Wren to move. Drag to look around, pinch to zoom.');
  }
  writeFlag(HINT_KEY);
});
ui.comment.addEventListener('click', () => void postComment());
ui.join.addEventListener('click', () => void joinCommunity());

/** The subreddit this post lives in ('' in local preview). */
let community = '';

const loadNight = async (): Promise<number> => {
  try {
    const res = await fetch('/api/init');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: InitResponse = await res.json();
    community = data.subredditName;
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
    coached: new Set(),
    coachAge: 0,
  };
  scene.onInput = onBoardInput;
  scene.setLevel(level, session.state, night);
  renderHud();

  ui.introCase.textContent = `#${String(night).padStart(3, '0')}`;
  ui.introNight.textContent = `Night ${night}`;
  ui.introTitle.textContent = level.title;
  ui.introBrief.textContent = level.brief;
  drawArt(ui.introArt, level);
  ui.introArtName.textContent = (level.job ?? 'painting') === 'painting' || level.job === 'swap' ? `“${paintingTitle(level.id)}”` : jobText(level).chip + ' job';
  fillGoals(ui.introGoals, level, session.state, false);
  // First-timers see the rules open; returning players see them folded away.
  // Rules stay folded: first-timers get short tips on the board instead.
  if (ui.introHowto instanceof HTMLDetailsElement) ui.introHowto.open = false;
  // `?shot` shows just the board, for store screenshots.
  if (new URLSearchParams(window.location.search).has('shot')) {
    document.body.classList.add('shot');
    return;
  }
  show(ui.intro, true);
};

void boot();
