# 08 · A page for one task

2026-10-13

I wanted to tap a task's heat map on my Stream Deck + and land on a
page that's all about that task: its timer, its sessions, its goal, its
streak, and its whole year across the dials.

## "A plugin can't do that"

I was sure of it. A plugin can't open my folders or my pages, so a tap
on the strip had nowhere to go.

Then I read my own notes. Earlier the same day, on my Mac Vitals
plugin, I'd written down two things that say otherwise:

- A plugin can switch a deck to a page **it ships with**. Just not to
  one I made by hand.
- It works while the plugin is only linked from the repo. The first
  switch installs the page, and Stream Deck asks first.

So the answer was never "it can't". It was "the page has to belong to
the plugin". I'd already learned this once and still argued the other
side. Future me has the memory of a goldfish, and so does same-day me.

## One page, not one per task

> Do I need a folder for every task?

A page is a file with every key already set. If each task had its own,
adding a task would mean building another page.

So there's one task page, and every key and dial on it is set to "the
task I tapped". Tapping a heat map writes down which task that was,
then opens the page. The keys read the note.

```
tap 593's map → note: "593" → open the task page → every key shows 593
```

On the page, turning any dial moves the note to the next task, and the
name goes across the whole strip so I can see where I've landed.
Tapping the strip goes back. Tap in, tap out.

![The task page: four keys, the streak, and the map across the dials](assets/08-a-page-for-one-task/task-page.png)

## The map across four dials

Each dial owns 200 pixels of the strip, and a plugin can't draw across
all 800 in one go. The trick is the one from my GitHub Graph: every
dial draws the same 800 pixel picture and looks at it through its own
200 pixel window. Side by side, the four windows are one picture.

57 weeks of squares is 796 pixels, so the task page shows a year and a
month.

## Home, but the other one

My two decks work as a pair, so the Home key on each one sends the
*other* deck home. A plugin can't do that part, because my Home
profile isn't the plugin's. Stream Deck's own Switch Profile key can,
and it can point at a different deck from the one it's sitting on.

That key needs the other deck's id, and the id has the deck's serial
number in it. So the pages aren't in the repo. A script builds them
from what's on this Mac: my task list, and wherever my Home profiles
are.

```bash
npm run profiles   # writes the three pages into the plugin folder
```

## Did it work?

Against a pretend Stream Deck, with a dial set to 593:

```
tap the dial            switchToProfile "profiles/pomodoro-task-plus", note: 593
(on the task page)
turn one click          note: 594, every key follows
tap the strip           switchToProfile "profiles/pomodoro-plus"
press Back              switchToProfile "profiles/pomodoro-plus"
```

## What I learned

- Check my own notes before saying something can't be done. I had the
  answer written down from earlier that day.
- "It can't open my page" and "it can't open a page" are different
  sentences.
- One page that follows a setting beats a page per thing.

## What's next

- A heat map made of keys, so the XL can show a graph too. It has no
  dials.
- Somewhere for a fourth task.
