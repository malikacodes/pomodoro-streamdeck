# 07 · The timer I forgot about

2026-10-13

Two small fixes about time, both for things I'd only notice the
morning after.

## A session at 9am that I didn't do

> What happens if my Mac goes to sleep in the middle of a round?

The timer remembers the clock time a round ends, which is why a
restart doesn't lose it. But that had a side effect. Start 45 minutes
at 11pm, close the lid, open it at 9am: the first tick sees a round
that ended ten hours ago and saves it. Under today. So this morning
gets a full session, a streak day and maybe confetti, for work I did
last night.

It never mattered while the plugin only had a heat map, and I'd
probably have missed it there too. A goal key throwing confetti at
breakfast would have been harder to miss.

Now the timer hands back when the round really ended, and the session
is filed under that. Last night's round is last night's.

## A pause that lasts forever

Only one task runs at a time. That's on purpose, but it means a timer I
paused and walked away from holds every other key hostage until I find
it and hold it down.

So a timer that sits paused for an hour ends itself. It ends the way
Done would have at the moment I walked away: the focus minutes up to
the pause are saved, dated at the pause, and it doesn't count as a full
session.

"Paused" includes one case that doesn't look like a pause. With auto
start off, the next round loads and waits for a tap. If the tap never
comes, that's a forgotten timer too, and its hour starts when the last
round ended.

A timer that's counting never ends itself, however long the round is.

## Did it work?

I gave the plugin a saved timer that had been paused for two hours, 20
minutes into a round, and started it:

```
state.json     null
sessions.json  [{"task":"593","date":"2026-10-13","minutes":20,"full":false}]
```

Gone on the first tick, with the 20 minutes kept and no sound.

## What I learned

- "When did this happen" and "when did I find out" are two different
  times. Most days they're a second apart. The day they aren't is the
  day the data goes wrong.
- A rule like "one at a time" needs a way out for the case where I
  forget.

## What's next

- With auto start on, rounds keep going and keep counting if I walk
  away. Nothing stops that yet, and I haven't decided what should.
