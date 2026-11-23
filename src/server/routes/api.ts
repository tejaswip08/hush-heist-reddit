import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type {
  CompleteRequest,
  CompleteResponse,
  ErrorResponse,
  InitResponse,
} from '../../shared/api';
import { levelForNight } from '../../shared/levels';
import { nightForPost } from '../core/post';
import { getBest, getStats, getStreak, recordEscape } from '../core/progress';

export const api = new Hono();

const fail = (message: string): ErrorResponse => ({ status: 'error', message });

api.get('/init', async (c) => {
  const { postId } = context;
  if (!postId) return c.json(fail('postId is missing from context'), 400);

  try {
    const [night, username] = await Promise.all([
      nightForPost(postId),
      reddit.getCurrentUsername(),
    ]);
    const name = username ?? 'anonymous';
    const [streak, best, stats] = await Promise.all([
      username ? getStreak(username, night) : Promise.resolve(0),
      username ? getBest(username, night) : Promise.resolve(null),
      getStats(night),
    ]);

    return c.json<InitResponse>({
      type: 'init',
      postId,
      username: name,
      night,
      streak,
      best,
      stats,
    });
  } catch (error) {
    console.error(`init failed for post ${postId}:`, error);
    return c.json(fail('Could not load tonight’s job'), 500);
  }
});

api.post('/complete', async (c) => {
  const { postId } = context;
  if (!postId) return c.json(fail('postId is missing from context'), 400);

  const username = await reddit.getCurrentUsername();
  if (!username) return c.json(fail('Log in to save your escape'), 401);

  const body = await c.req.json<CompleteRequest>();
  const night = await nightForPost(postId);
  if (body.night !== night) return c.json(fail('This post is for a different night'), 400);

  const level = levelForNight(night);
  const moves = Math.floor(body.moves);
  const stars = Math.floor(body.stars);
  // Nobody can beat the solver's par, and stars are 1–3.
  if (!Number.isFinite(moves) || moves < level.par || stars < 1 || stars > 3) {
    return c.json(fail('That result isn’t possible'), 400);
  }

  const { streak, firstEscape } = await recordEscape(username, night, moves, stars, level.par);
  const stats = await getStats(night);
  return c.json<CompleteResponse>({ type: 'complete', streak, firstEscape, stats });
});
