import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createNightPost, nightForPost } from '../core/post';
import { getNightReport, getStats } from '../core/progress';
import { levelForNight } from '../../shared/levels';

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

const day = (iso: string | null) => (iso ? iso.slice(5, 16).replace('T', ' ') : '–');

/** Moderators: everyone who played this post's night, and how. */
menu.post('/stats', async (c) => {
  const { postId } = context;
  if (!postId) return c.json<UiResponse>({ showToast: 'Open this on a Hush post' }, 400);
  try {
    const night = await nightForPost(postId);
    const level = levelForNight(night);
    const [rows, stats] = await Promise.all([getNightReport(night), getStats(night)]);
    const tries = rows.reduce((n, r) => n + r.tries, 0);
    const lines = rows.slice(0, 200).map((r, i) => {
      const best = r.best ? `${'★'.repeat(r.best.stars)}${'☆'.repeat(3 - r.best.stars)} ${r.best.moves} moves` : 'not escaped';
      return `${i + 1}. u/${r.username} · ${best} · ${r.tries} tries, ${r.fails} caught · first played ${day(r.firstPlay)} · escaped ${day(r.firstEscape)}`;
    });
    if (rows.length > 200) lines.push(`…and ${rows.length - 200} more`);
    const report = lines.length ? lines.join('\n') : 'Nobody has played this night yet.';
    return c.json<UiResponse>({
      showForm: {
        name: 'statsForm',
        form: {
          title: `Night ${night}: ${level.title}`,
          description: `${rows.length} players · ${stats.escapes} escaped · ${stats.parEscapes} at par (${level.par}) · ${tries} runs. Times are UTC.`,
          fields: [{ type: 'paragraph', name: 'report', label: 'Players, best run first', defaultValue: report }],
          acceptLabel: 'Close',
          cancelLabel: 'Close',
        },
      },
    });
  } catch (error) {
    console.error(`Stats failed: ${error}`);
    return c.json<UiResponse>({ showToast: 'Couldn’t load the stats' }, 400);
  }
});
