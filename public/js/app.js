import {
  loadState,
  saveState,
  defaultState,
  getBinaryState,
  getRankedValue,
  cycleBinaryState,
  countSetValues,
} from "./state.js";
import { isDisabled, applyBinarySet } from "./constraints.js";
import { buildVectorsDocument, downloadJson } from "./export.js?v=3";
import { bindTap } from "./tap.js?v=3";
import { attachTooltip } from "./tooltip.js";
import { bindCollapsible, collapseId } from "./collapsible.js";
import { loadCatalog, showCatalogSource } from "./catalog.js";
import { valuesFromTypeIdeals, findType } from "./apply-type.js";
import { applyRankedAppearance } from "./ranked-style.js";

let catalog = null;
let state = defaultState();

async function init() {
  const app = document.querySelector("#app");
  try {
    state = await loadState();
    catalog = await loadCatalog();
    showCatalogSource(catalog, "catalog-source");
    populateTypePicker();
    bindToolbar();
    render();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    app.innerHTML =
      `<div class="empty-notice">Failed to load catalog: ${escapeHtml(message)}. Contact an admin to refresh the catalog.</div>`;
    console.error(err);
  }
}

function populateTypePicker() {
  const select = document.querySelector("#type-picker");
  if (!select || !catalog?.types) return;

  const sorted = [...catalog.types].sort((a, b) => a.name.localeCompare(b.name));
  for (const type of sorted) {
    const option = document.createElement("option");
    option.value = type.id;
    option.textContent = type.name;
    select.appendChild(option);
  }
}

function bindToolbar() {
  const speakerInput = document.querySelector("#speaker");
  const modeBinary = document.querySelector("#mode-binary");
  const modeRanked = document.querySelector("#mode-ranked");
  const exportBtn = document.querySelector("#export-btn");
  const clearBtn = document.querySelector("#clear-btn");
  const typePicker = document.querySelector("#type-picker");

  speakerInput.value = state.speaker || "";
  speakerInput.addEventListener("input", () => {
    state.speaker = speakerInput.value.trim();
    saveState(state);
    updateStats();
  });

  modeBinary.classList.toggle("active", state.mode === "binary");
  modeRanked.classList.toggle("active", state.mode === "ranked");

  modeBinary.addEventListener("click", () => setMode("binary"));
  modeRanked.addEventListener("click", () => setMode("ranked"));

  bindTap(exportBtn, onExport);
  clearBtn.addEventListener("click", onClear);
  typePicker.addEventListener("change", onTypeSelected);
}

function onTypeSelected() {
  const typeId = document.querySelector("#type-picker").value;
  if (!typeId) return;

  const type = findType(catalog, typeId);
  if (!type) return;

  state.values = valuesFromTypeIdeals(type);
  saveState(state);
  render();
}

function setMode(mode) {
  state.mode = mode;
  saveState(state);
  document.querySelector("#mode-binary").classList.toggle("active", mode === "binary");
  document.querySelector("#mode-ranked").classList.toggle("active", mode === "ranked");
  render();
}

function onClear() {
  if (!confirm("Clear all vector values for this session?")) return;
  state.values = {};
  saveState(state);
  render();
}

function onExport() {
  downloadJson(
    () => {
      if (!catalog) {
        throw new Error("Catalog not loaded yet. Wait for the page to finish loading.");
      }

      const speakerInput = document.querySelector("#speaker");
      if (!state.speaker?.trim()) {
        state.speaker = speakerInput?.value.trim() || "Speaker";
        if (speakerInput) speakerInput.value = state.speaker;
        saveState(state);
      }

      return buildVectorsDocument({
        catalog,
        speaker: state.speaker || "Speaker",
        mode: state.mode,
        values: state.values,
      });
    },
    () => {
      const speaker = state.speaker || "Speaker";
      const slug = speaker.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return `${slug}-vectors.json`;
    }
  );
}

function updateStats() {
  const el = document.querySelector("#stats");
  if (!el || !catalog) return;
  const keys = catalog.skills.map((s) => s.key);
  const { set, unset, total } = countSetValues(state.values, state.mode, keys);
  el.innerHTML = `<span><strong>${set}</strong> set / <strong>${unset}</strong> unset of ${total} axes</span>`;
}

