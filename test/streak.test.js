import { test } from "node:test";
import assert from "node:assert/strict";
import { graceOf, modeOf, streaks } from "../src/streak.js";

// Builds the same kind of map History.totals gives, with one 45 minute
// session on each date given. Any date that's left out is a day with
// nothing on it.
const focused = (...dates) => new Map(dates.map(date => [date, 45]));

// The dates used most below, so the weekdays are easy to check:
//
//   Sun Sep 13   Sun Sep 20   Sun Sep 27   Mon Sep 28   Tue Sep 29
//   Wed Sep 30   Thu Oct 1    Fri Oct 2    Sat Oct 3    Sun Oct 4
//   Mon Oct 5    Tue Oct 6    (all 2026)

// The basic count: days in a row, ending today.
test("daily: counts a plain run of days", () => {
  const days = focused("2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06");
  assert.deepEqual(streaks(days, "2026-10-06", "daily", 0), { current: 4, longest: 4 });
});

// Without this the streak would drop to 0 every morning before I've
// started anything.
test("daily: nothing yet today doesn't break the streak", () => {
  const days = focused("2026-10-03", "2026-10-04", "2026-10-05");
  assert.deepEqual(streaks(days, "2026-10-06", "daily", 0), { current: 3, longest: 3 });
});

// Today gets added as soon as there's a session on it.
test("daily: focus time today counts", () => {
  const days = focused("2026-10-05", "2026-10-06");
  assert.equal(streaks(days, "2026-10-06", "daily", 0).current, 2);
});

// A day that's in the file with 0 minutes is the same as a day that isn't
// there. Any time at all is a hit, even half a minute.
test("daily: a day with 0 minutes is a miss, and half a minute is a hit", () => {
  const days = focused("2026-10-03", "2026-10-05", "2026-10-06");
  days.set("2026-10-04", 0);
  assert.deepEqual(streaks(days, "2026-10-06", "daily", 0), { current: 2, longest: 2 });

  days.set("2026-10-04", 0.5);
  assert.deepEqual(streaks(days, "2026-10-06", "daily", 0), { current: 4, longest: 4 });
});

// What a grace day is: Sunday Oct 4 is missed, the streak carries on over
// it, and the missed day isn't counted.
test("grace 1: one missed day is bridged but not counted", () => {
  const days = focused("2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06");
  assert.deepEqual(streaks(days, "2026-10-06", "daily", 1), { current: 4, longest: 4 });
});

// Grace 0 means no forgiveness at all, using the same days as above.
test("grace 0: one missed day breaks the streak", () => {
  const days = focused("2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06");
  assert.deepEqual(streaks(days, "2026-10-06", "daily", 0), { current: 2, longest: 2 });
});

// The limit: grace 1 covers one missed day, not two in a row.
test("grace 1: two missed days in a row break the streak", () => {
  const days = focused("2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06");
  assert.deepEqual(streaks(days, "2026-10-06", "daily", 1), { current: 2, longest: 2 });
});

// Today is left out of the gap: with nothing today, only the finished
// days before it are held against the grace allowance.
test("grace: missed days before an empty today are measured without today", () => {
  // Yesterday missed, today empty. Grace 1 keeps it, grace 0 doesn't.
  const one = focused("2026-10-03", "2026-10-04");
  assert.equal(streaks(one, "2026-10-06", "daily", 1).current, 2);
  assert.equal(streaks(one, "2026-10-06", "daily", 0).current, 0);

  // Two finished days missed is one too many for grace 1, but fine for 2.
  const two = focused("2026-10-02", "2026-10-03");
  assert.equal(streaks(two, "2026-10-06", "daily", 1).current, 0);
  assert.equal(streaks(two, "2026-10-06", "daily", 2).current, 2);
});

// The longest streak follows the same grace rule as the current one. The
// old run is Sep 14, 15, (16 missed), 17, 18, 19.
test("grace applies inside the longest streak too", () => {
  const days = focused("2026-09-14", "2026-09-15", "2026-09-17", "2026-09-18", "2026-09-19", "2026-10-05", "2026-10-06");
  assert.deepEqual(streaks(days, "2026-10-06", "daily", 1), { current: 2, longest: 5 });
  assert.deepEqual(streaks(days, "2026-10-06", "daily", 0), { current: 2, longest: 3 });
});

// My best streak is remembered after it has ended.
test("longest comes from an older run when it beats the current one", () => {
  const days = focused("2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-10-05", "2026-10-06");
  assert.deepEqual(streaks(days, "2026-10-06", "daily", 0), { current: 2, longest: 5 });
});

// The weekend is skipped: Thu, Fri, (Sat, Sun), Mon, Tue is four days in
// a row with no grace needed.
test("weekdays: a weekend doesn't break the streak", () => {
  const days = focused("2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06");
  assert.deepEqual(streaks(days, "2026-10-06", "weekdays", 0), { current: 4, longest: 4 });
});

// Weekend sessions can't pad the number: Fri, Sat, Sun, Mon is 2.
test("weekdays: focus time on a weekend isn't counted", () => {
  const days = focused("2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05");
  assert.deepEqual(streaks(days, "2026-10-05", "weekdays", 0), { current: 2, longest: 2 });

  // Only a Saturday and a Sunday, so there's no streak at all.
  const weekend = focused("2026-10-03", "2026-10-04");
  assert.deepEqual(streaks(weekend, "2026-10-05", "weekdays", 0), { current: 0, longest: 0 });
});

