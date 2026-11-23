# Hush: project overview

A daily stealth-heist game that runs inside Reddit posts. Built for **Reddit's Game of the Day Hackathon** (Devpost, Nov 11 – Dec 8, 2026).

## The hackathon in short

- **Brief:** build a new *daily game* on Reddit's Developer Platform (Devvit Web, Interactive Posts): bite-sized, a satisfying daily loop, replayable, and native to Reddit.
- **Prizes:** Best Daily Game $15,000 · Best Ported Daily Game $6,000 · 10 Honorable Mentions at $1,000 · Devvit Helper and Feedback awards.
- **Judging:** Delightful UX · Polish · Reddit-y (community-minded) · Daily Content.
- **Avoid:** obvious AI slop, games *about* Reddit (karma, Snoo), overused ideas (space shooters, clones, simple platformers, trivia), and anything that doesn't run on Devvit.
- **Submit by Dec 8:**
  1. The app listing link on developers.reddit.com
  2. A public demo post running the game in our subreddit
  3. Optionally, the developer feedback survey

  Upload and playtest only. **Don't publish** the app during the hackathon.

## The game

**Premise:** You're **Wren**, a retired thief pulled back in by an anonymous client, *The Curator*. Every night a sealed envelope brings one job: steal a painting back from a member of **The Gilded Circle**, a secret ring of art thieves, without being seen. Each job ends with a clue. Over the season the clues point to the Circle's leader. Nobody gets hurt; it's a heist, not a hit.

**How a turn works**
- The map is a small top-down grid of rooms, halls, and doors.
- You move one tile per turn (tap a neighbouring tile, swipe, or use the arrow keys or WASD). Then every guard takes one step.
- Guards see **3 tiles ahead, but only on lit tiles**. In the dark they only notice you if you're right in front of them.
- Take the painting, then reach the exit.

