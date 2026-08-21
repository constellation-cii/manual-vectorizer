import { fetchWorkspace } from "./sheets-nav.js";
import { exportSheetBundle, importSheetBundle, downloadJson, readFileAsText } from "./sheet-io.js";

let sheetId = null;
let definition = null;

const yamlEditor = document.getElementById("yaml-editor");
const vectorList = document.getElementById("vector-list");
const validationOutput = document.getElementById("validation-output");
const threshold = document.getElementById("threshold");
const thresholdVal = document.getElementById("threshold-val");

threshold.addEventListener("input", () => {
  thresholdVal.textContent = Number(threshold.value).toFixed(2);
});

async function loadSheet() {
  const workspace = await fetchWorkspace();
  sheetId = workspace.active_sheet_id;
  document.getElementById("sheet-title").textContent = workspace.active_sheet_name || "Sheet editor";
  const jsonRes = await fetch(`/api/sheets/${sheetId}`, { credentials: "same-origin" });
  if (!jsonRes.ok) throw new Error(`sheet HTTP ${jsonRes.status}`);
  const payload = await jsonRes.json();
  definition = payload.definition;
  yamlEditor.value = JSON.stringify(definition, null, 2);
  renderVectorList(definition.vectors || []);
}

function renderVectorList(vectors) {
  vectorList.innerHTML = "";
  const sorted = [...vectors].sort((a, b) => (a.order || 0) - (b.order || 0));
  sorted.forEach((vector, index) => {
    const li = document.createElement("li");
    li.draggable = true;
    li.dataset.key = vector.key;
    li.innerHTML = `<span class="vector-key">${vector.key}</span><span class="vector-name">${vector.name || ""}</span>`;
    li.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", vector.key);
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));
    li.addEventListener("dragover", (e) => e.preventDefault());
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      const fromKey = e.dataTransfer.getData("text/plain");
      reorderVectors(fromKey, vector.key);
    });
    vectorList.appendChild(li);
  });
}

function reorderVectors(fromKey, toKey) {
  const vectors = [...(definition.vectors || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const fromIdx = vectors.findIndex((v) => v.key === fromKey);
  const toIdx = vectors.findIndex((v) => v.key === toKey);
  if (fromIdx < 0 || toIdx < 0) return;
  const [item] = vectors.splice(fromIdx, 1);
  vectors.splice(toIdx, 0, item);
  vectors.forEach((v, i) => {
    v.order = i;
  });
  definition.vectors = vectors;
  yamlEditor.value = jsonToYaml(definition);
  renderVectorList(vectors);
}

function jsonToYaml(obj) {
  return JSON.stringify(obj, null, 2);
}

async function saveSheet() {
  const res = await fetch(`/api/sheets/${sheetId}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "text/yaml" },
    body: yamlEditor.value,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Save failed");
  definition = data.definition;
  renderVectorList(definition.vectors || []);
  validationOutput.textContent = "Saved.";
}

async function validateSheet() {
  const res = await fetch(`/api/sheets/${sheetId}/validate?threshold=${threshold.value}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "text/yaml" },
    body: yamlEditor.value,
  });
  const data = await res.json();
  validationOutput.textContent = JSON.stringify(data, null, 2);
}

document.getElementById("save-btn").addEventListener("click", () => saveSheet().catch((e) => {
  validationOutput.textContent = e.message;
}));
document.getElementById("validate-btn").addEventListener("click", () => validateSheet().catch((e) => {
  validationOutput.textContent = e.message;
}));
document.getElementById("export-btn").addEventListener("click", async () => {
  const bundle = await exportSheetBundle(sheetId);
  downloadJson(`sheet-${sheetId}.json`, bundle);
});
document.getElementById("import-btn").addEventListener("click", () => {
  document.getElementById("import-file").click();
});
document.getElementById("import-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await readFileAsText(file);
  const bundle = JSON.parse(text);
  const imported = await importSheetBundle(bundle);
  sheetId = imported.id;
  await loadSheet();
});

loadSheet().catch((e) => {
  validationOutput.textContent = e.message;
});
