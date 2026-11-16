# threejs-fps-02-v3

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Dimah28/threejs-fps-02-v3/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Dimah28/threejs-fps-02-v3/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Duskfall Bazaar — a round-based tactical FPS in the browser, built for make.fun's "Make the best three.js tactical FPS" bounty. Five versus five, first to 7 rounds, in a night bazaar at dusk lit by lanterns.

## Run it

```sh
node serve.ts   # serves game/ on http://localhost:8080
```

Open the page, click to play. `?shot=start|play|plant|end&seed=7` renders deterministic captures for the dossier; `?autotest=1` runs a hands-free autopilot used for headless testing.

## The game

Two teams — **Emberfox** (attack) and **Lantern Ward** (defend) — fight over two bomb sites, **Spice Court** and **Lantern Row**, on a 55 x 40 m map with three lanes, a fountain plaza, market stalls you can wallbang through, and two balconies reached by ramps.

- 5v5 with 9 bots: entry, support, lurker, AWPer and anchor roles, waypoint pathing, low-HP retreats, plant and defuse behaviour, and radio chatter that calls out contacts by location and bot name.
- Named weapons with their own feel: **Vesper AR**, **Moth SMG**, **Heron DMR** (scoped), **Cinder-12** shotgun, **Wasp P9** pistol and a knife — plus smoke, flash and frag utility, kevlar and a defuse kit.
- Economy and a buy phase between rounds, halftime side swap after round 6, first to 7 (max 12 rounds, overtime if tied).
- Full HUD: live minimap with site letters and a location readout, team scores with alive pips, round timer, killfeed with HS / WALLBANG tags, radio feed, damage numbers, plant/defuse banners and progress bars, and name tags over every bot.
- Synthesised WebAudio sound (no audio files): gunshots per weapon, reloads, hit and kill ticks, plant beeps, explosion, footsteps and a quiet night-bazaar ambience. All art is procedural — no external assets, the game runs fully offline from static files.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click to lock) |
| Click | Fire |
| R | Reload |
| 1 / 2 / 3 / 4 | Primary / sidearm / knife / charge |
| Q / G / 5 | Flash / smoke / frag |
| E (hold) | Plant / defuse the charge |
| B | Buy menu (buy phase) |
| Ctrl | Crouch, Space jump, M mute |

## Layout

- `game/index.html` — page + full HUD
- `game/src/main.js` — boot, loop, rounds, shooting, plant/defuse
- `game/src/world.js` — the bazaar map, lanes, sites, waypoints
- `game/src/bots.js` — bot AI
- `game/src/weapons.js` — weapons, utility, economy
- `game/src/hud.js` — minimap, killfeed, radio, buy menu
- `game/src/effects.js` — tracers, muzzle flash, smoke, explosion
- `game/src/audio.js` — synthesised sound
- `game/src/player.js` / `game/src/input.js` — movement + input
- `main.ts` — hands the game in (copies `game/` + `screenshots/`, writes `dossier.json` via the kit's vendored library)

MIT licensed. Built with three.js 0.187.0 (vendored in `game/vendor/three/`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=6kzxz8b0&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
