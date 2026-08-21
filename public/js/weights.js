import { loadState, saveState, defaultState } from "./state.js";
import { buildWeightsExport, downloadJson } from "./export.js?v=3";
import { bindTap } from "./tap.js?v=3";
import { collapseId, isCollapsed, setCollapsed } from "./collapsible.js";
import { loadCatalog, showCatalogSource } from "./catalog.js";
import {
  appliedWeightForGroupOverride,
  axisKeysForCategory,
  cycleGroupPriority,
  getGroupOverride,
  isAxisEffectivelyDisabled,
  isAxisGroupOverrideActive,
  isDisabledWeight,
  isGroupOverrideApplying,
  isGroupOverrideDisabled,
  priorityLabel,
  priorityTitle,
  resolveAllEffectiveWeights,
  setGroupOverride,
} from "./group-weights.js";
import {
  applyAxisWeightAppearance,
  applyFolderWeightAppearance,
} from "./weight-style.js";

let catalog = null;
let state = defaultState();

async function init() {
  const app = document.querySelector("#weights-app");
  try {
    state = await loadState();
    catalog = await loadCatalog();
    showCatalogSource(catalog, "catalog-source");
    if (!state.weights) {
      state.weights = { ...catalog.weights };
      saveState(state);
    }
    if (!state.groupWeights) {
      state.groupWeights = {};
      saveState(state);
    }
    bindToolbar();
    render();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    app.innerHTML =
      `<div class="empty-notice">Failed to load catalog: ${escapeHtml(message)}. Contact an admin to refresh the catalog.</div>`;
    console.error(err);
  }
}

function bindToolbar() {
  document.querySelector("#reset-weights").addEventListener("click", () => {
    if (!confirm("Reset all weights to catalog defaults?")) return;
    state.weights = { ...catalog.weights };
    state.groupWeights = {};
    saveState(state);
    render();
  });

  bindTap(document.querySelector("#export-weights"), onExportWeights);

  document.querySelector("#filter").addEventListener("input", render);
  document.querySelector("#show-zero-only").addEventListener("change", render);
}

function onExportWeights() {
  downloadJson(
    () => {
      if (!catalog) {
        throw new Error("Catalog not loaded yet.");
      }
      return buildWeightsExport(resolveAllEffectiveWeights(catalog, state));
    },
    "types-weights.json"
  );
}

function render() {
  const container = document.querySelector("#weights-app");
  const scrollEl = document.querySelector(".weights-table-wrap");
  const scrollTop = scrollEl?.scrollTop ?? 0;
  const filter = document.querySelector("#filter").value.toLowerCase().trim();
  const zeroOnly = document.querySelector("#show-zero-only").checked;
  const effectiveWeights = resolveAllEffectiveWeights(catalog, state);

  const skills = catalog.skills.filter((skill) => {
    const disabled = isAxisEffectivelyDisabled(
      skill.key,
      catalog,
      state,
      effectiveWeights
    );
    if (filter && !skill.key.toLowerCase().includes(filter) && !skill.id.toLowerCase().includes(filter)) {
      return false;
    }
    if (zeroOnly && !disabled) return false;
    return true;
  });

  const zeroCount = catalog.skills.filter((skill) =>
    isAxisEffectivelyDisabled(skill.key, catalog, state, effectiveWeights)
  ).length;

  document.querySelector("#stats").innerHTML = `
    <span><strong>${skills.length}</strong> axes shown</span>
    <span><strong>${zeroCount}</strong> disabled (effective weight 0)</span>
    <span>Override cycles: <strong>Ignored</strong> → <strong>Low</strong> → <strong>High</strong></span>`;

  if (skills.length === 0) {
    container.innerHTML = `<div class="empty-notice">No axes match the current filter.</div>`;
    return;
  }

  const skillByKey = Object.fromEntries(catalog.skills.map((skill) => [skill.key, skill]));
  const skillKeys = new Set(skills.map((skill) => skill.key));

  container.innerHTML = "";
  container.appendChild(buildWeightsTable(skills, skillByKey, skillKeys, effectiveWeights, zeroOnly));
  bindWeightInputs(container);

  const newScrollEl = document.querySelector(".weights-table-wrap");
  if (newScrollEl) newScrollEl.scrollTop = scrollTop;
}

