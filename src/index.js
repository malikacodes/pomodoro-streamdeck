// The only file that talks to Stream Deck. It passes presses and turns to
// the timer, saves what the timer hands back, and redraws the keys and
// dials. The thinking is in timer.js, presses.js, history.js and draw.js.
import { execFile } from "node:child_process";
import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import { Timer, plan, PINK } from "./timer.js";
import { Presses } from "./presses.js";
import { History, PERIODS, dayOf, lastWeeks, periodStart } from "./history.js";
import { drawKey, drawOpenKey, drawStatsKey, drawStrip, isHex, short, GRAY, WEEKS_SHOWN, WEEKS_WIDE } from "./draw.js";
import { drawGoalKey, goalOf } from "./goal.js";
import { animate, idle, stopAnimating, stopIdling } from "./animate.js";
import { streaks } from "./streak.js";
import { SWAY_MS, TIERS, drawStreakKey } from "./flames.js";

const NOTICE_MS = 2000;

// What each press does. This is the one place to change if a gesture
// should do something else: the words on the right are the commands in
// "act" below.
const KEY_GESTURES = { tap: "toggle", double: "skip", hold: "done" };
const DIAL_PRESS = "skip";

const timer = new Timer();
const history = new History({ logger: streamDeck.logger });

// Stream Deck takes an image as a base64 "data URI", which is the whole
// picture packed into one long string.
function asImage(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// For the places that ask Stream Deck for something and don't wait for
// the answer: a picture, an alert, a word to the settings page. If it
// doesn't go through, the log says what didn't, the same way redraw
// does. A catch that swallows the error would leave a blank key with
// nothing to read afterwards.
function warn(what) {
  return error => streamDeck.logger.warn(`Couldn't ${what}: ${error.message}`);
}

// A period ran out by itself: one of macOS's own sounds, and a
// notification in case I'm not looking at the deck. The words go to
// osascript as arguments and are never pasted into the script, so a task
// name with a quote in it can't break it.
function announce(task, finished) {
  const next = timer.run?.phase;
  const message =
    finished !== "focus" ? "Break's over. Back to focus."
    : next === "long" ? "Focus done. Time for the long break."
    : next === "short" ? "Focus done. Time for a short break."
    : "Time's up.";
  // Neither one is waited for, but a sound that never played is worth a
  // line in the log, or I'd blame the deck.
  const played = error => {
    if (error) streamDeck.logger.warn(`Couldn't play the sound: ${error.message}`);
  };
  const shown = error => {
    if (error) streamDeck.logger.warn(`Couldn't show the notification: ${error.message}`);
  };
  execFile("/usr/bin/afplay", ["/System/Library/Sounds/Glass.aiff"], { timeout: 10000 }, played);
  execFile("/usr/bin/osascript", ["-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv)", "-e", "end run", task, message], { timeout: 10000 }, shown);
}

// Whatever the timer hands back after a command or a tick gets filed
// here: a finished focus session goes into the history, and the timer as
// it stands now is saved in case the plugin restarts.
function keep(result, now) {
  // A session is filed under the moment it really ended, when the timer
  // knows that better than the clock does (see "tick" in timer.js).
  if (result?.session) history.add(result.session, result.at ?? now);
  history.saveRun(timer.run);
}

// A task's color, or pink for one that never got a color.
function colorFor(task) {
  return history.colorOf(task) ?? PINK;
}

// On the heat map dial's dropdown, "All tasks" needs a value that can't
// be a task's name. A name is trimmed before it's added, so it can never
// be a lone star.
const ALL = "*";

// And "the task I tapped" needs one too. A key or dial set to this
// shows whichever task I last tapped on a heat map dial, which is how
// one task page can serve every task.
const TAPPED = "@";

// The task a dial's or a stats key's settings point at, or null for all
// of them. One I've never touched has no setting, and that's all of
// them too.
function pickedTask(settings) {
  const task = settings?.task;
  if (task === TAPPED) return history.tapped() ?? null;
  return task && task !== ALL ? task : null;
}

// The pages this plugin ships with, by the kind of deck they're laid out
// for (Stream Deck's own numbers: 7 is the Stream Deck +, 2 is the XL).
// A plugin can only open pages it ships with, never ones I made by hand.
// The task page needs dials, so only the + has one.
const PAGES = {
  7: { main: "profiles/pomodoro-plus", task: "profiles/pomodoro-task-plus" },
  2: { main: "profiles/pomodoro-xl" },
};

// Opens one of those pages on the deck the key or dial is on. The first
// time, Stream Deck asks whether to install it. If this kind of deck
// has no such page, the yellow triangle says so.
async function openPage(target, which) {
  const page = PAGES[target.device.type]?.[which];
  if (!page) return target.showAlert();
  try {
    await streamDeck.profiles.switchToProfile(target.device.id, page);
  } catch (error) {
    streamDeck.logger.error(`Couldn't open ${page}: ${error.message}`);
    await target.showAlert();
  }
}

// Tells the settings page that's open about the task list. Three
// messages, because three things on the pages want it:
//   getTasks       the rows for the Timer key's dropdown
//   getTasksOrAll  the same with "All tasks" on top, for the dial
//   tasks          each task's color, and which task this key is on, so
//                  the color box can show the right one
// The dropdowns have "hot-reload" on, so they fill in again whenever
// their message arrives, not only when the page opens.
function sendTasks(picked) {
  const names = history.tasks().map(name => ({ value: name, label: name }));
  const colors = Object.fromEntries(history.tasks().map(name => [name, colorFor(name)]));
  // The last row is for the keys and dials on the task page.
  const items = [...names, { value: TAPPED, label: "The task I tapped" }];
  for (const message of [
    { event: "getTasks", items },
    { event: "getTasksOrAll", items: [{ value: ALL, label: "All tasks" }, ...items] },
    { event: "tasks", colors, picked },
  ]) {
    streamDeck.ui.sendToPropertyInspector(message).catch(warn("send the task list to the settings page"));
  }
}

function sendStatus(text) {
  streamDeck.ui.sendToPropertyInspector({ event: "status", text }).catch(warn("send a status to the settings page"));
}

// Runs one command. settings is the key's settings, or null from the
// dial, which has no task of its own and works on whatever is running.
// It answers with how it went, so the key knows whether to flash:
//   "ok"       it did the thing
//   "done"     it finished the task
//   "busy"     another task is running, and only one runs at a time
//   "nothing"  there was nothing to do
function act(command, settings, now = Date.now()) {
  const mine = settings === null || timer.owns(settings);
  let outcome = "ok";

  if (!timer.run) {
    if (command !== "toggle" || settings === null) return "nothing";
    timer.start(settings, now);
    keep(null, now);
  } else if (!mine) {
    return "busy";
  } else if (command === "toggle") {
    timer.toggle(now);
    keep(null, now);
  } else if (command === "skip") {
    keep(timer.skip(now), now);
  } else if (command === "done") {
    keep(timer.done(now), now);
    outcome = "done";
  }

  redraw();
  return outcome;
}

class TimerKey extends SingletonAction {
  settings = new Map();
  lastImages = new Map();

  async onWillAppear(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.adopt(ev.action);
    await this.render(ev.action);
  }

  // Fires when I change something on this key's settings page.
  async onDidReceiveSettings(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.adopt(ev.action);
    // The page's color box follows the task I just picked.
    sendTasks(plan(this.settingsOf(ev.action.id)).task);
    redraw();
  }

  // Makes sure this key's task is on the list. Two kinds of key need it:
  // a brand new one, which starts out on "Focus", and one from before
  // the list existed, whose name and color were typed into the key.
  // Those get added once, with the color the key had.
  async adopt(target) {
    const settings = this.settings.get(target.id) ?? {};
    // A key on the task page has no task of its own to add.
    if (settings.name === TAPPED) return;
    const p = plan(settings);
    await history.addTask(p.task, p.color);
    if (settings.name === p.task) return;

    // Saved back so the dropdown shows the task and not "Pick a task".
    const next = { ...settings, name: p.task };
    this.settings.set(target.id, next);
    await target.setSettings(next);
  }

  // A key's settings as the timer should see them. A key on the task
  // page says "the task I tapped" where the name goes, and this swaps
  // in the real one. Its lengths are still its own.
  settingsOf(id) {
    const settings = this.settings.get(id) ?? {};
    return settings.name === TAPPED ? { ...settings, name: history.tapped() } : settings;
  }

  // Messages from the settings page: it asks for the list when it opens,
  // and tells me when I add a task or change a color.
  async onSendToPlugin(ev) {
    const asked = ev.payload ?? {};
    const picked = plan(this.settingsOf(ev.action.id)).task;

    if (asked.event === "addTask") {
      // 30 letters is more than the key can show anyway.
      const name = String(asked.name ?? "").trim().slice(0, 30);
      if (!name || name === ALL || name === TAPPED) return sendStatus("Type a name first");
      const added = await history.addTask(name, PINK);
      // A new task needs no announcement: the dropdown switching to it
      // says it worked. Only the odd case gets words.
      sendStatus(added ? "" : `${name} was already on the list`);
      sendTasks(picked);
      // The page puts this key on the new task. That comes back here as
      // a settings change, like picking it from the dropdown would.
      streamDeck.ui.sendToPropertyInspector({ event: "added", name }).catch(warn("tell the settings page about the new task"));
      return;
    }

    if (asked.event === "setColor") {
      // The color goes straight into the pictures, so only a plain hex
      // color like #f2a7c3 gets in.
      if (!isHex(asked.color)) return;
      history.setColor(String(asked.task ?? ""), asked.color);
      redraw();
    }

    sendTasks(picked);
  }

  onWillDisappear(ev) {
    presses.forget(ev.action.id);
    this.settings.delete(ev.action.id);
    this.lastImages.delete(ev.action.id);
  }

  // The key only reports down and up. presses.js turns those into a tap,
  // a double tap or a hold, and calls "pressed" below.
  onKeyDown(ev) {
    presses.down(ev.action.id, plan(this.settingsOf(ev.action.id)).doubleTap);
  }

  onKeyUp(ev) {
    presses.up(ev.action.id);
  }

  pressed(id, kind) {
    const target = [...this.actions].find(each => each.id === id);
    if (!target) return;
    const outcome = act(KEY_GESTURES[kind], this.settingsOf(id));

    // The yellow triangle means "another task is running". The check
    // mark is for Done, so I know the hold landed.
    if (outcome === "busy") target.showAlert().catch(warn("show the alert"));
    if (outcome === "done") target.showOk().catch(warn("show the check mark"));
  }

  async render(target) {
    // Every setImage is a message to Stream Deck, so a picture only goes
    // out when it's different from the last one. Most seconds it is,
    // while a timer runs, and never while nothing does.
    const settings = this.settingsOf(target.id);
    const face = timer.face(settings, Date.now());
    // The color belongs to the task now, not to the key.
    face.color = colorFor(plan(settings).task);
    const image = asImage(drawKey(face));
    if (this.lastImages.get(target.id) === image) return;
    this.lastImages.set(target.id, image);
    await target.setImage(image);
  }
}

class HeatMap extends SingletonAction {
  // Per dial on screen: its settings, the word it's showing for a moment
  // (if any), the timer that will take that word down, and the last
  // picture sent to it.
  settings = new Map();
  notices = new Map();
  clearing = new Map();
  lastImages = new Map();

  async onWillAppear(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.render(ev.action);
  }

  // I picked a task from the dropdown on the dial's settings page.
  async onDidReceiveSettings(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.render(ev.action);
  }

  // The settings page asking for the list.
  onSendToPlugin() {
    sendTasks();
  }

  onWillDisappear(ev) {
    this.settings.delete(ev.action.id);
    this.notices.delete(ev.action.id);
    clearTimeout(this.clearing.get(ev.action.id));
    this.clearing.delete(ev.action.id);
    this.lastImages.delete(ev.action.id);
  }

  // Whether this dial is one of the four on the task page, which all
  // show the task I tapped.
  onTaskPage(id) {
    return this.settings.get(id)?.task === TAPPED;
  }

  // Where a turn lands: ticks steps along the list from where I am, going
  // round at both ends. JavaScript's % keeps the minus sign (-1 % 5 is
  // -1), so I add the length back before taking it again.
  step(list, current, ticks) {
    const at = Math.max(0, list.indexOf(current));
    return list[(((at + ticks) % list.length) + list.length) % list.length];
  }

  // Turning flips through All and then each task. The name shows for a
  // moment so I know which map I've landed on. On the task page there's
  // no All: turning any of the four dials moves the whole page to the
  // next task.
  async onDialRotate(ev) {
    if (this.onTaskPage(ev.action.id)) {
      const tasks = history.tasks();
      if (tasks.length === 0) return;
      const next = this.step(tasks, history.tapped(), ev.payload.ticks);
      history.tap(next);
      // The name goes across all four dials at once.
      for (const dial of this.actions) {
        if (this.onTaskPage(dial.id)) this.showNotice(dial, next).catch(warn("show the task's name on the dial"));
      }
      redraw();
      return;
    }

    const next = this.step([null, ...history.tasks()], pickedTask(this.settings.get(ev.action.id)), ev.payload.ticks);
    const settings = { ...this.settings.get(ev.action.id), task: next ?? ALL };
    this.settings.set(ev.action.id, settings);
    // Saved in the dial's settings so it's on the same map after a
    // restart, and so the dropdown on its settings page agrees.
    await ev.action.setSettings(settings);
    await this.showNotice(ev.action, next ?? "All tasks");
  }

  // Tapping a task's map opens the task page for that task. Tapping on
  // the task page goes back, so it's tap in, tap out.
  async onTouchTap(ev) {
    if (this.onTaskPage(ev.action.id)) return openPage(ev.action, "main");

    const task = pickedTask(this.settings.get(ev.action.id));
    // All tasks has no page of its own.
    if (!task) return this.showNotice(ev.action, "Turn to a task");
    history.tap(task);
    redraw();
    await openPage(ev.action, "task");
  }

  // Pressing the dial jumps to the break, or from a break back to focus,
  // for whichever task is running.
  async onDialDown(ev) {
    if (act(DIAL_PRESS, null) === "nothing") await this.showNotice(ev.action, "Nothing running");
  }

  // Shows a word on the dial for a moment, then puts the map back. One
  // timer per dial: a new word cancels the old timer, so turning A, B,
  // then A again inside two seconds can't have the first A's timer
  // take the second A down early.
  async showNotice(target, text) {
    this.notices.set(target.id, text);
    clearTimeout(this.clearing.get(target.id));
    this.clearing.set(
      target.id,
      setTimeout(() => {
        this.notices.delete(target.id);
        this.clearing.delete(target.id);
        this.render(target).catch(warn("put the map back on the dial"));
      }, NOTICE_MS),
    );
    await this.render(target);
  }

  async render(target) {
    // No settings means the dial went away while a redraw was on its way.
    const settings = this.settings.get(target.id);
    if (!settings) return;

    const task = pickedTask(settings);
    // "wide" is the map across all four dials. Each dial draws the slice
    // for the column it sits in.
    const wide = settings.wide === true;
    const image = asImage(
      drawStrip({
        columns: lastWeeks(Date.now(), wide ? WEEKS_WIDE : WEEKS_SHOWN),
        totals: history.totals(task),
        today: dayOf(Date.now()),
        // All tasks together is always pink. One task is its own color.
        color: task ? colorFor(task) : PINK,
        notice: this.notices.get(target.id),
        slot: wide ? (target.coordinates?.column ?? 0) : undefined,
      }),
    );
    if (this.lastImages.get(target.id) === image) return;
    this.lastImages.set(target.id, image);
    await target.setFeedback({ canvas: image });
  }
}

// A key that opens my main Pomodoro page on the deck it's on. On the
// task page it's the Back key. The word on it comes from its settings.
class OpenKey extends SingletonAction {
  async onWillAppear(ev) {
    await ev.action.setImage(asImage(drawOpenKey(String(ev.payload.settings?.label || "Pomodoro"))));
  }

  async onDidReceiveSettings(ev) {
    await ev.action.setImage(asImage(drawOpenKey(String(ev.payload.settings?.label || "Pomodoro"))));
  }

  async onKeyDown(ev) {
    await openPage(ev.action, "main");
  }
}

// How each stretch of time reads along the bottom of the stats key.
// This year reads as the year itself, like on my GitHub stats key.
function periodName(period, now) {
  return { today: "Today", week: "This week", all: "All time" }[period] ?? String(new Date(now).getFullYear());
}

// A key that counts my sessions: rounds that ran to the end, for one
// task or all of them, over today, this week, this year or all time.
class StatsKey extends SingletonAction {
  settings = new Map();
  lastImages = new Map();

  async onWillAppear(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.render(ev.action);
  }

  async onDidReceiveSettings(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.render(ev.action);
  }

  onWillDisappear(ev) {
    this.settings.delete(ev.action.id);
    this.lastImages.delete(ev.action.id);
  }

  // The settings page asking for the task list.
  onSendToPlugin() {
    sendTasks();
  }

  // The stretch of time a key counts over. A key I haven't set up counts
  // this year, and anything odd in the setting does too.
  period(settings) {
    return PERIODS.includes(settings?.period) ? settings.period : "year";
  }

  // A press steps to the next stretch: today, this week, this year, all
  // time, and round again. It's saved, so the settings page agrees and
  // the key stays there after a restart.
  async onKeyDown(ev) {
    const settings = this.settings.get(ev.action.id) ?? {};
    const next = PERIODS[(PERIODS.indexOf(this.period(settings)) + 1) % PERIODS.length];
    this.settings.set(ev.action.id, { ...settings, period: next });
    await ev.action.setSettings({ ...settings, period: next });
    await this.render(ev.action);
  }

  async render(target) {
    // No settings means the key went away while a redraw was on its way
    // to it. Drawing it now would put it back in the maps for good.
    const settings = this.settings.get(target.id);
    if (!settings) return;

    const task = pickedTask(settings);
    const period = this.period(settings);
    const now = Date.now();
    const image = asImage(
      drawStatsKey({
        label: task ?? "All tasks",
        sessions: history.sessionCount(task, periodStart(period, now)),
        period: periodName(period, now),
        color: task ? colorFor(task) : PINK,
      }),
    );
    if (this.lastImages.get(target.id) === image) return;
    this.lastImages.set(target.id, image);
    await target.setImage(image);
  }
}

// How long the goal key's celebration lasts. Its pictures go through
// animate.js, which keeps the whole plugin inside Elgato's limit of ten
// pictures a second.
const CELEBRATION_MS = 2200;

// A key with a ring that fills up as today's sessions get closer to my
// goal for the day, and a celebration the first time it's met. Once
// it's met, a press plays the celebration again.
class GoalKey extends SingletonAction {
  settings = new Map();
  lastImages = new Map();

  // The keys that are in the middle of celebrating, and the time on the
  // clock when each one started. How far along a key is gets worked out
  // from that every time it's drawn, like checking a stopwatch, so the
  // celebration takes the same 2.2 seconds however many pictures make
  // it to the key.
  started = new Map();

  async onWillAppear(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.render(ev.action);
  }

  // Fires when I pick a different task or goal on the settings page.
  // Only those two are taken from it. The page keeps its own copy of the
  // settings, and if that copy is older than today's celebration, taking
  // all of it would make the key forget it already celebrated.
  async onDidReceiveSettings(ev) {
    const { task, goal } = ev.payload.settings ?? {};
    this.settings.set(ev.action.id, { ...this.settings.get(ev.action.id), task, goal });
    await this.render(ev.action);
  }

  onWillDisappear(ev) {
    // A celebration that gets cut off isn't picked up later. It already
    // counted as today's, so the key comes back as the finished ring.
    this.settings.delete(ev.action.id);
    this.lastImages.delete(ev.action.id);
    this.started.delete(ev.action.id);
    stopAnimating(ev.action.id);
  }

  // The settings page asking for the task list.
  onSendToPlugin() {
    sendTasks();
  }

  sessionsToday(settings) {
    const now = Date.now();
    return history.sessionCount(pickedTask(settings), periodStart("today", now));
  }

  // Whether animate.js is sending this key's pictures right now. The
  // once-a-second redraw leaves a moving key alone (see "redraw").
  moving(id) {
    return this.started.has(id);
  }

  // If today's goal is already met, a press plays the celebration again,
  // because that's fun to watch twice. Pressing in the middle of one
  // starts it over.
  async onKeyDown(ev) {
    const settings = this.settings.get(ev.action.id);
    if (!settings || this.sessionsToday(settings) < goalOf(settings)) return;
    this.celebrate(ev.action);
    await this.render(ev.action);
  }

  // The one place a key gets its picture from, whether that's the normal
  // ring or a moment of the celebration.
  async render(target) {
    // No settings means the key went away while a redraw was on its way
    // to it. Drawing it now would put it back in the maps for good.
    const settings = this.settings.get(target.id);
    if (!settings) return;

    const now = Date.now();
    const today = dayOf(now);
    const goal = goalOf(settings);
    const count = this.sessionsToday(settings);
    const task = pickedTask(settings);

    // The goal was just met and this key hasn't celebrated today. The
    // date is saved right now and not when the animation ends, so
    // switching pages or restarting halfway can't make it play again.
    const starting = count >= goal && settings.celebrated !== today;
    if (starting) {
      this.settings.set(target.id, { ...settings, celebrated: today });
      this.celebrate(target);
    }

    // How far through the celebration this key is, from 0 to 1.
    const began = this.started.get(target.id);
    const burst = began === undefined ? undefined : (now - began) / CELEBRATION_MS;

    // Past the goal the ring just stays full, and the count keeps going.
    const image = asImage(drawGoalKey(count, `of ${goal}`, GRAY, Math.min(1, count / goal), count >= goal, burst, task ? colorFor(task) : PINK));
    const same = this.lastImages.get(target.id) === image;
    this.lastImages.set(target.id, image);

    if (starting) await target.setSettings({ ...settings, celebrated: today });
    if (!same) await target.setImage(image);
  }

  // Starts a key's stopwatch and puts it in the queue for animation
  // turns. A key that's already celebrating just gets a new start time.
  celebrate(target) {
    this.started.set(target.id, Date.now());
    animate(target.id, () => this.turn(target));
  }

  // Runs each time it's this key's turn to send a picture. When time's
  // up the key comes out of the queue before it's drawn, so this same
  // call is what puts the normal ring back.
  turn(target) {
    const began = this.started.get(target.id);
    if (began === undefined || Date.now() - began >= CELEBRATION_MS) {
      this.started.delete(target.id);
      stopAnimating(target.id);
    }
    this.render(target).catch(warn("draw the goal key"));
  }
}

// The burst is the fire flaring up and throwing sparks. The rest of the
// time a lit fire sways a little so the key doesn't look frozen.
const BURST_MS = 2000;

// A key with a fire that grows as my streak does, and the streak as a
// number. A day counts if it has any focus time on it. Pressing the key
// makes the fire flare up.
class StreakKey extends SingletonAction {
  settings = new Map();
  lastImages = new Map();

  // The streak each key showed last. A different number is what sets
  // off a burst, and a key that isn't in here yet has only just appeared.
  counts = new Map();

  // The keys in the middle of a burst, and the time on the clock when
  // each one started, like the goal key's celebration.
  flared = new Map();

  async onWillAppear(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.render(ev.action);
  }

  async onDidReceiveSettings(ev) {
    this.settings.set(ev.action.id, ev.payload.settings ?? {});
    await this.render(ev.action);
  }

  onWillDisappear(ev) {
    // Its streak is forgotten too, which is what makes the fire flare
    // up when the key comes back.
    this.settings.delete(ev.action.id);
    this.lastImages.delete(ev.action.id);
    this.counts.delete(ev.action.id);
    this.flared.delete(ev.action.id);
    stopAnimating(ev.action.id);
    stopIdling(ev.action.id);
  }

  // The settings page asking for the task list.
  onSendToPlugin() {
    sendTasks();
  }

  // A lit fire is always moving: flaring, or swaying. A cold coal isn't,
  // so the once-a-second redraw is what notices its first day.
  moving(id) {
    return this.flared.has(id) || this.counts.get(id) > 0;
  }

  // If there's a fire, a press makes it flare. A cold coal has nothing
  // to flare, so there a press does nothing.
  async onKeyDown(ev) {
    if (!this.counts.get(ev.action.id)) return;
    this.flare(ev.action);
    await this.render(ev.action);
  }

  // The settings page shows Daily and 1 before anything is picked, but
  // it doesn't save them until I change them, so a new key arrives with
  // no settings at all. Whatever does arrive is checked.
  mode(settings) {
    return settings.mode === "weekdays" || settings.mode === "weekly" ? settings.mode : "daily";
  }

  // 0 is a real choice here (no grace at all), so the default of 1 is
  // only for a value that's missing or isn't a number.
  grace(settings) {
    const grace = Number(settings.graceDays ?? 1);
    return Number.isNaN(grace) ? 1 : Math.min(3, Math.max(0, Math.round(grace)));
  }

  // The one place a key gets its picture from, whether the fire is
  // cold, swaying or flaring.
  async render(target) {
    // No settings means the key went away while a redraw was on its way.
    const settings = this.settings.get(target.id);
    if (!settings) return;

    const now = Date.now();
    const task = pickedTask(settings);
    const mode = this.mode(settings);
    const { current } = streaks(history.totals(task), dayOf(now), mode, this.grace(settings));

    // A new number gets a burst. That covers a key that has just
    // appeared too, because it has no last number yet. 0 never bursts.
    if (current > 0 && current !== this.counts.get(target.id)) this.flare(target);
    this.counts.set(target.id, current);

    // A lit fire that isn't in a burst sways, so it's in the idling line
    // for as long as it's showing. A cold coal has nothing to sway.
    if (current > 0 && !this.flared.has(target.id)) idle(target.id, () => this.render(target).catch(warn("draw the streak key")));
    else stopIdling(target.id);

    // The tier is how many rows of the table the streak has reached. A
    // week counts as 7 days, so a weekly streak grows the same fire.
    const days = mode === "weekly" ? current * 7 : current;
    const tier = TIERS.filter(row => days >= row.from).length;

    // How far through its burst this key is, from 0 to 1. The sway has
    // no start of its own. It's read straight off the clock, like
    // looking at where the second hand is.
    const flared = this.flared.get(target.id);
    const burst = flared === undefined ? undefined : (now - flared) / BURST_MS;
    const sway = (now % SWAY_MS) / SWAY_MS;

    // The small line says which task, when it's only one. A long name
    // is cut so it stays inside the key.
    const image = asImage(drawStreakKey(current, task ? short(task, 14) : "", GRAY, tier, burst, sway));
    const same = this.lastImages.get(target.id) === image;
    this.lastImages.set(target.id, image);
    if (!same) await target.setImage(image);
  }

  // Starts a key's burst stopwatch and puts it in the queue for
  // animation turns.
  flare(target) {
    this.flared.set(target.id, Date.now());
    animate(target.id, () => this.turn(target));
  }

  // Runs each time it's this key's turn to send a picture of its burst.
  // When time's up the key comes out of the queue before it's drawn, so
  // this same call is what sends it back to swaying.
  turn(target) {
    if (Date.now() - (this.flared.get(target.id) ?? 0) >= BURST_MS) {
      this.flared.delete(target.id);
      stopAnimating(target.id);
    }
    this.render(target).catch(warn("draw the streak key"));
  }
}

const timerKey = new (action({ UUID: "com.malikacodes.pomodoro.timer" })(TimerKey))();
const openKey = new (action({ UUID: "com.malikacodes.pomodoro.open" })(OpenKey))();
const streakKey = new (action({ UUID: "com.malikacodes.pomodoro.streak" })(StreakKey))();
const goalKey = new (action({ UUID: "com.malikacodes.pomodoro.goal" })(GoalKey))();
const statsKey = new (action({ UUID: "com.malikacodes.pomodoro.stats" })(StatsKey))();
const heatMap = new (action({ UUID: "com.malikacodes.pomodoro.heatmap" })(HeatMap))();
const presses = new Presses((id, kind) => timerKey.pressed(id, kind));

// Redraws every key and dial on the page. The "is it different" check in
// each render keeps this cheap.
//
// A key that's in the middle of moving is skipped. Its picture changes
// with the clock, so it would never be "the same as last time", and
// every redraw would be one more picture on top of the ten a second
// that animate.js is already handing out. It isn't left behind: its
// next turn works everything out fresh, new sessions included.
function redraw() {
  for (const owner of [timerKey, heatMap, statsKey, goalKey, streakKey]) {
    for (const target of owner.actions) {
      if (owner.moving?.(target.id)) continue;
      owner.render(target).catch(warn("redraw"));
    }
  }
}

// Pick up where I left off: the saved sessions, and a timer that was
// running when the plugin last stopped.
await history.load();
timer.restore(await history.loadRun());

streamDeck.actions.registerAction(timerKey);
streamDeck.actions.registerAction(heatMap);
streamDeck.actions.registerAction(openKey);
streamDeck.actions.registerAction(statsKey);
streamDeck.actions.registerAction(goalKey);
streamDeck.actions.registerAction(streakKey);

// Once a second: see if the period has run out, then redraw. This keeps
// going when none of it is on the page I'm looking at, so the sound
// still plays when a period ends.
setInterval(() => {
  const now = Date.now();
  const task = timer.run?.task;
  const result = timer.tick(now);
  if (result) {
    keep(result, now);
    // A timer that gave up after an hour paused ends quietly.
    if (result.finished) announce(task, result.finished);
  }
  redraw();
}, 1000);

streamDeck.connect();
