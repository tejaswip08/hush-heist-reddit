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
- You move one tile per turn (tap a neighbouring tile, or use the arrow keys or WASD). Then every guard takes one step.
- **Camera:** drag to turn and tilt the model, pinch or scroll to zoom, and tap **View** to reset. A press only counts as a tap (a move) if it doesn't drag.
- Guards see **3 tiles ahead, but only on lit tiles**. In the dark they only notice you if you're right in front of them.
- Do tonight's job, then reach the exit. Six job types rotate: **steal a painting**; **cash run** (grab every stack of cash); **crack the safe** (stand on it, unseen, for 2 turns); **the swap** (pick up a forgery first, then swap it for the painting); **plant evidence** (leave the file on a desk while no guard can see you); **catch the boss** (knock out the white-suited lieutenant, who has a bodyguard).

**Tools and twists**
| Thing | What it does |
|---|---|
| Patrol guard | Walks a fixed loop |
| Sentry | Stands still and turns on a timer |
| Light switch | Step on it to black out a room (step again to turn it back on) |
| Vent | Step in to pop out at the linked vent |
| Coin | Toss within 3 tiles; nearby guards turn to look for 2 turns |
| Takedown | Step onto a guard from behind or the side to knock them out. They topple, hop into the painted **"Knocked out"** box on the pavement, stand back up, and glare at Wren wherever Wren goes, fuming (red anger mark) and stomping |
| Potted palm | Stand in it and no one can see you (but a guard walking into you still catches you) |
| Guard dog | Smells you 2 tiles ahead, light or dark; no flashlight |
| Guard uniform | Take it off a coat rack: guards stop recognising you for the rest of the job (dogs still smell you) |
| Gold key and door | A locked door blocks moves and sight; picking up its key swings every door of that colour open |

**Scoring (3 stars a night)**
1. Finish the job and escape
2. Do it in par moves or fewer (par = the true optimum, computed by a solver)
3. Keep the night's rule, for example "never step into the light" or "no takedowns"

**The daily loop:** one new job per night (UTC). The game keeps your streak and your best run per night, and shows "X thieves escaped tonight, Y% at par". The result card has a spoiler-free "Copy result" button for posting in the comments.

**Look:** Hitman GO-style scale models (three.js). Each level is one building on a deep **moulded wooden display base with a brass plaque** ("Night 6 · Good boy"): tall facades with arched windows, doors and wall lanterns along the back and left, low balustrades at the front and right, and a **non-playable apron** in front and to the right that brings the model to life — **bystander figurines** (couples chatting, a lady in a red coat, a man in a white suit and panama, a waiter with a tray, guests seated at café tables under parasols) who shift their weight and look around, plus palms in planters, lamp posts and a parked car. **Every episode has its own sky and light** (10 moods). Pieces: Wren the noir burglar (fedora, trench coat, red scarf, lantern) and guards in coloured bomber jackets with flashlights. Static scenery and figurines are batched into a few meshes per material (about 360 draw calls, ~160k triangles) so it stays smooth on phones; add `?debug` to log draw calls locally.

**Sound:** all synthesised in code (no audio files): footsteps, takedown thud, key chime, door creak, uniform rustle, coin clinks, light switch, vent clang, painting pickup, a spotted sting, an escape fanfare, and night ambience (room tone, low drone, crickets). A Sound on/off button remembers your choice.

## What's built

- Full game rules plus a solver that checks every level is winnable and sets its exact par
- 62 nights (about two months), repeating after night 62. Nights 1–14 teach the mechanics: 1 quiet wing (tutorial), 2 night watch, 3 long gallery, 4 **cash run**, 5 lights out, 6 back way, 7 **the vault** (safe), 8 good boy (dog), 9 dress code (uniform), 10 **the swap**, 11 locked wing (key/door), 12 **boss night**, 13 heads or tails (coin), 14 **evidence**. Nights 15–62 are a six-chapter story — *Lisbon*, *The auction*, *The family business*, *The lighthouse*, *The Curator* — whose clues reveal that Wren's client, the Curator, founded the Gilded Circle; the finale (night 62) is catching him.
- Gameplay modelled on Hitman GO: node-and-line board, turn-based guards, takedowns from behind, hiding plants, dogs, disguises, keys and locked doors, distractions, trapdoor-style vents, and 3 optional objectives per level
- Local preview can pick a level with `?night=7` (only used when the Reddit server isn't reachable)
- Case-file screens: a **briefing dossier** (case number, the night's stolen painting with its title, the three star goals, folded how-to-play), live **goal chips** in the HUD (painting, moves vs par, tonight's rule), a **"Spotted" stamp** with the reason and a tip, and a **"Case closed" result** (rubber stamp, recovered painting, stars that pop in with chimes, moves bar vs par, streak flame, the clue on a pinned typed note, share button, live countdown to the next job)
- Every night has its own generated target painting with a title (paintings.ts), shown on the 3D easel and the cards
- An in-feed splash card with a **live replay** of tonight's level behind it (a light 2D board tilted like the diorama: guards run their real patrols and turns, flashlights sweep and danger tiles pulse, while Wren waits at the start, so it never spoils the route. Horror mood: the board sits in darkness lit only by lamps, Wren's flickering lantern and sweeping flashlights; the hound's red eyes glow; lightning double-flashes; fog drifts; film grain; a red heartbeat pulses round the card when a guard gets close; a blinking "Live · guards on patrol" tag. Pauses off-screen and respects reduced motion), and the night's case file: the episode's sky colours behind a small dossier with the stolen painting, title, brief, your streak and best, how many thieves escaped tonight, and an "Escaped"/"Flawless" stamp once you've played
- Server: streaks, best runs, nightly stats (Redis), a daily auto-post (scheduler), a mod menu item "Post tonight's Hush job", and a post created on app install
- Mobile layout
- Runs live in a Devvit playtest subreddit

## Still to do before Dec 8

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
    levels.ts        One entry per night; night 1 = Nov 23, 2026 (UTC), launch day
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
   - **Map:** `#` wall, `.` floor, `S` start, `P` painting, `E` exit, `$` cash, `B` safe, `F` forgery, `D` desk (set `job`, and `cashNeeded` for cash runs; mark one guard `boss: true` for boss jobs), `H` potted palm, `U` guard uniform. Doors and keys go in `doors` and `keys`.
   - **Light:** `1` lit, `0` dark, or a letter for "lit while that switch group is on"
   - Add guards (`patrol` with a route, or `sentry` with facings), vents, switches, coins, a rule, a brief, and a clue.
2. Run `npm run test:unit`. It fails with the real par, or tells you the level can't be solved.
3. Set `par` to that number and run the tests again.

Keep levels small (about 7×7). Each night should take 2 to 4 minutes, and the start tile must be safe on turn one.

## Credits

3D models: **KayKit** packs by Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)), licensed CC0: Character Pack Adventures (Wren is the hooded Rogue, guards are the Knight), Halloween Bits, City Builder Bits, and Furniture Bits. `public/models` holds five compressed files built from them (three prop packs plus the two characters, about 1.3 MB in total; geometry quantized and meshopt-compressed). To rebuild, download the packs from github.com/KayKit-Game-Assets and run `node tools/build-models.mjs <folder>`.
