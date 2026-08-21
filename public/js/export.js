/** Export vectors in vectorizer/de-vector compatible format. */

import { toNumericScore } from "./state.js?v=3";

/**
 * Nest flat key "category/id" into { category: { id: score } }.
 * @param {Record<string, number>} flat
 */
function nestVectors(flat) {
  const nested = {};
  for (const [key, score] of Object.entries(flat)) {
    const parts = key.split("/");
    const id = parts.pop();
    let current = nested;
    for (const segment of parts) {
      current[segment] = current[segment] || {};
      current = current[segment];
    }
    current[id] = score;
  }
  return nested;
}

/**
 * @param {object} opts
 * @param {object} opts.catalog
 * @param {string} opts.speaker
 * @param {'binary'|'ranked'} opts.mode
 * @param {Record<string, *>} opts.values
 */
export function buildVectorsDocument({ catalog, speaker, mode, values }) {
  const flat = {};
  for (const skill of catalog.skills) {
    const score = toNumericScore(values, skill.key, mode);
    if (score !== null) flat[skill.key] = Math.round(score * 100) / 100;
  }

  const skillsMeta = catalog.skills.map((s) => ({
    id: s.id,
    name: s.name,
    key: s.key,
    category: s.category,
    path: s.path,
    description: s.summary || "",
  }));

  return {
    version: "0.2.1",
    generated_at: new Date().toISOString(),
    speakers: speaker || "manual",
    transcripts: [],
    skills: skillsMeta,
    vectors: {
      [speaker || "Speaker"]: nestVectors(flat),
    },
    details: {},
    skill_runs: [],
  };
}

/**
 * @param {Record<string, number>} weights
 */
export function buildWeightsExport(weights) {
  return {
    weights: Object.fromEntries(
      Object.entries(weights).sort(([a], [b]) => a.localeCompare(b))
    ),
  };
}

/** @type {{ json: string, filename: string, blob: Blob } | null} */
let exportPayload = null;
/** @type {string | null} */
let exportObjectUrl = null;

/** @type {boolean} */
let exportModalBound = false;

function isCoarsePointer() {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

function isMobileExportContext() {
  return isCoarsePointer() || navigator.maxTouchPoints > 0;
}

function revokeExportObjectUrl() {
  if (exportObjectUrl) {
    URL.revokeObjectURL(exportObjectUrl);
    exportObjectUrl = null;
  }
}

function exportModalMarkup() {
  return `
    <div class="export-fallback-panel">
      <button type="button" class="export-fallback-close" aria-label="Close">×</button>
      <h2 id="export-fallback-title">Export ready</h2>
      <p class="export-fallback-hint" id="export-fallback-hint"></p>
      <div class="export-fallback-actions">
        <button type="button" class="btn btn-primary export-fallback-save">Share / Save file</button>
        <button type="button" class="btn export-fallback-select">Select all JSON</button>
        <button type="button" class="btn export-fallback-copy">Copy JSON</button>
        <button type="button" class="btn export-fallback-view">View JSON</button>
      </div>
      <textarea class="export-fallback-preview" readonly spellcheck="false" aria-label="Exported JSON"></textarea>
      <p class="export-fallback-status" aria-live="polite"></p>
    </div>`;
}

function bindExportModal(root) {
  if (exportModalBound) return;
  exportModalBound = true;

  root.addEventListener("cancel", (event) => {
    event.preventDefault();
    hideExportFallback();
  });

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest(".export-fallback-close")) {
      hideExportFallback();
      return;
    }
    if (target.closest(".export-fallback-save")) {
      event.preventDefault();
      onExportSaveClick();
      return;
    }
    if (target.closest(".export-fallback-select")) {
      event.preventDefault();
      onExportSelectClick();
      return;
    }
    if (target.closest(".export-fallback-copy")) {
      event.preventDefault();
      void onExportCopyClick();
      return;
    }
    if (target.closest(".export-fallback-view")) {
      event.preventDefault();
      onExportViewClick();
    }
  });
}

