/**
 * Build vectorizer state.values from a type's ideals (always numeric 0–10).
 * @param {{ ideals: Record<string, number> }} type
 * @returns {Record<string, number>}
 */
export function valuesFromTypeIdeals(type) {
  const values = {};

  for (const [axis, ideal] of Object.entries(type.ideals || {})) {
    values[axis] = ideal;
  }

  return values;
}

/**
 * @param {object} catalog
 * @param {string} typeId
 * @returns {object|undefined}
 */
export function findType(catalog, typeId) {
  return catalog.types?.find((type) => type.id === typeId);
}
