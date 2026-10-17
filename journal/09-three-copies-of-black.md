# 09 · Three copies of black

2026-10-17

A tidy-up, not a feature. I went through all my plugins looking for
the things I'd copied instead of shared, and this one had a few.

## What I found

Every file that draws had its own copy of the same handful of lines:
the font, pure black, the `safe()` that keeps a `<` in a task name from
blanking a key, and the "is this a real hex color" check. draw.js had
them, then flames.js got its own when I borrowed the fire from my
GitHub Graph, then goal.js got its own when I borrowed the ring. Three
files, three blacks.

The 75% shade on the goal key's ring was its own little sum too, the
same red, green and blue multiply the heat map already does for its
five shades. And `#8a8a90`, the gray for the small words, was typed out
six times across two files.

None of it was wrong. It's just that if I ever changed one, I'd have to
remember the other two, and I wouldn't.

## What I did

draw.js now exports the shared bits: `FONT`, `BLACK`, `GRAY`, `DIM`,
`safe`, `isHex`, `color` and `ramp`. flames.js and goal.js import
them. The goal ring takes its darker shade from the heat map's ramp
(`ramp(color)[3]` is the 75% one), so there's one multiply in the whole
plugin.

```
draw.js      the shared bits, and the timer key, stats key and strip
flames.js    imports them, draws the fire
goal.js      imports them, draws the ring
```

timer.js keeps its own copy of the hex check on purpose. draw.js
imports timer.js for the clock, so timer.js can't import draw.js back
without the two chasing each other in a circle.

## Did it work?

Nothing should look different, and nothing does. All 135 tests pass
without a change to any of them, which is the point: the tests for
"drawn on pure black" and "an & can't break the picture" were already
there in all three files, so they're what caught me if a copy drifted.
The pretend deck drew all six pictures on black, side by side.

## What I learned

- When I borrow a key from another plugin, the first thing I paste is
  its helpers. The second time that happens is when they should move.
- A refactor with no test changes is the good kind.
