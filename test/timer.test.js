import { test } from "node:test";
import assert from "node:assert/strict";
import { Timer, plan, clock, PINK, GIVE_UP_MS } from "../src/timer.js";

const MIN = 60000;
const mine = { name: "Reading", focus: "45", rounds: "2", shortBreak: "10", longBreak: "15" };

// A key I haven't set up yet should still be my usual timer, not NaN.
test("untouched settings fall back to 45, 4 rounds, 10 and 15", () => {
  const p = plan({});
  assert.equal(p.task, "Focus");
  assert.equal(p.color, PINK);
  assert.deepEqual([p.focus, p.short, p.long, p.rounds], [45 * MIN, 10 * MIN, 15 * MIN, 4]);
  assert.equal(p.autoStart, false);
  assert.equal(p.doubleTap, true);
});

// Settings come in as typed text, so junk has to land somewhere sensible.
test("junk in the settings falls back and doesn't break the timer", () => {
  const p = plan({ focus: "abc", rounds: "12", color: "pinkish", name: "   " });
  assert.equal(p.focus, 45 * MIN);
  assert.equal(p.rounds, 4);
  assert.equal(p.color, PINK);
  assert.equal(p.task, "Focus");
});

// The whole point of pause: the paused stretch isn't focus time.
test("paused time doesn't count toward the session", () => {
  const t = new Timer();
  t.start(mine, 0);
  t.toggle(10 * MIN);
  t.toggle(40 * MIN);
  assert.equal(t.timeLeft(40 * MIN), 35 * MIN);
  assert.deepEqual(t.done(45 * MIN).session, { task: "Reading", minutes: 15 });
});

// Done part way through saves what I did, not the full 45.
test("done saves the real minutes of a partial session", () => {
  const t = new Timer();
  t.start(mine, 0);
  assert.deepEqual(t.done(12.5 * MIN).session, { task: "Reading", minutes: 12.5 });
  assert.equal(t.run, null);
});

// Pressing Done a second after starting shouldn't leave a 0 minute session.
test("done right after starting saves nothing", () => {
  const t = new Timer();
  t.start(mine, 0);
  assert.equal(t.done(1000).session, null);
});

// Only one task at a time. This is the rule the second key leans on.
test("a second task can't start while one is running", () => {
  const t = new Timer();
  assert.equal(t.start(mine, 0), true);
  assert.equal(t.start({ name: "Cleaning" }, 5), false);
  assert.equal(t.run.task, "Reading");
  assert.equal(t.owns({ name: "Cleaning" }), false);
  assert.equal(t.owns(mine), true);
});

// The order of a cycle: short breaks between rounds, the long one last,
// then round 1 again.
test("with auto start it runs focus, short, focus, long and starts over", () => {
  const t = new Timer();
  t.start({ ...mine, autoStart: true }, 0);
  let now = 45 * MIN;
  assert.deepEqual(t.tick(now), { finished: "focus", session: { task: "Reading", minutes: 45, full: true }, at: now });
  assert.deepEqual([t.run.phase, t.run.round, t.run.running], ["short", 1, true]);
  now += 10 * MIN;
  assert.deepEqual(t.tick(now), { finished: "short", session: null, at: now });
  assert.deepEqual([t.run.phase, t.run.round], ["focus", 2]);
  now += 45 * MIN;
  t.tick(now);
  assert.equal(t.run.phase, "long");
  assert.equal(t.timeLeft(now), 15 * MIN);
  now += 15 * MIN;
  t.tick(now);
  assert.deepEqual([t.run.phase, t.run.round], ["focus", 1]);
});

// Nothing happens before the time is up, or while paused.
test("a tick before the end does nothing", () => {
  const t = new Timer();
  t.start(mine, 0);
  assert.equal(t.tick(44 * MIN), null);
  t.toggle(44 * MIN);
  assert.equal(t.tick(90 * MIN), null);
});