function createExportDialog() {
  const root = document.createElement("dialog");
  root.id = "export-fallback";
  root.className = "export-fallback";
  root.innerHTML = exportModalMarkup();
  document.body.appendChild(root);
  bindExportModal(root);
  return root;
}

function getExportModal() {
  if (!document.body) {
    throw new Error("Page not ready for export UI");
  }

  let root = document.getElementById("export-fallback");
  if (root && !(root instanceof HTMLDialogElement)) {
    root.remove();
    exportModalBound = false;
    root = null;
  }

  if (root) {
    if (!root.querySelector(".export-fallback-preview")) {
      root.innerHTML = exportModalMarkup();
      exportModalBound = false;
    }
    bindExportModal(root);
    return root;
  }

  return createExportDialog();
}

function setExportStatus(message) {
  const status = document.querySelector("#export-fallback .export-fallback-status");
  if (status) status.textContent = message;
}

function openExportDialog() {
  const root = getExportModal();
  if (root instanceof HTMLDialogElement) {
    if (typeof root.showModal === "function") {
      if (!root.open) root.showModal();
    } else {
      root.setAttribute("open", "");
    }
  } else {
    root.classList.add("is-open");
  }
  document.body.classList.add("export-fallback-open");
}

function hideExportFallback() {
  const root = document.getElementById("export-fallback");
  if (root instanceof HTMLDialogElement) {
    if (root.open) root.close();
  } else if (root) {
    root.classList.remove("is-open");
  }
  document.body.classList.remove("export-fallback-open");
  revokeExportObjectUrl();
  exportPayload = null;
}

/** Show export dialog immediately (before JSON is built). */
function showPreparingExport(filename = "export.json") {
  const root = getExportModal();
  const title = root.querySelector("#export-fallback-title");
  const hint = root.querySelector(".export-fallback-hint");
  const preview = root.querySelector(".export-fallback-preview");
  const saveBtn = root.querySelector(".export-fallback-save");
  const viewBtn = root.querySelector(".export-fallback-view");

  if (title) title.textContent = "Preparing export…";
  if (hint) {
    hint.textContent = isMobileExportContext()
      ? "Building your file — the save options will appear in a moment."
      : "Building your file…";
  }
  if (preview) preview.value = "";
  if (saveBtn) {
    saveBtn.textContent = isMobileExportContext() ? "Share / Save file" : "Download";
  }
  if (viewBtn) {
    viewBtn.hidden = !isMobileExportContext();
  }

  setExportStatus("");
  openExportDialog();
}

function showExportFallback(json, filename, blob, statusMessage = "") {
  exportPayload = { json, filename, blob };
  revokeExportObjectUrl();
  exportObjectUrl = URL.createObjectURL(blob);

  const root = getExportModal();
  const title = root.querySelector("#export-fallback-title");
  const hint = root.querySelector(".export-fallback-hint");
  const saveBtn = root.querySelector(".export-fallback-save");
  const viewBtn = root.querySelector(".export-fallback-view");
  const preview = root.querySelector(".export-fallback-preview");

  if (title) title.textContent = "Export ready";
  if (preview) preview.value = json;

  if (hint) {
    hint.innerHTML = isMobileExportContext()
      ? `Tap <strong>Share / Save file</strong>, or <strong>Select all JSON</strong> then Copy. File: <code>${escapeHtml(filename)}</code>`
      : `Use <strong>Share / Save file</strong> to download <code>${escapeHtml(filename)}</code>, or copy from the preview below.`;
  }

  if (saveBtn) {
    saveBtn.textContent = isMobileExportContext() ? "Share / Save file" : "Download";
  }

  if (viewBtn) {
    viewBtn.hidden = !isMobileExportContext();
  }

  setExportStatus(statusMessage);
  openExportDialog();
}

