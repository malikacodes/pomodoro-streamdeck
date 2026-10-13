import { test } from "node:test";
import assert from "node:assert/strict";
import { TIERS, SWAY_MS, drawStreakKey, flame } from "../src/flames.js";

const key = (tier, burst, sway, count = "12") => drawStreakKey(count, "", "#8a8a90", tier, burst, sway);

// How tall a fire is drawn, read back out of its picture: the distance
// from the lowest point of its first path to the highest. A path is all
// x y pairs, so every second number is a y.
function height(picture) {
  const ys = picture.match(/<path d="([^"]+)"/)[1].match(/-?\d+(\.\d+)?/g).map(Number).filter((_, i) => i % 2 === 1);
  return Math.max(...ys) - Math.min(...ys);
}

// The deck is pure black, so a lighter background shows as a gray square.
test("the streak key is drawn on pure black", () => {
  for (const tier of [0, 1, 5, 8]) {
    assert.ok(key(tier).startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" font-family="-apple-system, Helvetica, sans-serif"><rect width="144" height="144" fill="#000000"/>'));
  }
  assert.doesNotMatch(key(8, 0, 0.3), /^data:/);
});

// With no streak there's nothing to burn: a coal, a gray number, and no
// flame even if a burst or a sway is asked for.
test("no streak draws the cold coal, a dim number and no fire", () => {
  const cold = key(0);
  assert.equal(cold.match(/<ellipse/g).length, 2);
  assert.doesNotMatch(cold, /<path|<circle|Gradient/);
  assert.match(cold, /<text x="72" y="112" fill="#5c5c62"/);
  assert.equal(key(0, 0.2, 0.4), cold);
});

// The number has to be readable over the fire: white when it's lit.
test("the number is white once a fire is lit", () => {
  for (let tier = 1; tier <= 8; tier++) assert.match(key(tier), /<text x="72" y="112" fill="#ffffff"/);
});

// The whole point of the tiers: a longer streak gets a visibly bigger
// fire. From Flicker up each one is taller than the last.
test("each tier's fire is taller than the one before", () => {
  const heights = [2, 3, 4, 5, 6, 7, 8].map(tier => height(flame(tier)));
  for (let i = 1; i < heights.length; i++) assert.ok(heights[i] > heights[i - 1], `tier ${i + 2} isn't taller than tier ${i + 1}`);
  assert.deepEqual(heights, [30, 52, 64, 76, 84, 94, 102]);
});

// The other things that grow: the ember has no tongue at all, the small
// fires have one, the big three have three and their hanging sparks.
test("bigger tiers get more tongues, an inner fire and hanging sparks", () => {
  const tongues = tier => (flame(tier).match(/<path d="([^"]+)"/)?.[1].match(/M /g) ?? []).length;
  assert.deepEqual([1, 2, 5, 6, 8].map(tongues), [0, 1, 1, 3, 3]);

  assert.doesNotMatch(flame(4), /id="inner"/);
  assert.match(flame(5), /id="inner"/);

  const sparks = tier => (flame(tier).match(/<circle[^>]*r="[34]" fill/g) ?? []).length;
  assert.deepEqual([5, 6, 7, 8].map(sparks), [0, 2, 3, 4]);
});

// The tiers have to keep climbing, or a longer streak could pick a
// smaller fire.
test("the tiers start at 1 day and each starts later than the last", () => {
  assert.equal(TIERS.length, 8);
  assert.equal(TIERS[0].from, 1);
  for (let i = 1; i < TIERS.length; i++) assert.ok(TIERS[i].from > TIERS[i - 1].from);
  assert.ok(SWAY_MS > 0);
});

// The key only redraws when the text changes, so the same moment has to
// give the exact same text every time. Nothing in here may be random.
test("the same inputs always give the exact same picture", () => {
  for (let tier = 0; tier <= 8; tier++) {
    assert.equal(key(tier), key(tier));
    assert.equal(key(tier, 0.25, 0.6), key(tier, 0.25, 0.6));
  }
});

// A burst has to look like something happened: the fire flares up taller
// and throws twelve sparks.
test("a burst flares the fire up and throws sparks", () => {
  for (const tier of [1, 3, 7]) {
    const still = flame(tier);
    const burst = flame(tier, 0);
    assert.notEqual(burst, still);
    assert.equal(burst.match(/fill-opacity="1"\/>/g).length - (tier === 1 ? 0 : 1), 12);
    assert.doesNotMatch(still, /fill-opacity/);
  }
  assert.ok(height(flame(3, 0)) > height(flame(3)));
  assert.match(flame(3, 0), /fill="#fffbe6"/);
});

// By the end of a burst the sparks are gone and the fire is back to its
// usual self, so nothing snaps when the burst hands over to the sway.
test("a burst ends on the same fire as the sway", () => {
  for (const tier of [1, 4, 8]) {
    assert.equal(flame(tier, 1, 0.4), flame(tier, undefined, 0.4));
    assert.doesNotMatch(flame(tier, 0.9, 0.4), /<circle[^>]*fill-opacity/);
  }
});

// The sway is a loop. If the end didn't match the start the fire would
// jump every 3.2 seconds. And it has to actually move in between.
test("the sway closes its loop and moves in between", () => {
  for (let tier = 1; tier <= 8; tier++) {
    assert.equal(key(tier, undefined, 1), key(tier, undefined, 0), `tier ${tier} jumps where the loop wraps`);
    assert.notEqual(key(tier, undefined, 0.3), key(tier, undefined, 0), `tier ${tier} doesn't move`);
  }
});

// A stray & or < in the number or the bottom line is the kind of thing
// that blanks a key.
test("odd characters in the number or the small line can't break the picture", () => {
  const picture = drawStreakKey("<3&", "a & b > c", "#8a8a90", 3);
  assert.equal(picture.match(/>&lt;3&amp;<\/text>/g).length, 17);
  assert.match(picture, />a &amp; b &gt; c<\/text>/);
  assert.doesNotMatch(picture, /<3|& /);
});

// The sticker edge: sixteen black copies of the number under the real
// one, which comes last so it's on top.
test("the number has its black edge stamped behind it", () => {
  const picture = key(6);
  const stamps = [...picture.matchAll(/<text x="([\d.]+)" y="([\d.]+)" fill="(#[0-9a-f]{6})" font-size="48"/g)];
  assert.equal(stamps.length, 17);
  assert.ok(stamps.slice(0, 16).every(m => m[3] === "#000000"));
  assert.deepEqual(stamps[16].slice(1), ["72", "112", "#ffffff"]);
  assert.equal(new Set(stamps.map(m => `${m[1]},${m[2]}`)).size, 17);
});

// A long streak still has to fit across the key, and nothing on a key
// this size is readable under 15px.
test("more digits get a smaller number, and no text goes under 15px", () => {
  const size = count => Number(drawStreakKey(count, "", "#8a8a90", 3).match(/y="112"[^>]*font-size="(\d+)"/)[1]);
  assert.deepEqual(["7", "42", "365", "1000"].map(size), [48, 48, 42, 34]);

  const sizes = [...drawStreakKey("1000", "updating", "#8a8a90", 8, 0.1, 0.5).matchAll(/font-size="(\d+)"/g)].map(m => Number(m[1]));
  assert.ok(Math.min(...sizes) >= 15);
});

// A tag left open blanks the whole key. This walks the picture like a
// stack of plates: every opening tag goes on, and each closing tag has
// to match the one on top.
test("every tag that opens also closes", () => {
  for (let tier = 0; tier <= 8; tier++) {
    for (const [burst, sway] of [[undefined, undefined], [0, 0], [0.4, 0.7], [undefined, 0.25]]) {
      const picture = drawStreakKey("12", "a < b", "#8a8a90", tier, burst, sway);
      const open = [];
      for (const [, closing, name, selfClosing] of picture.matchAll(/<(\/?)([A-Za-z]+)[^<>]*?(\/?)>/g)) {
        if (selfClosing) continue;
        if (closing) assert.equal(open.pop(), name, `tier ${tier}: </${name}> closes the wrong tag`);
        else open.push(name);
      }
      assert.deepEqual(open, [], `tier ${tier} leaves a tag open`);
      assert.doesNotMatch(picture, /NaN|undefined|Infinity/);
    }
  }
});
