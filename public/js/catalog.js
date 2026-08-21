/** Load catalog from the authenticated API. */

/**
 * @returns {Promise<object>}
 */
export async function loadCatalog() {
  const res = await fetch("/api/catalog", { credentials: "same-origin", cache: "no-store" });
  if (res.status === 401) {
    window.location.href = `/login?return=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Login required");
  }
  if (!res.ok) {
    throw new Error(`catalog HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * @param {object} catalog
 * @param {string} elementId
 */
export function showCatalogSource(catalog, elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const host = catalog.built_on || "server catalog";
  const when = catalog.built_at ? new Date(catalog.built_at).toLocaleString() : "unknown time";
  const count = catalog.skill_count ?? catalog.skills?.length ?? "?";

  el.textContent = `Catalog: ${host} · ${count} skills · ${when}`;
}
