import { loadState } from "./state.js";

const logRows = document.getElementById("log-rows");
const sharedList = document.getElementById("shared-list");
const saveStatus = document.getElementById("save-status");

async function loadLogs() {
  const res = await fetch("/api/logs", { credentials: "same-origin" });
  const logs = await res.json();
  logRows.innerHTML = "";
  for (const log of logs) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(log.speaker_name)}</td>
      <td>${escapeHtml(log.source_ref || "—")}</td>
      <td>${new Date(log.created_at).toLocaleString()}</td>
      <td><input type="email" placeholder="email@example.com" class="share-email" data-id="${log.id}" /></td>
      <td><button type="button" class="btn btn-sm share-btn" data-id="${log.id}">Share</button>
          <button type="button" class="btn btn-sm load-btn" data-id="${log.id}">Load</button></td>`;
    logRows.appendChild(tr);
  }
}

async function loadShared() {
  const res = await fetch("/api/shared", { credentials: "same-origin" });
  const shares = await res.json();
  sharedList.innerHTML = shares.length
    ? shares.map((s) => `<li>${s.resource_type} #${s.resource_id} (${s.permission})</li>`).join("")
    : "<li>No shared items.</li>";
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.getElementById("save-log-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const state = await loadState();
  const body = {
    speaker_name: document.getElementById("speaker_name").value,
    source_ref: document.getElementById("source_ref").value,
    notes: document.getElementById("notes").value,
    ranking: {
      mode: state.mode,
      values: state.values,
      weights: state.weights,
      groupWeights: state.groupWeights,
    },
  };
  const res = await fetch("/api/logs", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Save failed");
  saveStatus.hidden = false;
  document.getElementById("speaker_name").value = "";
  await loadLogs();
});

logRows.addEventListener("click", async (e) => {
  const shareBtn = e.target.closest(".share-btn");
  if (shareBtn) {
    const id = shareBtn.dataset.id;
    const input = logRows.querySelector(`.share-email[data-id="${id}"]`);
    const res = await fetch(`/api/logs/${id}/share`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.value }),
    });
    const data = await res.json();
    alert(res.ok ? "Shared." : data.error || "Share failed");
    return;
  }
  const loadBtn = e.target.closest(".load-btn");
  if (loadBtn) {
    const id = loadBtn.dataset.id;
    const res = await fetch(`/api/logs/${id}`, { credentials: "same-origin" });
    const log = await res.json();
    await fetch("/api/session", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        speaker: log.speaker_name,
        mode: log.ranking.mode,
        values: log.ranking.values,
        weights: log.ranking.weights,
        groupWeights: log.ranking.groupWeights || {},
        collapsed: {},
      }),
    });
    window.location.href = "/";
  }
});

loadLogs().catch(console.error);
loadShared().catch(console.error);