**Tools and twists**
| Thing | What it does |
|---|---|
| Patrol guard | Walks a fixed loop |
| Sentry | Stands still and turns on a timer |
| Light switch | Step on it to black out a room (step again to turn it back on) |
| Vent | Step in to pop out at the linked vent |
| Coin | Toss within 3 tiles; nearby guards turn to look for 2 turns |
| Takedown | Step onto a guard from behind or the side to knock them out (they're set aside next to the board) |
| Potted palm | Stand in it and no one can see you (but a guard walking into you still catches you) |
| Guard dog | Smells you 2 tiles ahead, light or dark; no flashlight |
| Guard uniform | Take it off a coat rack: guards stop recognising you for the rest of the job (dogs still smell you) |
| Gold key and door | A locked door blocks moves and sight; picking up its key swings every door of that colour open |

**Scoring (3 stars a night)**
1. Escape with the painting
2. Do it in par moves or fewer (par = the true optimum, computed by a solver)
3. Keep the night's rule, for example "never step into the light" or "no takedowns"

**The daily loop:** one new job per night (UTC). The game keeps your streak and your best run per night, and shows "X thieves escaped tonight, Y% at par". The result card has a spoiler-free "Copy result" button for posting in the comments.

**Look:** a horror-tinged scale model at night (three.js). Each level is one building on its lot in a rain-soaked city: asphalt streets, street lamps, and blocks of buildings with a few lit windows fading into fog. A storm rolls over: occasional rain showers (15–30 s, with long dry spells), lightning flashes that light the whole city, flickering lamps, and a cold, desaturated grade. Five settings change the floor, obstacles and decor per level: **gallery** (marble, display walls with paintings, busts, palms), **mansion** (parquet, dark panelled walls with candle sconces, candelabras), **library** (patterned red carpet, bookshelves with rows of books, globes), **garden** (grass and stepping stones, hedges, dead trees, gravestones), **cellar** (stone flags, crate stacks, barrels). Figurines have jointed legs and arms, hands, shaped torsos and faces: Wren in a long hooded coat with a mask, satchel and lantern; guards in caps, blazers, ties and belts with raised flashlights. Rendered with reflections, ambient occlusion (desktop), bloom, tilt-shift, bevelled edges and varnished pieces; the camera glides in, pieces land with dust, knocked-out guards topple off the board.

**Sound:** all synthesised in code (no audio files): footsteps, takedown thud, key chime, door creak, uniform rustle, coin clinks, light switch, vent clang, painting pickup, a spotted sting, an escape fanfare, night ambience (room tone, low drone, crickets, and a soft muffled patter only while a shower is passing), thunder after each lightning flash, and a heartbeat when a guard is within 2 tiles. A Sound on/off button remembers your choice.

## What's built

- Full game rules plus a solver that checks every level is winnable and sets its exact par
- 9 nights: *The quiet wing* (tutorial), *The night watch* (takedowns), *The long gallery* (hiding, no takedowns), *Lights out*, *The back way*, *Good boy* (guard dog), *Dress code* (disguise), *The locked wing* (key and door), *Heads or tails*. They repeat after night 9.
- Gameplay modelled on Hitman GO: node-and-line board, turn-based guards, takedowns from behind, hiding plants, dogs, disguises, keys and locked doors, distractions, trapdoor-style vents, and 3 optional objectives per level
- Local preview can pick a level with `?night=7` (only used when the Reddit server isn't reachable)
- Intro card, "Spotted" screen, and result card with stars, streak, community stats, and the clue
- An in-feed splash card for the post
- Server: streaks, best runs, nightly stats (Redis), a daily auto-post (scheduler), a mod menu item "Post tonight's Hush job", and a post created on app install
- Mobile layout
- Runs live in a Devvit playtest subreddit

## Still to do before Dec 8

- [ ] About 11 more levels (target 20+)
- [ ] Saturday community vote on Sunday's boss twist
- [ ] Devvit Journeys events (the judges call these out for streaks and analytics)
- [ ] Art polish: lamp fixtures, more props, test frame rate on low-end phones
- [ ] Trim the upload size (drop source maps from the build)
- [ ] Set up the subreddit (r/Hush or similar), make the public demo post, and submit on Devpost

## Tech stack

| Part | Tool |
|---|---|
| Platform | Devvit Web (Reddit Interactive Posts) |
| Board rendering | three.js 0.187 (3D) with Canvas 2D textures |
| HUD and menus | Plain HTML/CSS |
| Language and build | TypeScript, Vite |
| Server | Hono on Devvit's Node runtime |
| Storage | Devvit Redis |
| Daily posts | Devvit Scheduler (cron `5 0 * * *` UTC) |

## Project layout

```
src/
  shared/
    sim.ts           Game rules (moves, guards, light, coin, vents, stars) + BFS solver
    levels.ts        One entry per night; night 1 = Nov 18, 2026 (UTC)
    levels.test.ts   Checks each level is solvable and its par is exact
    api.ts           Request/response types shared by client and server
  client/
    art.ts           Canvas helpers and the painted wood floor
    three/models.ts  3D models: thief and guard figurines, walls, painting, exit, vents, switches
    three/scene3d.ts 3D board: camera, moonlight and lamps, shadows, hop animations, tap/swipe input
    game.ts/.html/.css   HUD, controls, intro, caught and result screens
    splash.*         The card shown in the Reddit feed
  server/
    routes/api.ts        /api/init and /api/complete
    routes/scheduler.ts  Nightly auto-post
    routes/menu.ts       Mod menu "Post tonight's Hush job"
    routes/triggers.ts   Posts a job when the app is installed
    core/progress.ts     Streaks, best runs, nightly stats in Redis
devvit.json          App config (name: hush-heist, entrypoints, menu, scheduler)
```

## Running it

You need Node 24+ and a Reddit account with a finished developer account (https://developers.reddit.com).

```bash
npm install
npm run login        # log the Devvit CLI into your Reddit account
npm run dev          # playtest live in a test subreddit
```

The playtest prints a subreddit link. Open it, use the mod menu item **"Post tonight's Hush job"**, and open the post.

To work on the app, you need to be added as a collaborator on the `hush-heist` app on developers.reddit.com. Otherwise, register your own copy with a different name in `devvit.json` and `package.json`.

Other commands:
```bash
npm run test:unit    # level solver tests
npm run test:types   # TypeScript
npm run lint
npm run build
```

Quick local preview without Reddit (scores won't save):
```bash
npm run build
python3 -m http.server 4173 --directory dist/client
# open http://localhost:4173/game.html
```

## Adding a level

1. Add an entry to `LEVELS` in `src/shared/levels.ts` with `par: 0`.
   - **Map:** `#` wall, `.` floor, `S` start, `P` painting, `E` exit, `H` potted palm, `U` guard uniform. Doors and keys go in `doors` and `keys`.
   - **Light:** `1` lit, `0` dark, or a letter for "lit while that switch group is on"
   - Add guards (`patrol` with a route, or `sentry` with facings), vents, switches, coins, a rule, a brief, and a clue.
2. Run `npm run test:unit`. It fails with the real par, or tells you the level can't be solved.
3. Set `par` to that number and run the tests again.

Keep levels small (about 7×7). Each night should take 2 to 4 minutes, and the start tile must be safe on turn one.

## Credits

3D models: **KayKit** packs by Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)), licensed CC0: Character Pack Adventures (Wren is the hooded Rogue, guards are the Knight), Halloween Bits, City Builder Bits, and Furniture Bits. `public/models` holds five compressed files built from them (three prop packs plus the two characters, about 1.3 MB in total; geometry quantized and meshopt-compressed). To rebuild, download the packs from github.com/KayKit-Game-Assets and run `node tools/build-models.mjs <folder>`.