// Auto start off: the break is loaded and waits, and the wait isn't
// eaten out of the break.
test("without auto start the next period waits for a tap, full length", () => {
  const t = new Timer();
  t.start(mine, 0);
  t.tick(45 * MIN);
  assert.deepEqual([t.run.phase, t.run.running], ["short", false]);
  assert.equal(t.timeLeft(80 * MIN), 10 * MIN);
  t.toggle(80 * MIN);
  assert.equal(t.timeLeft(85 * MIN), 5 * MIN);
});

// Skipping to the break keeps the focus minutes, and starts the break
// even with auto start off, because I asked for it.
test("skip saves the focus so far and starts the break", () => {
  const t = new Timer();
  t.start(mine, 0);
  assert.deepEqual(t.skip(20 * MIN).session, { task: "Reading", minutes: 20 });
  assert.deepEqual([t.run.phase, t.run.running], ["short", true]);
  assert.equal(t.skip(22 * MIN).session, null);
  assert.deepEqual([t.run.phase, t.run.round, t.run.running], ["focus", 2, true]);
});

// Only a round that ran out counts as a session on the stats key.
// Leaving early, by Done or by skipping, keeps the minutes and nothing more.
test("only a round that ran to the end is marked full", () => {
  const t = new Timer();
  t.start({ ...mine, autoStart: true }, 0);
  assert.equal(t.skip(44 * MIN).session.full, undefined);
  t.skip(45 * MIN);
  assert.equal(t.tick(200 * MIN).session.full, true);
  t.tick(400 * MIN);
  assert.equal(t.done(430 * MIN).session.full, undefined);
});

// Interval timer off is one countdown: no break to skip to, and it ends
// by itself.
test("a plain countdown ignores skip and ends when it runs out", () => {
  const t = new Timer();
  t.start({ ...mine, intervals: false }, 0);
  assert.equal(t.skip(5 * MIN), null);
  assert.deepEqual(t.tick(45 * MIN), { finished: "focus", session: { task: "Reading", minutes: 45, full: true }, at: 45 * MIN });
  assert.equal(t.run, null);
});

// The dots: finished rounds, the one I'm on, and all of them on the
// long break.
test("the key's face counts rounds done and the current one", () => {
  const t = new Timer();
  assert.deepEqual(
    { ...t.face(mine, 0) },
    { label: "Reading", ms: 45 * MIN, tone: "idle", color: PINK, rounds: 2, done: 0, current: 0 },
  );
  t.start({ ...mine, autoStart: true }, 0);
  assert.deepEqual([t.face(mine, 0).tone, t.face(mine, 0).done, t.face(mine, 0).current], ["running", 0, 1]);
  t.tick(45 * MIN);
  const onBreak = t.face(mine, 45 * MIN);
  assert.deepEqual([onBreak.label, onBreak.tone, onBreak.done, onBreak.current], ["Break", "break", 1, 0]);
  t.toggle(46 * MIN);
  assert.equal(t.face(mine, 46 * MIN).label, "Paused");
});

// Another task's key keeps showing its own settings while mine runs.
test("a key whose task isn't running shows its own idle face", () => {
  const t = new Timer();
  t.start(mine, 0);
  const other = t.face({ name: "Cleaning", focus: "20", intervals: false }, 5 * MIN);
  assert.deepEqual([other.label, other.ms, other.tone, other.rounds], ["Cleaning", 20 * MIN, "idle", 0]);
});

// A restart in the middle of a timer: the saved copy lands on the same
// second, because it holds a clock time and not a count.
test("a saved timer picks up at the right time after a restart", () => {
  const before = new Timer();
  before.start(mine, 0);
  const saved = JSON.parse(JSON.stringify(before.run));

  const after = new Timer();
  assert.equal(after.restore(saved), true);
  assert.equal(after.timeLeft(30 * MIN), 15 * MIN);
  assert.equal(after.tick(46 * MIN).finished, "focus");
});

