# Hush

A daily stealth heist for Reddit, built on Devvit Web for Reddit's Game of the Day Hackathon (Nov 11 – Dec 8, 2026).

Every night a new job posts to the subreddit: steal one painting from a small blueprint map and get out without being seen. Guards see 3 tiles ahead, but only in the light. Use the dark, light switches, vents and a tossed coin. Three stars per night: escape, hit par, keep the night's rule.

## Layout

- `src/shared/sim.ts` – all game rules (movement, guards, light, coin, vents, stars) and a BFS solver. Shared by client, server and tests.
- `src/shared/levels.ts` – one entry per night. Nights cycle through the list, starting Nov 23, 2026 (UTC).
- `src/client/three/` – the 3D diorama board (three.js): models, lighting, camera, input.
- `src/client/game.ts` / `game.html` – the HUD, controls, intro, caught and result screens.
- `src/client/splash.*` – the inline post preview in the feed.
- `src/server` – `/api/init`, `/api/complete` (streaks, best runs, nightly stats in Redis), the mod menu item, the install trigger, and the nightly scheduler post.

## Adding a level

1. Add an entry to `LEVELS` in `src/shared/levels.ts` with `par: 0`.
2. Run `npm run test:unit`. The test fails with the solver's real par (or says the level is unsolvable).
3. Set `par` to that number and run the tests again.

Map: `#` wall, `.` floor, `S` start, `P` painting, `E` exit, `H` potted palm, `U` guard uniform. Doors and keys go in the level's `doors` and `keys` lists. Light: `1` lit, `0` dark, a letter = lit while that switch group is on.

## Commands

- `npm run login` – log the Devvit CLI into Reddit
- `npm run dev` – playtest live in your test subreddit
- `npm run test:unit` – level solver tests
- `npm run test:types` / `npm run lint`
- `npm run deploy` – upload a private build (don't publish during the hackathon)

## Credits

3D models: **KayKit** packs by Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)), licensed CC0: Character Pack Adventures (Wren is the hooded Rogue, guards are the Knight), Halloween Bits, City Builder Bits, and Furniture Bits. `public/models` holds five compressed files built from them (three prop packs plus the two characters, about 1.3 MB in total; geometry quantized and meshopt-compressed). To rebuild, download the packs from github.com/KayKit-Game-Assets and run `node tools/build-models.mjs <folder>`.
