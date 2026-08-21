/** Sheet list, switcher, and nav links. */

export async function fetchSheets() {
  const res = await fetch("/api/sheets", { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new Error(`sheets HTTP ${res.status}`);
  return res.json();
}

export async function fetchWorkspace() {
  const res = await fetch("/api/workspace", { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new Error(`workspace HTTP ${res.status}`);
  return res.json();
}

export async function switchSheet(sheetId) {
  const res = await fetch("/api/workspace/switch-sheet", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheet_id: sheetId }),
  });
  if (!res.ok) throw new Error(`switch HTTP ${res.status}`);
  return res.json();
}

export async function createSheet(name, forkFromId = null) {
  const res = await fetch("/api/sheets", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, fork_from_id: forkFromId }),
  });
  if (!res.ok) throw new Error(`create sheet HTTP ${res.status}`);
  return res.json();
}

export async function deleteSheet(sheetId) {
  const res = await fetch(`/api/sheets/${sheetId}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `delete HTTP ${res.status}`);
  return data;
}

export function initSheetSwitcher(container) {
  if (!container || container.querySelector(".sheet-switcher")) return;

  const wrap = document.createElement("div");
  wrap.className = "sheet-switcher";
  const label = document.createElement("label");
  label.textContent = "Sheet ";
  label.className = "sheet-switcher-label";
  const select = document.createElement("select");
  select.className = "sheet-switcher-select";
  select.title = "Active vector sheet";
  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "btn btn-sm";
  newBtn.textContent = "+";
  newBtn.title = "New sheet";

  wrap.append(label, select, newBtn);
  container.prepend(wrap);

  async function refresh() {
    const [sheets, workspace] = await Promise.all([fetchSheets(), fetchWorkspace()]);
    select.innerHTML = "";
    for (const sheet of sheets) {
      const opt = document.createElement("option");
      opt.value = String(sheet.id);
      opt.textContent = sheet.is_master ? `${sheet.name} (master)` : sheet.name;
      if (sheet.id === workspace.active_sheet_id) opt.selected = true;
      select.appendChild(opt);
    }
  }

  select.addEventListener("change", async () => {
    await switchSheet(Number(select.value));
    window.location.reload();
  });

  newBtn.addEventListener("click", async () => {
    const name = window.prompt("New sheet name:");
    if (!name) return;
    const sheet = await createSheet(name, Number(select.value) || null);
    await switchSheet(sheet.id);
    window.location.reload();
  });

  refresh().catch(() => {});
}

export function addToolNav(nav) {
  if (!nav || nav.dataset.toolsNav || nav.querySelector('a[href="/edit.html"]')) return;
  nav.dataset.toolsNav = "1";
  const links = [
    { href: "/edit.html", text: "Edit" },
    { href: "/log.html", text: "Log" },
  ];
  for (const { href, text } of links) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    if (window.location.pathname === href) a.classList.add("active");
    nav.appendChild(a);
  }
}
