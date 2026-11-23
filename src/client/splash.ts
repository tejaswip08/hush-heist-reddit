import { requestExpandedMode } from '@devvit/web/client';
import type { InitResponse } from '../shared/api';
import { levelForNight, nightForDate } from '../shared/levels';
import { DemoBoard } from './demo';
import { paintTarget, paintingTitle } from './paintings';
import { moodFor } from './three/moods';

// The card in the Reddit feed: tonight's case file, kept light (no 3D).

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
};

const app = byId('app');
const caseEl = byId('case');
const nightEl = byId('night');
const titleEl = byId('title');
const briefEl = byId('brief');
const metaEl = byId('meta');
const artName = byId('art-name');
const stamp = byId('stamp');
const start = byId('start-button');
const art = byId('art');

start.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

/** Board colours per setting, matching the 3D themes. */
const BOARD: Record<string, { floor: string; floorAlt: string; wall: string; wallTop: string; ink: string }> = {
  gallery: { floor: '#ece8e1', floorAlt: '#ded8cf', wall: '#c9ab9b', wallTop: '#f7efe7', ink: 'rgba(30,30,34,0.55)' },
  mansion: { floor: '#6b4a32', floorAlt: '#5e402b', wall: '#4f5c40', wallTop: '#7d8a69', ink: 'rgba(235,215,170,0.5)' },
  library: { floor: '#5a1c22', floorAlt: '#4e171c', wall: '#8f4f3d', wallTop: '#c7826a', ink: 'rgba(230,190,120,0.5)' },
  garden: { floor: '#34452b', floorAlt: '#2c3b24', wall: '#46583a', wallTop: '#5f7650', ink: 'rgba(230,225,210,0.5)' },
  cellar: { floor: '#5d5852', floorAlt: '#524d47', wall: '#3d3833', wallTop: '#6b6056', ink: 'rgba(230,220,200,0.45)' },
};

let demo: DemoBoard | null = null;
let demoNight = 0;
const demoCanvas = byId('demo');

const render = (night: number) => {
  const level = levelForNight(night);
  const mood = moodFor(night);
  app.style.setProperty('--sky-top', mood.sky[0]);
  app.style.setProperty('--sky-mid', mood.sky[1]);
  app.style.setProperty('--sky-low', mood.sky[2]);
  caseEl.textContent = `#${String(night).padStart(3, '0')}`;
  nightEl.textContent = `Night ${night} · Tonight`;
  titleEl.textContent = level.title;
  briefEl.textContent = level.brief;
  artName.textContent = `“${paintingTitle(level.id)}”`;
  if (art instanceof HTMLCanvasElement) {
    art.getContext('2d')?.drawImage(paintTarget(level.id), 0, 0, art.width, art.height);
  }
  if (demoCanvas instanceof HTMLCanvasElement && demoNight !== night) {
    demoNight = night;
    demo?.stop();
    demo = new DemoBoard(demoCanvas, level, BOARD[level.theme] ?? BOARD.gallery!);
    demo.onFlash = () => {
      // Restart the CSS lightning animation on every strike.
      app.classList.remove('flash');
      void app.offsetWidth;
      app.classList.add('flash');
    };
    demo.onDanger = (near) => app.classList.toggle('danger', near);
    demo.start();
  }
};

const init = async () => {
  render(nightForDate(new Date()));
  try {
    const res = await fetch('/api/init');
    if (!res.ok) return;
    const data: InitResponse = await res.json();
    render(data.night);

    const parts: string[] = [];
    if (data.streak > 0) parts.push(`Streak ${data.streak}`);
    if (data.best) parts.push(`Your best ${'★'.repeat(data.best.stars)}${'☆'.repeat(3 - data.best.stars)} in ${data.best.moves}`);
    if (data.stats.escapes > 0) {
      parts.push(`${data.stats.escapes} ${data.stats.escapes === 1 ? 'thief' : 'thieves'} out tonight`);
    }
    metaEl.textContent = parts.join(' · ');

    if (data.best) {
      stamp.textContent = data.best.stars === 3 ? 'Flawless' : 'Escaped';
      stamp.classList.toggle('gold', data.best.stars === 3);
      stamp.hidden = false;
      start.textContent = data.best.stars === 3 ? 'Play again' : 'Go for 3 stars';
    }
  } catch (error) {
    console.error('Splash init failed', error);
  }
};

void init();
