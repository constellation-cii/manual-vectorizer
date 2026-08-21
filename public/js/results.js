import { loadState, defaultState } from "./state.js";
import { loadCatalog, showCatalogSource } from "./catalog.js";
import {
  buildRankings,
  bestMatches,
  distancesFor,
  resolveWeights,
  topContributions,
} from "./distance.js";

let catalog = null;
let state = defaultState();

async function init() {
  try {
    state = await loadState();
    catalog = await loadCatalog();
  } catch {
    document.querySelector("#results-app").innerHTML =
      `<div class="empty-notice">Failed to load catalog. Contact an admin.</div>`;
    return;
  }

  showCatalogSource(catalog, "catalog-source");
  bindToolbar();
  render();
}

function bindToolbar() {
  document.querySelector("#top-n").addEventListener("change", render);
}

function render() {
  const root = document.querySelector("#results-app");
  const rankings = buildRankings(catalog, state.values, state.mode);
  const rankingCount = Object.keys(rankings).length;

  if (rankingCount === 0) {
    root.innerHTML = `
      <div class="empty-notice">
        No rankings set yet. Go to <a href="index.html">Vectorize</a> and score some axes first.
      </div>`;
    document.querySelector("#summary").innerHTML = "";
    return;
  }

  const weights = resolveWeights(catalog, state);
  const distances = distancesFor(rankings, catalog.types, weights);
  const tiedBest = bestMatches(distances);
  const speaker = state.speaker?.trim() || "Speaker";

  document.querySelector("#summary").innerHTML = `
    <span><strong>${escapeHtml(speaker)}</strong></span>
    <span>${rankingCount} axes ranked</span>
    <span>${distances.length} types scored</span>
    <span>Mode: ${state.mode}</span>`;

  const topN = document.querySelector("#top-n").value;
  const visible =
    topN === "all" ? distances : distances.slice(0, Number.parseInt(topN, 10));

  root.innerHTML = `
    <section class="results-hero">
      <div class="results-hero-label">${tiedBest.length > 1 ? "Best matches" : "Best match"}${tiedBest.length > 1 ? ` (${tiedBest.length} tied)` : ""}</div>
      <div class="results-hero-grid">
        ${tiedBest.map((row) => renderBestMatchCard(row)).join("")}
      </div>
    </section>

    <section class="results-table-wrap">
      <table class="results-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Type</th>
            <th>Match</th>
            <th>RMSE</th>
            <th>Axes</th>
          </tr>
        </thead>
        <tbody>
          ${visible
            .map(
              (row) => `
            <tr class="results-row" data-type-id="${escapeAttr(row.id)}">
              <td>${row.rank}</td>
              <td>
                <div class="results-type-name">${escapeHtml(row.name)}</div>
                <div class="results-type-id">${escapeHtml(row.id)}</div>
                ${renderMeta(row.meta, true)}
              </td>
              <td>
                <div class="match-bar-wrap">
                  <div class="match-bar" style="width:${row.match_percent}%"></div>
                  <span>${row.match_percent}%</span>
                </div>
              </td>
              <td>${row.rmse.toFixed(3)}</td>
              <td>${row.axes_compared}</td>
            </tr>
            <tr class="results-detail-row" hidden data-detail-for="${escapeAttr(row.id)}">
              <td colspan="5">${renderContributionList(row.contributions, "Top axis contributions")}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </section>`;

  root.querySelectorAll(".results-row").forEach((row) => {
    row.addEventListener("click", () => toggleDetail(row.dataset.typeId));
  });
}

function toggleDetail(typeId) {
  const detail = document.querySelector(`tr[data-detail-for="${typeId}"]`);
  if (!detail) return;
  detail.hidden = !detail.hidden;
}

function renderBestMatchCard(row) {
  return `
    <article class="results-hero-card">
      <div class="results-hero-name">${escapeHtml(row.name)}</div>
      <div class="results-hero-id">${escapeHtml(row.id)}</div>
      ${renderMeta(row.meta)}
      <div class="results-hero-stats">
        <div class="results-stat">
          <span class="results-stat-value">${row.match_percent}%</span>
          <span class="results-stat-label">Match</span>
        </div>
        <div class="results-stat">
          <span class="results-stat-value">${row.rmse.toFixed(3)}</span>
          <span class="results-stat-label">RMSE</span>
        </div>
        <div class="results-stat">
          <span class="results-stat-value">${row.axes_compared}</span>
          <span class="results-stat-label">Axes compared</span>
        </div>
      </div>
      ${renderContributionList(row.contributions, "Largest mismatches")}
    </article>`;
}

function renderMeta(meta, compact = false) {
  if (!meta || typeof meta !== "object") return "";
  const parts = [];
  if (meta.mbti) parts.push(meta.mbti);
  if (meta.development) parts.push(meta.development);
  if (meta.focus) parts.push(meta.focus);
  if (meta.gender) parts.push(meta.gender);
  if (parts.length === 0) return "";
  const cls = compact ? "meta-badges meta-badges-compact" : "meta-badges";
  return `<div class="${cls}">${parts.map((p) => `<span class="meta-badge">${escapeHtml(p)}</span>`).join("")}</div>`;
}

function renderContributionList(contributions, title) {
  const items = topContributions(contributions);
  if (items.length === 0) return "";
  return `
    <div class="contributions-block">
      <div class="contributions-title">${escapeHtml(title)}</div>
      <ul class="contributions-list">
        ${items
          .map(
            ([axis, value]) =>
              `<li><code>${escapeHtml(axis)}</code> <span>${value.toFixed(3)}</span></li>`
          )
          .join("")}
      </ul>
    </div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

init();
