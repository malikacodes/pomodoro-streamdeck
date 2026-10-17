# 12 · The key that knew too much

2026-10-17

index.js is the one file that talks to Stream Deck, and the rule for
this plugin is that it only talks. The thinking lives in the other
files, where the tests can get at it. Somewhere along the way three
bits of thinking had crept into the key classes, and the tests couldn't
see them.

## The three strays

- The goal key turned its setting into a whole number from 1 to 12.
- The streak key decided what "daily", "weekdays" and "weekly" mean
  when the setting is junk, and how many grace days a junk value gets.
- The heat map dial worked out where a turn lands on the task list,
  going round at both ends.

All three are settings coming in as text and turning into something
the plugin can use. None of them had a test, because they were methods
on a class that only exists once the SDK is loaded.

## One at a time

Each one moved on its own, tests first. Write the tests against the
file it's moving to, watch them fail because the export isn't there,
move the function, watch them pass. Four small commits instead of one
big one, so if one of them is wrong the other three aren't under
suspicion.

```
goalOf(settings)        → goal.js      4 by default, 0 is "nothing picked", 12 at most
modeOf(settings)        → streak.js    daily unless it says weekdays or weekly
graceOf(settings)       → streak.js    0 is a real choice, junk is 1, 3 at most
step(list, current, n)  → history.js   wraps at both ends, a gone task is the top
```

The one that surprised me was `step` with an unknown task. A task
that's left the list has no place on it, so it counts as the top, and
one click from there lands on the second row. That was already how it
worked. Now there's a line saying so.

## The fifth copy

Every key and dial checked "is this picture the one I already sent?"
before sending, in its own words. Five copies, two of them slightly
different because they had to save settings in between. Now there's
one `send(target, lastImages, svg)` at the top of the file. A dial
takes its picture through `setFeedback` and a key through `setImage`,
and `send` asks the SDK which one it has.

I thought about a base class for the five, since they all keep the
same two maps. It would have saved about twelve lines and cost a layer
I'd have to read through every time. The goal key only takes two
fields from its settings page, which the base class would have had to
know about. One plain function is the right size.

## Did it work?

144 tests, four of them new on this one. The pretend deck, with a
copy of my real history and one click of the dial: every key drew on
black, and the dial showed the map, the name, then the map. The goal
key still saves its "celebrated" date before it sends the picture,
which is the order that matters if the plugin restarts between the
two.

## What I learned

- "No tests possible" was only true while the thinking sat inside the
  class. Move the thinking and the test writes itself.
- One slice per commit is slower to type and faster to trust.
