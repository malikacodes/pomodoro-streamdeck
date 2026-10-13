// The countdown and the rounds. No Stream Deck and no files in here, and
// the time is always handed in as "now", so the tests can run it without
// waiting 45 minutes.

const MINUTE = 60000;
export const PINK = "#f2a7c3";

// A timer that has sat paused for this long ends itself. That covers a
// pause I never came back from, and a next round that waited for a tap
// that never came. Without it, a forgotten timer would hold on to the
// whole plugin, because only one task runs at a time.
export const GIVE_UP_MS = 60 * MINUTE;

// A key's settings, cleaned up. They're saved as text ("45"), and a
// setting I've never touched isn't saved at all, so everything here has
// a fallback. Those fallbacks are my usual: 45 minute focus, 4 rounds,
// 10 and 15 minute breaks.
export function plan(settings = {}) {
  const minutes = (value, fallback) => {
    const n = Number(value);
    return (Number.isFinite(n) && n > 0 ? Math.min(n, 600) : fallback) * MINUTE;
  };
  const rounds = Math.round(Number(settings.rounds));
  const intervals = settings.intervals !== false;
  return {
    task: String(settings.name ?? "").trim() || "Focus",
    color: /^#[0-9a-f]{6}$/i.test(settings.color ?? "") ? settings.color : PINK,
    intervals,
    focus: minutes(settings.focus, 45),
    short: minutes(settings.shortBreak, 10),
    long: minutes(settings.longBreak, 15),
    // With the interval timer off it's one plain countdown.
    rounds: intervals ? (rounds >= 1 && rounds <= 8 ? rounds : 4) : 1,
    autoStart: settings.autoStart === true,
    doubleTap: settings.doubleTap !== false,
  };
}

// Focus time in minutes, to one decimal place, so a 12 and a half minute
// session isn't saved as 12 or 13.
function minutesOf(ms) {
  return Math.round(ms / (MINUTE / 10)) / 10;
}

// There is one Timer for the whole plugin, because only one task runs at
// a time. While something is running, "run" holds all of it:
//
//   task, color   whose timer this is
//   plan          the lengths and rounds it started with. Changing a key's
//                 settings mid-timer doesn't move the goalposts.
//   phase         "focus", "short" or "long"
//   round         which focus round I'm on (or just finished, on a break)
//   running       false while paused
//   endsAt        when this period runs out, as a clock time
//   left          how much was left when I paused
//   pausedAt      when it stopped counting, as a clock time
//
// It keeps the time the period ends and not a count of seconds. A count
// drifts if a tick is late, and it's gone if the plugin restarts. A clock
// time is still right after both.
export class Timer {
  run = null;

  // Whether this key's task is the one running.
  owns(settings) {
    return this.run !== null && this.run.task === plan(settings).task;
  }

  // Starts a task's first focus round. Says no if anything is running.
  start(settings, now) {
    if (this.run) return false;
    const p = plan(settings);
    this.run = { task: p.task, color: p.color, plan: p, phase: "focus", round: 1, running: true, endsAt: now + p.focus, left: 0 };
    return true;
  }

  // How long the period I'm in is meant to last.
  length() {
    return this.run.plan[this.run.phase];
  }

  timeLeft(now) {
    return this.run.running ? Math.max(0, this.run.endsAt - now) : this.run.left;
  }

  // Pause, or carry on. Pausing writes down what was left, and carrying on
  // sets a new end time from it, so the paused stretch never counts.
  toggle(now) {
    const run = this.run;
    if (!run) return;
    if (run.running) {
      run.left = this.timeLeft(now);
      run.running = false;
      run.pausedAt = now;
    } else {
      run.endsAt = now + run.left;
      run.running = true;
      delete run.pausedAt;
    }
  }

  // Called every second. When the period has run out it moves to the next
  // one and says which kind just finished, so the deck can make a sound.
  // If it was focus, the session to save comes back too.
  //
  // "at" is the moment it really happened, which isn't always now. If
  // the Mac was asleep when a round ran out, the first tick after it
  // wakes is hours late, and the session still belongs to the time the
  // round ended. A 45 minute round started at 11pm is last night's.
  tick(now) {
    const run = this.run;
    if (!run) return null;

    if (!run.running) {
      // A timer saved before pausedAt existed starts its hour now.
      run.pausedAt ??= now;
      if (now - run.pausedAt < GIVE_UP_MS) return null;

      // Paused for an hour. It ends the way Done would have at the
      // moment I walked away: the focus minutes up to the pause are
      // saved, and it isn't a full round.
      const at = run.pausedAt;
      const session = this.#closeFocus(now);
      this.run = null;
      return { finished: null, session, at };
    }

    if (now < run.endsAt) return null;
    const finished = run.phase;
    const at = run.endsAt;
    const session = this.#closeFocus(now);
    this.#advance(now, run.plan.autoStart, at);
    return { finished, session, at };
  }

