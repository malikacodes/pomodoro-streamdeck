// The parts of the Timer key's settings page that Elgato's components
// don't do by themselves: the color box, the "New task" box and its Add
// button. All three change the task list, which the plugin keeps, so
// they send the plugin a message and don't save into this key.
const { streamDeckClient, useSettings } = SDPIComponents;

const colorBox = document.getElementById("color");
const nameBox = document.getElementById("new-task");

// Which task this key is on. useSettings hands back a way to read the
// key's "name" setting and a way to save it. Saving it here is the same
// as picking it from the dropdown.
let picked;
const [readPicked, savePicked] = useSettings("name", (name) => {
  picked = name;
});

function add() {
  streamDeckClient.send("sendToPlugin", { event: "addTask", name: nameBox.value });
}

document.getElementById("add").addEventListener("click", add);
nameBox.addEventListener("keydown", (event) => {
  if (event.key === "Enter") add();
});
// Typing again clears whatever the last add said.
nameBox.addEventListener("input", () => {
  document.getElementById("status").textContent = "";
});

// "change" fires once, when I close the color picker. "input" would
// fire the whole time I drag around in it, and each one is a save.
colorBox.addEventListener("change", () => {
  if (picked) streamDeckClient.send("sendToPlugin", { event: "setColor", task: picked, color: colorBox.value });
});

// What the plugin sends back down the same pipe.
streamDeckClient.sendToPropertyInspector.subscribe((message) => {
  const sent = message.payload ?? {};

  if (sent.event === "status") document.getElementById("status").textContent = sent.text;

  // The list as it stands: show the color of the task this key is on.
  if (sent.event === "tasks") {
    if (sent.picked) picked = sent.picked;
    if (sent.colors?.[picked]) colorBox.value = sent.colors[picked];
  }

  // My new task is on the list. Put this key on it and clear the box.
  if (sent.event === "added") {
    picked = sent.name;
    savePicked(sent.name);
    nameBox.value = "";
  }
});

// The page has only just opened: find out which task this key has, then
// ask the plugin for the list and the colors.
readPicked().then((name) => {
  picked = name;
  streamDeckClient.send("sendToPlugin", { event: "tasks" });
});