// A Friday streak mustn't die over the weekend: on Saturday Oct 3 the
// last weekday was a hit, so nothing has been missed.
test("weekdays: the streak is still alive when today is a Saturday", () => {
  const days = focused("2026-10-01", "2026-10-02");
  assert.equal(streaks(days, "2026-10-03", "weekdays", 0).current, 2);
});

// How a gap is measured. Thu Oct 1 to Mon Oct 5 is three days on the
// calendar but only one missed weekday (Friday), so grace 1 covers it.
test("weekdays: a gap is counted in weekdays only", () => {
  const friday = focused("2026-10-01", "2026-10-05");
  assert.equal(streaks(friday, "2026-10-05", "weekdays", 1).current, 2);

  // Wed Sep 30 to Mon Oct 5 misses Thursday and Friday, which is two.
  const both = focused("2026-09-30", "2026-10-05");
  assert.equal(streaks(both, "2026-10-05", "weekdays", 1).current, 1);
});

// Weeks run Sunday to Saturday. Tue Sep 15, Sat Sep 26 and Sun Sep 27 are
// in three weeks in a row, and Sat Sep 26 to Sun Sep 27 is the week
// changing. Today, Tue Oct 6, is in a fourth week with nothing in it yet,
// which doesn't break anything.
test("weekly: counts weeks, and an empty current week doesn't break it", () => {
  const days = focused("2026-09-15", "2026-09-26", "2026-09-27");
  assert.deepEqual(streaks(days, "2026-10-06", "weekly", 0), { current: 3, longest: 3 });

  // Something on Sunday Oct 4 makes this week count too.
  days.set("2026-10-04", 90);
  assert.deepEqual(streaks(days, "2026-10-06", "weekly", 0), { current: 4, longest: 4 });
});

// Several sessions in one week are still one week.
test("weekly: a busy week is still one week", () => {
  const days = focused("2026-10-04", "2026-10-05", "2026-10-06");
  assert.deepEqual(streaks(days, "2026-10-06", "weekly", 0), { current: 1, longest: 1 });
});

// Weekly mode doesn't use grace days: the week of Sep 20 is empty, and
// even 3 grace days don't join the weeks on either side of it.
test("weekly: grace days are ignored", () => {
  const days = focused("2026-09-15", "2026-09-29");
  assert.deepEqual(streaks(days, "2026-10-06", "weekly", 3), { current: 1, longest: 1 });
});

// A finished empty week ends the streak: last week (Sep 27 to Oct 3) had
// nothing, so the current streak is 0.
test("weekly: a whole empty week ends the streak", () => {
  const days = focused("2026-09-15", "2026-09-22");
  assert.deepEqual(streaks(days, "2026-10-06", "weekly", 0), { current: 0, longest: 2 });
});

// The date math where the year changes, which is the easiest place for a
// day or a week to go missing.
test("a streak carries on across New Year", () => {
  const days = focused("2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02");
  assert.deepEqual(streaks(days, "2026-01-02", "daily", 0), { current: 5, longest: 5 });

  // Wed Dec 31 and Thu Jan 1 are in the same week, Mon Jan 5 is in the next.
  const weeks = focused("2025-12-31", "2026-01-01", "2026-01-05");
  assert.deepEqual(streaks(weeks, "2026-01-05", "weekly", 0), { current: 2, longest: 2 });
});

// Focus time can't be in the future, but if the file somehow says so it
// mustn't sneak into the count.
test("days after today are ignored", () => {
  const days = focused("2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08");
  assert.deepEqual(streaks(days, "2026-10-06", "daily", 0), { current: 2, longest: 2 });
});

// The key before my first session ever, when there's nothing to count.
test("no days, or no today, gives 0 and 0", () => {
  assert.deepEqual(streaks(new Map(), "2026-10-06", "daily", 1), { current: 0, longest: 0 });
  assert.deepEqual(streaks(focused("2026-10-06"), "", "daily", 1), { current: 0, longest: 0 });
  assert.deepEqual(streaks(new Map(), "2026-10-06", "weekly", 1), { current: 0, longest: 0 });
});

// The mode comes from the settings page as text, or not at all for a
// key I've never touched. Anything that isn't one of the other two
// modes is daily.
test("the mode setting is daily unless it says weekdays or weekly", () => {
  assert.equal(modeOf({ mode: "weekdays" }), "weekdays");
  assert.equal(modeOf({ mode: "weekly" }), "weekly");
  assert.equal(modeOf({ mode: "daily" }), "daily");
  assert.equal(modeOf({ mode: "monthly" }), "daily");
  assert.equal(modeOf({}), "daily");
});

// Grace days: 0 is a real choice (no forgiveness), so only a missing
// or nonsense value falls back to 1. Never more than 3.
test("grace days keep a 0, fall back to 1 for junk, and stop at 3", () => {
  assert.equal(graceOf({ graceDays: "0" }), 0);
  assert.equal(graceOf({ graceDays: "2" }), 2);
  assert.equal(graceOf({ graceDays: "abc" }), 1);
  assert.equal(graceOf({}), 1);
  assert.equal(graceOf({ graceDays: "9" }), 3);
  assert.equal(graceOf({ graceDays: "-1" }), 0);
  assert.equal(graceOf({ graceDays: "1.5" }), 2);
});
