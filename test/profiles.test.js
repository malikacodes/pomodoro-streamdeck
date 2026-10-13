import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEVICES, layouts, profileFiles } from "../scripts/profiles.mjs";

const manifest = JSON.parse(readFileSync(new URL("../com.malikacodes.pomodoro.sdPlugin/manifest.json", import.meta.url), "utf8"));
const homes = { xl: { device: "xl-deck", profile: "xl-home" }, plus: { device: "plus-deck", profile: "plus-home" } };
const made = layouts({ tasks: ["593", "594", "Cleaning", "A fourth one"], homes });

// A key placed off the edge of the deck, or two keys on one spot, makes
// a profile that imports with a key quietly missing.
test("every key and dial is on the deck and no spot is used twice", () => {
  for (const [name, profile] of Object.entries(made)) {
    const { columns, rows, dials } = DEVICES[profile.device];
    const spots = new Set();
    for (const [column, row] of profile.keys) {
      assert.ok(column >= 0 && column < columns && row >= 0 && row < rows, `${name} has a key at ${column},${row}`);
      assert.ok(!spots.has(`${column},${row}`), `${name} uses ${column},${row} twice`);
      spots.add(`${column},${row}`);
    }
    const turned = profile.dials.map(([column]) => column);
    assert.ok(turned.every(column => column >= 0 && column < dials), `${name} has a dial the deck doesn't`);
    assert.equal(new Set(turned).size, turned.length, `${name} uses a dial twice`);
  }
});

// A layout that names an action the plugin doesn't have can't be built,
// and I'd rather find that out here than when I run the script.
test("every layout builds, with actions the plugin really has", () => {
  for (const [name, profile] of Object.entries(made)) {
    const files = profileFiles(name, profile, manifest);
    assert.equal(Object.keys(files).length, 3, name);
  }
});

// The manifest tells Stream Deck which deck each profile is for. If it
// disagrees with the layout, the XL page lands on the + or nowhere, and
// a page that isn't listed can't be opened by a tap at all.
test("the manifest lists each profile for the right deck", () => {
  assert.equal(manifest.Profiles.length, Object.keys(made).length);
  for (const [name, profile] of Object.entries(made)) {
    const listed = manifest.Profiles.find(p => p.Name === `profiles/${name}`);
    assert.ok(listed, `${name} isn't in the manifest`);
    assert.equal(listed.DeviceType, DEVICES[profile.device].type);
  }
});

// The Home key is crossed over: on the + it sends the XL home, and on
// the XL it sends the + home. Getting this backwards would send the
// deck I'm pressing home and leave the other one where it was.
test("each deck's Home key points at the other deck", () => {
  const homeOn = name => made[name].keys.find(key => key[2] === "home")[3];
  assert.deepEqual(homeOn("pomodoro-plus"), { DeviceUUID: "xl-deck", PageIndex: 1, ProfileUUID: "xl-home" });
  assert.deepEqual(homeOn("pomodoro-xl"), { DeviceUUID: "plus-deck", PageIndex: 1, ProfileUUID: "plus-home" });
});

// On a Mac where a Home profile can't be found, the key is left out
// and the rest of the page still builds.
test("a deck whose partner has no Home profile gets no Home key", () => {
  const alone = layouts({ tasks: ["593"], homes: {} });
  for (const profile of Object.values(alone)) assert.ok(!profile.keys.some(key => key[2] === "home"));
});

// The task page has to work for any task, so nothing on it can be tied
// to one. Every key and dial follows the task I tapped, and the four
// dials are the wide map.
test("everything on the task page follows the tapped task", () => {
  const page = made["pomodoro-task-plus"];
  const followers = page.keys.filter(key => key[2] !== "open");
  assert.ok(followers.every(key => (key[3].task ?? key[3].name) === "@"));
  assert.deepEqual(page.dials.map(dial => dial[2]), [0, 1, 2, 3].map(() => ({ task: "@", wide: true })));
  assert.ok(page.keys.some(key => key[2] === "open"), "the task page needs a way back");
});

// Three tasks fit. A fourth mustn't push a key off the deck or bump the
// All tasks dial.
test("only the first three tasks get a column, and All keeps its dial", () => {
  const dials = made["pomodoro-plus"].dials.map(dial => dial[2].task);
  assert.deepEqual(dials, ["593", "594", "Cleaning", "*"]);
  assert.ok(!JSON.stringify(made).includes("A fourth one"));
});

// A brand new plugin has no tasks yet, and the pages should still build
// with the All tasks keys on them.
test("the pages build with no tasks at all", () => {
  const empty = layouts();
  assert.deepEqual(empty["pomodoro-plus"].dials, [[3, "heatmap", { task: "*" }]]);
  for (const [name, profile] of Object.entries(empty)) profileFiles(name, profile, manifest);
});