  // Jump to the break now, or from a break straight back to focus. The
  // focus minutes done so far are saved. A plain countdown has no break
  // to go to, so there it does nothing.
  skip(now) {
    const run = this.run;
    if (!run || !run.plan.intervals) return null;
    const session = this.#closeFocus(now);
    // I asked for it, so the next period starts right away whatever the
    // auto start setting says.
    this.#advance(now, true);
    return { finished: null, session };
  }

  // Done: stop everything and save the focus minutes I actually did.
  done(now) {
    if (!this.run) return null;
    const session = this.#closeFocus(now);
    this.run = null;
    return { finished: null, session };
  }

  // The session for the focus period I'm leaving, or null on a break or
  // when I'd barely started. The minutes are the period's length minus
  // what's left, which is why paused time can't sneak in.
  //
  // "full" marks a round that ran all the way to the end. Leaving early
  // still saves the minutes, but only a full round counts as a session
  // on the stats and goal keys.
  #closeFocus(now) {
    const run = this.run;
    if (run.phase !== "focus") return null;
    const left = this.timeLeft(now);
    const minutes = minutesOf(this.length() - left);
    if (!(minutes > 0)) return null;
    return left === 0 ? { task: run.task, minutes, full: true } : { task: run.task, minutes };
  }

  // What comes after the period I'm in: a short break after each focus
  // round, the long one after the last round, and after the long break a
  // fresh cycle from round 1. A plain countdown just ends.
  #advance(now, go, at = now) {
    const run = this.run;
    if (!run.plan.intervals) {
      this.run = null;
      return;
    }
    if (run.phase === "focus") {
      run.phase = run.round >= run.plan.rounds ? "long" : "short";
    } else {
      run.round = run.phase === "long" ? 1 : run.round + 1;
      run.phase = "focus";
    }
    // With auto start off, the next period sits there full and paused
    // until I tap.
    run.running = go;
    run.left = go ? 0 : this.length();
    run.endsAt = go ? now + this.length() : 0;
    // Waiting for a tap is a pause too, and its hour starts when the
    // last period ended.
    if (go) delete run.pausedAt;
    else run.pausedAt = at;
  }

  // What a key should show: its own timer if its task is the one running,
  // otherwise its settings, waiting.
  //
  //   label    the small word on top
  //   ms       the time to show
  //   tone     "idle", "running", "paused" or "break"
  //   rounds   how many dots, 0 for a plain countdown
  //   done     how many of them are finished
  //   current  the round in progress (1 is the first dot), 0 for none
  face(settings, now) {
    const p = plan(settings);
    if (!this.owns(settings)) {
      return { label: p.task, ms: p.focus, tone: "idle", color: p.color, rounds: p.intervals ? p.rounds : 0, done: 0, current: 0 };
    }
    const run = this.run;
    const onBreak = run.phase !== "focus";
    return {
      label: !run.running ? "Paused" : onBreak ? "Break" : run.task,
      ms: this.timeLeft(now),
      tone: !run.running ? "paused" : onBreak ? "break" : "running",
      color: p.color,
      rounds: run.plan.intervals ? run.plan.rounds : 0,
      done: onBreak ? run.round : run.round - 1,
      current: onBreak ? 0 : run.round,
    };
  }

  // Picks a saved timer back up after a restart. Anything that isn't the
  // shape this file writes is ignored, and I start with nothing running.
  restore(saved) {
    const ok =
      saved &&
      typeof saved.task === "string" &&
      ["focus", "short", "long"].includes(saved.phase) &&
      Number.isFinite(saved.round) &&
      typeof saved.running === "boolean" &&
      Number.isFinite(saved.endsAt) &&
      Number.isFinite(saved.left) &&
      saved.plan &&
      ["focus", "short", "long", "rounds"].every(k => Number.isFinite(saved.plan[k]));
    if (ok) this.run = saved;
    return Boolean(ok);
  }
}

// 2700000 to "45:00". Past 99 minutes it just keeps counting: "120:00".
export function clock(ms) {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
