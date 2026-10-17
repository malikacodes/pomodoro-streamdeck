# 13 · A year of squares a second

2026-10-17

Once a second, the plugin asks the timer whether a period has run out,
and then redraws everything. The redraw was the cheap part, I thought,
because each key only sends a picture when it's different from the
last one. True. But "is it different" means drawing it first, and on
the task page that's four dials each building 57 weeks of squares,
every second, all day, to find out that nothing changed.

I'd written this down once already, back when the streak key's sway
turned up as extra pictures on top of the animation budget. The tick
was redrawing a moving key that was already drawing itself. I fixed
that case and left the rest.

## When can anything change?

Three ways, and only three:

- The timer said something happened: a period ran out, a paused timer
  gave up. That comes back from `tick()`.
- A timer is running. The countdown moves every second.
- The day rolled over. The heat map, the streak and today's counts
  all move at midnight whether I'm there or not.

Everything else that changes a picture already redraws on its own: a
tap, a dial turn, a settings change, a new task, a new color. So the
tick now checks those three and otherwise leaves the deck alone.

```
tick → anything from the timer?   → redraw
       timer.run not null?        → redraw
       today isn't the day it was → redraw
       none of those              → nothing
```

The tick itself and the sound didn't move. They still run with nothing
on the page, which is the whole reason the sound reaches me on another
profile.

## Did it work?

The pretend deck with a 3 second plain countdown and a press on every
key:

```
timer   00:03  00:03  00:02  00:01  00:03
```

Counting down while it ran, the sound played, a 0.1 minute session
landed in the file marked full, and the key went back to idle. Then
five seconds with nothing running and a copy of my real history: each
key drew once and the deck stayed quiet.

Midnight I couldn't fake. The clock in index.js is the real one, so
the day-roll branch is checked by reading it, not by seeing it. That's
one for tomorrow morning.

## What I learned

- "It only sends if different" and "it only draws if needed" are two
  different savings, and I'd only taken the first one.
- The same lesson found me twice. The first time I fixed the one key
  that was obviously moving. The quiet ones were the expensive ones.
