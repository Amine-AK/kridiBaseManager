// The order of the main tabs (الكريدي, البيع, المخزون…), chosen in ⚙️ «↕️ ترتيب الأقسام».
// Kept on the device (localStorage `tab-order`): each phone / PC its own order.
// The first tab is also the one the app opens on.

export const TAB_ORDER_KEY = "tab-order";

/**
 * The tabs in the saved order. Tabs the saved order doesn't know (added in a
 * newer version) come after, in their default order; saved names that no
 * longer exist (or that this account can't open) are skipped.
 */
export function orderTabs<T extends { value: string }>(tabs: readonly T[], saved: readonly string[]): T[] {
  const rank = new Map(saved.map((v, i) => [v, i]));
  return [...tabs].sort((a, b) => (rank.get(a.value) ?? saved.length + tabs.indexOf(a)) - (rank.get(b.value) ?? saved.length + tabs.indexOf(b)));
}

/** Moves the tab at `index` one place up (-1) or down (+1); the list as it was at the edges. */
export function moveTab<T>(list: readonly T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function readTabOrder(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveTabOrder(order: string[]) {
  try {
    if (order.length) localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(order));
    else localStorage.removeItem(TAB_ORDER_KEY);
  } catch {}
}
