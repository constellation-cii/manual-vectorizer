/** Weight impact colors — log-scaled weight relative to max (0 = red, 1 = green). */

import { isDisabledWeight, normalizeWeight } from "./group-weights.js";

const RED = [255, 0, 0];
const YELLOW = [230, 195, 85];
const GREEN = [0, 255, 0];

/** More spread between mid-range values (e.g. 0.9 vs 0.5 vs 0.2). */
const LOG_K = 4;

/**
 * @param {Record<string, number>} effectiveWeights
 */
export function maxEffectiveWeight(effectiveWeights) {
  const positives = Object.values(effectiveWeights).filter((weight) => weight > 0);
  if (positives.length === 0) return 1;
  return Math.max(...positives);
}

/**
 * 0–1: this weight relative to the strongest effective weight in the catalog.
 * Equal weights → same ratio → same color.
 * @param {number} weight
 * @param {Record<string, number>} effectiveWeights
 */
export function relativeToMaxWeight(weight, effectiveWeights) {
  const value = normalizeWeight(weight, 0);
  if (value <= 0) return 0;

  const max = maxEffectiveWeight(effectiveWeights);
  if (max <= 0) return 0;

  return Math.min(1, value / max);
}

/**
 * Log-scaled 0–1 → color position.
 * @param {number} relative 0–1
 * @returns {number} 0–1
 */
export function relativeToColorRatio(relative) {
  const s = Math.max(0, Math.min(1, relative));
  if (s <= 0) return 0;
  if (s >= 1) return 1;
  return Math.log1p(s * LOG_K) / Math.log1p(LOG_K);
}

/**
 * @param {[number, number, number]} from
 * @param {[number, number, number]} to
 * @param {number} t
 */
function mixRgb(from, to, t) {
  const u = Math.max(0, Math.min(1, t));
  return from.map((channel, index) =>
    Math.round(channel + (to[index] - channel) * u)
  );
}

/**
 * @param {number} ratio 0–1
 * @returns {string}
 */
export function weightColorForRatio(ratio) {
  const t = Math.max(0, Math.min(1, ratio));
  const channels =
    t <= 0.5
      ? mixRgb(RED, YELLOW, t / 0.5)
      : mixRgb(YELLOW, GREEN, (t - 0.5) / 0.5);
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

/**
 * @param {number} weight
 * @param {Record<string, number>} effectiveWeights
 * @returns {string}
 */
export function weightColorForWeight(weight, effectiveWeights) {
  if (isDisabledWeight(weight)) return weightColorForRatio(0);
  const relative = relativeToMaxWeight(weight, effectiveWeights);
  return weightColorForRatio(relativeToColorRatio(relative));
}

/**
 * @param {HTMLElement} input
 */
export function applyAxisOverrideAppearance(input) {
  if (!input) return;

  input.classList.remove("weight-inert", "weight-disabled", "weight-impact");
  input.classList.add("weight-overridden");
  input.style.removeProperty("--weight-color");
}

/**
 * @param {HTMLElement} input
 * @param {number} effectiveWeight
 * @param {Record<string, number>} effectiveWeights
 * @param {boolean} overridden
 */
export function applyAxisWeightAppearance(input, effectiveWeight, effectiveWeights, overridden) {
  if (!input) return;

  input.classList.remove("weight-overridden", "weight-inert", "weight-disabled", "weight-impact");
  input.style.removeProperty("--weight-color");

  if (overridden) {
    applyAxisOverrideAppearance(input);
    return;
  }

  if (isDisabledWeight(effectiveWeight)) {
    input.classList.add("weight-disabled");
    input.style.setProperty("--weight-color", weightColorForRatio(0));
    return;
  }

  const color = weightColorForWeight(effectiveWeight, effectiveWeights);
  input.classList.add("weight-impact");
  input.style.setProperty("--weight-color", color);
}

/**
 * Active folder/group rows use the same rule as a single vector at that weight.
 * @param {HTMLElement} input
 * @param {number} weight
 * @param {'ignored'|'high'|'low'} priority
 * @param {boolean} active
 * @param {Record<string, number>} effectiveWeights
 */
export function applyFolderWeightAppearance(input, weight, priority, active, effectiveWeights) {
  if (!input) return;

  input.classList.remove("weight-inert", "weight-disabled", "weight-impact", "weight-overridden");
  input.style.removeProperty("--weight-color");

  if (priority === "ignored" || !active) {
    input.classList.add("weight-inert");
    return;
  }

  if (isDisabledWeight(weight)) {
    input.classList.add("weight-disabled");
    input.style.setProperty("--weight-color", weightColorForRatio(0));
    return;
  }

  const color = weightColorForWeight(weight, effectiveWeights);
  input.classList.add("weight-impact");
  input.style.setProperty("--weight-color", color);
}
