// The focus sessions I've finished, kept in a file, and the sums the heat
// map needs from them. No Stream Deck in here.
//
// The file lives in its own folder under Application Support, not inside
// the plugin, because reinstalling the plugin replaces the plugin's
// folder and my history would go with it.
import { homedir } from "node:os";
import { join } from "node:path";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";

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

// The day each stretch on the stats key starts on. "week" starts on
// Sunday, the same as a column of the heat map. "all" has no start.
export const PERIODS = ["today", "week", "year", "all"];
export function periodStart(period, now) {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  if (period === "today") return dayOf(d.getTime());
  if (period === "week") {
    d.setDate(d.getDate() - d.getDay());
    return dayOf(d.getTime());
  }
  if (period === "year") return `${d.getFullYear()}-01-01`;
  return undefined;
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

// Where a dial turn lands: ticks steps along the list from where I am,
// going round at both ends. A current that isn't on the list (a task
// that's gone, or nothing picked yet) counts as the top. JavaScript's %
// keeps the minus sign (-1 % 5 is -1), so I add the length back before
// taking it again.
export function step(list, current, ticks) {
  const at = Math.max(0, list.indexOf(current));
  return list[(((at + ticks) % list.length) + list.length) % list.length];
}

const empty = () => ({ v: 1, sessions: [], colors: {} });

// Whether a saved focus period counts as a session: a round that ran all
// the way to the end. Newer ones say so themselves ("full" is true or
// false). The ones saved before I kept track don't say either way, so
// those count if they're at least 25 minutes, which is as short as a
// focus round of mine gets.
const OLD_SESSION_MINUTES = 25;
function counts(s) {
  return s.full ?? s.minutes >= OLD_SESSION_MINUTES;
}

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
    // Set by load when the file on disk has to be left alone (see there).
    this.keep = false;
  }

  // Reads the file back. No file is the normal first run. Anything else
  // that goes wrong (the file can't be read, isn't JSON, isn't the shape
  // above) is said in the log, and the file is set aside as
  // sessions.json.bad before the next save writes a fresh one next to
  // it. Starting fresh in memory while leaving the old file in place
  // would be worse: the next finished session would write over a year
  // of focus time that a permissions fix could have brought back.
  async load() {
    const file = join(this.dir, "sessions.json");
    let data;
    try {
      data = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return;
      return this.#setAside(file, error.message);
    }
    if (valid(data)) this.data = data;
    else return this.#setAside(file, "it isn't the shape I save");
  }

  // Moves the file I couldn't use out of the way. If it can't be moved,
  // or there's already a .bad from an earlier time that I haven't looked
  // at yet, the file stays where it is and this run doesn't save the
  // task list or sessions at all. Losing today's sessions is the lesser
  // evil: the file on disk is the one I'd want back.
  async #setAside(file, why) {
    this.logger.warn(`Couldn't use ${file}: ${why}.`);
    const bad = `${file}.bad`;
    try {
      await access(bad);
      this.keep = true;
      this.logger.warn(`${bad} is already there from an earlier time. Move it and restart, and until then nothing is saved to sessions.json.`);
      return;
    } catch {
      // No .bad yet, which is the usual case.
    }
    try {
      await rename(file, bad);
      this.logger.warn(`Starting fresh, with the old file kept as ${bad}.`);
    } catch (error) {
      this.keep = true;
      this.logger.warn(`Couldn't move it aside (${error.message}), so nothing is saved to sessions.json until it's sorted.`);
    }
  }

  // Adds a finished focus session, filed under the day it ended. full is
  // whether the round ran to the end (see "counts" above).
  add({ task, minutes, full }, now) {
    this.data.sessions.push({ task, date: dayOf(now), minutes, full: Boolean(full) });
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

  // Adds a task. Says whether it was new, once its save has been tried
  // (a save that fails is logged, not thrown). A name that's already
  // there changes nothing.
  async addTask(name, color) {
    if (this.hasTask(name)) return false;
    this.data.colors[name] = color;
    await this.#write("sessions.json", this.data);
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

  // The task I last tapped on a heat map dial. The task page's keys and
  // dials all show this one. It's saved with the rest so the page is
  // still on the same task after a restart. A task that has since left
  // the list doesn't count.
  tapped() {
    return this.tasks().includes(this.data.tapped) ? this.data.tapped : undefined;
  }

  tap(name) {
    if (this.data.tapped === name) return;
    this.data.tapped = name;
    return this.#write("sessions.json", this.data);
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

  // How many sessions, for one task or (with no task) all of them, on or
  // after the day "from". With no from it's every one I've saved. Only a
  // round that ran to the end is a session.
  sessionCount(task, from) {
    // Dates written like 2026-10-13 sort like words, so >= means "that
    // day or later".
    return this.data.sessions.filter(s => (!task || s.task === task) && (!from || s.date >= from) && counts(s)).length;
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
    // See #setAside: a file I couldn't read is never written over.
    if (this.keep && name === "sessions.json") {
      this.logger.warn(`Not saving ${name}: the one on disk couldn't be read.`);
      return this.writing;
    }
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
