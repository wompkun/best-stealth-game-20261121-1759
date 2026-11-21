# Night Vault — a top-down stealth game

An original top-down stealth game. You are a night courier slipping through the
Meridian Archive after closing: collect every data shard on the floor, then
reach the service exit unseen. Guards patrol with visible vision cones; walls
and crates block their sight, and the dark patches hide you. Get spotted and
the guard gives chase — break line of sight and vanish into the dark before
the alarm fills.

## How to play

- **Move:** WASD or arrow keys. **Click** anywhere to walk there.
- **Sneak:** hold **Shift** — slower, silent, and harder to spot.
- **Pause:** P or Esc. **Mute:** M. **Retry floor:** R.
- **Start / continue:** Space, Enter, or click.
- **Goal:** collect all the green shards, then reach the glowing green exit.
  The exit stays locked until every shard is collected.
- **Detection:** the ring around you and the alert meter at the top show how
  close a guard is to spotting you. A `?` over a guard means it is suspicious
  and coming to look; a `!` means it has spotted you and is chasing. Running
  is noisy — guards nearby will turn toward the sound.

Three floors, rising difficulty: more guards, faster patrols, longer vision
cones. Clear all three to finish the job.

## How to run

No build step, no network. Serve `game/` with any static server:

```sh
node serve.ts
# then open http://localhost:8080
```

Or serve `game/` with `python3 -m http.server` from inside that folder.
Plays in desktop Chrome. All art is drawn in code and all sound is
synthesized with WebAudio — the game loads nothing from the network.

## Screenshot scenes

The game stages deterministic scenes for screenshots (fixed seed, the
autopilot plays the real rules forward):

- `?shot=start&seed=1` — title screen over Floor 1, guards on patrol
- `?shot=play&seed=1` — mid-sneak: two shards collected, a guard turning suspicious
- `?shot=end&seed=1` — the win screen after the courier reaches the exit

See `shots.json` for the exact list, and `screenshots/SCREENSHOTS-TODO.md`
for how the screenshots were captured.

## Files

- `game/index.html` — the page, loads the game
- `game/src/config.js` — tuning numbers, palette tokens, screen names
- `game/src/random.js` — seeded RNG (mulberry32)
- `game/src/levels.js` — the three floors: tile maps and guard patrols
- `game/src/world.js` — the simulation: movement, vision cones, line of sight, detection, guard states
- `game/src/render.js` — canvas painter: floor, cones, entities, lighting, HUD, screens
- `game/src/input.js` — keyboard + click-to-move
- `game/src/audio.js` — synthesized WebAudio bleeps
- `game/src/shots.js` — deterministic screenshot scenes + autopilot
- `game/src/main.js` — boot, fixed-step loop, screens
- `main.ts` — hands the game in: copies `game/` + `screenshots/` and writes `dossier.json`
- `serve.ts` — tiny static server for local play
- `tests/world.test.mjs` — Node tests for the simulation and the autopilot
