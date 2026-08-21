/** Server-backed state persistence (falls back gracefully while loading). */

const STORAGE_KEY = "manual-vectorizer-state";

export function defaultState() {
  return {
    speaker: "",
    mode: "binary",
    values: {},
    weights: null,
    groupWeights: {},
    collapsed: {},
  };
}

function mergeLoaded(base, parsed) {
  const collapsed =
    parsed.collapsed && typeof parsed.collapsed === "object" ? parsed.collapsed : {};
  return {
    ...base,
    ...parsed,
    collapsed: { ...collapsed },
    values: normalizeValues(parsed.values || {}),
    groupWeights:
      parsed.groupWeights && typeof parsed.groupWeights === "object"
        ? { ...parsed.groupWeights }
        : {},
  };
}

export async function loadState() {
  const base = defaultState();
  try {
    const res = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
    if (res.status === 401) {
      window.location.href = `/login?return=${encodeURIComponent(window.location.pathname)}`;
      return base;
    }
    if (!res.ok) throw new Error(`session HTTP ${res.status}`);
    return mergeLoaded(base, await res.json());
  } catch {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      return mergeLoaded(base, JSON.parse(raw));
    } catch {
      return base;
    }
  }
}

export async function saveState(state) {
  try {
    const res = await fetch("/api/session", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!res.ok) throw new Error(`save HTTP ${res.status}`);
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

/** @typedef {'unset'|'set'|'negative'|'partial'} BinaryState */

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function getNumericValue(value) {
  if (value === "set") return 10;
  if (value === "negative") return 0;
  if (value === "unset" || value == null) return null;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  return null;
}

/**
 * @param {Record<string, unknown>} values
 * @param {string} key
 */
export function getRankedValue(values, key) {
  return getNumericValue(values[key]);
}

/**
 * @param {Record<string, unknown>} values
 * @param {string} key
 * @returns {BinaryState}
 */
export function getBinaryState(values, key) {
  const numeric = getNumericValue(values[key]);
  if (numeric == null) return "unset";
  if (numeric === 10) return "set";
  if (numeric === 0) return "negative";
  return "partial";
}

/** @param {unknown} value */
export function isAxisSet(value) {
  return getNumericValue(value) === 10;
}

/** @param {unknown} value */
export function isAxisNegative(value) {
  return getNumericValue(value) === 0;
}

/** Cycle binary state: unset → set (10) → negative (0) → unset */
export function cycleBinaryState(current) {
  if (current === "unset") return "set";
  if (current === "set" || current === "partial") return "negative";
  return "unset";
}

/** Score for export / distance (null = omit). Mode-independent. */
export function toNumericScore(values, key, _mode) {
  return getNumericValue(values[key]);
}

export function countSetValues(values, mode, skillKeys) {
  let set = 0;
  let unset = 0;
  for (const key of skillKeys) {
    if (getNumericValue(values[key]) == null) unset++;
    else set++;
  }
  return { set, unset, total: skillKeys.length };
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, number>}
 */
export function normalizeValues(raw) {
  const values = {};
  for (const [key, value] of Object.entries(raw || {})) {
    const numeric = getNumericValue(value);
    if (numeric != null) values[key] = numeric;
  }
  return values;
}

/**
 * @param {BinaryState} state
 * @returns {number|undefined}
 */
export function binaryStateToNumeric(state) {
  if (state === "set") return 10;
  if (state === "negative") return 0;
  return undefined;
}
