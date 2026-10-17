import { test } from "node:test";
import assert from "node:assert/strict";
import { drawGoalKey, goalOf } from "../src/goal.js";

const BLUE = "#88ccff";
const GRAY = "#8a8a90";

// A normal key: 2 of 4 sessions, half the ring, in blue.
const key = ({ count = "2", small = "of 4", fill = 0.5, met = false, burst, color = BLUE } = {}) =>
  drawGoalKey(count, small, GRAY, fill, met, burst, color);

// The colored part of the ring is whatever is painted with the fade.
const arc = svg => svg.match(/<path d="M 72 20 A 52 52 0 (\d) 1 ([\d.]+) ([\d.]+)" stroke="url\(#ring\)"/);
const fullRing = /<circle cx="72" cy="72" r="52" stroke="url\(#ring\)"/;

// The deck is pure black, so a lighter background shows as a gray square.
// That goes for the celebration pictures too.
test("the goal key is drawn on pure black", () => {
  const black = /^<svg [^>]*><rect width="144" height="144" fill="#000000"\/>/;
  assert.match(key(), black);
  assert.match(key({ fill: 1, met: true, burst: 0.1 }), black);
});

// Before I've done anything today the ring is only the empty track.
test("an empty ring draws the track and no colored arc", () => {
  const svg = key({ fill: 0 });
  assert.match(svg, /<circle cx="72" cy="72" r="52" stroke="#21262d"/);
  assert.doesNotMatch(svg, /stroke="url\(#ring\)"/);
});

// Halfway to the goal the arc has to stop at 6 o'clock, and a quarter of
// the way at 3 o'clock. If the maths drifts, the ring lies about my day.
test("a partial fill draws an arc that ends at the right spot", () => {
  assert.deepEqual(arc(key({ fill: 0.5 })).slice(2), ["72.00", "124.00"]);
  assert.deepEqual(arc(key({ fill: 0.25 })).slice(2), ["124.00", "72.00"]);
  assert.doesNotMatch(key({ fill: 0.5 }), fullRing);
});

// An arc that ends where it starts draws nothing, so a full ring drawn as
// an arc would look empty on the very day I hit the goal.
test("a full ring is a circle and not an arc", () => {
  for (const fill of [1, 1.5]) {
    const svg = key({ fill });
    assert.match(svg, fullRing);
    assert.equal(arc(svg), null);
  }
});

// Without the flag flipping, anything past halfway takes the short way
// round and the ring goes backwards.
test("the arc takes the long way round once it's past halfway", () => {
  assert.equal(arc(key({ fill: 0.5 }))[1], "0");
  assert.equal(arc(key({ fill: 0.51 }))[1], "1");
  assert.equal(arc(key({ fill: 0.99 }))[1], "1");
});

// The star is how I know the goal is done. Its outline is the background
// black, or it would show as a gray edge.
test("the star is only there when the goal is met", () => {
  const star = /<polygon points="[^"]+" fill="#ffd33d" stroke="#000000"/;
  assert.match(key({ fill: 1, met: true }), star);
  assert.doesNotMatch(key({ fill: 0.9, met: false }), star);
});

// The ring is in the task's color, fading up from the same color at 75%.
test("the ring fades from the task's color at 75% to the full color", () => {
  const stops = svg => [...svg.matchAll(/stop-color="(#[0-9a-f]{6})"/g)].map(m => m[1]);
  assert.deepEqual(stops(key({ color: "#88ccff" })), ["#6699bf", "#88ccff"]);
  assert.deepEqual(stops(key({ color: "#ffffff" })), ["#bfbfbf", "#ffffff"]);
  // The glow in the flash is the task's color too.
  assert.match(key({ fill: 1, met: true, burst: 0, color: "#88ccff" }), /stroke="#88ccff" stroke-width="30"/);
});

// The color comes from settings and goes straight into the picture, so
// anything that isn't a hex color goes to pink and never into the SVG.
test("a bad color falls back to pink and stays out of the picture", () => {
  for (const bad of ['"><script>', "red", "#fff", "#12345g", undefined, null, 7]) {
    const svg = drawGoalKey("4", "of 4", GRAY, 1, true, 0, bad);
    assert.match(svg, /<stop offset="1" stop-color="#f2a7c3"\/>/);
    assert.match(svg, /<stop offset="0" stop-color="#b67d92"\/>/);
    assert.match(svg, /stroke="#f2a7c3" stroke-width="30"/);
    assert.doesNotMatch(svg, /script/);
  }
});

