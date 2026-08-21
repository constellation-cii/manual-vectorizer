/** Sheet bundle import/export helpers. */

export async function exportSheetBundle(sheetId) {
  const res = await fetch(`/api/sheets/${sheetId}/export`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`export HTTP ${res.status}`);
  return res.json();
}

export async function importSheetBundle(bundle) {
  const res = await fetch("/api/sheets/import", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bundle),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `import HTTP ${res.status}`);
  }
  return res.json();
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function parseImportFile(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const res = await fetch("/api/sheets/import", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "text/yaml" },
    body: trimmed,
  });
  if (res.status === 422) {
    const err = await res.json();
    throw new Error(err.error || "Invalid sheet");
  }
  return null;
}
