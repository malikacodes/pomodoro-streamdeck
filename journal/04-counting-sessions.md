# 04 · Counting sessions

2026-10-13

My GitHub Graph has a key with one big number on it: contributions
this year. I wanted the same for focus sessions.

## What's a session, though?

> If I stop a round five minutes in, did I do a session?

The heat map never had to answer that. It counts minutes, and five
minutes is five minutes. A key that says "12 sessions" does have to
answer it, and my answer is no. A session is a round that ran all the
way to the end.

So the timer now marks a round as full when it runs out by itself.
Pressing Done early, or jumping to the break, still saves the minutes.
It just isn't a session.

That left the sessions I'd already saved, which don't say either way.
I didn't want my first week to read as zero, so an old one counts if
it's 25 minutes or longer. Anything shorter was me testing.

## The key

![The Sessions key for all tasks and for single tasks](assets/04-counting-sessions/key.png)

The task on top, the number, and along the bottom which stretch of
time it's for, with a dot in the task's color.

The GitHub key only shows this year. Here a press steps through four:
today, this week, this year, all time. "This week" starts on Sunday,
the same as a column of the heat map, so the two can't disagree about
what week it is.

The first version also had the focus time along the bottom ("9h"). I
took it out. Three facts on one small key was one too many, and the
heat map already does time.

## What I learned

- A number on a key needs a definition behind it. "Sessions" sounded
  obvious until I had to count them.
- When old data can't answer a new question, pick a fair guess, write
  it down, and move on.

## What's next

- A daily goal key and a streak key, which both lean on this same
  definition of a session.