function refreshWeightUI() {
  const container = document.querySelector("#weights-app");
  if (!container) return;

  const effectiveWeights = resolveAllEffectiveWeights(catalog, state);
  updateWeightStats(effectiveWeights);

  container.querySelectorAll("input[data-key]").forEach((input) => {
    const key = input.dataset.key;
    const stored = state.weights[key] ?? catalog.weights[key] ?? 1;
    const overridden = isAxisGroupOverrideActive(key, catalog, state);
    const effective = effectiveWeights[key];

    input.value = String(stored);
    input.readOnly = overridden;
    if (overridden) {
      input.title = "Overridden by folder/group weight";
    } else {
      input.removeAttribute("title");
    }

    applyAxisWeightAppearance(input, effective, effectiveWeights, overridden);
  });

  container.querySelectorAll("input[data-group-weight]").forEach((input) => {
    const groupId = input.dataset.groupWeight;
    const { priority } = getGroupOverride(state, groupId);
    const active = isGroupOverrideApplying(state, groupId, catalog);
    const typed = parseFloat(input.value);
    const weightForColor = active
      ? (Number.isNaN(typed)
          ? appliedWeightForGroupOverride(state, groupId, catalog)
          : typed)
      : typed;
    applyFolderWeightAppearance(
      input,
      Number.isNaN(weightForColor) ? 0 : weightForColor,
      priority,
      active,
      effectiveWeights
    );
  });
}

function updateWeightStats(effectiveWeights) {
  const zeroCount = catalog.skills.filter((skill) =>
    isDisabledWeight(effectiveWeights[skill.key])
  ).length;
  const stats = document.querySelector("#stats");
  if (!stats) return;
  const spans = stats.querySelectorAll("span");
  if (spans[1]) {
    spans[1].innerHTML = `<strong>${zeroCount}</strong> disabled (effective weight 0)`;
  }
}

function buildWeightsTable(skills, skillByKey, skillKeys, effectiveWeights, zeroOnly) {
  const wrap = document.createElement("div");
  wrap.className = "weights-table-wrap";

  const table = document.createElement("table");
  table.className = "weights-table";
  table.innerHTML = `
    <colgroup>
      <col class="weights-col-key" />
      <col class="weights-col-label" />
      <col class="weights-col-weight" />
      <col class="weights-col-default" />
      <col class="weights-col-override" />
    </colgroup>
    <thead>
      <tr>
        <th class="weights-col-key">Axis key</th>
        <th class="weights-col-label">Label</th>
        <th class="weights-col-weight">Weight</th>
        <th class="weights-col-default">Default</th>
        <th class="weights-col-override">Override</th>
      </tr>
    </thead>`;

  const categories = catalog.ui_groups
    ? Object.keys(catalog.ui_groups).sort()
    : [...new Set(skills.map((skill) => skill.category[0] || "other"))].sort();

  for (const category of categories) {
    const catId = collapseId("cat", category);
    const catAxisKeys = axisKeysForCategory(catalog, category).filter((key) => skillKeys.has(key));
    const catDisabledOverride = isGroupOverrideDisabled(state, catId);
    const groups = catalog.ui_groups?.[category];

    let catSkills = skills.filter((skill) => (skill.category[0] || "other") === category);
    if (zeroOnly && catSkills.length === 0 && catDisabledOverride) {
      catSkills = catalog.skills
        .filter((skill) => (skill.category[0] || "other") === category)
        .filter((skill) =>
          isAxisEffectivelyDisabled(skill.key, catalog, state, effectiveWeights)
        );
    }
    if (!catSkills.length && !(zeroOnly && catDisabledOverride)) continue;
    const tbody = document.createElement("tbody");
    tbody.className = "collapsible-tbody collapsible-category";

    tbody.appendChild(
      makeFolderRow({
        collapseId: catId,
        groupId: catId,
        title: category,
        level: "category",
        axisKeys: catAxisKeys,
        collapsed: isCollapsed(state, catId),
        catCollapsed: isCollapsed(state, catId),
        effectiveWeights,
      })
    );

    if (groups?.length) {
      for (const group of groups) {
        const grpId = collapseId("grp", category, group.id);
        const grpDisabledOverride = isGroupOverrideDisabled(state, grpId);

        let groupSkills = group.keys
          .map((key) => skillByKey[key])
          .filter((skill) => skill && skillKeys.has(skill.key));
        if (zeroOnly && groupSkills.length === 0 && grpDisabledOverride) {
          groupSkills = group.keys
            .map((key) => skillByKey[key])
            .filter(Boolean)
            .filter((skill) =>
              isAxisEffectivelyDisabled(skill.key, catalog, state, effectiveWeights)
            );
        }
        if (!groupSkills.length && !(zeroOnly && grpDisabledOverride)) continue;

        const grpAxisKeys = group.keys.filter((key) => skillKeys.has(key));
        const grpCollapsed = isCollapsed(state, grpId);
        const catCollapsed = isCollapsed(state, catId);

        tbody.appendChild(
          makeFolderRow({
            collapseId: grpId,
            groupId: grpId,
            title: group.label,
            level: "group",
            axisKeys: grpAxisKeys,
            collapsed: grpCollapsed,
            catCollapsed,
            effectiveWeights,
          })
        );

        for (const skill of groupSkills) {
          const row = makeWeightRow(skill, effectiveWeights);
          row.hidden = catCollapsed || grpCollapsed;
          tbody.appendChild(row);
        }
      }
    } else {
      for (const skill of catSkills) {
        const row = makeWeightRow(skill, effectiveWeights);
        row.hidden = isCollapsed(state, catId);
        tbody.appendChild(row);
      }
    }

    bindCategoryTbody(tbody, catId);
    table.appendChild(tbody);
  }

  wrap.appendChild(table);
  return wrap;
}

