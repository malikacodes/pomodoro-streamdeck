# 14 · A color nobody read

2026-10-17

The last of the small ones. The running timer carried a `color`, and
so did the face the timer hands the key to draw. Neither was ever
read.

## How it got there

The first version of this plugin kept the color on the key: you typed
a task name and picked a color, and both lived in that key's settings.
So the timer copied the color into its run, and `face()` passed it
along for the dots and the break time.

Then the task list arrived (journal 03) and the color moved to the
task. index.js started looking it up from the list and writing it over
`face.color` just before drawing. From that day the timer's copy was
overwritten every time, and the one on the run was never looked at by
anyone. It was still being saved to state.json once a second, a stale
copy of a color that lives somewhere else.

## What went

- `run.color`: gone from the timer, so gone from state.json.
- `face.color` from `face()`: gone. index.js still sets `face.color`
  from the task list before `drawKey`, which is where it was coming
  from anyway.

`plan().color` stays. It's what a key from before the list existed
gets added with: the color that was typed into the key, carried over
once. That's a real job.

## Did it work?

Two tests already pinned the face's shape, and I took the color out of
their expected objects first so they'd fail, then made them pass. A
new one checks the run has no color and its plan still does.

Then the part that matters with a saved file: I gave the plugin a
state.json from the old shape, color field and all, ten minutes into a
focus round, with the key set to that task. `restore()` only checks
the fields it needs, so the extra one is carried along and ignored.
The key came up at 09:59 and counting, a press paused it, and the save
wrote the run back as it was, stale color included. That old field
lives on until that run ends. The next timer I start is saved without
it. A test pins the restore path, so the old shape keeps working.

## What I learned

- A field that's set, saved and never read is the easiest kind of dead
  code to miss, because it never breaks anything. It just costs a few
  bytes a second, forever.
- When a thing moves house, go back and check who still has its old
  address.
