// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (A* over the tile grid with a heavy cost for tiles inside a guard's
// cone right now, replanned twice a second; it waits out a cone and hides in a
// shadow when the alarm climbs), so the frame is what a short game really looks
// like and the same seed always gives the same frame.

import { FIELD, TILE, STEP, SCREEN_TITLE, SCREEN_PLAY, SCREEN_OVER, SCREEN_WIN } from './config.js';
import { EVENT_WIN, EVENT_CAUGHT, guardSees } from './world.js';

const START_SECONDS = 5;
/** 11 s: the courier has two shards and is slipping past the first guard with
 * the alarm half risen — a mid-sneak frame, before the win at ~21 s. */
const PLAY_SECONDS = 11;
const END_LIMIT_SECONDS = 300;
const REPLAN_SECONDS = 0.5;
const HIDE_AT = 0.35;
const SAFE_AT = 0.15;
const SNEAK_NEAR = 180;
/** How close a guard may come to a hiding player before it relocates. */
const HIDE_GUARD_NEAR = 130;
/** A hiding spot counts as safe when every guard is at least this far away. */
const HIDE_GUARD_FAR = 160;

/** A* over the tile grid; `danger(tx, ty)` is 0..1 for how exposed a tile is now. */
function findPath(level, from, to, danger) {
  const key = (x, y) => `${x},${y}`;
  const open = [{ x: from.x, y: from.y, g: 0, f: 0, parent: null }];
  const best = new Map([[key(from.x, from.y), 0]]);
  const closed = new Set();
  const heuristic = (x, y) => Math.abs(x - to.x) + Math.abs(y - to.y);
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.x === to.x && cur.y === to.y) {
      const path = [];
      let node = cur;
      while (node !== null) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }
    closed.add(key(cur.x, cur.y));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (level.solid(nx, ny) || closed.has(key(nx, ny))) continue;
      const stepCost = 1 + danger(nx, ny) * 14;
      const g = cur.g + stepCost;
      if (best.has(key(nx, ny)) && best.get(key(nx, ny)) <= g) continue;
      best.set(key(nx, ny), g);
      open.push({ x: nx, y: ny, g, f: g + heuristic(nx, ny), parent: cur });
    }
  }
  return null;
}

