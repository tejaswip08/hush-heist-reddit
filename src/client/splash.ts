import { requestExpandedMode } from '@devvit/web/client';
import type { InitResponse } from '../shared/api';
import { levelForNight, nightForDate } from '../shared/levels';

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
};

const nightEl = byId('night');
const titleEl = byId('title');
const briefEl = byId('brief');
const metaEl = byId('meta');
const start = byId('start-button');

start.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

const render = (night: number) => {
  const level = levelForNight(night);
  nightEl.textContent = `Night ${night}`;
  titleEl.textContent = level.title;
  briefEl.textContent = level.brief;
};

const init = async () => {
  render(nightForDate(new Date()));
  try {
    const res = await fetch('/api/init');
    if (!res.ok) return;
    const data: InitResponse = await res.json();
    render(data.night);
    const parts: string[] = [];
    if (data.streak > 0) parts.push(`Your streak: ${data.streak}`);
    if (data.best) parts.push(`Your best: ${'★'.repeat(data.best.stars)} in ${data.best.moves} moves`);
    if (data.stats.escapes > 0) parts.push(`${data.stats.escapes} escaped tonight`);
    metaEl.textContent = parts.join(' · ');
    if (data.best) start.textContent = 'Play again';
  } catch (error) {
    console.error('Splash init failed', error);
  }
};

void init();
