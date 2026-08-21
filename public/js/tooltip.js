/** Skill body tooltip — hover on desktop, long-press panel on touch. */

let tooltipEl = null;
let backdropEl = null;
let hideTimer = null;
let longPressTimer = null;
let longPressTriggered = false;
let touchDevice = false;

const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 12;

function detectTouchDevice() {
  touchDevice =
    window.matchMedia("(pointer: coarse)").matches ||
    "ontouchstart" in window;
}

detectTouchDevice();
window.matchMedia("(pointer: coarse)").addEventListener("change", detectTouchDevice);

function ensureTooltip() {
  if (!tooltipEl) {
    backdropEl = document.createElement("div");
    backdropEl.className = "tooltip-backdrop";
    backdropEl.hidden = true;
    backdropEl.addEventListener("click", () => hide(true));

    tooltipEl = document.createElement("div");
    tooltipEl.className = "tooltip";
    tooltipEl.hidden = true;
    tooltipEl.setAttribute("role", "dialog");
    tooltipEl.setAttribute("aria-modal", "true");

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tooltip-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      hide();
    });

    tooltipEl.appendChild(closeBtn);

    document.body.appendChild(backdropEl);
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

/**
 * @param {HTMLElement} anchor
 * @param {{ key: string, name: string, body: string }} skill
 */
export function attachTooltip(anchor, skill) {
  if (touchDevice) {
    attachTouchTooltip(anchor, skill);
    return;
  }

  anchor.addEventListener("mouseenter", (event) => showDesktop(event, skill));
  anchor.addEventListener("mousemove", (event) => positionDesktop(event));
  anchor.addEventListener("mouseleave", hide);
  anchor.addEventListener("focus", (event) => showDesktop(event, skill));
  anchor.addEventListener("blur", hide);
}

function isSliderTouch(target) {
  return Boolean(target.closest('input[type="range"]'));
}

/**
 * @param {HTMLElement} anchor
 * @param {{ key: string, body: string }} skill
 */
function attachTouchTooltip(anchor, skill) {
  let startX = 0;
  let startY = 0;

  const clearLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  anchor.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1 || isSliderTouch(event.target)) return;
      longPressTriggered = false;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      clearLongPress();
      longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        showMobile(skill);
      }, LONG_PRESS_MS);
    },
    { passive: true }
  );

  anchor.addEventListener(
    "touchmove",
    (event) => {
      if (isSliderTouch(event.target)) return;
      if (!longPressTimer || event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
        clearLongPress();
      }
    },
    { passive: true }
  );

  anchor.addEventListener("touchend", clearLongPress);
  anchor.addEventListener("touchcancel", clearLongPress);

  anchor.addEventListener(
    "click",
    (event) => {
      if (!longPressTriggered) return;
      event.preventDefault();
      event.stopPropagation();
      longPressTriggered = false;
    },
    true
  );
}

/**
 * @param {{ key: string, body: string }} skill
 */
function showMobile(skill) {
  clearTimeout(hideTimer);
  const el = ensureTooltip();
  el.classList.add("tooltip-mobile");
  el.innerHTML = `
    <button type="button" class="tooltip-close" aria-label="Close">×</button>
    <div class="tooltip-title">${escapeHtml(skill.key)}</div>
    <div class="tooltip-body">${escapeHtml(skill.body)}</div>`;

  el.querySelector(".tooltip-close")?.addEventListener("click", (event) => {
    event.stopPropagation();
    hide(true);
  });

  if (backdropEl) backdropEl.hidden = false;
  el.hidden = false;
  document.body.classList.add("tooltip-open");
}

/**
 * @param {Event} event
 * @param {{ key: string, body: string }} skill
 */
function showDesktop(event, skill) {
  clearTimeout(hideTimer);
  const el = ensureTooltip();
  el.classList.remove("tooltip-mobile");
  el.innerHTML = `
    <div class="tooltip-title">${escapeHtml(skill.key)}</div>
    <div class="tooltip-body">${escapeHtml(skill.body)}</div>`;

  if (backdropEl) backdropEl.hidden = true;
  el.hidden = false;
  document.body.classList.remove("tooltip-open");
  positionDesktop(event);
}

function hide(immediate = false) {
  clearTimeout(hideTimer);
  const run = () => {
    if (tooltipEl) {
      tooltipEl.hidden = true;
      tooltipEl.classList.remove("tooltip-mobile");
    }
    if (backdropEl) backdropEl.hidden = true;
    document.body.classList.remove("tooltip-open");
    longPressTriggered = false;
  };

  if (immediate) {
    run();
    return;
  }

  hideTimer = setTimeout(run, 80);
}

/**
 * @param {Event} event
 */
function positionDesktop(event) {
  if (!tooltipEl || tooltipEl.hidden || tooltipEl.classList.contains("tooltip-mobile")) {
    return;
  }

  const pad = 12;
  const rect = tooltipEl.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;

  if (x + rect.width > window.innerWidth - pad) {
    x = event.clientX - rect.width - pad;
  }
  if (y + rect.height > window.innerHeight - pad) {
    y = event.clientY - rect.height - pad;
  }

  tooltipEl.style.left = `${Math.max(pad, x)}px`;
  tooltipEl.style.top = `${Math.max(pad, y)}px`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
