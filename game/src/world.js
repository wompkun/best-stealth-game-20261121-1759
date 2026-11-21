// The simulation: one fixed-step world with no DOM in it, so Node can run it for
// tests and for the deterministic screenshot scenes. A player sneaks through a
// floor, guards patrol with vision cones, detection builds in sight and fades
// out of it, and the level ends when the player is caught or reaches the exit
// with every data shard.

import { FIELD, TILE, PLAYER, GUARD, DETECTION, PICKUP_RADIUS, EXIT_RADIUS } from './config.js';
import { parseLevel } from './levels.js';

export const EVENT_PICKUP = 1;
export const EVENT_SPOTTED = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_WIN = 8;

const TAU = Math.PI * 2;

/** Smallest signed angle from `a` to `b`, in (-PI, PI]. */
function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d <= -Math.PI) d += TAU;
  return d;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Whether the circle at (x, y) with `radius` overlaps any solid tile. */
function circleHitsSolid(level, x, y, radius) {
  const x0 = Math.floor((x - radius) / TILE);
  const x1 = Math.floor((x + radius) / TILE);
  const y0 = Math.floor((y - radius) / TILE);
  const y1 = Math.floor((y + radius) / TILE);
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      if (!level.solid(tx, ty)) continue;
      const cx = clamp(x, tx * TILE, (tx + 1) * TILE);
      const cy = clamp(y, ty * TILE, (ty + 1) * TILE);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < radius * radius) return true;
    }
  }
  return false;
}

/** Move an entity axis by axis so it slides along walls instead of sticking. */
function moveEntity(level, entity, dx, dy, radius) {
  const nx = entity.x + dx;
  if (!circleHitsSolid(level, nx, entity.y, radius)) entity.x = nx;
  const ny = entity.y + dy;
  if (!circleHitsSolid(level, entity.x, ny, radius)) entity.y = ny;
}

/** Whether the segment from (ax, ay) to (bx, by) crosses any solid tile. */
export function lineBlocked(level, ax, ay, bx, by) {
  const d = dist(ax, ay, bx, by);
  const steps = Math.max(1, Math.ceil(d / 8));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    if (level.solid(Math.floor(x / TILE), Math.floor(y / TILE))) return true;
  }
  return false;
}