// A redraw in the middle of the celebration mustn't make the confetti
// jump around, so nothing in the picture can be random.
test("the same inputs always give exactly the same picture", () => {
  for (const burst of [undefined, 0, 0.3, 0.75]) {
    assert.equal(key({ fill: 1, met: true, burst }), key({ fill: 1, met: true, burst }));
  }
  assert.notEqual(key({ fill: 1, met: true, burst: 0.3 }), key({ fill: 1, met: true, burst: 0.4 }));
});

// Early in the celebration: confetti flying, the tick in the middle, and
// the words out of the way so the tick isn't sitting on top of them.
test("early in the celebration there's confetti and a tick, and no words", () => {
  const svg = key({ fill: 1, met: true, burst: 0.3 });
  assert.equal(svg.match(/<circle [^>]*r="6"/g).length, 6);
  assert.equal(svg.match(/<polygon points="[^"]+" fill="#[0-9a-f]{6}" fill-opacity/g).length, 12);
  assert.match(svg, /<path d="M 47\.5 73\.5 L 64\.5 89\.5 L 96\.5 54\.5" fill="none" stroke="#ffffff" stroke-width="15\.0"/);
  assert.doesNotMatch(svg, /<text/);
});

// The tick pops in from nothing: on the very first picture it has no size
// yet, and the flash is at full strength.
test("the first picture of the celebration is the flash, with the tick still tiny", () => {
  const svg = key({ fill: 1, met: true, burst: 0 });
  assert.match(svg, /stroke="#ffffff" stroke-width="20\.00" stroke-opacity="1\.00"/);
  assert.match(svg, /<path d="M 72\.0 72\.0 L 72\.0 72\.0 L 72\.0 72\.0"/);
  // By a third of a second in, the flash is gone.
  assert.doesNotMatch(key({ fill: 1, met: true, burst: 0.16 }), /stroke-width="30"/);
});

// The celebration has to land on the normal key. If it ended one picture
// off, the key would visibly snap when the animation hands back.
test("the very end of the celebration is exactly the normal met picture", () => {
  assert.equal(key({ fill: 1, met: true, burst: 1 }), key({ fill: 1, met: true }));
});

// The small line can be a task name, and an & in it is the kind of thing
// that blanks a key.
test("the count and the small line can't break the picture", () => {
  const svg = key({ count: "<1>", small: "R&D <b>" });
  assert.match(svg, />&lt;1&gt;<\/text>/);
  assert.match(svg, />R&amp;D &lt;b&gt;<\/text>/);
  assert.doesNotMatch(svg, /<b>|<1>/);
});

// The ring only leaves so much room inside it, so longer text gets
// smaller. Nothing goes under 15px, which is as small as I can read.
test("long counts and long small lines shrink to fit, but never under 15px", () => {
  const sizes = svg => [...svg.matchAll(/<text [^>]*font-size="(\d+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(sizes(key({ count: "12", small: "of 4" })), [44, 18]);
  assert.deepEqual(sizes(key({ count: "120", small: "minutes" })), [34, 18]);
  assert.deepEqual(sizes(key({ count: "1:30", small: "of 2 hours" })), [26, 15]);
  assert.deepEqual(sizes(key({ count: "12:30:00", small: "a very long line of words" })), [26, 15]);
});

// The goal comes from the settings page as text, or not at all for a
// key I've never touched. It has to end up a whole number from 1 to 12
// whatever arrives: 4 when nothing or nonsense does, 12 at most, and 0
// is "nothing picked", not a goal of nothing.
test("the goal setting is read as a whole number from 1 to 12, 4 by default", () => {
  assert.equal(goalOf({ goal: "4" }), 4);
  assert.equal(goalOf({ goal: "7" }), 7);
  assert.equal(goalOf({}), 4);
  assert.equal(goalOf(undefined), 4);
  assert.equal(goalOf({ goal: "0" }), 4);
  assert.equal(goalOf({ goal: "13" }), 12);
  assert.equal(goalOf({ goal: "abc" }), 4);
  assert.equal(goalOf({ goal: "2.6" }), 3);
});
