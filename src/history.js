// The focus sessions I've finished, kept in a file, and the sums the heat
// map needs from them. No Stream Deck in here.
//
// The file lives in its own folder under Application Support, not inside
// the plugin, because reinstalling the plugin replaces the plugin's
// folder and my history would go with it.
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

// POMODORO_HOME is only set by the tests, so they never touch the real
// folder.
export function dataDir(env = process.env) {
  return env.POMODORO_HOME || join(homedir(), "Library", "Application Support", "com.malikacodes.pomodoro");
}

// A clock time to the day it falls on, like "2026-10-10", in my own time
// zone. toISOString would use London's, and a late night session would
// land on tomorrow.
export function dayOf(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// How dark a day's square is, 0 to 4, from its focus minutes. The cut-offs
// are in focus sessions of mine: under one 45, under two, under four, and
// four or more.
export const STEPS = [45, 90, 180];
export function level(minutes) {
  if (!(minutes > 0)) return 0;
  return 1 + STEPS.filter(step => minutes >= step).length;
}

// The last few weeks as columns for the map, oldest first. Each column is
// a week, Sunday at the top, and each slot is a day like "2026-10-10".
// The week I'm in is always all seven days, the ones that haven't
// happened yet included, so the map stays a full rectangle. On a Monday
// the last column would otherwise be two squares over a hole.
export function lastWeeks(now, count) {
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const columns = [];
  for (let w = count - 1; w >= 0; w--) {
    const week = [];
    for (let slot = 0; slot < 7; slot++) {
      // Noon, and setDate to move, so a clock change can't skip or
      // repeat a day.
      const d = new Date(today);
      d.setDate(today.getDate() - today.getDay() - w * 7 + slot);
      week.push(dayOf(d.getTime()));
    }
    columns.push(week);
  }
  return columns;
}

const empty = () => ({ v: 1, sessions: [], colors: {} });

// A saved file is only trusted if it's the shape this file writes.
// Anything else starts fresh rather than drawing nonsense.
function valid(data) {
  return (
    data &&
    data.v === 1 &&
    Array.isArray(data.sessions) &&
    data.sessions.every(s => s && typeof s.task === "string" && typeof s.date === "string" && Number.isFinite(s.minutes)) &&
    data.colors &&
    typeof data.colors === "object"
  );
}

export class History {
  constructor({ dir = dataDir(), logger = console } = {}) {
    this.dir = dir;
    this.logger = logger;
    this.data = empty();
    this.writing = Promise.resolve();
  }

  async load() {
    try {
      const data = JSON.parse(await readFile(join(this.dir, "sessions.json"), "utf8"));
      if (valid(data)) this.data = data;
    } catch {
      // No history yet, or a broken file: start fresh.
    }
  }

  // Adds a finished focus session, filed under the day it ended.
  add({ task, minutes }, now) {
    this.data.sessions.push({ task, date: dayOf(now), minutes });
    return this.#write("sessions.json", this.data);
  }

  // The task list: every task I've added, each with its color. It's in
  // the same file as the sessions, under "colors". Keys and dials only
  // pick from this list, so a typo can't quietly start a second task.
  //
  // Object.hasOwn asks "is this name really in my list?". Without it, a
  // task called "constructor" would look like it was already there,
  // because every JavaScript object has a few names built in.
  hasTask(name) {
    return Object.hasOwn(this.data.colors, name);
  }

  // Adds a task. Says false, and changes nothing, if it's already there.
  addTask(name, color) {
    if (this.hasTask(name)) return false;
    this.data.colors[name] = color;
    this.#write("sessions.json", this.data);
    return true;
  }

  // Changes a task's color. Only for a task on the list.
  setColor(name, color) {
    if (!this.hasTask(name) || this.data.colors[name] === color) return;
    this.data.colors[name] = color;
    return this.#write("sessions.json", this.data);
  }

  colorOf(task) {
    return this.hasTask(task) ? this.data.colors[task] : undefined;
  }

  // Every task, in the order a person would sort them: A to Z, and
  // "CIT 593" before "CIT 5930". A task with saved focus time counts
  // even if it never made it onto the list.
  tasks() {
    const names = new Set([...Object.keys(this.data.colors), ...this.data.sessions.map(s => s.task)]);
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }

  // Focus minutes per day, for one task or (with no task) all of them.
  totals(task) {
    const days = new Map();
    for (const s of this.data.sessions) {
      if (task && s.task !== task) continue;
      days.set(s.date, (days.get(s.date) ?? 0) + s.minutes);
    }
    return days;
  }

  // The timer that's running right now, saved so a restart can pick it
  // back up. null clears it.
  saveRun(run) {
    return this.#write("state.json", run);
  }

  async loadRun() {
    try {
      return JSON.parse(await readFile(join(this.dir, "state.json"), "utf8"));
    } catch {
      return null;
    }
  }

  // Writes are queued one after another, like a single checkout lane, so
  // two quick saves can't write over each other halfway. Each goes to a
  // temporary name first and is renamed into place, so the real file is
  // never half written if the plugin is stopped mid-save.
  #write(name, data) {
    const text = JSON.stringify(data);
    this.writing = this.writing
      .then(async () => {
        await mkdir(this.dir, { recursive: true });
        const file = join(this.dir, name);
        await writeFile(`${file}.tmp`, text);
        await rename(`${file}.tmp`, file);
      })
      .catch(error => this.logger.warn(`Couldn't save ${name}: ${error.message}`));
    return this.writing;
  }
}
