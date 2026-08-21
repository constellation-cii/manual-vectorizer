/** Binary mode constraint logic — grey out invalid options. */

import { isAxisSet, isAxisNegative } from "./state.js";

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} values
 * @param {string} targetKey
 * @returns {boolean}
 */
export function isDisabled(catalog, values, targetKey) {
  const current = values[targetKey];
  if (isAxisSet(current) || isAxisNegative(current)) return false;

  const membership = catalog.group_membership || {};
  const groups = catalog.exclusive_groups || {};
  const polePairs = catalog.pole_pairs || {};

  const groupId = membership[targetKey];
  if (groupId && groups[groupId]) {
    for (const member of groups[groupId]) {
      if (member !== targetKey && isAxisSet(values[member])) return true;
    }
  }

  const opposite = polePairs[targetKey];
  if (opposite && isAxisSet(values[opposite])) return true;

  return false;
}

/**
 * @param {object} catalog
 * @param {Record<string, unknown>} values
 * @returns {Set<string>}
 */
export function disabledKeys(catalog, values) {
  const disabled = new Set();
  for (const skill of catalog.skills) {
    if (isDisabled(catalog, values, skill.key)) disabled.add(skill.key);
  }
  return disabled;
}

/**
 * When setting a key in binary mode, clear conflicting set states.
 * @param {object} catalog
 * @param {Record<string, unknown>} values
 * @param {string} key
 * @param {'unset'|'set'|'negative'} newState
 * @returns {Record<string, number>}
 */
export function applyBinarySet(catalog, values, key, newState) {
  const next = { ...normalizeNumericValues(values) };

  if (newState === "unset") {
    delete next[key];
  } else if (newState === "set") {
    next[key] = 10;
  } else if (newState === "negative") {
    next[key] = 0;
  }

  if (newState !== "set") return next;

  const membership = catalog.group_membership || {};
  const groups = catalog.exclusive_groups || {};
  const polePairs = catalog.pole_pairs || {};

  const groupId = membership[key];
  if (groupId && groups[groupId]) {
    for (const member of groups[groupId]) {
      if (member !== key && isAxisSet(next[member])) delete next[member];
    }
  }

  const opposite = polePairs[key];
  if (opposite && isAxisSet(next[opposite])) delete next[opposite];

  return next;
}

/**
 * @param {Record<string, unknown>} values
 * @returns {Record<string, number>}
 */
function normalizeNumericValues(values) {
  const out = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === "set") out[key] = 10;
    else if (value === "negative") out[key] = 0;
    else if (typeof value === "number" && !Number.isNaN(value)) out[key] = value;
  }
  return out;
}
