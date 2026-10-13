// Draws the key and the dial's strip as SVG text. It only draws: no
// Stream Deck, no files, no clock, so the tests can read what it made.

import { clock, PINK } from "./timer.js";
import { level } from "./history.js";

const DIM = "#5c5c62";
const FONT = "-apple-system, Helvetica, sans-serif";

// Pure black, to match the deck. Anything lighter shows up as a gray
// square next to the keys around it.
const BLACK = "#000000";

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
function safe(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function short(name, most) {
  return name.length > most ? name.slice(0, most - 1).trimEnd() + "…" : name;
}

// The colors come from a key's settings and go straight into the SVG, so
// anything that isn't a plain hex color like #f2a7c3 falls back to pink.
function color(value) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value : PINK;
}

// The map's five shades from one color: the empty gray, then the color
// at 30%, 50%, 75% and full strength. "At 30%" means each of its red,
// green and blue numbers is multiplied by 0.3, which is the same as
// mixing it with black. That way any color I pick gets a ramp.
export function ramp(picked) {
  const hex = color(picked);
  const parts = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const at = strength => "#" + parts.map(p => Math.round(p * strength).toString(16).padStart(2, "0")).join("");
  return [EMPTY, at(0.3), at(0.5), at(0.75), at(1)];
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
    `<text x="72" y="38" fill="${face.tone === "break" ? fill : "#8a8a90"}" font-size="20" font-weight="600" text-anchor="middle">${safe(short(face.label, 12))}</text>`,
    `<text x="72" y="88" fill="${fill}" font-size="38" font-weight="600" text-anchor="middle">${clock(face.ms)}</text>`,
  ];

  // The dots: the task's color for a round I've finished, the same
  // color its heat map uses. Gray for the round I'm in, nearly black for
  // the ones to come. They're 16 apart and centered, so eight still fit.
  for (let i = 0; i < face.rounds; i++) {
    const dot = i < face.done ? color(face.color) : i + 1 === face.current ? "#8a8a90" : "#2c2c30";
    parts.push(`<circle cx="${72 - (face.rounds - 1) * 8 + i * 16}" cy="120" r="4" fill="${dot}"/>`);
  }

  parts.push("</svg>");
  return parts.join("");
}

// The strip above the dial, 200 by 100 pixels: the heat map, one square
// a day. Seven rows have to fit in 100px, so the squares are 12px with a
// 2px gap. 14 weeks of those is 194px, which leaves 3px on each side.
export const WEEKS_SHOWN = 14;

// view is { columns, totals, today, color, notice }:
//   columns  weeks of days from lastWeeks in history.js
//   totals   focus minutes per day, a Map of "2026-10-10" to minutes
//   today    today as "2026-10-10". Days after it are drawn as upcoming.
//   color    the color to shade with
//   notice   a word to show for a moment in place of the map, like the
//            name of the task I just turned to
export function drawStrip({ columns, totals, today, color: picked, notice }) {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100" font-family="${FONT}">`,
    `<rect width="200" height="100" fill="${BLACK}"/>`,
  ];

  if (notice) {
    parts.push(`<text x="100" y="57" fill="#ffffff" font-size="20" font-weight="600" text-anchor="middle">${safe(short(notice, 17))}</text>`);
  } else {
    const shades = ramp(picked);
    columns.forEach((week, w) => {
      week.forEach((day, slot) => {
        // Dates written this way sort like words, so > means "later".
        const fill = day > today ? UPCOMING : shades[level(totals.get(day))];
        parts.push(`<rect x="${3 + w * 14}" y="${2 + slot * 14}" width="12" height="12" rx="2" fill="${fill}"/>`);
      });
    });
  }

  parts.push("</svg>");
  return parts.join("");
}