/** BFS for the nearest tile matching `want`, through walkable tiles. */
function nearestTile(level, from, want) {
  const key = (x, y) => `${x},${y}`;
  const seen = new Set([key(from.x, from.y)]);
  const queue = [{ x: from.x, y: from.y }];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (want(cur.x, cur.y)) return cur;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (seen.has(key(nx, ny)) || level.solid(nx, ny)) continue;
      seen.add(key(nx, ny));
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

function makeAutopilot(world) {
  const { level } = world;
  let path = null;
  let pathIndex = 0;
  let replanIn = 0;
  let hideTarget = null;

  const tileOf = (x, y) => ({ x: Math.floor(x / TILE), y: Math.floor(y / TILE) });

  const danger = (tx, ty) => {
    const cx = (tx + 0.5) * TILE;
    const cy = (ty + 0.5) * TILE;
    let d = 0;
    for (const guard of world.state.guards) {
      if (guardSees(guard, cx, cy, level)) d = 1;
      else if (Math.hypot(guard.x - cx, guard.y - cy) < 70) d = Math.max(d, 0.5);
    }
    return d;
  };

  const nearestGuardDist = (x, y) => {
    let best = Infinity;
    for (const guard of world.state.guards) best = Math.min(best, Math.hypot(guard.x - x, guard.y - y));
    return best;
  };

  /** Nearest shadow tile that is clear of guards, else the nearest shadow at all. */
  const pickHideout = (from) => {
    const far = nearestTile(level, from, (x, y) => {
      if (!level.shadow(x, y)) return false;
      return nearestGuardDist((x + 0.5) * TILE, (y + 0.5) * TILE) > HIDE_GUARD_FAR;
    });
    if (far !== null) return far;
    return nearestTile(level, from, (x, y) => level.shadow(x, y));
  };

  const currentTarget = () => {
    const player = world.state.player;
    if (hideTarget !== null) return hideTarget;
    const remaining = world.state.shards.filter((s) => !s.taken);
    if (remaining.length > 0) {
      let bestShard = remaining[0];
      let bestD = Infinity;
      for (const s of remaining) {
        const d = Math.hypot(s.x - player.x, s.y - player.y);
        if (d < bestD) {
          bestD = d;
          bestShard = s;
        }
      }
      return tileOf(bestShard.x, bestShard.y);
    }
    return tileOf(world.state.exit.x, world.state.exit.y);
  };

  return function autopilot(dt) {
    const player = world.state.player;
    const playerTile = tileOf(player.x, player.y);
    const chasing = world.state.guards.some((g) => g.state === 'chase');
    const fleeing = chasing || world.state.detection >= HIDE_AT;

    if (fleeing && hideTarget === null) {
      hideTarget = pickHideout(playerTile);
      path = null;
    }
    if (hideTarget !== null) {
      if (world.state.detection <= SAFE_AT && !chasing) {
        hideTarget = null;
        path = null;
      } else if (nearestGuardDist(player.x, player.y) < HIDE_GUARD_NEAR) {
        // A guard is closing on the hiding spot: relocate to another shadow.
        const next = pickHideout(playerTile);
        if (next !== null && (next.x !== hideTarget.x || next.y !== hideTarget.y)) {
          hideTarget = next;
          path = null;
        }
      }
    }

    replanIn -= dt;
    if (path === null || replanIn <= 0) {
      const target = currentTarget();
      path = findPath(level, playerTile, target, danger);
      pathIndex = 0;
      replanIn = REPLAN_SECONDS;
    }
    if (path === null || path.length === 0) return { x: 0, y: 0, sneak: true };

    // Never step into a tile a guard's cone covers right now; wait it out.
    // Check two nodes ahead: the cone can sweep onto the next tile mid-step.
    if (!fleeing) {
      for (let ahead = 1; ahead <= 2; ahead += 1) {
        const next = path[Math.min(pathIndex + ahead, path.length - 1)];
        if (next && danger(next.x, next.y) >= 1) return { x: 0, y: 0, sneak: true };
      }
      // Standing in a cone already: step back along the path instead of forward.
      if (danger(playerTile.x, playerTile.y) >= 1 && pathIndex > 0) {
        const back = path[pathIndex - 1];
        const dx = (back.x + 0.5) * TILE - player.x;
        const dy = (back.y + 0.5) * TILE - player.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: dx / len, y: dy / len, sneak: true };
      }
    }

    const node = path[Math.min(pathIndex, path.length - 1)];
    const cx = (node.x + 0.5) * TILE;
    const cy = (node.y + 0.5) * TILE;
    const dx = cx - player.x;
    const dy = cy - player.y;
    if (Math.hypot(dx, dy) < 6 && pathIndex < path.length - 1) {
      pathIndex += 1;
      return { x: 0, y: 0, sneak: true };
    }
    const len = Math.hypot(dx, dy) || 1;
    const nearGuard = world.state.guards.some((g) => Math.hypot(g.x - player.x, g.y - player.y) < SNEAK_NEAR);
    // Fleeing means running: sneaking is slower than a chasing guard.
    const sneak = !fleeing && (nearGuard || world.state.detection > 0.25);
    return { x: dx / len, y: dy / len, sneak };
  };
}

export { makeAutopilot as createAutopilot };

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and
 * return the screen to draw over it and the shard count to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { x: 0, y: 0 }, {});
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const pilot = makeAutopilot(world);
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  for (let i = 0; i < limit / STEP; i += 1) {
    const move = pilot(STEP);
    const events = world.step(STEP, { x: move.x, y: move.y }, { sneak: move.sneak });
    if (events & (EVENT_WIN | EVENT_CAUGHT)) break;
  }
  const won = world.state.status === 'won';
  const caught = world.state.status === 'caught';
  return {
    screen: won ? SCREEN_WIN : caught ? SCREEN_OVER : SCREEN_PLAY,
    best: world.state.shardsCollected,
  };
}