function tryShareExport(json, filename, blob) {
  if (!navigator.share) return false;

  try {
    const file = new File([blob], filename, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) {
      navigator
        .share({ files: [file], title: filename })
        .then(() => setExportStatus("Share sheet opened — choose Save to Files or Downloads."))
        .catch((err) => {
          if (err?.name === "AbortError") {
            setExportStatus("Share cancelled — use Select all, then Copy.");
            return;
          }
          tryShareText(json, filename);
        });
      return true;
    }
  } catch {
    // fall through
  }

  return tryShareText(json, filename);
}

function tryShareText(json, filename) {
  if (!navigator.share) return false;

  try {
    if (navigator.canShare?.({ text: json })) {
      navigator
        .share({ text: json, title: filename })
        .then(() => setExportStatus("Shared as text — paste into a .json file if needed."))
        .catch((err) => {
          if (err?.name !== "AbortError") {
            setExportStatus("Share failed — use Select all, then Copy.");
          }
        });
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function getExportPreview() {
  return document.querySelector("#export-fallback .export-fallback-preview");
}

function selectExportPreview() {
  const preview = getExportPreview();
  if (!preview || !exportPayload) return false;

  preview.focus();
  preview.select();
  preview.setSelectionRange(0, exportPayload.json.length);
  return true;
}

function onExportSelectClick() {
  if (!exportPayload) return;
  if (selectExportPreview()) {
    setExportStatus("JSON selected — tap Copy or use the keyboard Copy button.");
  }
}

async function copyTextToClipboard(text) {
  if (selectExportPreview()) {
    try {
      if (document.execCommand("copy")) {
        return;
      }
    } catch {
      // fall through
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "2em";
  textarea.style.height = "2em";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function onExportViewClick() {
  if (!exportPayload) return;

  try {
    const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(exportPayload.json)}`;
    window.location.assign(dataUrl);
  } catch {
    if (exportObjectUrl) {
      window.location.assign(exportObjectUrl);
    } else {
      setExportStatus("Could not open JSON — use Select all and Copy.");
    }
  }
}

function onExportSaveClick() {
  if (!exportPayload) return;

  const { json, filename, blob } = exportPayload;

  if (isMobileExportContext()) {
    if (tryShareExport(json, filename, blob)) return;
    onExportViewClick();
    return;
  }

  try {
    const anchor = document.createElement("a");
    anchor.href = exportObjectUrl || URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setExportStatus("Download started.");
  } catch {
    setExportStatus("Download failed — use Copy JSON.");
  }
}

async function onExportCopyClick() {
  if (!exportPayload) return;

  try {
    await copyTextToClipboard(exportPayload.json);
    setExportStatus("Copied to clipboard.");
  } catch {
    if (selectExportPreview()) {
      setExportStatus("Copy failed — JSON is selected; use keyboard Copy.");
    } else {
      setExportStatus("Copy failed — tap Select all JSON first.");
    }
  }
}

/**
 * @param {object | (() => object)} dataOrFn
 * @param {string | (() => string)} filenameOrFn
 * @param {string} [statusMessage]
 */
export function downloadJson(dataOrFn, filenameOrFn, statusMessage = "") {
  const resolveFilename = () => {
    const name = typeof filenameOrFn === "function" ? filenameOrFn() : filenameOrFn;
    return name || "export.json";
  };

  showPreparingExport(resolveFilename());

  window.setTimeout(() => {
    try {
      const data = typeof dataOrFn === "function" ? dataOrFn() : dataOrFn;
      const filename = resolveFilename();
      const json = JSON.stringify(data, null, 2) + "\n";
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      showExportFallback(json, filename, blob, statusMessage);
    } catch (err) {
      const filename = resolveFilename();
      try {
        showExportFallback(
          JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2) + "\n",
          filename.endsWith(".json") ? filename : "export-error.json",
          new Blob(["{}\n"], { type: "application/json" }),
          err instanceof Error ? err.message : String(err)
        );
      } catch {
        alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, 0);
}

export function downloadWeightsJson(weights, filename = "weights.json") {
  downloadJson(buildWeightsExport(weights), filename);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
