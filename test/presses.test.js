import { test } from "node:test";
import assert from "node:assert/strict";
import { Presses, LONG_PRESS_MS, DOUBLE_TAP_MS } from "../src/presses.js";

// Node's test clock stands in for real waiting, so "hold for half a
// second" takes no time at all.
function setup(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const seen = [];
  const presses = new Presses((id, kind) => seen.push(`${id}:${kind}`));
  return { seen, presses, wait: ms => t.mock.timers.tick(ms) };
}

// With double tap off, pause should feel instant.
test("with double tap off a tap fires the moment I let go", t => {
  const { seen, presses } = setup(t);
  presses.down("a", false);
  presses.up("a");
  assert.deepEqual(seen, ["a:tap"]);
});

// With double tap on, a single tap still has to arrive. Late, but once.
test("with double tap on a single tap fires after the wait, once", t => {
  const { seen, presses, wait } = setup(t);
  presses.down("a", true);
  presses.up("a");
  assert.deepEqual(seen, []);
  wait(DOUBLE_TAP_MS);
  assert.deepEqual(seen, ["a:tap"]);
  wait(5000);
  assert.deepEqual(seen, ["a:tap"]);
});

// Two quick taps are one double, and never a tap plus a double. That
// would pause the timer and then skip it.
test("two quick taps are one double tap and no single taps", t => {
  const { seen, presses, wait } = setup(t);
  presses.down("a", true);
  presses.up("a");
  wait(DOUBLE_TAP_MS - 50);
  presses.down("a", true);
  presses.up("a");
  wait(5000);
  assert.deepEqual(seen, ["a:double"]);
});

// Two slow taps are two taps: pause, then carry on.
test("two slow taps are two single taps", t => {
  const { seen, presses, wait } = setup(t);
  presses.down("a", true);
  presses.up("a");
  wait(DOUBLE_TAP_MS + 50);
  presses.down("a", true);
  presses.up("a");
  wait(DOUBLE_TAP_MS);
  assert.deepEqual(seen, ["a:tap", "a:tap"]);
});

// Done fires while my finger is still down, and letting go afterwards
// mustn't also count as a tap, or Done would start a new timer.
test("a hold fires while the key is down, and letting go adds nothing", t => {
  const { seen, presses, wait } = setup(t);
  presses.down("a", true);
  wait(LONG_PRESS_MS - 1);
  assert.deepEqual(seen, []);
  wait(1);
  assert.deepEqual(seen, ["a:hold"]);
  presses.up("a");
  wait(5000);
  assert.deepEqual(seen, ["a:hold"]);
});

// Letting go just before the half second is a tap, not a hold.
test("letting go just short of a hold is a tap", t => {
  const { seen, presses, wait } = setup(t);
  presses.down("a", false);
  wait(LONG_PRESS_MS - 1);
  presses.up("a");
  wait(5000);
  assert.deepEqual(seen, ["a:tap"]);
});

// Two tasks' keys pressed close together are two taps, not a double.
test("taps on two different keys don't make a double", t => {
  const { seen, presses, wait } = setup(t);
  presses.down("a", true);
  presses.up("a");
  presses.down("b", true);
  presses.up("b");
  wait(DOUBLE_TAP_MS);
  assert.deepEqual(seen, ["a:tap", "b:tap"]);
});

// Switching pages mid press shouldn't fire a Done on a key I can't see.
test("a key that leaves the page mid press does nothing", t => {
  const { seen, presses, wait } = setup(t);
  presses.down("a", true);
  presses.forget("a");
  wait(5000);
  presses.up("a");
  assert.deepEqual(seen, []);
});
