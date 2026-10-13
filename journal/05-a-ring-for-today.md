# 05 · A ring for today

2026-10-13

The second key from my GitHub Graph to move over: the daily goal. A
ring that fills up as I finish sessions, and confetti when I hit the
number.

![The Daily Goal key part way, celebrating, and met](assets/05-a-ring-for-today/key.png)

One of four, the celebration, and a goal of one that's been met.

## What came over as it was

The ring, the star, the checkmark that pops in like a sticker, and the
confetti are the same drawing as on the GitHub key. So is the rule
that nothing in it is random: where a piece of confetti is comes from
its number in the line and how long the celebration has been going.
The same moment always gives the same picture.

The metronome came over too. Stream Deck takes about ten pictures a
second, and that's for the whole plugin, not per key. So every key
that moves shares one clock that ticks ten times a second, and each
tick is one key's turn.

## What changed

- **It counts sessions, not contributions.** A session is a round that
  ran to the end, the same definition as the Sessions key.
- **The ring isn't green.** It's the task's color, fading from a
  slightly darker shade of it, and pink when the key is set to all
  tasks.
- **There's nothing to refresh.** The GitHub key's press goes and asks
  GitHub. This one already knows, so a press only replays the confetti,
  and only if today's goal is met.

## The pink ring that wasn't

When I lined up a few pictures on one page to look at them, every ring
came out pink, even the one for a blue task. For a minute I thought
the color wasn't getting through.

It was. Each picture has a color fade inside it named "ring", and with
several pictures on one page, they all used the first one's fade. On the
deck each key gets its own picture, so there's nothing to share. One
picture looked at by itself was blue.

## Did it work?

Run against a pretend Stream Deck with a goal of 1 and one session
already saved today:

```
setSettings [goal] {"task":"593","goal":1,"celebrated":"2026-10-13"}
setImage    [goal]   21 pictures over 2.2 seconds
```

The date is saved before the first picture goes out, so switching
pages halfway through can't make it celebrate twice.

## What I learned

- Names inside an SVG are shared by everything on the same page. Two
  pictures side by side can borrow each other's colors.
- When something looks wrong in a test page, check one thing alone
  before fixing code that isn't broken.

## What's next

- The streak key, with the fire.
