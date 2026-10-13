import { test } from "node:test";
import assert from "node:assert/strict";
import { drawKey, drawStatsKey, drawStrip, ramp, short, WEEKS_SHOWN } from "../src/draw.js";
import { lastWeeks } from "../src/history.js";

const MIN = 60000;
const face = more => ({ label: "Reading", ms: 45 * MIN, tone: "running", color: "#88ccff", rounds: 4, done: 1, current: 2, ...more });
const saturday = new Date(2026, 9, 10, 12).getTime();
const strip = more => drawStrip({ columns: lastWeeks(saturday, WEEKS_SHOWN), totals: new Map(), today: "2026-10-10", color: "#f2a7c3", ...more });

// The deck is pure black, so a lighter background shows as a gray square.
test("the key and the strip are drawn on pure black", () => {
  assert.match(drawKey(face()), /<rect width="144" height="144" fill="#000000"\/>/);
  assert.match(drawStatsKey({ label: "Reading", sessions: 3, period: "Today", color: "#88ccff" }), /<rect width="144" height="144" fill="#000000"\/>/);
  assert.match(strip(), /<rect width="200" height="100" fill="#000000"\/>/);
  assert.match(strip({ notice: "Reading" }), /<rect width="200" height="100" fill="#000000"\/>/);
});

// One dot per round: finished ones in the task's color, so the dots and
// that task's heat map match. The one I'm in is gray.
test("the key has a dot per round, in the task's color for the finished ones", () => {
  const key = drawKey(face());
  assert.equal(key.match(/<circle/g).length, 4);
  assert.equal(key.match(/<circle[^>]*fill="#88ccff"/g).length, 1);
  assert.doesNotMatch(key, /<circle[^>]*fill="#ffffff"/);
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

// A color that isn't a hex color mustn't reach the dots either.
test("a bad color gives pink dots", () => {
  assert.equal(drawKey(face({ color: "nope", done: 2 })).match(/<circle[^>]*fill="#f2a7c3"/g).length, 2);
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

// The map: one square per day, shaded by that day's minutes.
test("the strip has a square per day and shades them by minutes", () => {
  // Saturday, so every day of all 14 weeks has happened.
  const full = strip({ totals: new Map([["2026-10-10", 200], ["2026-10-09", 30]]) });
  assert.equal(full.match(/<rect x=/g).length, 14 * 7);
  assert.equal(full.match(/fill="#f2a7c3"/g).length, 1);
  assert.equal(full.match(new RegExp(`fill="${ramp("#f2a7c3")[1]}"`, "g")).length, 1);
  assert.equal(full.match(/fill="#21262d"/g).length, 14 * 7 - 2);
});

// On a Monday the last column used to be two squares over a black hole.
// The days still to come get their own darker square, so the map stays a
// full rectangle and "not yet" doesn't look like "nothing that day".
test("the rest of this week is drawn as upcoming squares, not left out", () => {
  const monday = new Date(2026, 9, 12, 12).getTime();
  const map = drawStrip({ columns: lastWeeks(monday, WEEKS_SHOWN), totals: new Map([["2026-10-12", 50]]), today: "2026-10-12", color: "#f2a7c3" });
  assert.equal(map.match(/<rect x=/g).length, 14 * 7);
  assert.equal(map.match(/fill="#1a1e24"/g).length, 5);
  assert.equal(map.match(/fill="#21262d"/g).length, 14 * 7 - 5 - 1);

  // The five are Tuesday to Saturday of the last column.
  const upcoming = [...map.matchAll(/<rect x="(\d+)" y="(\d+)"[^>]*fill="#1a1e24"/g)].map(m => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(upcoming, [[185, 30], [185, 44], [185, 58], [185, 72], [185, 86]]);
});

// Focus time can't be in the future, but a day past today must never be
// shaded even if the file somehow says so.
test("a day after today is upcoming whatever the totals say", () => {
  const monday = new Date(2026, 9, 12, 12).getTime();
  const map = drawStrip({ columns: lastWeeks(monday, WEEKS_SHOWN), totals: new Map([["2026-10-14", 300]]), today: "2026-10-12", color: "#f2a7c3" });
  assert.doesNotMatch(map, /fill="#f2a7c3"/);
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

// The stats key: the task, the count, and the dot in the task's color.
test("the stats key shows the task, the sessions and a dot in the task's color", () => {
  const key = drawStatsKey({ label: "Reading", sessions: 12, period: "This week", color: "#88ccff" });
  assert.match(key, />Reading</);
  assert.match(key, />12</);
  assert.match(key, /<tspan fill="#88ccff">●<\/tspan> This week</);
});

// A year of sessions is a four digit number, and it has to shrink to fit.
test("a long session count gets smaller digits", () => {
  const size = n => Number(drawStatsKey({ label: "All tasks", sessions: n, period: "All time", color: "#f2a7c3" }).match(/font-size="(\d+)" font-weight="600" text-anchor="middle">\d+</)[1]);
  assert.ok(size(7) > size(365) && size(365) > size(1200));
  assert.ok(size(1200) >= 15);
});

// A task name with an & in it is the kind of thing that blanks a key.
test("the stats key's task name and color can't break the picture", () => {
  const key = drawStatsKey({ label: "R&D <x>", sessions: 1, period: "Today", color: '"><script>' });
  assert.match(key, />R&amp;D &lt;x&gt;</);
  assert.doesNotMatch(key, /script/);
});

// The streak key's small line is a task name, and 30 letters at that
// size would run off both sides of the key.
test("a name is cut to the length asked for, and a short one is left alone", () => {
  assert.equal(short("Organic Chemistry II", 14), "Organic Chemi…");
  assert.equal(short("Organic Chemistry II", 14).length, 14);
  assert.equal(short("593", 14), "593");
});
