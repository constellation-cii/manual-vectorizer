/** Collapsible section state and DOM helpers. */

export function isCollapsed(state, id) {
  return state.collapsed?.[id] === true;
}

export function setCollapsed(state, id, collapsed) {
  if (!state.collapsed) state.collapsed = {};
  if (collapsed) state.collapsed[id] = true;
  else delete state.collapsed[id];
}

export function collapseId(kind, ...parts) {
  return `${kind}:${parts.join(":")}`;
}

/**
 * @param {object} opts
 * @param {string} opts.id
 * @param {string} opts.title
 * @param {"category"|"group"} opts.level
 * @param {object} opts.state
 * @param {() => void} opts.saveState
 * @param {HTMLElement} opts.bodyEl - element to show/hide
 */
export function bindCollapsible({ id, title, level, state, saveState, bodyEl }) {
  const wrap = document.createElement("div");
  wrap.className = `collapsible collapsible-${level}`;
  if (isCollapsed(state, id)) wrap.classList.add("is-collapsed");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = `collapsible-trigger collapsible-trigger-${level}`;
  trigger.dataset.collapseId = id;
  trigger.setAttribute("aria-expanded", String(!isCollapsed(state, id)));

  const chevron = document.createElement("span");
  chevron.className = "collapsible-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = isCollapsed(state, id) ? "▸" : "▾";

  const label = document.createElement("span");
  label.className = "collapsible-label";
  label.textContent = title;

  trigger.append(chevron, label);
  bodyEl.classList.add("collapsible-body");

  trigger.addEventListener("click", () => {
    const collapsed = wrap.classList.toggle("is-collapsed");
    setCollapsed(state, id, collapsed);
    saveState();
    chevron.textContent = collapsed ? "▸" : "▾";
    trigger.setAttribute("aria-expanded", String(!collapsed));
  });

  wrap.append(trigger, bodyEl);
  return wrap;
}

/**
 * Collapsible tbody: first row is trigger, remaining rows are content.
 * @param {object} opts
 * @param {string} opts.id
 * @param {string} opts.title
 * @param {"category"|"group"} opts.level
 * @param {object} opts.state
 * @param {() => void} opts.saveState
 * @param {() => HTMLTableRowElement[]} opts.renderRows
 */
export function buildCollapsibleTbody({ id, title, level, state, saveState, renderRows }) {
  const tbody = document.createElement("tbody");
  tbody.className = `collapsible-tbody collapsible-${level}`;
  if (isCollapsed(state, id)) tbody.classList.add("is-collapsed");

  const triggerRow = document.createElement("tr");
  triggerRow.className = "collapsible-trigger-row";

  const triggerCell = document.createElement("td");
  triggerCell.colSpan = 4;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = `collapsible-trigger collapsible-trigger-${level}`;
  trigger.dataset.collapseId = id;
  trigger.setAttribute("aria-expanded", String(!isCollapsed(state, id)));

  const chevron = document.createElement("span");
  chevron.className = "collapsible-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = isCollapsed(state, id) ? "▸" : "▾";

  const label = document.createElement("span");
  label.className = "collapsible-label";
  label.textContent = title;

  trigger.append(chevron, label);
  triggerCell.appendChild(trigger);
  triggerRow.appendChild(triggerCell);
  tbody.appendChild(triggerRow);

  for (const row of renderRows()) {
    tbody.appendChild(row);
  }

  trigger.addEventListener("click", () => {
    const collapsed = tbody.classList.toggle("is-collapsed");
    setCollapsed(state, id, collapsed);
    saveState();
    chevron.textContent = collapsed ? "▸" : "▾";
    trigger.setAttribute("aria-expanded", String(!collapsed));
  });

  return tbody;
}
