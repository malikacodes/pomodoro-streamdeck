// Draws the goal key as SVG text: a ring that fills up, and the confetti
// when it's full. This is the same ring as on my GitHub Graph daily goal
// key. Like draw.js it only draws: no Stream Deck, no files, no clock.

import { BLACK, FONT, ramp, safe } from "./draw.js";

// The confetti colors. Each piece takes the next one, going round the list.
const CONFETTI = ["#ff7eb6", "#ffd33d", "#58a6ff", "#bc8cff", "#ffa657", "#39d353", "#ffffff"];

// Keeps a number between 0 and 1. The celebration is a few things that each
// start and stop at a different moment, and this is what holds each one at
// "not started" before its moment and at "finished" after it.
function clamp(n) {
  return Math.min(1, Math.max(0, n));
}

// Eighteen pieces of confetti thrown out from the middle of the key. Nothing
// here is random. Where a piece goes comes from its number in the line, so
// the same moment always gives the same picture, and a redraw in the middle
// of the celebration can't make the pieces jump around.
function confetti(burst) {
  // The flight is the pieces' whole time in the air, and it's over about
  // 1.9 seconds in. Past that there's nothing to draw. Sending pieces
  // nobody can see would still make the picture a different one from the
  // normal key, and the celebration is meant to end on exactly that.
  const flight = clamp(burst / 0.86);
  if (flight >= 1) return "";

  // The throw is the outward part, and it's much shorter than the flight.
  // Almost all of the distance is covered in the first third of a second
  // and the rest is the pieces coasting to a stop, like a handful of
  // confetti that leaves your hand fast and then drifts. The key only
  // gets about ten pictures a second, so the big early jumps are what
  // make it look like a burst. Small even steps would look like a slide
  // show. Over the last quarter of the flight the pieces fade away.
  const thrown = 1 - (1 - clamp(burst / 0.4)) ** 4;
  const opacity = clamp((1 - flight) / 0.25).toFixed(2);

  let pieces = "";
  for (let i = 0; i < 18; i++) {
    // Turning by 2.4 (about 137 degrees) for each piece is the trick
    // sunflowers use for their seeds. No two pieces end up going the
    // same way, and they never line up into spokes. The ring's outside
    // edge is 58px from the middle and the edge of the key is 72. The
    // slowest pieces stop 64 out, so they clear the ring and hang around
    // in the corners, and the fastest go 112 and fly right off the key.
    const angle = i * 2.4;
    const distance = (64 + 16 * (i % 4)) * thrown;
    const x = 72 + distance * Math.cos(angle);

    // The extra bit on the end is gravity. It's almost nothing until
    // late in the flight and then pulls every piece down.
    const y = 72 + distance * Math.sin(angle) + 34 * flight ** 3;
    const paint = `fill="${CONFETTI[i % CONFETTI.length]}" fill-opacity="${opacity}"`;

    // Every third piece is a round one.
    if (i % 3 === 0) {
      pieces += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" ${paint}/>`;
      continue;
    }

    // The rest are little 14x8 strips that tumble as they fly, half of
    // them one way and half the other. I work out where the four
    // corners land myself, so the strip is a plain shape and doesn't
    // lean on the key knowing how to rotate things.
    const turn = i + flight * (i % 2 ? 7 : -7);
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const corners = [
      [-7, -4],
      [7, -4],
      [7, 4],
      [-7, 4],
    ].map(([across, down]) => `${(x + across * cos - down * sin).toFixed(1)},${(y + across * sin + down * cos).toFixed(1)}`);
    pieces += `<polygon points="${corners.join(" ")}" ${paint}/>`;
  }
  return pieces;
}

