import { test } from "node:test";
import assert from "node:assert/strict";
import { animate, stopAnimating, idle, stopIdling } from "../src/animate.js";

// Node's test clock stands in for real waiting. One tick of the metronome
// is 100ms, and the list fills up with the name of whoever got each turn.
// The lines live at the top of animate.js and are shared by every test in
// this file, so each test stops everything it started before it ends.
function setup(t) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const seen = [];
  return { seen, draw: name => () => seen.push(name), ticks: n => t.mock.timers.tick(n * 100) };
}

// A key animating on its own should get the whole budget, all ten
// pictures a second.
test("one animating key gets every tick", t => {
  const { seen, draw, ticks } = setup(t);
  animate("a", draw("a"));
  assert.deepEqual(seen, []);
  ticks(10);
  assert.deepEqual(seen, Array(10).fill("a"));
  stopAnimating("a");
});

// Two keys animating share the ten pictures a second. Neither one gets
// two turns in a row, and when one finishes the other gets them all.
test("two animating keys take turns", t => {
  const { seen, draw, ticks } = setup(t);
  animate("a", draw("a"));
  animate("b", draw("b"));
  ticks(6);
  assert.deepEqual(seen, ["a", "b", "a", "b", "a", "b"]);

  stopAnimating("a");
  ticks(3);
  assert.deepEqual(seen.slice(6), ["b", "b", "b"]);
  stopAnimating("b");
});

// Idling is the background music. It only gets every third tick, and two
// idling keys share those between them.
test("idling keys only get every third tick, and take turns on those", t => {
  const { seen, draw, ticks } = setup(t);
  idle("a", draw("a"));
  idle("b", draw("b"));

  // Which tick each redraw landed on. The count of quiet ticks carries
  // over from the tests above, so I check the gaps and not where it starts.
  const landed = [];
  for (let tick = 1; tick <= 12; tick++) {
    const before = seen.length;
    ticks(1);
    if (seen.length > before) landed.push(tick);
  }
  assert.deepEqual(seen, ["a", "b", "a", "b"]);
  assert.deepEqual(landed.slice(1).map((tick, i) => tick - landed[i]), [3, 3, 3]);

  stopIdling("a");
  stopIdling("b");
});

// The confetti mustn't lose pictures to something that's only swaying, so
// idling goes silent while anything animates and comes back afterwards.
test("idling gets nothing while something is animating", t => {
  const { seen, draw, ticks } = setup(t);
  idle("slow", draw("slow"));
  animate("fast", draw("fast"));
  ticks(9);
  assert.deepEqual(seen, Array(9).fill("fast"));

  stopAnimating("fast");
  ticks(9);
  assert.deepEqual(seen.slice(9), ["slow", "slow", "slow"]);
  stopIdling("slow");
});

// Left running, the metronome would wake the plugin ten times a second
// forever. It should start once, stop when the last key leaves, and start
// fresh the next time something moves.
test("the metronome stops with the last key and starts again for the next", t => {
  const { seen, draw, ticks } = setup(t);

  // Count the real starts and stops by standing in front of the test
  // clock's own setInterval and clearInterval for the length of this test.
  const { setInterval: start, clearInterval: stop } = globalThis;
  let started = 0;
  let stopped = 0;
  globalThis.setInterval = (...args) => (started++, start(...args));
  globalThis.clearInterval = id => (stopped++, stop(id));

  try {
    animate("a", draw("a"));
    idle("b", draw("b"));
    assert.equal(started, 1);

    stopAnimating("a");
    assert.equal(stopped, 0);
    stopIdling("b");
    assert.equal(stopped, 1);

    ticks(30);
    assert.deepEqual(seen, []);

    animate("a", draw("a"));
    assert.equal(started, 2);
    ticks(2);
    assert.deepEqual(seen, ["a", "a"]);
    stopAnimating("a");
    assert.equal(stopped, 2);
  } finally {
    globalThis.setInterval = start;
    globalThis.clearInterval = stop;
  }
});

// A key that asks again mid animation should get its new picture drawn,
// and not a second place in the line that would take turns from the others.
test("asking again for the same key swaps the redraw without adding a turn", t => {
  const { seen, draw, ticks } = setup(t);
  animate("a", draw("old"));
  animate("b", draw("b"));
  animate("a", draw("new"));
  ticks(4);
  assert.deepEqual(seen, ["new", "b", "new", "b"]);
  stopAnimating("a");
  stopAnimating("b");
});
