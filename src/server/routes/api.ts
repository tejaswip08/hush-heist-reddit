import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type {
  CaughtRequest,
  CommentRequest,
  CommentResponse,
  CompleteRequest,
  CompleteResponse,
  ErrorResponse,
  InitResponse,
} from '../../shared/api';
import { levelForNight } from '../../shared/levels';
import { nightForPost } from '../core/post';
import { claimComment, getBest, getLeaderboard, getStats, getStreak, recordCaught, recordEscape } from '../core/progress';

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
      subredditName: context.subredditName ?? '',
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
  // A streak badge next to the player's name in this community.
  const { subredditName } = context;
  if (subredditName && streak > 0) {
    try {
      await reddit.setUserFlair({
        subredditName,
        username,
        text: `🔥 ${streak}-night streak · Hush`,
        backgroundColor: '#1d2b22',
        textColor: 'light',
      });
    } catch (error) {
      console.warn(`Could not set flair for ${username}:`, error);
    }
  }
  const [stats, board] = await Promise.all([getStats(night), getLeaderboard(night, username)]);
  return c.json<CompleteResponse>({ type: 'complete', streak, firstEscape, stats, board });
});

api.post('/caught', async (c) => {
  const { postId } = context;
  if (!postId) return c.json(fail('postId is missing from context'), 400);
  const username = await reddit.getCurrentUsername();
  if (!username) return c.json(fail('Log in to save your runs'), 401);
  const body = await c.req.json<CaughtRequest>();
  const night = await nightForPost(postId);
  if (body.night !== night) return c.json(fail('This post is for a different night'), 400);
  await recordCaught(username, night);
  return c.json({ type: 'caught' });
});

/** Post the player's best run tonight as a comment, from their account. */
api.post('/comment', async (c) => {
  const { postId } = context;
  if (!postId) return c.json(fail('postId is missing from context'), 400);
  const username = await reddit.getCurrentUsername();
  if (!username) return c.json(fail('Log in to comment'), 401);
  const body = await c.req.json<CommentRequest>();
  const night = await nightForPost(postId);
  if (body.night !== night) return c.json(fail('This post is for a different night'), 400);
  const best = await getBest(username, night);
  if (!best) return c.json(fail('Escape first, then share'), 400);
  if (!(await claimComment(username, night))) {
    return c.json<CommentResponse>({ type: 'comment', posted: false });
  }
  const level = levelForNight(night);
  const stars = '★'.repeat(best.stars) + '☆'.repeat(3 - best.stars);
  const verdict = best.moves <= level.par ? 'at par' : `par ${level.par}`;
  try {
    await reddit.submitComment({
      id: postId,
      // Posted by the app (unpublished apps can't post as the player), so it
      // names the player itself.
      text: `**u/${username}** escaped **Night ${night}: ${level.title}**\n\n${stars} · ${best.moves} moves (${verdict}) 🤫`,
      runAs: 'APP',
    });
  } catch (error) {
    // Keep the claim: the comment may have gone through anyway, and a retry
    // would post it twice.
    console.error(`Comment failed for ${username}:`, error);
    return c.json(fail('Couldn’t post the comment'), 500);
  }
  return c.json<CommentResponse>({ type: 'comment', posted: true });
});

/** Join the community the game lives in. */
api.post('/join', async (c) => {
  try {
    await reddit.subscribeToCurrentSubreddit();
    return c.json({ type: 'join' });
  } catch (error) {
    console.error('Join failed:', error);
    return c.json(fail('Couldn’t join'), 500);
  }
});
