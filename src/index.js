// The only file that talks to Stream Deck. It passes presses and turns to
// the timer, saves what the timer hands back, and redraws the keys and
// dials. The thinking is in timer.js, presses.js, history.js and draw.js.
import { execFile } from "node:child_process";
import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import { Timer, plan, PINK } from "./timer.js";
import { Presses } from "./presses.js";
import { History, dayOf, lastWeeks } from "./history.js";
import { drawKey, drawStrip, WEEKS_SHOWN } from "./draw.js";

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
  execFile("/usr/bin/afplay", ["/System/Library/Sounds/Glass.aiff"], { timeout: 10000 }, () => {});
  execFile("/usr/bin/osascript", ["-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv)", "-e", "end run", task, message], { timeout: 10000 }, () => {});
}

// Whatever the timer hands back after a command or a tick gets filed
// here: a finished focus session goes into the history, and the timer as
// it stands now is saved in case the plugin restarts.
function keep(result, now) {
  if (result?.session) history.add(result.session, now);
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

// Tells the settings page that's open about the task list. Three
// messages, because three things on the pages want it:
//   getTasks       the rows for the Timer key's dropdown
//   getTasksOrAll  the same with "All tasks" on top, for the dial
//   tasks          each task's color, and which task this key is on, so
//                  the color box can show the right one
// The dropdowns have "hot-reload" on, so they fill in again whenever
// their message arrives, not only when the page opens.
function sendTasks(picked) {
  const items = history.tasks().map(name => ({ value: name, label: name }));
  const colors = Object.fromEntries(history.tasks().map(name => [name, colorFor(name)]));
  for (const message of [
    { event: "getTasks", items },
    { event: "getTasksOrAll", items: [{ value: ALL, label: "All tasks" }, ...items] },
    { event: "tasks", colors, picked },
  ]) {
    streamDeck.ui.sendToPropertyInspector(message).catch(() => {});
  }
}

function sendStatus(text) {
  streamDeck.ui.sendToPropertyInspector({ event: "status", text }).catch(() => {});
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
    sendTasks(plan(ev.payload.settings).task);
    redraw();
  }

  // Makes sure this key's task is on the list. Two kinds of key need it:
  // a brand new one, which starts out on "Focus", and one from before
  // the list existed, whose name and color were typed into the key.
  // Those get added once, with the color the key had.
  async adopt(target) {
    const settings = this.settings.get(target.id) ?? {};
    const p = plan(settings);
    history.addTask(p.task, p.color);
    if (settings.name === p.task) return;

    // Saved back so the dropdown shows the task and not "Pick a task".
    const next = { ...settings, name: p.task };
    this.settings.set(target.id, next);
    await target.setSettings(next);
  }

  // Messages from the settings page: it asks for the list when it opens,
  // and tells me when I add a task or change a color.
  async onSendToPlugin(ev) {
    const asked = ev.payload ?? {};
    const picked = plan(this.settings.get(ev.action.id)).task;

    if (asked.event === "addTask") {
      // 30 letters is more than the key can show anyway.
      const name = String(asked.name ?? "").trim().slice(0, 30);
      if (!name || name === ALL) return sendStatus("Type a name first");
      const added = history.addTask(name, PINK);
      // A new task needs no announcement: the dropdown switching to it
      // says it worked. Only the odd case gets words.
      sendStatus(added ? "" : `${name} was already on the list`);
      sendTasks(picked);
      // The page puts this key on the new task. That comes back here as
      // a settings change, like picking it from the dropdown would.
      streamDeck.ui.sendToPropertyInspector({ event: "added", name }).catch(() => {});
      return;
    }

    if (asked.event === "setColor") {
      // The color goes straight into the pictures, so only a plain hex
      // color like #f2a7c3 gets in.
      if (!/^#[0-9a-f]{6}$/i.test(asked.color ?? "")) return;
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
    presses.down(ev.action.id, plan(this.settings.get(ev.action.id)).doubleTap);
  }

  onKeyUp(ev) {
    presses.up(ev.action.id);
  }

  pressed(id, kind) {
    const target = [...this.actions].find(each => each.id === id);
    if (!target) return;
    const outcome = act(KEY_GESTURES[kind], this.settings.get(id) ?? {});

    // The yellow triangle means "another task is running". The check
    // mark is for Done, so I know the hold landed.
    if (outcome === "busy") target.showAlert().catch(() => {});
    if (outcome === "done") target.showOk().catch(() => {});
  }

  async render(target) {
    // Every setImage is a message to Stream Deck, so a picture only goes
    // out when it's different from the last one. Most seconds it is,
    // while a timer runs, and never while nothing does.
    const face = timer.face(this.settings.get(target.id) ?? {}, Date.now());
    // The color belongs to the task now, not to the key.
    face.color = colorFor(plan(this.settings.get(target.id)).task);
    const image = asImage(drawKey(face));
    if (this.lastImages.get(target.id) === image) return;
    this.lastImages.set(target.id, image);
    await target.setImage(image);
  }
}

class HeatMap extends SingletonAction {
  // Per dial on screen: which task's map it's on (null is all of them),
  // the word it's showing for a moment (if any), and the last picture
  // sent to it.
  showing = new Map();
  notices = new Map();
  lastImages = new Map();

  async onWillAppear(ev) {
    this.showing.set(ev.action.id, this.pick(ev.payload.settings));
    await this.render(ev.action);
  }

  // I picked a task from the dropdown on the dial's settings page.
  async onDidReceiveSettings(ev) {
    this.showing.set(ev.action.id, this.pick(ev.payload.settings));
    await this.render(ev.action);
  }

  // The settings page asking for the list.
  onSendToPlugin() {
    sendTasks();
  }

  // The task a dial's settings point at, or null for all of them. A
  // dial I've never touched has no setting, and that's all of them too.
  pick(settings) {
    const task = settings?.task;
    return task && task !== ALL ? task : null;
  }

  onWillDisappear(ev) {
    this.showing.delete(ev.action.id);
    this.notices.delete(ev.action.id);
    this.lastImages.delete(ev.action.id);
  }

  // Turning flips through All and then each task, and goes round at both
  // ends. The name shows for a moment so I know which map I've landed on.
  async onDialRotate(ev) {
    const list = [null, ...history.tasks()];

    const at = Math.max(0, list.indexOf(this.showing.get(ev.action.id) ?? null));
    // JavaScript's % keeps the minus sign (-1 % 5 is -1), so I add the
    // length back before taking it again.
    const next = list[(((at + ev.payload.ticks) % list.length) + list.length) % list.length];
    await this.show(ev.action, next);
  }

  // Tapping the strip goes back to everything.
  async onTouchTap(ev) {
    await this.show(ev.action, null);
  }

  // Pressing the dial jumps to the break, or from a break back to focus,
  // for whichever task is running.
  async onDialDown(ev) {
    if (act(DIAL_PRESS, null) === "nothing") await this.showNotice(ev.action, "Nothing running");
  }

  async show(target, task) {
    this.showing.set(target.id, task);
    // Saved in the dial's settings so it's on the same map after a
    // restart, and so the dropdown on its settings page agrees.
    await target.setSettings({ task: task ?? ALL });
    await this.showNotice(target, task ?? "All tasks");
  }

  async showNotice(target, text) {
    this.notices.set(target.id, text);
    await this.render(target);
    setTimeout(() => {
      // Only clear it if a newer message hasn't replaced it.
      if (this.notices.get(target.id) !== text) return;
      this.notices.delete(target.id);
      this.render(target).catch(() => {});
    }, NOTICE_MS);
  }

  async render(target) {
    const task = this.showing.get(target.id) ?? null;
    const image = asImage(
      drawStrip({
        columns: lastWeeks(Date.now(), WEEKS_SHOWN),
        totals: history.totals(task),
        today: dayOf(Date.now()),
        // All tasks together is always pink. One task is its own color.
        color: task ? colorFor(task) : PINK,
        notice: this.notices.get(target.id),
      }),
    );
    if (this.lastImages.get(target.id) === image) return;
    this.lastImages.set(target.id, image);
    await target.setFeedback({ canvas: image });
  }
}

const timerKey = new (action({ UUID: "com.malikacodes.pomodoro.timer" })(TimerKey))();
const heatMap = new (action({ UUID: "com.malikacodes.pomodoro.heatmap" })(HeatMap))();
const presses = new Presses((id, kind) => timerKey.pressed(id, kind));

// Redraws every key and dial on the page. The "is it different" check in
// each render keeps this cheap.
function redraw() {
  for (const owner of [timerKey, heatMap]) {
    for (const target of owner.actions) {
      owner.render(target).catch(error => streamDeck.logger.warn(`Couldn't redraw: ${error.message}`));
    }
  }
}

// Pick up where I left off: the saved sessions, and a timer that was
// running when the plugin last stopped.
await history.load();
timer.restore(await history.loadRun());

streamDeck.actions.registerAction(timerKey);
streamDeck.actions.registerAction(heatMap);

// Once a second: see if the period has run out, then redraw. This keeps
// going when none of it is on the page I'm looking at, so the sound
// still plays when a period ends.
setInterval(() => {
  const now = Date.now();
  const task = timer.run?.task;
  const result = timer.tick(now);
  if (result) {
    keep(result, now);
    announce(task, result.finished);
  }
  redraw();
}, 1000);

streamDeck.connect();
