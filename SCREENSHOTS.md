# Screenshots — capture instructions

The three screenshots in this folder are real renders of the game, captured
in headless Chromium from the deterministic `?shot=` scenes. Serve the game
first:

```sh
node serve.ts --port 8901
```

Then capture each scene at 1280x720 (the game scales its 1280x720 field to
the window):

| File | URL |
| ---- | --- |
| `1-start.jpg` | http://localhost:8901/?shot=start&seed=1 |
| `2-play.jpg` | http://localhost:8901/?shot=play&seed=1 |
| `3-end.jpg` | http://localhost:8901/?shot=end&seed=1 |

Each scene paints twice and then sets `window.__shotReady = true`; capture
after that flag is set (e.g. with `--virtual-time-budget=5000` in headless
Chromium, or by waiting for the flag in a small driver script). The scenes
are deterministic: the same seed always renders the same frame.

- `1-start.jpg` — the title screen over Floor 1, guards on patrol with their
  vision cones visible (the cover image).
- `2-play.jpg` — mid-sneak: the courier has two shards and is slipping past
  the first guard as its suspicion climbs.
- `3-end.jpg` — the win screen: all three shards collected, exit reached.

Keep each file under 256 KiB, long side at most 1280 px, short side at least
480 px (1280x720 JPEG at quality ~80 is well inside the cap).
