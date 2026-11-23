import { redis } from '@devvit/web/server';
import type { BoardEntry, Leaderboard, NightStats } from '../../shared/api';

const userKey = (username: string) => `s1:user:${username}`;
const nightStatsKey = (night: number) => `s1:night:${night}:stats`;
const nightBestKey = (night: number) => `s1:night:${night}:best`;
/** Sorted set: higher score = better run (more stars, then fewer moves). */
const boardKey = (night: number) => `s1:night:${night}:board`;
/** Hashes keyed by username: runs started and ended, and times. */
const triesKey = (night: number) => `s1:night:${night}:tries`;
const failsKey = (night: number) => `s1:night:${night}:fails`;
const firstPlayKey = (night: number) => `s1:night:${night}:firstPlay`;
const firstEscapeKey = (night: number) => `s1:night:${night}:firstEscapeAt`;

const boardScore = (stars: number, moves: number) => stars * 1000 - moves;

/** Count one finished run (caught or escaped) for a player. */
const countTry = async (username: string, night: number) => {
  await redis.hIncrBy(triesKey(night), username, 1);
  await redis.hSetNX(firstPlayKey(night), username, new Date().toISOString());
};

/** Record a run that ended with Wren being spotted. */
export const recordCaught = async (username: string, night: number): Promise<void> => {
  await countTry(username, night);
  await redis.hIncrBy(failsKey(night), username, 1);
};

const toInt = (v: string | undefined): number => {
  const n = v ? Number.parseInt(v, 10) : 0;
  return Number.isFinite(n) ? n : 0;
};

export const getStats = async (night: number): Promise<NightStats> => {
  const raw = await redis.hGetAll(nightStatsKey(night));
  return { escapes: toInt(raw.escapes), parEscapes: toInt(raw.parEscapes) };
};

export const getStreak = async (username: string, tonight: number): Promise<number> => {
  const raw = await redis.hGetAll(userKey(username));
  const last = toInt(raw.lastNight);
  // A streak survives until a full night is missed.
  return last >= tonight - 1 ? toInt(raw.streak) : 0;
};

export const getBest = async (
  username: string,
  night: number
): Promise<{ moves: number; stars: number } | null> => {
  const raw = await redis.hGet(nightBestKey(night), username);
  if (!raw) return null;
  const [moves, stars] = raw.split(':').map((v) => Number.parseInt(v, 10));
  return moves !== undefined && stars !== undefined && Number.isFinite(moves) && Number.isFinite(stars)
    ? { moves, stars }
    : null;
};

/**
 * Record an escape. Stats count each player once per night; the best
 * result and the streak update on every better run.
 */
export const recordEscape = async (
  username: string,
  night: number,
  moves: number,
  stars: number,
  par: number
): Promise<{ streak: number; firstEscape: boolean }> => {
  const previous = await getBest(username, night);
  if (
    !previous ||
    stars > previous.stars ||
    (stars === previous.stars && moves < previous.moves)
  ) {
    await redis.hSet(nightBestKey(night), { [username]: `${moves}:${stars}` });
    await redis.zAdd(boardKey(night), { member: username, score: boardScore(stars, moves) });
  }
  await countTry(username, night);
  await redis.hSetNX(firstEscapeKey(night), username, new Date().toISOString());

  // hSetNX returns 1 only the first time, so each player counts once.
  const firstEscape = (await redis.hSetNX(`s1:night:${night}:escaped`, username, '1')) === 1;
  if (firstEscape) {
    await redis.hIncrBy(nightStatsKey(night), 'escapes', 1);
  }
  if (moves <= par && (await redis.hSetNX(`s1:night:${night}:atPar`, username, '1')) === 1) {
    await redis.hIncrBy(nightStatsKey(night), 'parEscapes', 1);
  }

  const user = await redis.hGetAll(userKey(username));
  const last = toInt(user.lastNight);
  let streak = toInt(user.streak);
  if (night > last) {
    streak = night === last + 1 ? streak + 1 : 1;
    await redis.hSet(userKey(username), { lastNight: String(night), streak: String(streak) });
  }
  return { streak, firstEscape };
};

const entry = async (night: number, username: string, rank: number): Promise<BoardEntry | null> => {
  const best = await getBest(username, night);
  return best ? { rank, username, moves: best.moves, stars: best.stars } : null;
};

/** The top 10 for a night, and the current player's own place. */
export const getLeaderboard = async (night: number, username: string | null): Promise<Leaderboard> => {
  const key = boardKey(night);
  const [rows, total] = await Promise.all([
    redis.zRange(key, 0, 9, { by: 'rank', reverse: true }),
    redis.zCard(key),
  ]);
  const top: BoardEntry[] = [];
  for (const [i, row] of rows.entries()) {
    const e = await entry(night, row.member, i + 1);
    if (e) top.push(e);
  }
  let me: BoardEntry | null = null;
  if (username) {
    const asc = await redis.zRank(key, username);
    if (asc !== undefined) me = await entry(night, username, total - asc);
  }
  return { top, me, total };
};

export type PlayerReport = {
  username: string;
  tries: number;
  fails: number;
  best: { moves: number; stars: number } | null;
  firstPlay: string | null;
  firstEscape: string | null;
};

/** Everything recorded about every player on one night (for moderators). */
export const getNightReport = async (night: number): Promise<PlayerReport[]> => {
  const [tries, fails, best, firstPlay, firstEscape] = await Promise.all([
    redis.hGetAll(triesKey(night)),
    redis.hGetAll(failsKey(night)),
    redis.hGetAll(nightBestKey(night)),
    redis.hGetAll(firstPlayKey(night)),
    redis.hGetAll(firstEscapeKey(night)),
  ]);
  const names = new Set([...Object.keys(tries), ...Object.keys(best)]);
  const rows = [...names].map((username): PlayerReport => {
    const [m, st] = (best[username] ?? '').split(':').map((v) => Number.parseInt(v, 10));
    return {
      username,
      tries: toInt(tries[username]),
      fails: toInt(fails[username]),
      best: m !== undefined && st !== undefined && Number.isFinite(m) && Number.isFinite(st) ? { moves: m, stars: st } : null,
      firstPlay: firstPlay[username] ?? null,
      firstEscape: firstEscape[username] ?? null,
    };
  });
  // Best runs first, then players who never escaped.
  return rows.sort(
    (a, b) =>
      (b.best ? boardScore(b.best.stars, b.best.moves) : -1e9) -
        (a.best ? boardScore(a.best.stars, a.best.moves) : -1e9) || a.username.localeCompare(b.username)
  );
};

/** True the first time a player posts their result for a night. */
export const claimComment = async (username: string, night: number): Promise<boolean> =>
  (await redis.hSetNX(`s1:night:${night}:commented`, username, '1')) === 1;
