// The painter: a canvas 2D renderer for the 1280x720 logical field, scaled to the
// window. Draws floor, shadows, crates, walls, vision cones clipped by walls,
// entities, particles, a darkness overlay with a light pool around the player,
// the HUD, and the title / pause / caught / win screens. No DOM reads except
// the canvas itself and prefers-reduced-motion.

import { FIELD, TILE, PALETTE, FONT, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_WIN } from './config.js';

const CONE_RAYS = 26;

function conePoints(guard, level) {
  const points = [{ x: guard.x, y: guard.y }];
  for (let i = 0; i <= CONE_RAYS; i += 1) {
    const angle = guard.facing - guard.coneHalf + (2 * guard.coneHalf * i) / CONE_RAYS;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let reach = guard.range;
    for (let d = 8; d <= guard.range; d += 8) {
      const x = guard.x + dx * d;
      const y = guard.y + dy * d;
      if (level.solid(Math.floor(x / TILE), Math.floor(y / TILE))) {
        reach = d;
        break;
      }
    }
    points.push({ x: guard.x + dx * reach, y: guard.y + dy * reach });
  }
  return points;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || FIELD.width;
    const h = canvas.clientHeight || FIELD.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = Math.min(w / FIELD.width, h / FIELD.height);
    offsetX = (w - FIELD.width * scale) / 2;
    offsetY = (h - FIELD.height * scale) / 2;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr);
  }

  function drawFloor(level) {
    for (let ty = 0; ty < level.rows; ty += 1) {
      for (let tx = 0; tx < level.cols; tx += 1) {
        const x = tx * TILE;
        const y = ty * TILE;
        const ch = level.tileAt(tx, ty);
        if (ch === '#') continue;
        ctx.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.floor : PALETTE.floorAlt;
        ctx.fillRect(x, y, TILE, TILE);
        if (ch === 's') {
          ctx.fillStyle = PALETTE.shadowZone;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = 'rgba(120, 150, 220, 0.10)';
          ctx.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7);
        }
      }
    }
    ctx.strokeStyle = PALETTE.floorLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let tx = 0; tx <= level.cols; tx += 1) {
      ctx.moveTo(tx * TILE, 0);
      ctx.lineTo(tx * TILE, FIELD.height);
    }
    for (let ty = 0; ty <= level.rows; ty += 1) {
      ctx.moveTo(0, ty * TILE);
      ctx.lineTo(FIELD.width, ty * TILE);
    }
    ctx.stroke();
  }

  function drawExit(state) {
    const { x, y } = state.exit;
    const open = state.shardsCollected === state.shards.length;
    const pulse = reducedMotion ? 0 : Math.sin(state.time * 3) * 0.15 + 0.15;
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 54);
    glow.addColorStop(0, open ? `rgba(55, 224, 139, ${0.5 + pulse})` : 'rgba(55, 224, 139, 0.18)');
    glow.addColorStop(1, 'rgba(55, 224, 139, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-54, -54, 108, 108);
    ctx.fillStyle = open ? PALETTE.exit : PALETTE.exitDark;
    ctx.strokeStyle = PALETTE.exit;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-16, -22, 32, 44);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = PALETTE.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(open ? 'EXIT — GO' : 'EXIT — LOCKED', x, y - 34);
  }

  function drawShards(state) {
    for (const shard of state.shards) {
      if (shard.taken) continue;
      const bob = reducedMotion ? 0 : Math.sin(state.time * 2.4 + shard.x) * 3;
      const pulse = reducedMotion ? 0.8 : 0.65 + Math.sin(state.time * 3 + shard.y) * 0.25;
      ctx.save();
      ctx.translate(shard.x, shard.y + bob);
      ctx.rotate(Math.PI / 4);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = PALETTE.shard;
      ctx.shadowColor = PALETTE.shard;
      ctx.shadowBlur = 14;
      ctx.fillRect(-8, -8, 16, 16);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function drawCover(level) {
    for (let ty = 0; ty < level.rows; ty += 1) {
      for (let tx = 0; tx < level.cols; tx += 1) {
        const ch = level.tileAt(tx, ty);
        const x = tx * TILE;
        const y = ty * TILE;
        if (ch === 'c') {
          ctx.fillStyle = PALETTE.crate;
          ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
          ctx.strokeStyle = PALETTE.crateEdge;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7);
          ctx.beginPath();
          ctx.moveTo(x + 3, y + 3);
          ctx.lineTo(x + TILE - 3, y + TILE - 3);
          ctx.moveTo(x + TILE - 3, y + 3);
          ctx.lineTo(x + 3, y + TILE - 3);
          ctx.stroke();
        } else if (ch === '#') {
          ctx.fillStyle = PALETTE.wall;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = PALETTE.wallTop;
          ctx.fillRect(x, y, TILE, 5);
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        }
      }
    }
  }

  function drawCones(state, level) {
    for (const guard of state.guards) {
      const points = conePoints(guard, level);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.fillStyle = guard.state === 'chase' ? PALETTE.coneAlert : guard.state === 'suspicious' || guard.state === 'search' ? PALETTE.coneSuspicious : PALETTE.coneCalm;
      ctx.fill();
      ctx.strokeStyle = PALETTE.coneEdge;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      const color = guard.state === 'chase' ? PALETTE.guardAlert : guard.state === 'suspicious' || guard.state === 'search' ? PALETTE.guardSuspicious : PALETTE.guardCalm;
      ctx.save();
      ctx.translate(guard.x, guard.y);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(2, 4, 15, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Facing tick: the direction the guard looks.
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(guard.facing) * 10, Math.sin(guard.facing) * 10);
      ctx.lineTo(Math.cos(guard.facing) * 21, Math.sin(guard.facing) * 21);
      ctx.stroke();
      // Eyes.
      const ex = Math.cos(guard.facing);
      const ey = Math.sin(guard.facing);
      const px = -ey;
      const py = ex;
      ctx.fillStyle = '#10131a';
      ctx.beginPath();
      ctx.arc(ex * 5 + px * 5, ey * 5 + py * 5, 2.2, 0, Math.PI * 2);
      ctx.arc(ex * 5 - px * 5, ey * 5 - py * 5, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (guard.state === 'suspicious' || guard.state === 'search') {
        ctx.fillStyle = PALETTE.guardSuspicious;
        ctx.font = `700 20px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('?', guard.x, guard.y - 24);
      } else if (guard.state === 'chase') {
        ctx.fillStyle = PALETTE.guardAlert;
        ctx.font = `700 22px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('!', guard.x, guard.y - 24);
      }
      if (guard.detection > 0.02 && guard.state !== 'chase') {
        ctx.strokeStyle = PALETTE.guardAlert;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(guard.x, guard.y, 20, -Math.PI / 2, -Math.PI / 2 + guard.detection * Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.playerRing;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = PALETTE.playerRing;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(player.facing) * 9, Math.sin(player.facing) * 9);
    ctx.lineTo(Math.cos(player.facing) * 18, Math.sin(player.facing) * 18);
    ctx.stroke();
    if (player.sneak) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(191, 243, 250, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 19, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    if (state.detection > 0.02) {
      ctx.strokeStyle = state.detection > 0.85 ? PALETTE.danger : PALETTE.guardSuspicious;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 24, -Math.PI / 2, -Math.PI / 2 + state.detection * Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawParticles(state) {
    if (reducedMotion) return;
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawDarkness(state) {
    const player = state.player;
    const light = ctx.createRadialGradient(player.x, player.y, 60, player.x, player.y, 330);
    light.addColorStop(0, 'rgba(4, 6, 12, 0)');
    light.addColorStop(0.55, 'rgba(4, 6, 12, 0.28)');
    light.addColorStop(1, PALETTE.darkness);
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawHud(state, hud) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, FIELD.width, 44);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 44.5);
    ctx.lineTo(FIELD.width, 44.5);
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 17px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.levelName, 16, 23);
    // Shards.
    ctx.textAlign = 'center';
    for (let i = 0; i < state.shards.length; i += 1) {
      const x = 560 + i * 30;
      ctx.save();
      ctx.translate(x, 22);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = state.shards[i].taken ? PALETTE.shard : 'rgba(125, 255, 176, 0.25)';
      ctx.fillRect(-6, -6, 12, 12);
      ctx.restore();
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `400 14px ${FONT}`;
    ctx.fillText(`${state.shardsCollected} / ${state.shards.length} shards`, 560 + state.shards.length * 30 + 8, 23);
    // Alert meter.
    const ax = 880;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText(state.detection > 0.85 ? 'SPOTTED' : state.detection > 0.02 ? 'SUSPICION' : 'UNSEEN', ax, 14);
    ctx.fillStyle = '#0a0d13';
    ctx.fillRect(ax, 22, 180, 10);
    ctx.fillStyle = state.detection > 0.85 ? PALETTE.danger : state.detection > 0.35 ? PALETTE.guardSuspicious : PALETTE.guardCalm;
    ctx.fillRect(ax, 22, 180 * Math.min(1, state.detection), 10);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.strokeRect(ax + 0.5, 22.5, 180, 10);
    // Timer and best.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `400 14px ${FONT}`;
    const mins = Math.floor(state.time / 60);
    const secs = Math.floor(state.time % 60).toString().padStart(2, '0');
    ctx.fillText(`${mins}:${secs}`, FIELD.width - 16, 16);
    ctx.fillText(hud.best > 0 ? `Best: floor ${hud.best} cleared` : 'Best: —', FIELD.width - 16, 33);
    ctx.textBaseline = 'alphabetic';
  }

  function drawOverlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(6, 8, 14, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent || PALETTE.text;
    ctx.font = `800 64px ${FONT}`;
    ctx.fillText(title, FIELD.width / 2, 250);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `400 20px ${FONT}`;
    let y = 310;
    for (const line of lines) {
      ctx.fillText(line, FIELD.width / 2, y);
      y += 34;
    }
  }

  function draw(world, screen, hud) {
    resize();
    const state = world.state;
    const level = world.level;
    ctx.fillStyle = '#0a0d13';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    drawFloor(level);
    drawExit(state);
    drawShards(state);
    drawCones(state, level);
    drawCover(level);
    drawGuards(state);
    drawPlayer(state);
    drawParticles(state);
    drawDarkness(state);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      drawHud(state, hud);
    }
    if (screen === SCREEN_TITLE) {
      drawOverlay('NIGHT VAULT', [
        'A night courier. Three floors. No witnesses.',
        'Collect every data shard, then slip out the exit unseen.',
        'WASD / arrows to move — hold Shift to sneak — click to walk there',
        'Hide in the dark patches. Crates and walls block a guard\u2019s sight.',
        'Press SPACE or click to begin',
      ]);
    } else if (screen === SCREEN_PAUSED) {
      drawOverlay('PAUSED', ['Press P or SPACE to keep sneaking.']);
    } else if (screen === SCREEN_OVER) {
      drawOverlay('CAUGHT', [
        'A guard got you. The archive keeps its secrets — this time.',
        'Press R or SPACE to try the floor again.',
      ], PALETTE.danger);
    } else if (screen === SCREEN_WIN) {
      const last = hud.levelIndex >= hud.totalLevels - 1;
      drawOverlay(last ? 'ALL FLOORS CLEAR' : 'FLOOR CLEAR', [
        last
          ? 'Every shard recovered. The courier vanishes into the night.'
          : `${state.levelName} — every shard recovered.`,
        last ? 'Press SPACE to play again from Floor 1.' : 'Press SPACE for the next floor.',
      ], PALETTE.ok);
    }
  }

  return { draw, resize };
}