// The goal key, 144 by 144 pixels: a ring that fills up as today's focus
// time gets closer to the goal, with the count in the middle and a small
// line under it. fill is how much of the ring is colored, from 0 to 1. met
// is whether today's goal has been reached, and puts a star on the ring.
// burst is only passed during the celebration, and says how far through it
// this picture is (also 0 to 1). The celebration is 2.2 seconds long, so
// 0.1 of it is a bit under a quarter of a second. Each picture is its own
// still, like the pages of a flip book. color is the task's color.
export function drawGoalKey(count, small, smallColor, fill, met, burst, color) {
  count = String(count);
  small = String(small);

  // The color comes from a key's settings and goes straight into the SVG.
  // ramp checks it (anything that isn't a hex color goes to pink) and
  // hands back the heat map's shades of it. The ring fades from the 75%
  // one up to the full color.
  const shades = ramp(color);
  const full = shades[4];
  const darker = shades[3];

  const ring = `fill="none" stroke-width="12"`;
  let content = `<circle cx="72" cy="72" r="52" stroke="#21262d" ${ring}/>`;

  // The filled part fades from the darker shade at the bottom left to the
  // task's full color at the top right. The fade is pinned to the key and
  // not to the arc, so a short arc doesn't get the whole fade squashed
  // into it.
  content +=
    `<linearGradient id="ring" gradientUnits="userSpaceOnUse" x1="20" y1="124" x2="124" y2="20">` +
    `<stop offset="0" stop-color="${darker}"/><stop offset="1" stop-color="${full}"/></linearGradient>`;

  // An arc that ends exactly where it starts draws nothing at all, so a
  // full ring has to be a circle. Anything less is an arc that starts at
  // 12 o'clock and goes clockwise. The "large" flag tells it to take the
  // long way round once it's past halfway.
  if (fill >= 1) {
    content += `<circle cx="72" cy="72" r="52" stroke="url(#ring)" ${ring}/>`;
  } else if (fill > 0) {
    const angle = fill * 2 * Math.PI;
    const x = 72 + 52 * Math.sin(angle);
    const y = 72 - 52 * Math.cos(angle);
    const large = fill > 0.5 ? 1 : 0;
    content += `<path d="M 72 20 A 52 52 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)}" stroke="url(#ring)" stroke-linecap="round" ${ring}/>`;
  }

  // The celebration opens with the ring flashing, like a camera flash
  // going off. It's two rings laid over the normal one: a wide soft one in
  // the task's color for the glow, and a thick white one on top. Both are
  // at full strength from the very first picture, start dimming a tenth of
  // a second in and are gone by about a third of a second, which leaves
  // the normal ring underneath. The glow reaches 67px from the middle, so
  // it stays inside the key.
  const flash = burst === undefined ? 0 : clamp((0.16 - burst) / 0.11);
  if (flash > 0) {
    content +=
      `<circle cx="72" cy="72" r="52" fill="none" stroke="${full}" stroke-width="30" stroke-opacity="${(flash * 0.45).toFixed(2)}"/>` +
      `<circle cx="72" cy="72" r="52" fill="none" stroke="#ffffff" stroke-width="${(12 + flash * 8).toFixed(2)}" stroke-opacity="${flash.toFixed(2)}"/>`;
  }

  // The star that says today's goal is done. It sits on the ring at about
  // half past one on a clock, 28px across, with a thin outline in the
  // key's background color so the yellow doesn't melt into the ring. A
  // star is ten points around a circle that take turns being far out and
  // close in.
  if (met) {
    let points = "";
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5;
      const reach = i % 2 ? 6 : 14;
      points += `${(108.8 + reach * Math.sin(angle)).toFixed(1)},${(35.2 - reach * Math.cos(angle)).toFixed(1)} `;
    }
    content += `<polygon points="${points.trim()}" fill="#ffd33d" stroke="${BLACK}" stroke-width="2.5" stroke-linejoin="round"/>`;
  }

  // During the celebration a checkmark takes the place of the words. It
  // pops in over the first sixth of a second or so, growing a bit too big
  // and then settling, the way a sticker gets pressed on. It holds until
  // 1.3 seconds, takes a quarter of a second to fade out, and the words
  // fade back in right behind it over the next third of a second, so the
  // two are never on top of each other and the ending doesn't drag. The
  // size is worked into the three corners of the tick here, measured from
  // the middle of the key.
  let words = 1;
  if (burst !== undefined) {
    words = clamp((burst - 0.7) / 0.14);

    const pop = clamp(burst / 0.08) - 1;
    const scale = 1 + 3.5 * pop ** 3 + 2.5 * pop ** 2;
    const tick = [
      [-24.5, 1.5],
      [-7.5, 17.5],
      [24.5, -17.5],
    ].map(([across, down]) => `${(72 + across * scale).toFixed(1)} ${(72 + down * scale).toFixed(1)}`);
    const opacity = 1 - clamp((burst - 0.59) / 0.11);
    if (opacity > 0) {
      content += `<path d="M ${tick.join(" L ")}" fill="none" stroke="#ffffff" stroke-width="${(15 * scale).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${opacity.toFixed(2)}"/>`;
    }
  }

  // The inside of the ring is 46px from the middle to its edge, so the
  // digits shrink as the count gets longer to stay clear of it. The small
  // line sits lower down, where the circle is already narrowing, so a
  // longer one shrinks too. 15 is as small as it goes: under that I can't
  // read it on the key.
  const size = count.length <= 2 ? 44 : count.length === 3 ? 34 : 26;
  const smallSize = small.length < 8 ? 18 : 15;
  if (words > 0) {
    const fade = `fill-opacity="${words.toFixed(2)}" text-anchor="middle"`;
    content +=
      `<text x="72" y="76" font-size="${size}" font-weight="700" fill="#ffffff" ${fade}>${safe(count)}</text>` +
      `<text x="72" y="98" font-size="${smallSize}" fill="${smallColor}" ${fade}>${safe(small)}</text>`;
  }

  // The confetti goes on last so it flies over the top of everything.
  if (burst !== undefined) content += confetti(burst);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" font-family="${FONT}">` +
    `<rect width="144" height="144" fill="${BLACK}"/>${content}</svg>`
  );
}
