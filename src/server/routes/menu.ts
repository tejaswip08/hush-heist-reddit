import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createNightPost } from '../core/post';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createNightPost();
    return c.json<UiResponse>(
      { navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}` },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>({ showToast: 'Couldn’t post tonight’s job' }, 400);
  }
});
