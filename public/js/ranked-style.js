/** Ranked-mode colors from score 0–10. */

const LOW = [240, 113, 120];
const HIGH = [61, 214, 140];

/**
 * @param {number} value 0–10
 * @returns {string}
 */
export function rankColorForValue(value) {
  const t = Math.max(0, Math.min(10, value)) / 10;
  const channels = LOW.map((low, index) =>
    Math.round(low + (HIGH[index] - LOW[index]) * t)
  );
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

/**
 * @param {HTMLElement} btn
 * @param {number|null} value
 */
export function applyRankedAppearance(btn, value) {
  if (value == null || Number.isNaN(value)) {
    btn.classList.remove("rank-has-value");
    btn.style.removeProperty("--rank-color");
    btn.style.removeProperty("--rank-fill");
    return;
  }

  const color = rankColorForValue(value);
  const fill = `${Math.max(0, Math.min(100, (value / 10) * 100))}%`;

  btn.classList.add("rank-has-value");
  btn.style.setProperty("--rank-color", color);
  btn.style.setProperty("--rank-fill", fill);
}
