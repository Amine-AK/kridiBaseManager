// The shop's suppliers (🚚 الموردين): a list kept in the shop settings
// (key "suppliers", JSON), offered in the product form of the categories
// that ask for it (`Category.hasSupplier`). Pure rules, shared by the
// screens and the tests.

import { SUPPLIERS_KEY, type Category, type Ledger, type Setting, type StockItem } from "./ledger";
import { normalizeText } from "./shop";

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  notes: string;
}

export { SUPPLIERS_KEY };

/** The suppliers saved in the shop settings (a broken value gives none). */
export function parseSuppliers(setting: Pick<Setting, "value"> | undefined): Supplier[] {
  try {
    const list: unknown = JSON.parse(setting?.value || "[]");
    if (!Array.isArray(list)) return [];
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    return list.map((x) => ({ id: str(x?.id), name: str(x?.name), phone: str(x?.phone), notes: str(x?.notes) })).filter((x) => x.id && x.name);
  } catch {
    return [];
  }
}

export const suppliersValue = (list: Supplier[]) => JSON.stringify(list);

export const suppliersOf = (ledger: Pick<Ledger, "settings">) => parseSuppliers(ledger.settings.find((s) => s.key === SUPPLIERS_KEY));

/** Does the product form ask for the supplier in this category? */
export const asksSupplier = (categories: Pick<Category, "name" | "hasSupplier">[], category: string) =>
  Boolean(categories.find((c) => c.name === category)?.hasSupplier);

/** The same name already in the list (case and spaces ignored), other than `exceptId`. */
export function sameName(list: Supplier[], name: string, exceptId = ""): Supplier | undefined {
  const key = normalizeText(name);
  return key ? list.find((s) => s.id !== exceptId && normalizeText(s.name) === key) : undefined;
}

/**
 * Names for the supplier filter of the stock: the list's, then the ones typed
 * on products only (not in the list), each once, in the list's order then A→Z.
 */
export function supplierNames(list: Supplier[], stock: Pick<StockItem, "supplier">[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (n: string) => {
    const key = normalizeText(n);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(n.trim());
    }
  };
  list.forEach((s) => add(s.name));
  const typed = stock.map((s) => (s.supplier ?? "").trim()).filter((n) => n && !seen.has(normalizeText(n)));
  [...new Set(typed)].sort((a, b) => a.localeCompare(b, "ar")).forEach(add);
  return out;
}

/** Products of this supplier (same name, case and spaces ignored). "" keeps everything. */
export function bySupplier<T extends Pick<StockItem, "supplier">>(stock: T[], name: string): T[] {
  const key = normalizeText(name);
  return key ? stock.filter((s) => normalizeText(s.supplier ?? "") === key) : stock;
}
