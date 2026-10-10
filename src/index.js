// The only file that talks to Stream Deck. It passes presses and turns to
// the timer, saves what the timer hands back, and redraws the keys and
// dials. The thinking is in timer.js, presses.js, history.js and draw.js.
import { execFile } from "node:child_process";
import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import { Timer, plan, PINK } from "./timer.js";
import { Presses } from "./presses.js";
import { History, lastWeeks } from "./history.js";
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
    this.remember(ev.action.id);
    await this.render(ev.action);
  }

  async onDidReceiveSettings(ev) {
    const before = plan(this.settings.get(ev.action.id)).task;
    this.settings.set(ev.action.id, ev.payload.settings ?? {});

    // Renaming a task that's running: the timer keeps going under the
    // new name, so this key can still pause and finish it.
    timer.rename(before, plan(ev.payload.settings).task);
    history.saveRun(timer.run);

    this.remember(ev.action.id);
    // The dials too, in case the color changed.
    redraw();
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

  // Keeps the task's color with the history, for the heat map.
  remember(id) {
    const p = plan(this.settings.get(id));
    history.remember(p.task, p.color);
  }

  async render(target) {
    // Every setImage is a message to Stream Deck, so a picture only goes
    // out when it's different from the last one. Most seconds it is,
    // while a timer runs, and never while nothing does.
    const image = asImage(drawKey(timer.face(this.settings.get(target.id) ?? {}, Date.now())));
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
    this.showing.set(ev.action.id, ev.payload.settings?.task ?? null);
    await this.render(ev.action);
  }

  onWillDisappear(ev) {
    this.showing.delete(ev.action.id);
    this.notices.delete(ev.action.id);
    this.lastImages.delete(ev.action.id);
  }

  // Turning flips through All and then each task, and goes round at both
  // ends. The name shows for a moment so I know which map I've landed on.
  async onDialRotate(ev) {
    // Every task with history, plus the ones on keys that haven't
    // finished a session yet.
    const onKeys = [...timerKey.settings.values()].map(settings => plan(settings).task);
    const list = [null, ...new Set([...history.tasks(), ...onKeys])];

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
    // Saved in the dial's settings so it's on the same map after a restart.
    await target.setSettings({ task });
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
        // All tasks together is always pink. One task is its own color.
        color: task ? history.colorOf(task) : PINK,
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
