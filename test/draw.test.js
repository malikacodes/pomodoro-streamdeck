import { test } from "node:test";
import assert from "node:assert/strict";
import { drawKey, drawStrip, ramp, WEEKS_SHOWN } from "../src/draw.js";
import { lastWeeks } from "../src/history.js";

const MIN = 60000;
const face = more => ({ label: "Reading", ms: 45 * MIN, tone: "running", color: "#88ccff", rounds: 4, done: 1, current: 2, ...more });
const saturday = new Date(2026, 9, 10, 12).getTime();
const strip = more => drawStrip({ columns: lastWeeks(saturday, WEEKS_SHOWN), totals: new Map(), color: "#f2a7c3", ...more });

// The deck is pure black, so a lighter background shows as a gray square.
test("the key and the strip are drawn on pure black", () => {
  assert.match(drawKey(face()), /<rect width="144" height="144" fill="#000000"\/>/);
  assert.match(strip(), /<rect width="200" height="100" fill="#000000"\/>/);
  assert.match(strip({ notice: "Reading" }), /<rect width="200" height="100" fill="#000000"\/>/);
});

// One dot per round: finished ones white, the one I'm in gray.
test("the key has a dot per round, white for the finished ones", () => {
  const key = drawKey(face());
  assert.equal(key.match(/<circle/g).length, 4);
  assert.equal(key.match(/<circle[^>]*fill="#ffffff"/g).length, 1);
  assert.equal(key.match(/<circle[^>]*fill="#8a8a90"/g).length, 1);
  assert.equal(key.match(/<circle[^>]*fill="#2c2c30"/g).length, 2);
});

// Eight is the most rounds I can pick, and the row mustn't run off the key.
test("eight dots stay inside the key", () => {
  const xs = [...drawKey(face({ rounds: 8 })).matchAll(/<circle cx="(\d+)"/g)].map(m => Number(m[1]));
  assert.equal(xs.length, 8);
  assert.ok(Math.min(...xs) - 4 >= 0 && Math.max(...xs) + 4 <= 144);
  assert.equal(xs[0] + xs[7], 144);
});

// A plain countdown has no rounds, so no dots.
test("a plain countdown draws no dots", () => {
  assert.doesNotMatch(drawKey(face({ rounds: 0 })), /<circle/);
});

// How I tell the states apart without reading: white is counting, gray
// is stopped, the task's color is a break.
test("the time is white while running, gray when stopped, the task's color on a break", () => {
  const time = key => key.match(/fill="(#[0-9a-f]{6})" font-size="38"/)[1];
  assert.equal(time(drawKey(face())), "#ffffff");
  assert.equal(time(drawKey(face({ tone: "paused" }))), "#5c5c62");
  assert.equal(time(drawKey(face({ tone: "idle" }))), "#5c5c62");
  assert.equal(time(drawKey(face({ tone: "break" }))), "#88ccff");
});

// A task name with an & in it is the kind of thing that blanks a key.
test("a task name with odd characters can't break the picture", () => {
  const key = drawKey(face({ label: "R&D <now>" }));
  assert.match(key, />R&amp;D &lt;now&gt;</);
  assert.match(strip({ notice: "Tidy & sort" }), />Tidy &amp; sort</);
});

// A long name gets cut with an ellipsis and doesn't run off the key.
test("a long task name is cut to fit", () => {
  assert.match(drawKey(face({ label: "Organic Chemistry II" })), />Organic Che…</);
});

// Any color I pick has to give five shades I can tell apart, darkest
// first, ending on the color itself.
test("a picked color makes five different shades ending on itself", () => {
  const shades = ramp("#88ccff");
  assert.equal(new Set(shades).size, 5);
  assert.equal(shades[4], "#88ccff");
  const brightness = hex => [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
  assert.deepEqual([...shades].sort((a, b) => brightness(a) - brightness(b)), shades);
});

// A color that isn't a hex color goes to pink and not into the SVG.
test("a bad color falls back to pink", () => {
  assert.equal(ramp("javascript:")[4], "#f2a7c3");
  assert.equal(ramp(undefined)[4], "#f2a7c3");
  assert.match(drawKey(face({ tone: "break", color: '"><script>' })), /fill="#f2a7c3" font-size="38"/);
});

// The map: one square per day that's happened, shaded by that day's
// minutes, and nothing for the days still to come.
test("the strip has a square per day and shades them by minutes", () => {
  // Saturday, so all 14 weeks are full.
  const full = strip({ totals: new Map([["2026-10-10", 200], ["2026-10-09", 30]]) });
  assert.equal(full.match(/<rect x=/g).length, 14 * 7);
  assert.equal(full.match(/fill="#f2a7c3"/g).length, 1);
  assert.equal(full.match(new RegExp(`fill="${ramp("#f2a7c3")[1]}"`, "g")).length, 1);
  assert.equal(full.match(/fill="#1e1e21"/g).length, 14 * 7 - 2);

  // Wednesday: three days of this week are missing.
  const wednesday = new Date(2026, 9, 7, 12).getTime();
  const part = drawStrip({ columns: lastWeeks(wednesday, WEEKS_SHOWN), totals: new Map(), color: "#f2a7c3" });
  assert.equal(part.match(/<rect x=/g).length, 14 * 7 - 3);
});

// Today's square is the bottom right one on a Saturday. If the grid
// drifted, the newest day would be somewhere I'm not looking.
test("the squares stay inside the strip with today at the right edge", () => {
  const xs = [...strip().matchAll(/<rect x="(\d+)" y="(\d+)"/g)].map(m => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(xs.at(-1), [185, 86]);
  assert.ok(xs.every(([x, y]) => x >= 0 && x + 12 <= 200 && y >= 0 && y + 12 <= 100));
});

// The name of the task takes over the strip for a moment, with no map
// behind it to muddle the letters.
test("a notice replaces the map", () => {
  const named = strip({ notice: "Reading" });
  assert.match(named, />Reading</);
  assert.doesNotMatch(named, /<rect x=/);
});
