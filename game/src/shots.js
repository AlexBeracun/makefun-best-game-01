// The screenshot scenes behind ?shot=start|play|victory|defeat. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (hold range from the nearest moth, step in front of any moth closing on the
// lighthouse, buy upgrades between waves), so the frame is what a real game looks like and
// the same seed always gives the same frame. The defeat scene's pilot never fires and
// never moves, as a player who walked away would.

import { FIELD, LIGHTHOUSE, SHOP, STEP, waveComp } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_LIMIT_SECONDS = 300;
const END_LIMIT_SECONDS = 900;
const SAMPLE = STEP;

/** One autopilot decision: where to move, where to aim, whether to fire. */
function autopilot(world, mode) {
  const state = world.state;
  const player = state.player;
  // The defeat scene's pilot stands his ground and fires, but never moves and never
  // shops: the moths close in anyway, and the light goes out with a score to show.
  if (mode === 'stand') {
    const enemy = world.nearestEnemy(player.x, player.y);
    if (!enemy) return { move: { x: 0, y: 0 }, aimAngle: player.aimAngle, firing: false };
    return { move: { x: 0, y: 0 }, aimAngle: Math.atan2(enemy.y - player.y, enemy.x - player.x), firing: true };
  }

  // Between waves: spend embers by priority, then sweep up what is left on the grass.
  if (state.phase === 'intermission' && state.wave > 0) {
    const priority = ['damage', 'rapid', 'twin', 'swift', 'glass', 'repair'];
    for (let index = 0; index < priority.length; index += 1) {
      const shopIndex = SHOP.findIndex((item) => item.id === priority[index]);
      if (world.buyUpgrade(shopIndex)) break;
    }
    let ember = null;
    let emberDistance = Infinity;
    for (const item of state.embers) {
      if (!item.active) continue;
      const distance = Math.hypot(item.x - player.x, item.y - player.y);
      if (distance < emberDistance) {
        emberDistance = distance;
        ember = item;
      }
    }
    if (ember) {
      const dx = ember.x - player.x;
      const dy = ember.y - player.y;
      const length = Math.hypot(dx, dy) || 1;
      return { move: { x: dx / length, y: dy / length }, aimAngle: player.aimAngle, firing: false };
    }
  }

  const enemy = world.nearestEnemy(player.x, player.y);
  if (!enemy) {
    const dx = LIGHTHOUSE.x + 150 - player.x;
    const dy = LIGHTHOUSE.y + 150 - player.y;
    const length = Math.hypot(dx, dy) || 1;
    return { move: length > 8 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 }, aimAngle: player.aimAngle, firing: false };
  }
  const aimAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);

  // The moth nearest the lighthouse is the danger: step between it and the light.
  let threat = null;
  let threatDistance = Infinity;
  for (const other of state.enemies) {
    if (!other.active) continue;
    const distance = Math.hypot(other.x - LIGHTHOUSE.x, other.y - LIGHTHOUSE.y);
    if (distance < threatDistance) {
      threatDistance = distance;
      threat = other;
    }
  }
  let vx = 0;
  let vy = 0;
  if (threat && threatDistance < 320) {
    const dx = LIGHTHOUSE.x - threat.x;
    const dy = LIGHTHOUSE.y - threat.y;
    const length = Math.hypot(dx, dy) || 1;
    const guardX = LIGHTHOUSE.x + (dx / length) * 150;
    const guardY = LIGHTHOUSE.y + (dy / length) * 150;
    vx = guardX - player.x;
    vy = guardY - player.y;
  } else {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    if (length > 280) {
      vx -= dx / length;
      vy -= dy / length;
    } else if (length < 170) {
      vx += dx / length;
      vy += dy / length;
    }
    const strafe = Math.sin(state.elapsed * 1.3);
    vx += (-dy / length) * strafe * 0.8;
    vy += (dx / length) * strafe * 0.8;
  }
  const speed = Math.hypot(vx, vy);
  return {
    move: speed > 0.01 ? { x: vx / speed, y: vy / speed } : { x: 0, y: 0 },
    aimAngle,
    firing: true,
  };
}

/**
 * Set `world` to the named scene (start, play, victory or defeat; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'victory' && name !== 'defeat') {
    for (let index = 0; index < START_SECONDS / SAMPLE; index += 1) world.step(SAMPLE, { move: { x: 0, y: 0 }, aimAngle: -Math.PI / 2, firing: false }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'defeat') {
    for (let index = 0; index < END_LIMIT_SECONDS / SAMPLE; index += 1) {
      if (world.step(SAMPLE, autopilot(world, 'stand'), false) & EVENT_OVER) break;
    }
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  if (name === 'victory') {
    world.startWave(1);
    for (let index = 0; index < END_LIMIT_SECONDS / SAMPLE; index += 1) {
      const events = world.step(SAMPLE, autopilot(world, 'play'), false);
      if (events & EVENT_WIN) break;
      if (events & EVENT_OVER) break;
    }
    const won = world.state.phase === 'won';
    return { screen: won ? SCREEN_WIN : SCREEN_PLAY, best: world.state.score };
  }
  world.startWave(1);
  const comp = waveComp(3);
  const waveThreeTotal = comp.moths + comp.wisps + comp.beetles;
  for (let index = 0; index < PLAY_LIMIT_SECONDS / SAMPLE; index += 1) {
    world.step(SAMPLE, autopilot(world, 'play'), false);
    // A busy mid-wave frame: most of wave 3 spawned, several moths still closing in.
    if (world.state.wave === 3 && world.state.spawnLeft <= waveThreeTotal - 12 && world.aliveEnemies() >= 4) break;
    // Fallback: the same, one wave later, if wave 3 cleared too fast.
    if (world.state.wave === 4 && world.aliveEnemies() >= 4) break;
    if (world.state.phase === 'over' || world.state.phase === 'won') break;
  }
  return { screen: SCREEN_PLAY, best: world.state.score };
}