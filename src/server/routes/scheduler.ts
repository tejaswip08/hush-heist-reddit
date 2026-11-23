import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import { nightForDate } from '../../shared/levels';
import { createNightPost } from '../core/post';

export const scheduler = new Hono();

/** Runs daily from the cron in devvit.json and posts the new night once. */
scheduler.post('/nightly-post', async (c) => {
  const night = nightForDate(new Date());
  const isNew = (await redis.hSetNX('posted-nights', String(night), '1')) === 1;
  if (!isNew) return c.json({ status: 'skipped', night }, 200);

  try {
    const post = await createNightPost(night);
    return c.json({ status: 'posted', night, postId: post.id }, 200);
  } catch (error) {
    await redis.hDel('posted-nights', [String(night)]);
    console.error(`Nightly post failed for night ${night}:`, error);
    return c.json({ status: 'error', night }, 500);
  }
});
