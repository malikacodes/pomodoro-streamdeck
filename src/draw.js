// Draws the key and the dial's strip as SVG text. It only draws: no
// Stream Deck, no files, no clock, so the tests can read what it made.
//
// The bits every picture shares live here too (the font, the blacks and
// grays, the hex check and the shades), and flames.js and goal.js
// import them. One copy of black to keep pure, instead of three.

import { clock, PINK } from "./timer.js";
import { level } from "./history.js";

export const FONT = "-apple-system, Helvetica, sans-serif";

// Pure black, to match the deck. Anything lighter shows up as a gray
// square next to the keys around it.
export const BLACK = "#000000";

// The two grays. GRAY is for words that aren't the point: the task's
// name above the time, the small line under a count. DIM is for a time
// that isn't counting and a streak number with no fire under it.
export const GRAY = "#8a8a90";
export const DIM = "#5c5c62";

// A square for a day with no focus time. It's the same color as an empty
// day on my GitHub Graph dial, so the two maps match when they sit side
// by side. It has to show against the black, and still be darker than
// the faintest colored square.
const EMPTY = "#21262d";

// The rest of this week: days that haven't happened yet. One shade darker
// than an empty day, also from my GitHub Graph dial, so I can tell "not
// yet" from "nothing that day".
const UPCOMING = "#1a1e24";

// Task names are whatever I typed, and a < or an & would break the SVG.
export function safe(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function short(name, most) {
  return name.length > most ? name.slice(0, most - 1).trimEnd() + "…" : name;
}

// A plain hex color like #f2a7c3, and nothing else. Colors come from a
// key's settings and go straight into the SVG, so this is the gate.
// timer.js has the same check written out, because this file imports
// timer.js and the two can't import each other.
export function isHex(value) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "");
}

// The color to draw with: what I picked, or pink for anything that
// isn't a hex color.
function color(value) {
  return isHex(value) ? value : PINK;
}

// A color at some fraction of its strength: each of its red, green and
// blue numbers is multiplied by it, which is the same as mixing the
// color with black. 1 is the color itself.
function shade(hex, strength) {
  return "#" + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * strength).toString(16).padStart(2, "0")).join("");
}

// The map's five shades from one color: the empty gray, then the color
// at 30%, 50%, 75% and full strength. That way any color I pick gets a
// ramp. The goal key's ring borrows the 75% one. The full one goes
// through shade too, so a color typed in capitals comes out lowercase
// like the rest and two pictures of the same color are the same text.
export function ramp(picked) {
  const hex = color(picked);
  return [EMPTY, shade(hex, 0.3), shade(hex, 0.5), shade(hex, 0.75), shade(hex, 1)];
}

// The key, 144 by 144 pixels: a small word on top, the time in the
// middle, and one dot per round along the bottom. face comes from
// Timer.face in timer.js.
export function drawKey(face) {
  // White while it's counting, gray when it isn't, and the task's own
  // color on a break so I can tell a break from focus at a glance.
  const fill = { running: "#ffffff", break: color(face.color), paused: DIM, idle: DIM }[face.tone];

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" font-family="${FONT}">`,
    `<rect width="144" height="144" fill="${BLACK}"/>`,
    `<text x="72" y="38" fill="${face.tone === "break" ? fill : GRAY}" font-size="20" font-weight="600" text-anchor="middle">${safe(short(face.label, 12))}</text>`,
    `<text x="72" y="88" fill="${fill}" font-size="38" font-weight="600" text-anchor="middle">${clock(face.ms)}</text>`,
  ];

  // The dots: the task's color for a round I've finished, the same
  // color its heat map uses. Gray for the round I'm in, nearly black for
  // the ones to come. They're 16 apart and centered, so eight still fit.
  for (let i = 0; i < face.rounds; i++) {
    const dot = i < face.done ? color(face.color) : i + 1 === face.current ? GRAY : "#2c2c30";
    parts.push(`<circle cx="${72 - (face.rounds - 1) * 8 + i * 16}" cy="120" r="4" fill="${dot}"/>`);
  }

  parts.push("</svg>");
  return parts.join("");
}

