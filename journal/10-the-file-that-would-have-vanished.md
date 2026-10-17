# 10 · The file that would have vanished

2026-10-17

The second cleanup, and the one that could have cost me real data.

## The bug I hadn't hit yet

`load()` read sessions.json inside a try, and the catch said: no
history yet, or a broken file, start fresh. Fine for the first run.
Fine for a mangled file, sort of. But "anything at all went wrong"
also covers a permissions error and a disk that's having a moment. In
those cases the file is fine, the plugin just couldn't read it right
then. It would start with an empty history, and the next focus session
I finished would write that empty history over the full one.

A year of focus time, gone because the Mac hiccuped once. I never saw
it happen. I'd rather not.

## Set it aside, don't sit on it

Two ways to fix it. Refuse to write until the file reads again, or move
the bad file out of the way and write a fresh one next to it.

Refusing sounded safer until I thought about the mangled-file case:
the plugin would be stuck forever, with no way to recover on its own,
until I noticed and fixed the file by hand. So: set aside. Anything
other than "there is no file" gets a line in the log and the file is
renamed to sessions.json.bad. The next save writes a new
sessions.json next to it. Nothing is deleted, and the .bad copy is
there to dig out.

```
sessions.json       can't read it, or it's not my shape
  → warn in the log
  → rename to sessions.json.bad
  → start fresh; the next save makes a new sessions.json
```

If the rename fails, or there's already a .bad sitting there from an
earlier time that I haven't looked at, the file stays where it is and
the plugin doesn't save sessions.json at all until I've sorted it. The
log says so. Losing today's sessions is the smaller loss: the file on
disk is the one I'd want back. The running timer has its own file and
keeps saving.

## And one small one

`addTask` fired off its save and forgot about it. `setColor` and `tap`
hand their save back, so a caller can wait for it. Now `addTask` does
too: it's async and answers true or false once its save has been tried.
The two places in index.js that call it await it.

## Did it work?

The new test writes a real history file, takes away its read
permission, and loads. A warning with EACCES in it, and one saying where the file went. Then it
saves a session and checks the old file is sitting there as .bad with
every byte intact and the new one has only the new session. A second
new test fires four saves in a row without waiting, checks the first is
on disk the moment its promise settles, and that all four landed in
order with no `.tmp` left behind. A third puts a .bad in place first and
checks a second bad file can't replace it. 140 tests green.

## What I learned

- A catch that swallows everything isn't "safe". It's a decision I
  made without looking, and the quiet ones are the expensive ones.
- "Can't read it" and "it's broken" deserve different answers, but
  "keep the file" is the right answer to both.
