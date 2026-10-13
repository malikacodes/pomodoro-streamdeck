// Makes my three Pomodoro pages as Stream Deck profiles, in the same
// format Stream Deck itself exports: a .streamDeckProfile is a zip of a
// <uuid>.sdProfile folder. The shape is copied from the same script in
// another plugin of mine, which got it from a real export.
//
//   Pomodoro +       timers and a heat map dial for each task
//   Pomodoro Task +  one task's page: opened by tapping that task's dial
//   Pomodoro XL      everything at once
//
// The pages are built from two things on this Mac: my task list, and
// where my Home profiles are. Neither belongs in the repo (the second
// one carries my decks' serial numbers), so the files this writes are
// ignored by git and made again with "npm run profiles".
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { History } from "../src/history.js";

const PLUGIN = "com.malikacodes.pomodoro";
// The date every file inside a profile is stamped with.
const BUILT = new Date("2026-10-13T12:00:00Z");

// The two decks: Stream Deck's number for the kind of deck (it goes in
// the plugin manifest), the model name it writes into its own profiles,
// and the key grid.
export const DEVICES = {
  xl: { type: 2, model: "20GAT9901", columns: 8, rows: 4, dials: 0 },
  plus: { type: 7, model: "20GBD9901", columns: 4, rows: 2, dials: 4 },
};

// The two values a key's task can have besides a name. They match ALL
// and TAPPED in src/index.js.
const ALL = "*";
const TAPPED = "@";

// Stream Deck's own Switch Profile action. A plugin can't open my Home
// profile (it isn't the plugin's), but this built-in key can, and it can
// do it on a different deck from the one it's on.
const SWITCH_PROFILE = "com.elgato.streamdeck.profile.rotate";
const HOME_IMAGE = "home.png";

// The three layouts, from my tasks and my Home profiles.
//
// tasks is a list of names. homes is { xl, plus }, each either
// { device, profile } or missing: the deck's id and the id of its Home
// profile.
//
// The Home key is crossed over on purpose. The one on the + sends the XL
// home, and the one on the XL sends the + home. A deck whose partner has
// no Home profile just doesn't get the key.
//
// Each key is [column, row, action, settings] and each dial is
// [column, action, settings]. Columns and rows count from 0 at the top
// left, the way Stream Deck names positions.
export function layouts({ tasks = [], homes = {} } = {}) {
  const home = other => (homes[other] ? [["home", { DeviceUUID: homes[other].device, PageIndex: 1, ProfileUUID: homes[other].profile }]] : []);
  // Three tasks get a column each. The + has four dials and the last one
  // is for all tasks, and the XL has four rows and the last one is too.
  const first = tasks.slice(0, 3);

  return {
    "pomodoro-plus": {
      name: "Pomodoro +",
      device: "plus",
      keys: [
        ...first.map((task, i) => [i, 0, "timer", { name: task }]),
        ...home("xl").map(key => [3, 0, ...key]),
        [0, 1, "stats", { task: ALL, period: "today" }],
        [1, 1, "goal", { task: ALL }],
        [2, 1, "streak", { task: ALL }],
      ],
      dials: [...first.map((task, i) => [i, "heatmap", { task }]), [3, "heatmap", { task: ALL }]],
    },
    // Every key and dial here is set to "the task I tapped", so this one
    // page works for any task, including ones I add later.
    "pomodoro-task-plus": {
      name: "Pomodoro Task +",
      device: "plus",
      keys: [
        [0, 0, "timer", { name: TAPPED }],
        [1, 0, "stats", { task: TAPPED, period: "week" }],
        [2, 0, "goal", { task: TAPPED }],
        [3, 0, "open", { label: "Back" }],
        [0, 1, "streak", { task: TAPPED }],
      ],
      dials: [0, 1, 2, 3].map(column => [column, "heatmap", { task: TAPPED, wide: true }]),
    },
    "pomodoro-xl": {
      name: "Pomodoro XL",
      device: "xl",
      keys: [
        ...first.flatMap((task, row) => [
          [0, row, "timer", { name: task }],
          [1, row, "stats", { task, period: "week" }],
          [2, row, "goal", { task }],
          [3, row, "streak", { task }],
        ]),
        [1, 3, "stats", { task: ALL, period: "year" }],
        [2, 3, "goal", { task: ALL }],
        [3, 3, "streak", { task: ALL }],
        ...home("plus").map(key => [7, 0, ...key]),
      ],
      dials: [],
    },
  };
}

