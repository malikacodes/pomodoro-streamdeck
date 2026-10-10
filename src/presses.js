// Works out what kind of press a key just got. Stream Deck only says
// "key down" and "key up", so telling a tap from a double tap from a hold
// is all in the timing. No Stream Deck in here.

// How long a key is held before it counts as a hold.
export const LONG_PRESS_MS = 500;

// How long after a tap a second one still makes it a double tap.
export const DOUBLE_TAP_MS = 300;

// on(id, kind) is called with "tap", "double" or "hold" for the key
// with that id.
export class Presses {
  keys = new Map();

  constructor(on) {
    this.on = on;
  }

  // double is whether this key listens for double taps at all.
  down(id, double) {
    const key = this.keys.get(id) ?? {};
    this.keys.set(id, key);

    // A tap is still waiting to see if it has a partner, and here it is.
    key.second = Boolean(key.waiting);
    clearTimeout(key.waiting);
    key.waiting = null;

    // The hold fires while the key is still down, so I can feel it happen
    // and don't have to guess when to let go.
    key.held = false;
    key.double = double;
    key.holding = setTimeout(() => {
      key.held = true;
      this.on(id, "hold");
    }, LONG_PRESS_MS);
  }

  up(id) {
    const key = this.keys.get(id);
    if (!key) return;
    clearTimeout(key.holding);
    // The hold already did its thing. Letting go isn't a tap as well.
    if (key.held) return;

    if (key.second) return this.on(id, "double");
    if (!key.double) return this.on(id, "tap");

    // The price of double tap: a single tap has to wait a moment to be
    // sure it's single.
    key.waiting = setTimeout(() => {
      key.waiting = null;
      this.on(id, "tap");
    }, DOUBLE_TAP_MS);
  }

  // The key left the page. Anything it was in the middle of is dropped.
  forget(id) {
    const key = this.keys.get(id);
    if (!key) return;
    clearTimeout(key.holding);
    clearTimeout(key.waiting);
    this.keys.delete(id);
  }
}
