import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { History, dataDir, dayOf, lastWeeks, level, periodStart } from "../src/history.js";

// Every test gets its own empty folder, so none of them can see my real
// history or each other's.
const freshDir = () => mkdtemp(join(tmpdir(), "pomodoro-"));
const quiet = { warn() {} };
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

// The tests point the data folder somewhere else with POMODORO_HOME.
// If that stopped working they'd write into my real history.
test("POMODORO_HOME moves the data folder", () => {
  assert.equal(dataDir({ POMODORO_HOME: "/tmp/elsewhere" }), "/tmp/elsewhere");
  assert.match(dataDir({}), /Application Support\/com\.malikacodes\.pomodoro$/);
});

// A session that ends at 11pm belongs to today, not to tomorrow in UTC.
test("a late night session is filed under my own day", () => {
  assert.equal(dayOf(at(2026, 10, 10, 23)), "2026-10-10");
  assert.equal(dayOf(at(2026, 3, 1, 0)), "2026-03-01");
});

// The map's five shades. The edges matter: 45 is a full session.
test("levels step up at 45, 90 and 180 minutes", () => {
  assert.deepEqual([0, 0.5, 44.9, 45, 89, 90, 179, 180, 400].map(level), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

// Saved sessions have to still be there after the plugin restarts.
test("sessions are still there after loading the file again", async () => {
  const dir = await freshDir();
  const first = new History({ dir, logger: quiet });
  first.add({ task: "Reading", minutes: 45 }, at(2026, 10, 9));
  await first.add({ task: "Cleaning", minutes: 20 }, at(2026, 10, 10));

  const second = new History({ dir, logger: quiet });
  await second.load();
  assert.deepEqual(second.tasks(), ["Cleaning", "Reading"]);
  assert.equal(second.totals().get("2026-10-10"), 20);
});

// The two maps: one task, or everything added up.
test("totals add up a day for one task or for all of them", async () => {
  const h = new History({ dir: await freshDir(), logger: quiet });
  const today = at(2026, 10, 10);
  h.add({ task: "Reading", minutes: 45 }, today);
  h.add({ task: "Reading", minutes: 12.5 }, today);
  h.add({ task: "Cleaning", minutes: 20 }, today);
  await h.add({ task: "Reading", minutes: 30 }, at(2026, 10, 9));

  assert.equal(h.totals("Reading").get("2026-10-10"), 57.5);
  assert.equal(h.totals("Cleaning").get("2026-10-10"), 20);
  assert.equal(h.totals().get("2026-10-10"), 77.5);
  assert.equal(h.totals("Cleaning").get("2026-10-09"), undefined);
});

// The stats key's number. A round I left early keeps its minutes but
// isn't a session.
test("only full rounds are counted as sessions", async () => {
  const h = new History({ dir: await freshDir(), logger: quiet });
  const today = at(2026, 10, 13);
  h.add({ task: "Reading", minutes: 45, full: true }, today);
  h.add({ task: "Reading", minutes: 44 }, today);
  await h.add({ task: "Cleaning", minutes: 20, full: true }, today);
  assert.equal(h.sessionCount(), 2);
  assert.equal(h.sessionCount("Reading"), 1);
  assert.equal(h.sessionCount("Nothing yet"), 0);
  // The early one still made it onto the heat map.
  assert.equal(h.totals("Reading").get("2026-10-13"), 89);
});

// Sessions saved before rounds were marked don't say if they were full.
// Those count from 25 minutes up, so my first weeks aren't a row of zeros.
test("an old session with no mark counts if it's 25 minutes or more", async () => {
  const dir = await freshDir();
  await writeFile(join(dir, "sessions.json"), JSON.stringify({ v: 1, colors: {}, sessions: [
    { task: "Reading", date: "2026-10-10", minutes: 45 },
    { task: "Reading", date: "2026-10-10", minutes: 25 },
    { task: "Reading", date: "2026-10-10", minutes: 24.9 },
    { task: "Reading", date: "2026-10-10", minutes: 60, full: false },
  ] }));
  const h = new History({ dir, logger: quiet });
  await h.load();
  assert.equal(h.sessionCount(), 2);
});

// The four stretches on the stats key. The edges are what matter:
// yesterday isn't today, last Saturday isn't this week.
test("sessions can be counted from today, this week or this year", async () => {
  const h = new History({ dir: await freshDir(), logger: quiet });
  // 2026-10-13 is a Tuesday, so this week started on Sunday the 11th.
  const now = at(2026, 10, 13);
  for (const day of [at(2025, 12, 31), at(2026, 1, 1), at(2026, 10, 10), at(2026, 10, 11), at(2026, 10, 12), now]) {
    h.add({ task: "Reading", minutes: 45, full: true }, day);
  }
  await h.writing;
  assert.equal(periodStart("today", now), "2026-10-13");
  assert.equal(periodStart("week", now), "2026-10-11");
  assert.equal(periodStart("year", now), "2026-01-01");
  assert.equal(periodStart("all", now), undefined);
  assert.deepEqual(["today", "week", "year", "all"].map(p => h.sessionCount(null, periodStart(p, now))), [1, 3, 5, 6]);
});

// The task list has to be there after a restart, colors included.
test("the task list and its colors are still there after loading again", async () => {
  const dir = await freshDir();
  const first = new History({ dir, logger: quiet });
  assert.equal(first.addTask("Reading", "#88ccff"), true);
  await first.setColor("Reading", "#aabbcc");

  const second = new History({ dir, logger: quiet });
  await second.load();
  assert.deepEqual(second.tasks(), ["Reading"]);
  assert.equal(second.colorOf("Reading"), "#aabbcc");
  assert.equal(second.colorOf("Never heard of it"), undefined);
});

// Adding a name twice must not wipe the color I already picked for it.
test("adding a task that's already there changes nothing", async () => {
  const h = new History({ dir: await freshDir(), logger: quiet });
  h.addTask("Reading", "#88ccff");
  assert.equal(h.addTask("Reading", "#f2a7c3"), false);
  assert.equal(h.colorOf("Reading"), "#88ccff");
});

// A color only sticks to a task that's on the list. This is what keeps
// stray names out of the file.
test("a color for a task that isn't on the list is ignored", async () => {
  const h = new History({ dir: await freshDir(), logger: quiet });
  await h.setColor("Typo", "#88ccff");
  assert.deepEqual(h.tasks(), []);
});

// Every JavaScript object already has a "constructor" and a "toString".
// A task with one of those names is still a new task.
test("a task can be called constructor", async () => {
  const h = new History({ dir: await freshDir(), logger: quiet });
  assert.equal(h.colorOf("constructor"), undefined);
  assert.equal(h.addTask("constructor", "#88ccff"), true);
  assert.equal(h.colorOf("constructor"), "#88ccff");
});

// The order of the dropdown and of the dial. Numbers sort as numbers, so
// 594 comes before 5930, and old focus time under a name that was never
// added still shows up.
test("tasks come back sorted, with ones that only have focus time", async () => {
  const h = new History({ dir: await freshDir(), logger: quiet });
  h.addTask("CIT 5930", "#f2a7c3");
  h.addTask("cleaning", "#f2a7c3");
  h.addTask("CIT 594", "#f2a7c3");
  await h.add({ task: "Baking", minutes: 20 }, at(2026, 10, 10));
  assert.deepEqual(h.tasks(), ["Baking", "CIT 594", "CIT 5930", "cleaning"]);
});

// A file that got mangled starts me fresh and doesn't crash the plugin.
test("a broken history file is ignored", async () => {
  const dir = await freshDir();
  await writeFile(join(dir, "sessions.json"), '{"v":1,"sessions":"oops"}');
  const h = new History({ dir, logger: quiet });
  await h.load();
  assert.deepEqual(h.tasks(), []);
});

// The running timer goes to its own file and comes back the same, and
// clearing it really clears it.
test("the running timer is saved, loaded and cleared", async () => {
  const dir = await freshDir();
  const h = new History({ dir, logger: quiet });
  assert.equal(await h.loadRun(), null);
  await h.saveRun({ task: "Reading", endsAt: 123 });
  assert.deepEqual(await h.loadRun(), { task: "Reading", endsAt: 123 });
  await h.saveRun(null);
  assert.equal(await h.loadRun(), null);
  assert.equal(await readFile(join(dir, "state.json"), "utf8"), "null");
});

// The map's grid: the last column is the week I'm in, all seven days of
// it, with every day in the row for its own weekday.
test("the last weeks end on this week's Saturday, Sunday at the top", () => {
  const week = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"];

  // 2026-10-10 is a Saturday.
  const full = lastWeeks(at(2026, 10, 10), 14);
  assert.equal(full.length, 14);
  assert.deepEqual(full.at(-1), week);
  assert.equal(full[0][0], "2026-07-05");

  // The Wednesday before gets the same column: Thursday to Saturday are
  // in it even though they haven't happened yet.
  const part = lastWeeks(at(2026, 10, 7), 2);
  assert.deepEqual(part.at(-1), week);
  assert.equal(part[0][6], "2026-10-03");
});

// The clocks go back on 2026-11-01. Counting days in milliseconds would
// repeat or skip one around then.
test("a clock change doesn't repeat or skip a day", () => {
  const days = lastWeeks(at(2026, 11, 7), 2).flat();
  assert.equal(new Set(days).size, 14);
  assert.deepEqual(days.slice(6, 9), ["2026-10-31", "2026-11-01", "2026-11-02"]);
});
