import { test } from "node:test";
import assert from "node:assert/strict";
import { Countdown, countdownPlan } from "../src/countdown.js";
import { drawKey } from "../src/draw.js";

const MIN = 60000;
const start = new Date(2026, 10, 4, 19, 0).getTime();

// A brand new key has no settings at all, and it still has to be my
// coffee chat: 15 minutes, with its name on top.
test("a key with no settings is a 15 minute Coffee Chat", () => {
  assert.deepEqual(countdownPlan(), { label: "Coffee Chat", ms: 15 * MIN });
  assert.deepEqual(countdownPlan({}), { label: "Coffee Chat", ms: 15 * MIN });
});

// Minutes come from a text box, so "30" is text and junk is possible.
test("minutes are read from text, and junk goes back to 15", () => {
  assert.equal(countdownPlan({ minutes: "30" }).ms, 30 * MIN);
  assert.equal(countdownPlan({ minutes: "0.5" }).ms, 0.5 * MIN);
  for (const bad of ["", "abc", "0", "-5", null]) assert.equal(countdownPlan({ minutes: bad }).ms, 15 * MIN, `${bad}`);
  assert.equal(countdownPlan({ minutes: "99999" }).ms, 600 * MIN);
  assert.equal(countdownPlan({ label: "  " }).label, "Coffee Chat");
});

// The whole point of the key: tap, pause, carry on, and the paused
// stretch doesn't eat into the chat.
test("tap starts, tap pauses, tap carries on without losing the pause", () => {
  const c = new Countdown();
  assert.equal(c.face({}, start).ms, 15 * MIN);
  assert.equal(c.face({}, start).tone, "idle");

  c.tap({}, start);
  assert.equal(c.face({}, start + 5 * MIN).ms, 10 * MIN);
  assert.equal(c.face({}, start + 5 * MIN).tone, "running");

  c.tap({}, start + 5 * MIN);
  const paused = c.face({}, start + 20 * MIN);
  assert.equal(paused.tone, "paused");
  assert.equal(paused.label, "Paused");
  assert.equal(paused.ms, 10 * MIN);

  c.tap({}, start + 20 * MIN);
  assert.equal(c.face({}, start + 25 * MIN).ms, 5 * MIN);
});

// At zero it says Done, and only then does a tap put it back to full.
// Before this a tap at 0:00 would have paused a finished countdown.
test("at zero it shows Done, and a tap resets it", () => {
  const c = new Countdown();
  c.tap({}, start);
  const done = c.face({}, start + 15 * MIN);
  assert.deepEqual([done.label, done.ms, done.tone, done.done], ["Done", 0, "done", 1]);

  c.tap({}, start + 16 * MIN);
  assert.equal(c.run, null);
  assert.equal(c.face({}, start + 16 * MIN).ms, 15 * MIN);
});

// A hold resets from anywhere: counting, paused or done.
test("a hold puts it back to full from any state", () => {
  const c = new Countdown();
  c.tap({}, start);
  c.reset();
  assert.equal(c.face({}, start + MIN).tone, "idle");

  c.tap({}, start);
  c.tap({}, start + MIN);
  c.reset();
  assert.equal(c.face({}, start + 2 * MIN).ms, 15 * MIN);
});

// The length is fixed when it starts, so editing the minutes mid-chat
// can't jump the time. The new length shows once it's full again.
test("changing the minutes mid-count doesn't move the end", () => {
  const c = new Countdown();
  c.tap({ minutes: "15" }, start);
  assert.equal(c.face({ minutes: "30" }, start + MIN).ms, 14 * MIN);
  c.reset();
  assert.equal(c.face({ minutes: "30" }, start + MIN).ms, 30 * MIN);
});

// The once-a-second tick only redraws what moved. Counting moves every
// second, the tick it hits zero is one more, and after that the Done
// picture sits still. Waiting and paused never move.
test("the tick asks for a redraw while counting and once at zero", () => {
  const c = new Countdown();
  assert.equal(c.tick(start), false);
  c.tap({ minutes: "1" }, start);
  assert.equal(c.tick(start + 30000), true);
  assert.equal(c.tick(start + MIN + 400), true);
  assert.equal(c.tick(start + MIN + 1400), false);

  const p = new Countdown();
  p.tap({}, start);
  p.tap({}, start + 1000);
  assert.equal(p.tick(start + 2000), false);
});

// Two keys are two countdowns. Starting one leaves the other alone.
test("two Countdown keys keep their own time", () => {
  const a = new Countdown();
  const b = new Countdown();
  a.tap({}, start);
  assert.equal(b.face({}, start + MIN).tone, "idle");
});

// The faces go through the Timer key's drawKey, so it has to look like
// my Coffee Chat Timer key: gray name, then white time with a gray dot
// while counting, and pink name, time and dot when it's done.
test("the key looks like a one-round Timer key, and pink when it's done", () => {
  const c = new Countdown();
  const idle = drawKey(c.face({}, start));
  assert.match(idle, /<rect width="144" height="144" fill="#000000"\/>/);
  assert.match(idle, /fill="#8a8a90" font-size="20"[^>]*>Coffee Chat</);
  assert.match(idle, /fill="#5c5c62" font-size="38"[^>]*>15:00</);
  assert.equal(idle.match(/<circle/g).length, 1);
  assert.match(idle, /<circle cx="72" cy="120" r="4" fill="#2c2c30"\/>/);

  c.tap({}, start);
  const running = drawKey(c.face({}, start + 1000));
  assert.match(running, /fill="#ffffff" font-size="38"[^>]*>14:59</);
  assert.match(running, /<circle[^>]*fill="#8a8a90"/);

  const done = drawKey(c.face({}, start + 15 * MIN));
  assert.match(done, /fill="#f2a7c3" font-size="20"[^>]*>Done</);
  assert.match(done, /fill="#f2a7c3" font-size="38"[^>]*>00:00</);
  assert.match(done, /<circle[^>]*fill="#f2a7c3"/);
});

// The label is whatever I type, and an & would break the picture.
test("a label with odd characters can't break the picture", () => {
  assert.match(drawKey(new Countdown().face({ label: "Q&A <1:1>" }, start)), />Q&amp;A &lt;1:1&gt;</);
});