function makeFolderRow({ collapseId: sectionId, groupId, title, level, axisKeys, collapsed, catCollapsed = false, effectiveWeights }) {
  const row = document.createElement("tr");
  row.className = `weights-folder-row weights-folder-${level}`;
  row.dataset.sectionId = sectionId;
  if (level === "group") {
    row.hidden = catCollapsed;
  }

  const { weight, priority } = getGroupOverride(state, groupId);

  row.innerHTML = `
    <td class="weights-folder-name weights-col-key" colspan="2">
      <button type="button" class="collapsible-trigger collapsible-trigger-${level}" aria-expanded="${!collapsed}">
        <span class="collapsible-chevron">${collapsed ? "▸" : "▾"}</span>
        <span class="collapsible-label">${escapeHtml(title)}</span>
      </button>
    </td>
    <td class="weights-col-weight">
      <input type="number" min="0" step="0.05" value="${weight}" data-group-weight="${escapeAttr(groupId)}" data-group-keys="${escapeAttr(axisKeys.join(","))}" />
    </td>
    <td class="weights-col-default">—</td>
    <td class="weights-col-override">
      <button type="button" class="priority-toggle priority-${priority}" data-group-id="${escapeAttr(groupId)}" data-group-keys="${escapeAttr(axisKeys.join(","))}" title="${escapeAttr(priorityTitle(priority))}">${priorityLabel(priority)}</button>
    </td>`;

  const active = isGroupOverrideApplying(state, groupId, catalog);
  const appliedWeight = active
    ? appliedWeightForGroupOverride(state, groupId, catalog)
    : weight;

  bindFolderRow(row, sectionId, groupId, axisKeys, level);
  applyFolderWeightAppearance(
    row.querySelector("[data-group-weight]"),
    appliedWeight,
    priority,
    active,
    effectiveWeights
  );
  return row;
}

function bindCategoryTbody(tbody, catId) {
  const catRow = tbody.querySelector("tr.weights-folder-category");
  const catTrigger = catRow?.querySelector(".collapsible-trigger");
  if (!catTrigger) return;

  const toggleCategory = (event) => {
    if (event.target.closest("input, .priority-toggle")) return;

    const collapsed = !isCollapsed(state, catId);
    setCollapsed(state, catId, collapsed);
    saveState(state);

    const chevron = catTrigger.querySelector(".collapsible-chevron");
    if (chevron) chevron.textContent = collapsed ? "▸" : "▾";
    catTrigger.setAttribute("aria-expanded", String(!collapsed));

    for (const row of tbody.querySelectorAll("tr")) {
      if (row === catRow) continue;
      if (row.classList.contains("weights-folder-group")) {
        row.hidden = collapsed;
        if (!collapsed) {
          const grpId = row.dataset.sectionId;
          const grpCollapsed = isCollapsed(state, grpId);
          let axis = row.nextElementSibling;
          while (axis && axis.classList.contains("weights-axis-row")) {
            axis.hidden = grpCollapsed;
            axis = axis.nextElementSibling;
          }
        }
        continue;
      }
      if (row.classList.contains("weights-axis-row")) {
        row.hidden = collapsed;
      }
    }
  };

  catTrigger.addEventListener("click", toggleCategory);
}

