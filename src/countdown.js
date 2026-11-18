// The Countdown key: one plain countdown per key that has nothing to do
// with the Pomodoro timer. It isn't a task, so it never asks the one
// Timer whether something else is running, and nothing it does goes
// into the history, the streak or the goal. I made it because my Coffee
// Chat key wouldn't start while a focus round was going on my other
// deck. No Stream Deck in here, and "now" is always handed in.

const MINUTE = 60000;

// A key's settings, cleaned up, with my coffee chat as the fallback:
// 15 minutes and "Coffee Chat" on top. Minutes are saved as text, and
// anything that isn't a number above 0 goes back to 15. A fraction is
// fine, which is also how the pretend deck gets to 0:00 in seconds.
export function countdownPlan(settings = {}) {
  const n = Number(settings.minutes);
  return {
    label: String(settings.label ?? "").trim() || "Coffee Chat",
    ms: (Number.isFinite(n) && n > 0 ? Math.min(n, 600) : 15) * MINUTE,
  };
}

// One of these per key. While it's counting, "run" holds the clock time
// it ends at (or what was left, while paused), the same way timer.js
// does it, so a late tick can't make it drift. A paused countdown never
// gives up by itself like a paused Pomodoro does: it blocks nothing.
export class Countdown {
  run = null;

  // Ran out and waiting for a tap. Worked out from the clock, so it's
  // right even if no tick has noticed yet.
  over(now) {
    return Boolean(this.run?.running && now >= this.run.endsAt);
  }

  // A tap starts it, pauses it, carries on, or once it's hit zero, puts
  // it back to full. The length is read from the settings when it
  // starts, so changing the minutes mid-chat doesn't move the end.
  tap(settings, now) {
    const run = this.run;
    if (!run) {
      const { ms } = countdownPlan(settings);
      this.run = { running: true, endsAt: now + ms, left: ms };
    } else if (this.over(now)) {
      this.run = null;
    } else if (run.running) {
      run.left = run.endsAt - now;
      run.running = false;
    } else {
      run.endsAt = now + run.left;
      run.running = true;
    }
  }

  // Hold: back to full, whatever it was doing.
  reset() {
    this.run = null;
  }

  // Called every second. Says whether the picture could have changed:
  // yes while it counts, and once more on the tick it hits zero. After
  // that the "Done" picture sits still, so there's nothing to redraw.
  tick(now) {
    const run = this.run;
    if (!run?.running || run.noticed) return false;
    if (this.over(now)) run.noticed = true;
    return true;
  }

  // What the key shows, in the same shape as Timer.face, so drawKey in
  // draw.js draws it and it looks exactly like my Timer keys. One dot,
  // like a one-round timer: dark while it waits, gray while it counts,
  // pink when it's done.
  face(settings, now) {
    const { label, ms } = countdownPlan(settings);
    const base = { label, ms, tone: "idle", rounds: 1, done: 0, current: 0 };
    const run = this.run;
    if (!run) return base;
    if (this.over(now)) return { ...base, label: "Done", ms: 0, tone: "done", done: 1 };
    if (!run.running) return { ...base, label: "Paused", ms: run.left, tone: "paused", current: 1 };
    return { ...base, ms: run.endsAt - now, tone: "running", current: 1 };
  }
}
