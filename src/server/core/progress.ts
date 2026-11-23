import { redis } from '@devvit/web/server';
import type { NightStats } from '../../shared/api';

const userKey = (username: string) => `user:${username}`;
const nightStatsKey = (night: number) => `night:${night}:stats`;
const nightBestKey = (night: number) => `night:${night}:best`;

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
  }

  // hSetNX returns 1 only the first time, so each player counts once.
  const firstEscape = (await redis.hSetNX(`night:${night}:escaped`, username, '1')) === 1;
  if (firstEscape) {
    await redis.hIncrBy(nightStatsKey(night), 'escapes', 1);
  }
  if (moves <= par && (await redis.hSetNX(`night:${night}:atPar`, username, '1')) === 1) {
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