// A broken state file shouldn't turn into a broken timer.
test("a saved timer in the wrong shape is ignored", () => {
  const t = new Timer();
  assert.equal(t.restore({ task: "Reading", phase: "nap" }), false);
  assert.equal(t.restore(null), false);
  assert.equal(t.run, null);
});

// The Mac was asleep when the round ran out. The session belongs to the
// time it ended, not to the morning I opened the lid.
test("a round that ran out while nothing was ticking is dated when it ended", () => {
  const t = new Timer();
  t.start(mine, 0);
  const late = t.tick(10 * 60 * MIN);
  assert.equal(late.at, 45 * MIN);
  assert.deepEqual(late.session, { task: "Reading", minutes: 45, full: true });
});

// A pause I never came back from. After an hour it ends like Done would
// have: the minutes up to the pause, not a full round, dated at the pause.
test("a timer paused for an hour ends itself and keeps the focus so far", () => {
  const t = new Timer();
  t.start(mine, 0);
  t.toggle(20 * MIN);
  assert.equal(t.tick(20 * MIN + GIVE_UP_MS - 1), null);
  assert.deepEqual(t.tick(20 * MIN + GIVE_UP_MS), { finished: null, session: { task: "Reading", minutes: 20 }, at: 20 * MIN });
  assert.equal(t.run, null);
});

// Coming back inside the hour and carrying on has to wipe the slate, or
// a later pause would be cut short by the first one.
test("carrying on starts the hour over", () => {
  const t = new Timer();
  t.start(mine, 0);
  t.toggle(10 * MIN);
  t.toggle(60 * MIN);
  t.toggle(65 * MIN);
  assert.equal(t.tick(65 * MIN + GIVE_UP_MS - 1), null);
  assert.equal(t.tick(65 * MIN + GIVE_UP_MS).session.minutes, 15);
});

// Auto start off: the break is loaded and waits for a tap. If the tap
// never comes, that's a forgotten timer too, and the hour counts from
// when the focus round ended.
test("a next round nobody starts ends itself an hour after the last one ended", () => {
  const t = new Timer();
  t.start(mine, 0);
  t.tick(50 * MIN);
  assert.deepEqual([t.run.phase, t.run.running], ["short", false]);
  assert.equal(t.tick(45 * MIN + GIVE_UP_MS - 1), null);
  // Nothing to save: the focus round was already filed when it ended.
  assert.deepEqual(t.tick(45 * MIN + GIVE_UP_MS), { finished: null, session: null, at: 45 * MIN });
  assert.equal(t.run, null);
});

// A timer that is counting is never given up on, however long it runs.
test("a running timer doesn't end itself", () => {
  const t = new Timer();
  t.start({ ...mine, focus: "180" }, 0);
  assert.equal(t.tick(179 * MIN), null);
  assert.notEqual(t.run, null);
});

// A paused timer saved by the version before this one has no pause
// time. Its hour starts when it's first looked at, not at "never".
test("a paused timer with no pause time on it gets an hour from now", () => {
  const before = new Timer();
  before.start(mine, 0);
  before.toggle(5 * MIN);
  const saved = JSON.parse(JSON.stringify(before.run));
  delete saved.pausedAt;

  const t = new Timer();
  t.restore(saved);
  assert.equal(t.tick(900 * MIN), null);
  assert.equal(t.tick(900 * MIN + GIVE_UP_MS).at, 900 * MIN);
});

// Rounds up, so the key shows 45:00 for the first second and 00:01 for
// the last, never 00:00 while it's still going.
test("the clock reads like a kitchen timer", () => {
  assert.equal(clock(45 * MIN), "45:00");
  assert.equal(clock(45 * MIN - 1), "45:00");
  assert.equal(clock(500), "00:01");
  assert.equal(clock(0), "00:00");
  assert.equal(clock(120 * MIN), "120:00");
});
