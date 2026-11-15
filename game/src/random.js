// A small seeded random generator (mulberry32) so a fixed seed always plays the same night:
// the same spawns, the same wobble, the same screenshots.

export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a value in [min, max) from a seeded generator. */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** Pick one entry of an array from a seeded generator. */
export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}
