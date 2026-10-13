# 06 · A fire that grows

2026-10-13

The last of the three keys from my GitHub Graph: the streak. Days in a
row with focus time, and a fire that gets bigger the longer it goes.

![The Streak key from a cold coal to a bonfire, and a flare](assets/06-a-fire-that-grows/key.png)

0, 3, 7, 40 and 120 days, and a 40 day fire flaring.

## When does a day count?

On GitHub a day counts if it has one contribution. Here I had two
candidates: a day with any focus time, or a day where I hit my goal.

I went with any focus time. The daily goal key already tells me if I
did enough. The streak is about showing up, and a 20 minute day when
I'm tired should keep the fire going. That's the whole point of it.

## The rules that came with it

The streak math is the same as on the GitHub key, and so are its
tests. All 21 came over, with contributions swapped for minutes:

- **Today can't break a streak.** It isn't over yet. It just doesn't
  count until there's something on it.
- **Grace days.** A streak survives this many missed days in a row.
  The missed days never add to the number.
- **Weekdays only.** Saturdays and Sundays don't exist. They can't
  break a streak and they can't add to one.
- **Weekly.** A week with any focus time counts, and the number is in
  weeks.

Days are turned into a plain count of days since 1970 before any of
that, so "the next day" is always just plus one. No months, no leap
years, no clocks changing.

## The fire

Eight sizes, changing at 1, 3, 7, 14, 30, 60, 120 and 365 days. A
weekly streak counts each week as 7, so four weeks gets the same fire
as 28 days.

It moves in two ways. A lit fire sways a little all the time, at about
three pictures a second, so the key never looks frozen. And when the
number changes, or I press the key, it flares up and throws sparks for
two seconds. The sway reads its position straight off the clock, like
looking at a second hand, so it never needs a "start".

The one thing I added: the small line under the number says which task
the streak is for. On GitHub that line is for error messages, and this
plugin has nothing to fetch and so nothing to fail at.

## Fourteen pictures a second

Going back over all three keys at the end, I counted pictures and came
out over the limit.

The metronome hands out ten turns a second. But the plugin also
redraws every key once a second, for the timer. Most keys shrug that
off, because a picture that's the same as the last one isn't sent. A
swaying fire is never the same as the last one. So every lit streak
key was getting one extra picture a second, and so was a goal key
mid-confetti. A round ending with the goal met and two streak keys on
the page came to about fourteen a second.

Now the once-a-second redraw skips any key that's already moving. Its
next turn from the metronome works everything out fresh anyway, new
sessions included.

## Did it work?

Against a pretend Stream Deck:

```
no history            a cold coal and a gray 0
40 days in a row      the flare for 2 seconds, then the sway
```

With a goal key celebrating next to it, the two took turns: 19
pictures for the fire and 11 for the confetti over five seconds.

## What I learned

- Tests are the easiest part of a project to carry over, and the most
  worth carrying. The 21 streak tests told me the copy was right
  before I'd drawn a single flame.
- Three keys in one day was only possible because all three already
  existed next door. Building a thing the second time is fast.

## What's next

- Live with all three for a week.
- The fire tiers are GitHub's. A focus streak might want its own.