function bindFolderRow(row, sectionId, groupId, axisKeys, level) {
  const trigger = row.querySelector(".collapsible-trigger");
  const weightInput = row.querySelector("[data-group-weight]");
  const priorityBtn = row.querySelector(".priority-toggle");

  if (level === "group") {
    trigger?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (event.target.closest("input, .priority-toggle")) return;

      const collapsed = !isCollapsed(state, sectionId);
      setCollapsed(state, sectionId, collapsed);
      saveState(state);

      const chevron = trigger.querySelector(".collapsible-chevron");
      if (chevron) chevron.textContent = collapsed ? "▸" : "▾";
      trigger.setAttribute("aria-expanded", String(!collapsed));

      let axis = row.nextElementSibling;
      while (axis && axis.classList.contains("weights-axis-row")) {
        axis.hidden = collapsed;
        axis = axis.nextElementSibling;
      }
    });
  }

  weightInput?.addEventListener("click", (event) => event.stopPropagation());
  priorityBtn?.addEventListener("click", (event) => event.stopPropagation());

  weightInput?.addEventListener("input", () => {
    let value = parseFloat(weightInput.value);
    if (Number.isNaN(value) || value < 0) value = 0;
    setGroupOverride(state, groupId, { weight: value });
    saveState(state);
    refreshWeightUI();
  });

  weightInput?.addEventListener("change", () => {
    let value = parseFloat(weightInput.value);
    if (Number.isNaN(value) || value < 0) value = 0;
    weightInput.value = String(value);
    saveState(state);
    refreshWeightUI();
  });

  priorityBtn?.addEventListener("click", () => {
    const current = getGroupOverride(state, groupId);
    const next = cycleGroupPriority(current.priority);
    setGroupOverride(state, groupId, { priority: next });
    saveState(state);
    render();
  });
}

function makeWeightRow(skill, effectiveWeights) {
  const stored = state.weights[skill.key] ?? catalog.weights[skill.key] ?? 1;
  const effective = effectiveWeights[skill.key];
  const def = catalog.weights[skill.key] ?? 1;
  const overridden = isAxisGroupOverrideActive(skill.key, catalog, state);

  const row = document.createElement("tr");
  row.className = "weights-axis-row";
  row.dataset.key = skill.key;
  row.innerHTML = `
    <td class="axis-key weights-col-key">${escapeHtml(skill.key)}</td>
    <td class="weights-col-label">${escapeHtml(skill.id.replace(/-/g, " "))}</td>
    <td class="weights-col-weight">
      <input type="number" min="0" step="0.05" value="${stored}" data-key="${escapeAttr(skill.key)}" ${overridden ? 'readonly title="Overridden by folder/group weight"' : ""} />
    </td>
    <td class="weights-col-default">${def}</td>
    <td class="weights-col-override"></td>`;

  applyAxisWeightAppearance(
    row.querySelector("input[type='number']"),
    effective,
    effectiveWeights,
    overridden
  );
  return row;
}

function bindWeightInputs(container) {
  container.querySelectorAll("input[data-key]").forEach((input) => {
    if (input.readOnly) return;

    input.addEventListener("input", () => {
      const key = input.dataset.key;
      let value = parseFloat(input.value);
      if (Number.isNaN(value) || value < 0) value = 0;
      state.weights[key] = value;
      saveState(state);
      refreshWeightUI();
    });

    input.addEventListener("change", () => {
      let value = parseFloat(input.value);
      if (Number.isNaN(value) || value < 0) value = 0;
      input.value = String(value);
      saveState(state);
      refreshWeightUI();
    });
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

init();
