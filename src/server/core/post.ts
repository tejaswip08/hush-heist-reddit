import { reddit, redis } from '@devvit/web/server';
import { levelForNight, nightForDate } from '../../shared/levels';

const nightKey = (postId: string) => `post:${postId}:night`;

/** Create the post for a night (tonight by default). */
export const createNightPost = async (night = nightForDate(new Date())) => {
  const level = levelForNight(night);
  const post = await reddit.submitCustomPost({
    title: `Hush · Night ${night}: ${level.title}`,
    postData: { night },
    textFallback: { text: `Hush, night ${night}: ${level.brief}` },
  });
  await redis.set(nightKey(post.id), String(night));
  return post;
};

/** Which night a post belongs to. Old posts keep their own night. */
export const nightForPost = async (postId: string): Promise<number> => {
  const stored = await redis.get(nightKey(postId));
  const parsed = stored ? Number.parseInt(stored, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : nightForDate(new Date());
};
