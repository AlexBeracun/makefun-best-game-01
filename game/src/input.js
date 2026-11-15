// Keyboard and pointer input. Held keys steer; the mouse aims and fires; one-shot presses
// (start, restart, pause, shop keys, mute) are queued as bit flags and taken once by the loop,
// so a press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_NEXT_WAVE = 8;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const NEXT = new Set(['KeyN']);

export function createInput(target, toField) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let actions = 0;
  let firing = false;
  let spaceHeld = false;
  let mouseX = 0;
  let mouseY = 0;
  let mouseSeen = false;
  let shopKey = -1;
  let lastClick = null;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (CONFIRM.has(event.code)) {
      if (event.code === 'Space') spaceHeld = true;
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (NEXT.has(event.code)) {
      if (!event.repeat) actions |= ACTION_NEXT_WAVE;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code >= 'Digit1' && event.code <= 'Digit6') {
      if (!event.repeat) shopKey = Number(event.code.slice(5)) - 1;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (event.code === 'Space') spaceHeld = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
    firing = false;
  });
  target.addEventListener('pointermove', (event) => {
    const point = toField(event.clientX, event.clientY);
    mouseX = point.x;
    mouseY = point.y;
    mouseSeen = true;
  });
  target.addEventListener('pointerdown', (event) => {
    const point = toField(event.clientX, event.clientY);
    mouseX = point.x;
    mouseY = point.y;
    mouseSeen = true;
    lastClick = point;
    if (event.button === 0) firing = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) firing = false;
  });

  return {
    /** Normalised steering vector from the held keys. */
    move() {
      const x = (right ? 1 : 0) - (left ? 1 : 0);
      const y = (down ? 1 : 0) - (up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const length = Math.hypot(x, y);
      return { x: x / length, y: y / length };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The shop slot (0-5) a number key picked since the last call, or -1. */
    takeShopKey() {
      const taken = shopKey;
      shopKey = -1;
      return taken;
    },
    /** Where the mouse points in field coordinates, and whether it has moved yet. */
    aim() {
      return { x: mouseX, y: mouseY, seen: mouseSeen };
    },
    /** True while the mouse button (or Space) is held: Space fires at the nearest foe. */
    isFiring() {
      return firing;
    },
    /** True while Space is held down. */
    isSpaceHeld() {
      return spaceHeld;
    },
    /** The field coordinates of the last pointer press, once, or null. */
    takeClick() {
      const taken = lastClick;
      lastClick = null;
      return taken;
    },
  };
}
