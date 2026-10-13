# A Pomodoro Timer on My Stream Deck

I wanted a focus timer I can start without picking up my phone or
finding a window. So it's a key: plain text, a countdown, and a dot for
every round. Each thing I time gets its own key with its own lengths
and its own color, whether that's a class, some research or cleaning my
room. A dial next to it shows a heat map of how much I've actually
focused.

| Action | What it does |
|---|---|
| ⏱ Timer | A key for one task. Tap to start, tap to pause, tap to carry on. Hold it for half a second for Done. Tap twice to jump to the break, or from a break back to focus. |
| 🟪 Heat Map | A dial. One square per day for the last 14 weeks, brighter for more focus time. Turn it to flip between all tasks and each one. Tap the strip to go back to all. Press it to jump to the break. |

![The key waiting, counting, paused and on a break](journal/assets/01-a-timer-on-a-key/key.png)

The key: waiting, counting, paused, and on a break. The dots are the
rounds. White ones are finished and the gray one is the round I'm in.

![The heat map for all tasks, for one task, and the name that shows when I turn](journal/assets/01-a-timer-on-a-key/strip.png)

The strip above the dial: all tasks in pink, one task in its own color,
and the name that shows for a moment when I turn to it.

These pictures are drawn by the plugin's own drawing code, not
photographed off the deck.

## The settings

Everything is in the key's settings in the Stream Deck app (the
Property Inspector, the panel at the bottom).

| Setting | What it's for | If I leave it alone |
|---|---|---|
| Task | Which task this key times, picked from my task list. It's the name on the key and the name its focus time is saved under | Focus |
| Color | The picked task's color: its heat map, and its time on the key during a break. It belongs to the task, so it's the same on every key for that task | Pink |
| New task | Type a name and press Add. It goes on the list and this key switches to it | |
| Interval timer | Off makes it one plain countdown with no breaks | On |
| Focus | Minutes per focus round | 45 |
| Rounds | Focus rounds before the long break, 1 to 8 | 4 |
| Short break | Minutes, after each round but the last | 10 |
| Long break | Minutes, after the last round | 15 |
| Auto start | Start the next focus or break by itself | Off |
| Double tap | Tap twice to jump to the break | On |

To time a second thing, I drag another Timer key onto the deck and pick
a different task, or add a new one right there.

The Heat Map dial has one setting, Show: all tasks, or one task from
the same list. Turning the dial changes the same thing.

The task list is one list for the whole plugin. I used to type the name
into each key, and one slip of the finger made a second task with its
own empty heat map. A dropdown can't misspell.

## How it works

```
key press → presses.js (tap, double or hold?) → timer.js → history.js → sessions.json
                                                    ↓
                                          draw.js → key and dial
```

- `timer.js` is the countdown and the rounds. It remembers the clock
  time a period ends, not a count of seconds, so a late tick can't make
  it drift and a restart can't lose it.
- `presses.js` tells a tap from a double tap from a hold. Stream Deck
  only reports "down" and "up".
- `history.js` saves each finished focus session and adds them up per
  day for the map. It keeps the task list too.
- `draw.js` makes the pictures as SVG text.
- `index.js` is the only file that talks to Stream Deck. The table at
  the top of it says which gesture does what, so changing one is a one
  line edit.

## Choices I made

- **One timer at a time.** If one task is running, another task's key
  shows Stream Deck's yellow warning triangle and does nothing. I didn't
  want a stray press on the wrong key to end a session.
- **Done saves what I actually did.** Hold the key 20 minutes into a 45
  and 20 minutes are saved. Paused time and break time never count.
- **Double tap is on trial.** With it on, a single tap takes a third of
  a second longer, because the key has to wait and see if a second tap
  is coming. If that bothers me, the checkbox turns it off and the dial
  press still jumps to the break.
- **The map's shades are in units of my sessions.** Under 45 minutes in
  a day is the faintest, then 45, 90, and 180 or more. They're in
  `STEPS` in `src/history.js`.
- **History lives outside the plugin**, in
  `~/Library/Application Support/com.malikacodes.pomodoro/sessions.json`,
  because reinstalling a plugin replaces its folder.

## Setup

Mac only. It needs Stream Deck 7.1 or newer and Node.

```bash
npm install
streamdeck link com.malikacodes.pomodoro.sdPlugin
```

`streamdeck` is Elgato's CLI (`npm install -g @elgato/cli`). There's no
build step. After changing the code:

```bash
streamdeck restart com.malikacodes.pomodoro
```

Then drag Timer onto a key and Heat Map onto a dial. They're under
Pomodoro in the action list.

## Good to know

- Focus time is saved under the task's name. There's no way to rename
  or remove a task from the settings yet. The list is the `colors` part
  of `sessions.json`, and the plugin has to be stopped before editing it.
- Two keys on the same task are one timer. Either one controls it.
- If I switch a key to another task while its timer is running, the
  timer keeps going under the old task. Switching the key back gets me
  the controls again.
- A new Timer key starts on a task called Focus.
- Tasks are listed A to Z, on the dropdowns and when I turn the dial.
- Changing a key's lengths while its timer is running takes effect the
  next time I start it, not mid round.
- With auto start off, the next period shows as "Paused" until I tap.
- Inside a dial stack the press belongs to the stack, so jumping to the
  break from the dial won't work there. The double tap still does.
- A plain countdown (interval timer off) has no break to jump to, so
  the double tap and the dial press do nothing on it.
- If the plugin was off when a period ran out, the sound plays when it
  comes back, and the next period starts from then.
- There's no undo after Done yet.

## Tests

```bash
npm test
```

They cover the rounds and breaks, that paused time isn't counted,
partial sessions, one task at a time, picking a timer back up after a
restart, the task list, taps against double taps against holds, the day totals and
shades, and that everything is drawn on pure black.
