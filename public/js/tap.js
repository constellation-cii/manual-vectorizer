/** Reliable tap/click binding for mobile browsers. */

/**
 * @param {HTMLElement | null} element
 * @param {() => void} handler
 */
export function bindTap(element, handler) {
  if (!element) return;

  let lastRun = 0;

  const run = (event) => {
    if (event.type === "pointerup" && event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const now = Date.now();
    if (now - lastRun < 500) return;
    lastRun = now;

    event.preventDefault();
    handler();
  };

  element.addEventListener("pointerup", run);
  element.addEventListener("click", run);
}