function render() {
  const app = document.querySelector("#app");
  if (!catalog) return;

  const skillByKey = Object.fromEntries(catalog.skills.map((s) => [s.key, s]));
  app.innerHTML = "";

  const categories = catalog.ui_groups
    ? Object.keys(catalog.ui_groups)
    : [...new Set(catalog.skills.map((s) => s.category[0] || "other"))];

  for (const category of categories.sort()) {
    const section = document.createElement("section");
    section.className = "category-section";

    const body = document.createElement("div");
    body.className = "category-body";

    const groups = catalog.ui_groups?.[category];
    if (groups?.length) {
      for (const group of groups) {
        body.appendChild(renderUiGroup(group, skillByKey, category));
      }
    } else {
      const skills = catalog.skills.filter(
        (s) => (s.category[0] || "other") === category
      );
      body.appendChild(renderSkillGrid(skills));
    }

    const collapsible = bindCollapsible({
      id: collapseId("cat", category),
      title: category,
      level: "category",
      state,
      saveState: () => saveState(state),
      bodyEl: body,
    });

    section.appendChild(collapsible);
    app.appendChild(section);
  }

  updateStats();
}

function renderUiGroup(group, skillByKey, category) {
  const skills = group.keys.map((key) => skillByKey[key]).filter(Boolean);
  const grid = renderSkillGrid(skills);

  return bindCollapsible({
    id: collapseId("grp", category, group.id),
    title: group.label,
    level: "group",
    state,
    saveState: () => saveState(state),
    bodyEl: grid,
  });
}

function renderSkillGrid(skills) {
  const grid = document.createElement("div");
  grid.className = "skill-grid";
  for (const skill of skills) {
    grid.appendChild(renderSkillButton(skill));
  }
  return grid;
}

function renderSkillButton(skill) {
  const card = document.createElement("div");
  card.className = "skill-btn";
  card.dataset.key = skill.key;

  if (state.mode === "binary") {
    renderBinaryButton(card, skill);
  } else {
    renderRankedButton(card, skill);
  }

  attachTooltip(card, skill);
  return card;
}

function setSkillCardDisabled(card, disabled) {
  if (disabled) {
    card.classList.add("disabled");
    card.setAttribute("aria-disabled", "true");
  } else {
    card.classList.remove("disabled");
    card.removeAttribute("aria-disabled");
  }
}

function renderBinaryButton(btn, skill) {
  btn.setAttribute("role", "button");
  btn.tabIndex = 0;

  const current = getBinaryState(state.values, skill.key);
  const disabled = isDisabled(catalog, state.values, skill.key);
  const numeric = getRankedValue(state.values, skill.key);

  btn.classList.add(`state-${current}`);
  setSkillCardDisabled(btn, disabled);

  const stateLabel =
    current === "set"
      ? "SET (10)"
      : current === "negative"
        ? "NEG (0)"
        : current === "partial"
          ? String(numeric)
          : "unset";

  btn.innerHTML = `
    <span class="skill-name">${escapeHtml(formatLabel(skill))}</span>
    <span class="skill-state">${stateLabel}</span>
  `;

  const activate = () => {
    if (disabled) return;
    const next = cycleBinaryState(getBinaryState(state.values, skill.key));
    state.values = applyBinarySet(catalog, state.values, skill.key, next);
    saveState(state);
    render();
  };

  btn.addEventListener("click", activate);
  btn.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate();
  });
}

function renderRankedButton(btn, skill) {
  btn.classList.add("ranked");
  const current = getRankedValue(state.values, skill.key);
  const display = current !== null ? current : "—";

  btn.innerHTML = `
    <span class="skill-name">${escapeHtml(formatLabel(skill))}</span>
    <span class="rank-value">${display}</span>
    <input type="range" min="0" max="10" step="0.5" value="${current ?? 5}" aria-label="Score for ${skill.key}" />
  `;

  const slider = btn.querySelector("input[type='range']");
  const valueEl = btn.querySelector(".rank-value");

  applyRankedAppearance(btn, current);

  const commitSliderValue = () => {
    const val = parseFloat(slider.value);
    state.values[skill.key] = val;
    valueEl.textContent = String(val);
    applyRankedAppearance(btn, val);
    saveState(state);
    updateStats();
  };

  slider.addEventListener("input", (event) => {
    event.stopPropagation();
    commitSliderValue();
  });

  slider.addEventListener("change", (event) => {
    event.stopPropagation();
    commitSliderValue();
  });

  for (const type of ["pointerdown", "touchstart"]) {
    slider.addEventListener(
      type,
      (event) => {
        event.stopPropagation();
      },
      type === "touchstart" ? { passive: true } : undefined
    );
  }

  btn.addEventListener("click", (event) => {
    if (event.target.closest('input[type="range"]')) return;
    if (current !== null) return;
    state.values[skill.key] = 5;
    saveState(state);
    render();
  });
}

function formatLabel(skill) {
  return skill.id.replace(/-/g, " ");
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

init();
