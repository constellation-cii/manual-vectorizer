import { fetchWorkspace } from "./sheets-nav.js";
import { readFileAsText } from "./sheet-io.js";

let sheetId = null;
let guestDefinition = null;

async function init() {
  const workspace = await fetchWorkspace();
  sheetId = workspace.active_sheet_id;
}

document.getElementById("guest-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await readFileAsText(file);
  const parsed = JSON.parse(text);
  guestDefinition = parsed.sheet?.definition || parsed.definition || parsed;
  document.getElementById("merge-report").textContent = `Loaded guest sheet with ${guestDefinition.vectors?.length || 0} vectors.`;
});

function mergePayload(apply) {
  let typeMap = {};
  try {
    const raw = document.getElementById("type-map").value.trim();
    if (raw) typeMap = JSON.parse(raw);
  } catch {
    throw new Error("Invalid type map JSON");
  }
  return {
    guest_definition: guestDefinition,
    type_map: typeMap,
    decisions: {
      overwrite_descriptions: document.getElementById("overwrite-descriptions").checked,
      description_conflicts: document.getElementById("conflict-policy").value,
    },
    apply,
  };
}

async function runMerge(apply) {
  if (!guestDefinition) throw new Error("Load a guest sheet first");
  const res = await fetch(`/api/sheets/${sheetId}/merge`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mergePayload(apply)),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Merge failed");
  document.getElementById("merge-report").textContent = JSON.stringify(data.report, null, 2);
  if (apply) alert("Merge applied.");
}

document.getElementById("preview-btn").addEventListener("click", () => {
  runMerge(false).catch((e) => {
    document.getElementById("merge-report").textContent = e.message;
  });
});
document.getElementById("apply-btn").addEventListener("click", () => {
  runMerge(true).catch((e) => {
    document.getElementById("merge-report").textContent = e.message;
  });
});

init().catch(console.error);