// Ids made from a name, not from chance, so building twice gives the
// same ids.
function uuidFrom(name) {
  const hex = createHash("sha1").update(`pomodoro:${name}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`.toUpperCase();
}

// One key or dial, the way Stream Deck writes it into a profile.
function entry(manifest, actionName, settings, id) {
  const base = { ActionID: uuidFrom(id).toLowerCase(), LinkedTitle: false, Resources: null, Settings: settings, State: 0 };
  const state = { FontFamily: "", FontSize: 12, FontStyle: "", FontUnderline: false, OutlineThickness: 2, ShowTitle: false, TitleAlignment: "bottom", TitleColor: "#ffffff" };
  if (actionName === "home") {
    return {
      ...base,
      Name: "Switch Profile",
      Plugin: { Name: "Switch Profile", UUID: SWITCH_PROFILE, Version: "1.0" },
      States: [{ ...state, Image: `Images/${HOME_IMAGE}` }],
      UUID: SWITCH_PROFILE,
    };
  }
  const action = manifest.Actions.find(a => a.UUID === `${PLUGIN}.${actionName}`);
  if (!action) throw new Error(`No action ${actionName} in the manifest`);
  return { ...base, Name: action.Name, Plugin: { Name: manifest.Name, UUID: manifest.UUID, Version: manifest.Version }, States: [state], UUID: action.UUID };
}

// The files inside one profile, as { path: object }.
export function profileFiles(key, profile, manifest) {
  const root = `${uuidFrom(`${key}:profile`)}.sdProfile`;
  const page = uuidFrom(`${key}:page`);
  // Stream Deck's own exports carry an empty default page that isn't in
  // the page list. I do the same.
  const defaultPage = uuidFrom(`${key}:default`);
  const empty = { Controllers: [{ Actions: null, Type: "Keypad" }, { Actions: null, Type: "Encoder" }], Icon: "", Name: "" };

  const keys = {};
  for (const [column, row, actionName, settings] of profile.keys) keys[`${column},${row}`] = entry(manifest, actionName, settings, `${key}:${column},${row}`);
  const dials = {};
  for (const [column, actionName, settings] of profile.dials) dials[`${column},0`] = entry(manifest, actionName, settings, `${key}:dial:${column}`);

  return {
    [`${root}/manifest.json`]: {
      Device: { Model: DEVICES[profile.device].model, UUID: "" },
      Name: profile.name,
      Pages: { Current: page.toLowerCase(), Default: defaultPage.toLowerCase(), Pages: [page.toLowerCase()] },
      Version: "3.0",
    },
    [`${root}/Profiles/${defaultPage}/manifest.json`]: empty,
    [`${root}/Profiles/${page}/manifest.json`]: { ...empty, Controllers: [{ Actions: keys, Type: "Keypad" }, { Actions: profile.dials.length ? dials : null, Type: "Encoder" }] },
  };
}

// Finds each deck's Home profile among Stream Deck's own saved profiles:
// the one named "Home" for that model. What comes back is the deck's id
// and the profile's id, which is the folder's name in lowercase.
async function findHomes() {
  const dir = join(homedir(), "Library", "Application Support", "com.elgato.StreamDeck", "ProfilesV3");
  const homes = {};
  for (const folder of await readdir(dir).catch(() => [])) {
    if (!folder.endsWith(".sdProfile")) continue;
    const saved = await readFile(join(dir, folder, "manifest.json"), "utf8").then(JSON.parse).catch(() => null);
    if (saved?.Name !== "Home" || !saved.Device?.UUID) continue;
    const deck = Object.keys(DEVICES).find(name => DEVICES[name].model === saved.Device.Model);
    if (deck) homes[deck] = { device: saved.Device.UUID, profile: folder.replace(".sdProfile", "").toLowerCase() };
  }
  return homes;
}

// Writes <dir>/<key>.streamDeckProfile for each layout.
export async function writeProfiles(dir, manifest, made) {
  await mkdir(dir, { recursive: true });
  for (const [key, profile] of Object.entries(made)) {
    const work = await mkdtemp(join(tmpdir(), "pomodoro-profile-"));
    const files = profileFiles(key, profile, manifest);
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(work, path, ".."), { recursive: true });
      await writeFile(join(work, path), JSON.stringify(content));
    }
    // A key's picture lives in an Images folder beside the page it's
    // on, and has to be a PNG. sips comes with macOS and does the
    // converting.
    const pagePath = Object.keys(files).find(path => files[path].Controllers?.[0].Actions);
    const image = join(pagePath, "..", "Images", HOME_IMAGE);
    await mkdir(join(work, image, ".."), { recursive: true });
    execFileSync("sips", ["-s", "format", "png", fileURLToPath(new URL("home.svg", import.meta.url)), "--out", join(work, image)], { stdio: "ignore" });

    // A zip remembers when each file inside it was last changed. Every
    // file gets the same made-up date, so building twice from the same
    // tasks gives the same file.
    for (const path of [...Object.keys(files), image]) await utimes(join(work, path), BUILT, BUILT);

    const out = join(dir, `${key}.streamDeckProfile`);
    await rm(out, { force: true });
    // Just the files, profile manifest first and no folder entries, the
    // way Stream Deck's own exports are laid out. -X leaves out extra
    // file attributes.
    execFileSync("zip", ["-q", "-X", "-D", out, ...Object.keys(files), image], { cwd: work });
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pluginDir = join(fileURLToPath(new URL("..", import.meta.url)), `${PLUGIN}.sdPlugin`);
  const manifest = JSON.parse(await readFile(join(pluginDir, "manifest.json"), "utf8"));
  const history = new History();
  await history.load();
  const tasks = history.tasks();
  const homes = await findHomes();
  await writeProfiles(join(pluginDir, "profiles"), manifest, layouts({ tasks, homes }));

  console.log(`Wrote ${PLUGIN}.sdPlugin/profiles`);
  console.log(`Tasks: ${tasks.length ? tasks.slice(0, 3).join(", ") : "none yet"}${tasks.length > 3 ? ` (the first 3 of ${tasks.length})` : ""}`);
  for (const deck of Object.keys(DEVICES)) console.log(`Home on the ${deck}: ${homes[deck] ? "found" : "not found, so the other deck gets no Home key"}`);
}
