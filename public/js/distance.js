/** Type distance scoring — mirrors de-vector DistanceCalculator. */

import { resolveAllEffectiveWeights } from "./group-weights.js";
import { toNumericScore } from "./state.js";

const SCORE_SCALE = 10;

/**
 * @param {Record<string, number|null|undefined>} weights
 * @param {string} axis
 * @returns {number|null} null when axis should be ignored
 */
export function weightFor(weights, axis) {
  if (!Object.prototype.hasOwnProperty.call(weights, axis)) {
    return 1;
  }
  const value = weights[axis];
  if (value == null || value <= 0) {
    return null;
  }
  return value;
}

/**
 * @param {object} catalog
 * @param {Record<string, *>} values
 * @param {'binary'|'ranked'} mode
 * @returns {Record<string, number>}
 */
export function buildRankings(catalog, values, mode) {
  const rankings = {};
  for (const skill of catalog.skills) {
    const score = toNumericScore(values, skill.key, mode);
    if (score !== null) {
      rankings[skill.key] = Math.round(score * 100) / 100;
    }
  }
  return rankings;
}

/**
 * @param {object} catalog
 * @param {object|null|undefined} stateOrWeights
 * @returns {Record<string, number>}
 */
export function resolveWeights(catalog, stateOrWeights) {
  if (stateOrWeights && typeof stateOrWeights === "object" && "groupWeights" in stateOrWeights) {
    return resolveAllEffectiveWeights(catalog, stateOrWeights);
  }

  const weights = { ...catalog.weights };
  if (stateOrWeights) {
    for (const [key, value] of Object.entries(stateOrWeights)) {
      weights[key] = value;
    }
  }
  return weights;
}

/**
 * @param {Record<string, number>} rankings
 * @param {{ id: string, name: string, meta?: object, ideals: Record<string, number> }} type
 * @param {Record<string, number>} weights
 */
function scoreType(type, rankings, weights) {
  let totalWeightedSqDiff = 0;
  let effectiveCount = 0;
  const contributions = {};

  for (const [axis, ideal] of Object.entries(type.ideals)) {
    const weight = weightFor(weights, axis);
    if (weight == null) continue;

    const ranking = rankings[axis];
    if (ranking == null) continue;

    const contrib = (ranking - ideal) ** 2 * weight;
    contributions[axis] = Math.round(contrib * 1_000_000) / 1_000_000;
    totalWeightedSqDiff += contrib;
    effectiveCount += 1;
  }

  if (effectiveCount === 0) {
    return null;
  }

  const rmse = Math.sqrt(totalWeightedSqDiff / effectiveCount);
  const matchPercent = Math.round(100 * (1 - Math.min(rmse / SCORE_SCALE, 1)));

  return {
    id: type.id,
    name: type.name,
    meta: type.meta || {},
    rmse: Math.round(rmse * 1_000_000) / 1_000_000,
    match_percent: matchPercent,
    total_weighted_sqdiff: Math.round(totalWeightedSqDiff * 1_000_000) / 1_000_000,
    axes_compared: effectiveCount,
    contributions,
  };
}

/**
 * @param {Record<string, number>} rankings
 * @param {object[]} types
 * @param {Record<string, number>} weights
 */
export function distancesFor(rankings, types, weights) {
  const results = types
    .map((type) => scoreType(type, rankings, weights))
    .filter(Boolean);

  results.sort((a, b) => {
    if (a.rmse !== b.rmse) return a.rmse - b.rmse;
    return a.id.localeCompare(b.id);
  });

  assignCompetitionRanks(results);

  return results;
}

/** Same RMSE → same rank; next rank skips (1, 1, 3, …). */
function assignCompetitionRanks(results) {
  for (let i = 0; i < results.length; i++) {
    results[i].rank = i === 0 || results[i].rmse !== results[i - 1].rmse ? i + 1 : results[i - 1].rank;
  }
}

/** All types tied for the lowest RMSE (rank 1). */
export function bestMatches(distances) {
  if (distances.length === 0) return [];
  const bestRmse = distances[0].rmse;
  return distances.filter((row) => row.rmse === bestRmse);
}

/**
 * @param {Record<string, number>} contributions
 * @param {number} limit
 */
export function topContributions(contributions, limit = 8) {
  return Object.entries(contributions)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
}
