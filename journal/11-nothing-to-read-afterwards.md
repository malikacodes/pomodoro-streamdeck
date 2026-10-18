# 11 · Nothing to read afterwards

2026-10-17

Three small things in index.js, all about what happens when something
quietly doesn't work.

## Ten empty catches

On Node 24 a promise that fails with nobody catching it ends the whole
plugin, and Stream Deck restarts it with nothing in the log. So every
picture, alert and settings page message that I don't wait for had a
`.catch(() => {})` on the end. Ten of them. They kept the plugin
alive, which was the point, and they also meant a key that went blank
left nothing to read afterwards.

`redraw()` already did it properly: catch, and warn with what it was
doing. Now the other ten do the same through one small function:

```js
target.showAlert().catch(warn("show the alert"));
```

One line in the log, saying which thing didn't land. Same safety,
with a trail.

## A sound that didn't play

`announce()` plays Glass.aiff with afplay and puts up a notification
with osascript, and threw away whatever either of them said back. If
afplay ever isn't where I think it is, the period would end in
silence and I'd blame the deck. Now each one logs its error.

## The notice that cleared too early

Turning a heat map dial shows the task's name for two seconds, then
puts the map back. The old code started a timer for each turn and,
when it fired, checked "is the name I'm showing still mine?" before
clearing. That guard is by text. Turn to A, then B, then back to A
inside two seconds, and the first A's timer sees A on the strip, says
"that's mine", and clears it early.

Now each dial keeps one timer. A new name cancels the old timer and
starts a fresh one. The timer is cleared when the dial leaves the
page too, so it can't fire for a dial that's gone.

## Did it work?

No unit tests can reach index.js, so this one is the pretend deck.
With a copy of my real history and one click of the dial:

```
canvas 1   the map
canvas 2   "593", white, in the middle of the strip
canvas 3   the map again, two seconds later
```

And a restart of the linked plugin, which came back without a word in
the log. The three-turns-in-two-seconds case is the one my hands have
to check on the real dial.

## What I learned

- "Catch and ignore" and "catch and say so" cost the same line. Only
  one of them helps at 11pm.
- A guard that compares text is really a guard that hopes the text is
  unique. A handle to the thing itself doesn't have to hope.