// The stats key: the task on top, how many sessions in the middle, and
// along the bottom which stretch of time that's for, with a dot in the
// task's color. It's laid out like the Timer key so the two sit well
// together.
export function drawStatsKey({ label, sessions, period, color: picked }) {
  const total = String(sessions);
  // A longer number needs smaller digits to stay inside the key.
  const size = total.length <= 2 ? 56 : total.length === 3 ? 46 : 36;

  // The dot is a character inside the same line of text as the words,
  // with its own color. That way the two are one piece, and centering
  // the piece centers both without me guessing how wide the letters are.
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" font-family="${FONT}">`,
    `<rect width="144" height="144" fill="${BLACK}"/>`,
    `<text x="72" y="38" fill="${GRAY}" font-size="20" font-weight="600" text-anchor="middle">${safe(short(label, 12))}</text>`,
    `<text x="72" y="${74 + size / 3}" fill="#ffffff" font-size="${size}" font-weight="600" text-anchor="middle">${total}</text>`,
    `<text x="72" y="126" fill="${GRAY}" font-size="18" font-weight="600" text-anchor="middle"><tspan fill="${color(picked)}">●</tspan> ${safe(period)}</text>`,
    "</svg>",
  ].join("");
}

// A key that opens one of my Pomodoro pages: a small stopwatch in pink
// and a word under it, like "Pomodoro" or "Back".
export function drawOpenKey(label) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" font-family="${FONT}">`,
    `<rect width="144" height="144" fill="${BLACK}"/>`,
    `<circle cx="72" cy="60" r="22" fill="none" stroke="${PINK}" stroke-width="5"/>`,
    `<path d="M72 60V46M64 30h16" fill="none" stroke="${PINK}" stroke-width="5" stroke-linecap="round"/>`,
    `<text x="72" y="118" fill="#ffffff" font-size="20" font-weight="600" text-anchor="middle">${safe(short(label, 12))}</text>`,
    "</svg>",
  ].join("");
}

// The strip above the dial, 200 by 100 pixels: the heat map, one square
// a day. Seven rows have to fit in 100px, so the squares are 12px with a
// 2px gap. 14 weeks of those is 194px, which leaves 3px on each side.
export const WEEKS_SHOWN = 14;

// The same map stretched across all four dials. The whole strip is 800
// pixels, and 57 weeks of 12px squares with a 2px gap is 796, which
// leaves 2px at each end. That's a year and a month.
export const WEEKS_WIDE = 57;

// view is { columns, totals, today, color, notice }:
//   columns  weeks of days from lastWeeks in history.js
//   totals   focus minutes per day, a Map of "2026-10-10" to minutes
//   today    today as "2026-10-10". Days after it are drawn as upcoming.
//   color    the color to shade with
//   notice   a word to show for a moment in place of the map, like the
//            name of the task I just turned to
//   slot     only for the map across four dials: which dial this is,
//            0 on the left to 3 on the right
//
// Across four dials, every dial draws the same 800px picture and then
// looks at it through its own 200px window. viewBox is that window:
// dial 0 shows pixels 0 to 200, dial 1 shows 200 to 400, and so on. Put
// side by side they make one picture.
export function drawStrip({ columns, totals, today, color: picked, notice, slot }) {
  const wide = slot !== undefined;
  const width = wide ? 800 : 200;
  const left = wide ? 2 : 3;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="${wide ? slot * 200 : 0} 0 200 100" font-family="${FONT}">`,
    `<rect width="${width}" height="100" fill="${BLACK}"/>`,
  ];

  if (notice) {
    // On the wide map the word sits in the middle of the whole strip,
    // bigger, and each dial shows its slice of it.
    parts.push(`<text x="${width / 2}" y="${wide ? 62 : 57}" fill="#ffffff" font-size="${wide ? 34 : 20}" font-weight="600" text-anchor="middle">${safe(short(notice, wide ? 30 : 17))}</text>`);
  } else {
    const shades = ramp(picked);
    columns.forEach((week, w) => {
      week.forEach((day, row) => {
        // Dates written this way sort like words, so > means "later".
        const fill = day > today ? UPCOMING : shades[level(totals.get(day))];
        parts.push(`<rect x="${left + w * 14}" y="${2 + row * 14}" width="12" height="12" rx="2" fill="${fill}"/>`);
      });
    });
  }

  parts.push("</svg>");
  return parts.join("");
}
