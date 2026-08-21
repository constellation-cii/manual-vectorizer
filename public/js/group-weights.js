/** Group/folder weight overrides with tri-state priority. */

import { collapseId } from "./collapsible.js";

/** @typedef {'ignored'|'high'|'low'} GroupPriority */

const PRIORITY_CYCLE = /** @type {const} */ (["ignored", "low", "high"]);

/**
 * @param {GroupPriority} current
 * @returns {GroupPriority}
 */
export function cycleGroupPriority(current) {
  const index = PRIORITY_CYCLE.indexOf(current);
  return PRIORITY_CYCLE[(index + 1) % PRIORITY_CYCLE.length];
}

/**
 * @param {object} state
 * @param {string} groupId
 */
export function getGroupOverride(state, groupId) {
  const entry = state.groupWeights?.[groupId];
  if (!entry) {
    return { weight: 1, priority: "ignored" };
  }
  return {
    weight: normalizeWeight(entry.weight, 1),
    priority: PRIORITY_CYCLE.includes(entry.priority) ? entry.priority : "ignored",
  };
}

/**
 * @param {object} state
 * @param {string} groupId
 * @param {{ weight?: number, priority?: GroupPriority }} patch
 */
export function setGroupOverride(state, groupId, patch) {
  if (!state.groupWeights) state.groupWeights = {};
  const current = getGroupOverride(state, groupId);
  state.groupWeights[groupId] = {
    weight: patch.weight ?? current.weight,
    priority: patch.priority ?? current.priority,
  };
}

/**
 * @param {object} skill
 * @param {object} catalog
 * @returns {string[]}
 */
export function overridePathForSkill(skill, catalog) {
  const category = skill.category[0] || "other";
  const path = [collapseId("cat", category)];

  const groups = catalog.ui_groups?.[category];
  if (!groups?.length) return path;

  const group = groups.find((entry) => entry.keys.includes(skill.key));
  if (group) path.push(collapseId("grp", category, group.id));

  return path;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
export function normalizeWeight(value, fallback = 1) {
  if (value == null || value === "") return fallback;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const parsed = Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * @param {unknown} value
 */
export function isDisabledWeight(value) {
  return normalizeWeight(value, 1) <= 0;
}

/**
 * The first active (non-ignored) override on the path parent → child wins.
 * @param {string} axisKey
 * @param {object} catalog
 * @param {object} state
 * @returns {string|null}
 */
export function winningOverrideGroupId(axisKey, catalog, state) {
  const skill = catalog.skills.find((entry) => entry.key === axisKey);
  if (!skill) return null;

  for (const groupId of overridePathForSkill(skill, catalog)) {
    const { priority } = getGroupOverride(state, groupId);
    if (priority !== "ignored") return groupId;
  }

  return null;
}

/**
 * @param {string} axisKey
 * @param {object} catalog
 * @param {object} state
 */
export function effectiveWeightForAxis(axisKey, catalog, state) {
  const skill = catalog.skills.find((entry) => entry.key === axisKey);
  if (!skill) {
    return normalizeWeight(
      state.weights?.[axisKey] ?? catalog.weights?.[axisKey],
      1
    );
  }

  const individual = normalizeWeight(
    state.weights?.[axisKey] ?? catalog.weights?.[axisKey],
    1
  );

  for (const groupId of overridePathForSkill(skill, catalog)) {
    const { weight, priority } = getGroupOverride(state, groupId);
    if (priority !== "ignored") {
      return normalizeWeight(weight, 1);
    }
  }

  return individual;
}

/**
 * True when a folder/group override is actively controlling this axis.
 * @param {string} axisKey
 * @param {object} catalog
 * @param {object} state
 */
export function isAxisGroupOverrideActive(axisKey, catalog, state) {
  return winningOverrideGroupId(axisKey, catalog, state) !== null;
}

/**
 * @param {object} state
 * @param {string} groupId
 * @param {object} catalog
 */
export function isGroupOverrideApplying(state, groupId, catalog) {
  for (const skill of catalog.skills) {
    if (winningOverrideGroupId(skill.key, catalog, state) === groupId) {
      return true;
    }
  }
  return false;
}

/**
 * Axes whose effective weight comes from this group override.
 * @param {object} state
 * @param {string} groupId
 * @param {object} catalog
 */
export function countAxesForGroupOverride(state, groupId, catalog) {
  let count = 0;
  for (const skill of catalog.skills) {
    if (winningOverrideGroupId(skill.key, catalog, state) === groupId) {
      count += 1;
    }
  }
  return count;
}

/**
 * Effective weight applied by this winning override (if any).
 * @param {object} state
 * @param {string} groupId
 * @param {object} catalog
 */
export function appliedWeightForGroupOverride(state, groupId, catalog) {
  for (const skill of catalog.skills) {
    if (winningOverrideGroupId(skill.key, catalog, state) === groupId) {
      return effectiveWeightForAxis(skill.key, catalog, state);
    }
  }
  return getGroupOverride(state, groupId).weight;
}

/**
 * @param {object} catalog
 * @param {object} state
 * @returns {Record<string, number>}
 */
export function resolveAllEffectiveWeights(catalog, state) {
  const weights = { ...catalog.weights, ...(state.weights || {}) };
  for (const skill of catalog.skills) {
    weights[skill.key] = effectiveWeightForAxis(skill.key, catalog, state);
  }
  return weights;
}

/**
 * @param {object} state
 * @param {string} groupId
 */
export function isGroupOverrideDisabled(state, groupId) {
  const { weight, priority } = getGroupOverride(state, groupId);
  return priority !== "ignored" && isDisabledWeight(weight);
}

/**
 * True when an axis is disabled after applying folder/group overrides.
 * @param {string} axisKey
 * @param {object} catalog
 * @param {object} state
 * @param {Record<string, number>} [effectiveWeights]
 */
export function isAxisEffectivelyDisabled(axisKey, catalog, state, effectiveWeights) {
  const weights = effectiveWeights ?? resolveAllEffectiveWeights(catalog, state);
  return isDisabledWeight(weights[axisKey]);
}

/**
 * @param {object} catalog
 * @param {string} category
 * @returns {string[]}
 */
export function axisKeysForCategory(catalog, category) {
  return catalog.skills
    .filter((skill) => (skill.category[0] || "other") === category)
    .map((skill) => skill.key);
}

/**
 * @param {GroupPriority} priority
 */
export function priorityLabel(priority) {
  if (priority === "high") return "High";
  if (priority === "low") return "Low";
  return "Ignored";
}

/**
 * @param {GroupPriority} priority
 */
export function priorityTitle(priority) {
  if (priority === "high") return "High — override active; parent folder wins over child when both are set";
  if (priority === "low") return "Low — override active; parent folder wins over child when both are set";
  return "Ignored — per-axis weights only";
}
