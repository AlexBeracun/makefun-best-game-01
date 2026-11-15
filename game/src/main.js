// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, shop, paused, victory and
// game over. Sound unlocks on the first gesture.
//
// ?seed=N fixes the night's pattern. ?shot=start|play|victory|defeat (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, LIGHTHOUSE, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  EVENT_BOSS,
  EVENT_HIT,
  EVENT_KILL,
  EVENT_LIGHT_HIT,
  EVENT_OVER,
  EVENT_PICKUP,
  EVENT_SHOOT,
  EVENT_TICK,
  EVENT_WAVE_CLEAR,
  EVENT_WIN,
  createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_NEXT_WAVE, ACTION_PAUSE, createInput } from './input.js';
import {
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_SHOP,
  SCREEN_TITLE,
  SCREEN_WIN,
  createRenderer,
  shopRowAt,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const scale = renderer.view.scale;
    return {
      x: (clientX - rect.left - renderer.view.x / (window.devicePixelRatio || 1)) / scale,
      y: (clientY - rect.top - renderer.view.y / (window.devicePixelRatio || 1)) / scale,
    };
  });
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    world.startWave(1);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.horn();
    announce('Playing. Wave 1. Defend the lighthouse.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) audio.victory();
    else audio.defeat();
    announce(won ? `Dawn breaks. You win. Score ${world.state.score}.` : `The light went out. Score ${world.state.score}. Best ${best}.`);
  }

  function aimAngle() {
    const aim = input.aim();
    if (aim.seen) return Math.atan2(aim.y - world.state.player.y, aim.x - world.state.player.x);
    const enemy = world.nearestEnemy(world.state.player.x, world.state.player.y);
    if (enemy) return Math.atan2(enemy.y - world.state.player.y, enemy.x - world.state.player.x);
    return world.state.player.aimAngle;
  }

  function handleEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_TICK) audio.hit();
    if (events & EVENT_KILL) audio.kill();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_HIT) {
      audio.hurt();
      announce(`Hit. Keeper health ${Math.max(0, world.state.player.hp)}.`);
    }
    if (events & EVENT_LIGHT_HIT) {
      audio.lightHit();
      announce(`The lighthouse is hit. Light ${Math.max(0, world.state.lighthouse.hp)}.`);
    }
    if (events & EVENT_WAVE_CLEAR) {
      audio.horn();
      announce(`Wave ${world.state.wave} clear. Spend your embers.`);
    }
    if (events & EVENT_BOSS) {
      audio.roar();
      announce(`${world.state.bossName} approaches.`);
    }
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_SHOP) {
      const shopKey = input.takeShopKey();
      if (shopKey >= 0) {
        if (world.buyUpgrade(shopKey)) audio.buy();
        return;
      }
      if (actions & ACTION_NEXT_WAVE) {
        world.startWave(world.state.wave + 1);
        screen = SCREEN_PLAY;
        audio.horn();
        announce(`Wave ${world.state.wave}.`);
        return;
      }
      if (actions & ACTION_CONFIRM) {
        const click = input.takeClick();
        const row = click ? shopRowAt(click.x, click.y) : -1;
        if (row >= 0) {
          if (world.buyUpgrade(row)) audio.buy();
        } else {
          world.startWave(world.state.wave + 1);
          screen = SCREEN_PLAY;
          audio.horn();
          announce(`Wave ${world.state.wave}.`);
        }
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { move: { x: 0, y: 0 }, aimAngle: -Math.PI / 2, firing: false }, true);
      return;
    }
    if (screen === SCREEN_SHOP || screen === SCREEN_PAUSED) return;
    const firing = input.isFiring() || input.isSpaceHeld();
    const events = world.step(STEP, { move: input.move(), aimAngle: aimAngle(), firing }, false);
    handleEvents(events);
    if (screen === SCREEN_PLAY && world.state.phase === 'intermission' && world.state.wave > 0) {
      screen = SCREEN_SHOP;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_SHOP) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
      if (screen === SCREEN_SHOP) accumulator = 0;
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting moths feed unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Lanternkeeper. Press Space or click to begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