/** Whether `guard` can see the point (x, y): in range, in the cone, sight clear. */
export function guardSees(guard, x, y, level) {
  const d = dist(guard.x, guard.y, x, y);
  if (d > guard.range) return false;
  if (d > 1) {
    const angle = Math.atan2(y - guard.y, x - guard.x);
    if (Math.abs(angleDiff(guard.facing, angle)) > guard.coneHalf) return false;
  }
  return !lineBlocked(level, guard.x, guard.y, x, y);
}

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function createWorld(random, levelIndex) {
  const level = parseLevel(levelIndex);
  const state = {
    levelIndex,
    levelName: level.name,
    time: 0,
    status: 'playing',
    player: {
      x: level.playerStart.x,
      y: level.playerStart.y,
      facing: -Math.PI / 2,
      moving: false,
      sneak: false,
    },
    guards: level.guards.map((g, i) => {
      const start = g.waypoints[0];
      const next = g.waypoints[1] ?? start;
      return {
        x: start.x,
        y: start.y,
        facing: Math.atan2(next.y - start.y, next.x - start.x),
        waypointIndex: 1 % g.waypoints.length,
        pauseTimer: (random() * 0.8) + i * 0.3,
        lookPhase: random() * TAU,
        state: 'patrol',
        detection: 0,
        lastSeen: { x: start.x, y: start.y },
        loseTimer: 0,
        searchTimer: 0,
        speed: g.speed,
        range: g.range,
        coneHalf: g.coneHalf,
        waypoints: g.waypoints,
      };
    }),
    shards: level.shards.map((s) => ({ ...s })),
    exit: { ...level.exit },
    shardsCollected: 0,
    detection: 0,
    particles: [],
    alertFlash: 0,
  };

  /** The exact initial state, for reset(): a reset world equals a fresh one. */
  const initial = structuredClone(state);

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * TAU;
      const v = speed * (0.4 + random() * 0.8);
      state.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + random() * 0.4, max: 0.9, color });
    }
  }

  function stepGuard(guard, dt) {
    const player = state.player;
    const sees = guardSees(guard, player.x, player.y, level);
    if (sees) {
      guard.lastSeen = { x: player.x, y: player.y };
      guard.loseTimer = 0;
      let rate = DETECTION.build;
      const d = dist(guard.x, guard.y, player.x, player.y);
      if (d < DETECTION.closeRange) rate *= DETECTION.closeMultiplier;
      if (level.shadow(Math.floor(player.x / TILE), Math.floor(player.y / TILE))) rate *= DETECTION.shadowMultiplier;
      if (player.sneak) rate *= DETECTION.sneakMultiplier;
      guard.detection = clamp(guard.detection + rate * dt, 0, 1);
    } else {
      guard.detection = clamp(guard.detection - DETECTION.decay * dt, 0, 1);
      if (guard.state === 'chase') {
        guard.loseTimer += dt;
        if (guard.loseTimer >= GUARD.loseSightSeconds) {
          guard.state = 'search';
          guard.searchTimer = GUARD.searchSeconds;
        }
      }
    }

    const wasChase = guard.state === 'chase';
    if (guard.detection >= 1 && guard.state !== 'chase') {
      guard.state = 'chase';
      guard.loseTimer = 0;
    } else if (guard.detection >= DETECTION.suspiciousAt && guard.state === 'patrol') {
      guard.state = 'suspicious';
    } else if (guard.detection < 0.1 && guard.state === 'suspicious') {
      guard.state = 'patrol';
    }

    let events = 0;
    if (guard.state === 'chase' && !wasChase) events |= EVENT_SPOTTED;

    // Movement by state.
    if (guard.state === 'patrol') {
      if (guard.pauseTimer > 0) {
        guard.pauseTimer -= dt;
        // Look around while waiting: a slow sweep of the facing, narrow enough
        // that the cone still covers what is straight ahead.
        guard.lookPhase += dt * 1.4;
        guard.facing += Math.sin(guard.lookPhase) * 0.45 * dt;
      } else {
        const target = guard.waypoints[guard.waypointIndex];
        const d = dist(guard.x, guard.y, target.x, target.y);
        if (d < 6) {
          guard.waypointIndex = (guard.waypointIndex + 1) % guard.waypoints.length;
          guard.pauseTimer = GUARD.waypointPause;
        } else {
          const angle = Math.atan2(target.y - guard.y, target.x - guard.x);
          guard.facing = angle;
          moveEntity(level, guard, Math.cos(angle) * guard.speed * dt, Math.sin(angle) * guard.speed * dt, GUARD.radius);
        }
      }
    } else if (guard.state === 'suspicious' || guard.state === 'search') {
      const target = guard.lastSeen;
      const d = dist(guard.x, guard.y, target.x, target.y);
      if (d > 8) {
        const angle = Math.atan2(target.y - guard.y, target.x - guard.x);
        guard.facing = angle;
        const speed = guard.speed * GUARD.suspiciousMultiplier;
        moveEntity(level, guard, Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt, GUARD.radius);
      } else {
        guard.lookPhase += dt * 2.2;
        guard.facing += Math.sin(guard.lookPhase) * 1.6 * dt;
        if (guard.state === 'search') {
          guard.searchTimer -= dt;
          if (guard.searchTimer <= 0) {
            guard.state = 'patrol';
            guard.detection = 0;
          }
        }
      }
    } else if (guard.state === 'chase') {
      const angle = Math.atan2(player.y - guard.y, player.x - guard.x);
      guard.facing = angle;
      const speed = guard.speed * GUARD.chaseMultiplier;
      moveEntity(level, guard, Math.cos(angle) * speed * dt, Math.sin(angle) * speed * dt, GUARD.radius);
      if (dist(guard.x, guard.y, player.x, player.y) < GUARD.catchDistance) {
        state.status = 'caught';
        burst(player.x, player.y, '#e5484d', 26, 190);
        events |= EVENT_CAUGHT;
      }
    }
    return events;
  }

  const world = {
    state,
    level,
    step(dt, move, opts = {}) {
      if (state.status !== 'playing') {
        for (const p of state.particles) p.life -= dt;
        state.particles = state.particles.filter((p) => p.life > 0);
        return 0;
      }
      state.time += dt;
      let events = 0;
      const player = state.player;
      const sneak = Boolean(opts.sneak);
      player.sneak = sneak;
      const mx = move?.x ?? 0;
      const my = move?.y ?? 0;
      const len = Math.hypot(mx, my);
      player.moving = len > 0.01;
      if (player.moving) {
        const nx = mx / (len > 1 ? len : 1);
        const ny = my / (len > 1 ? len : 1);
        const speed = sneak ? PLAYER.sneakSpeed : PLAYER.walkSpeed;
        player.facing = Math.atan2(ny, nx);
        moveEntity(level, player, nx * speed * dt, ny * speed * dt, PLAYER.radius);
        player.x = clamp(player.x, PLAYER.radius, FIELD.width - PLAYER.radius);
        player.y = clamp(player.y, PLAYER.radius, FIELD.height - PLAYER.radius);
        // Walking is noisy: guards close by turn suspicious toward the sound.
        if (!sneak) {
          for (const guard of state.guards) {
            if (guard.state === 'patrol' && dist(guard.x, guard.y, player.x, player.y) < PLAYER.noiseRadius) {
              guard.state = 'suspicious';
              guard.lastSeen = { x: player.x, y: player.y };
              guard.detection = Math.max(guard.detection, DETECTION.suspiciousAt);
            }
          }
        }
      }

      for (const shard of state.shards) {
        if (!shard.taken && dist(player.x, player.y, shard.x, shard.y) < PICKUP_RADIUS) {
          shard.taken = true;
          state.shardsCollected += 1;
          events |= EVENT_PICKUP;
          burst(shard.x, shard.y, '#7dffb0', 18, 150);
        }
      }

      for (const guard of state.guards) {
        events |= stepGuard(guard, dt);
        if (state.status !== 'playing') break;
      }

      state.detection = state.guards.reduce((m, g) => Math.max(m, g.detection), 0);
      if (state.alertFlash > 0) state.alertFlash = Math.max(0, state.alertFlash - dt * 2);
      if (events & EVENT_SPOTTED) state.alertFlash = 1;

      for (const p of state.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.life -= dt;
      }
      state.particles = state.particles.filter((p) => p.life > 0);

      if (state.status === 'playing' && state.shardsCollected === state.shards.length) {
        if (dist(player.x, player.y, state.exit.x, state.exit.y) < EXIT_RADIUS) {
          state.status = 'won';
          burst(state.exit.x, state.exit.y, '#37e08b', 40, 220);
          events |= EVENT_WIN;
        }
      }
      return events;
    },
    reset() {
      // Restore the exact initial state (a snapshot taken at creation), so a
      // reset world is byte-identical to a fresh one from the same seed.
      const fresh = structuredClone(initial);
      for (const key of Object.keys(state)) state[key] = fresh[key];
    },
    stateHash() {
      const parts = [
        state.levelIndex,
        Math.round(state.time * 1000),
        state.status,
        Math.round(state.player.x * 100),
        Math.round(state.player.y * 100),
        state.shardsCollected,
        state.guards.map((g) => [Math.round(g.x * 100), Math.round(g.y * 100), Math.round(g.facing * 1000), g.state, Math.round(g.detection * 1000)].join(',')).join(';'),
        state.shards.map((s) => (s.taken ? 1 : 0)).join(''),
      ];
      return fnv1a(parts.join('|'));
    },
  };
  return world;
}
