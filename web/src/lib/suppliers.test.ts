import { describe, expect, it } from "vitest";
import { applyOp, emptyLedger, type Ledger, type LedgerOp, type StockItem } from "./ledger";
import { HEADERS, ledgerToRows, rowsToLedger, TABS } from "./ledger-sheet";
import { searchStock } from "./shop";
import { asksSupplier, bySupplier, parseSuppliers, sameName, supplierNames, SUPPLIERS_KEY, suppliersOf, suppliersValue, type Supplier } from "./suppliers";

let n = 0;
const op = (body: object): LedgerOp => ({ opId: `O-SUPP${String(++n).padStart(4, "0")}`, at: `2026-11-20T10:00:${String(n % 60).padStart(2, "0")}.000Z`, ...body }) as LedgerOp;
function run(l: Ledger, body: object) {
  const r = applyOp(l, op(body));
  expect(r.result).toBe("ok");
  return r.ledger;
}

const AT = "2026-11-20T09:00:00.000Z";
const fridge: StockItem = {
  id: "I-FRIDGE01", item: "ثلاجة Samsung 400L", category: "كهرومنزلي كبير", condition: "جديد", buyPrice: 5000, sellPrice: 6200,
  quantity: 2, serial: "", codes: [], notes: "", createdAt: AT, updatedAt: AT, supplier: "Electro Plus",
};
const cable: StockItem = { ...fridge, id: "I-CABLE001", item: "كابل HDMI", category: "إكسسوارات وكابلات", supplier: undefined };

const list: Supplier[] = [
  { id: "a1", name: "Electro Plus", phone: "0612345678", notes: "" },
  { id: "b2", name: "مخزن الشمال", phone: "", notes: "كيوصل نهار الثلاثاء" },
];

describe("suppliers list (shop setting)", () => {
  it("reads back what it writes, and gives nothing for a broken value", () => {
    expect(parseSuppliers({ value: suppliersValue(list) })).toEqual(list);
    expect(parseSuppliers(undefined)).toEqual([]);
    expect(parseSuppliers({ value: "{oops" })).toEqual([]);
    expect(parseSuppliers({ value: '[{"id":"x","name":"  "},{"id":"y","name":" A ","phone":5}]' })).toEqual([{ id: "y", name: "A", phone: "", notes: "" }]);
  });

  it("is saved with setting.save under its key", () => {
    const l = run(emptyLedger(), { type: "setting.save", key: SUPPLIERS_KEY, value: suppliersValue(list) });
    expect(suppliersOf(l).map((s) => s.name)).toEqual(["Electro Plus", "مخزن الشمال"]);
  });

  it("finds the same name whatever the case or spaces", () => {
    expect(sameName(list, "  electro plus ")?.id).toBe("a1");
    expect(sameName(list, "Electro Plus", "a1")).toBeUndefined();
    expect(sameName(list, "")).toBeUndefined();
  });

  it("lists the filter's names: the list first, then names typed on products", () => {
    const stock = [{ supplier: "electro plus" }, { supplier: "Zed" }, { supplier: "Alpha" }, { supplier: "" }, {}];
    expect(supplierNames(list, stock)).toEqual(["Electro Plus", "مخزن الشمال", "Alpha", "Zed"]);
  });

  it("filters the stock by supplier", () => {
    expect(bySupplier([fridge, cable], "ELECTRO plus")).toEqual([fridge]);
    expect(bySupplier([fridge, cable], "")).toEqual([fridge, cable]);
  });

  it("finds products by their supplier in the search", () => {
    expect(searchStock([fridge, cable], "electro").map((s) => s.id)).toEqual(["I-FRIDGE01"]);
  });
});

describe("category asks for the supplier", () => {
  it("is saved by category.save, and a change of the toggle alone is a change", () => {
    let l = run(emptyLedger(), { type: "category.save", category: { name: "ثلاجات", description: "", marginTarget: 0, icon: "🧊", hasSupplier: true } });
    expect(asksSupplier(l.categories, "ثلاجات")).toBe(true);
    expect(applyOp(l, op({ type: "category.save", category: { name: "ثلاجات", description: "", marginTarget: 0, icon: "🧊", hasSupplier: true } })).result).toBe("already");
    l = run(l, { type: "category.save", category: { name: "ثلاجات", description: "", marginTarget: 0, icon: "🧊", hasSupplier: false } });
    expect(asksSupplier(l.categories, "ثلاجات")).toBe(false);
    expect(asksSupplier(l.categories, "ما كايناش")).toBe(false);
  });
});

describe("product supplier", () => {
  it("is kept by stock.add and changed by stock.update", () => {
    let l = run(emptyLedger(), { type: "stock.add", item: fridge });
    expect(l.stock[0].supplier).toBe("Electro Plus");
    l = run(l, { type: "stock.update", id: fridge.id, base: l.stock[0].updatedAt, patch: { supplier: "مخزن الشمال" } });
    expect(l.stock[0].supplier).toBe("مخزن الشمال");
  });

  it("refuses a name longer than 100 letters", () => {
    expect(applyOp(emptyLedger(), op({ type: "stock.add", item: { ...fridge, supplier: "x".repeat(101) } })).result).toBe("invalid");
  });
});

describe("sheet columns", () => {
  it("come last in their tabs", () => {
    expect(HEADERS.stock.at(-1)).toBe("المورد");
    expect(HEADERS.stock).toHaveLength(15);
    expect(HEADERS.categories.at(-1)).toBe("طلب المورد (1 نعم، 0 لا)");
    expect(HEADERS.categories).toHaveLength(5);
  });

  it("write and read back the supplier and the toggle", () => {
    const l: Ledger = {
      ...emptyLedger(),
      stock: [fridge, { ...cable, supplier: undefined }],
      categories: [
        { name: "ثلاجات", description: "", marginTarget: 0, icon: "🧊", hasSupplier: true },
        { name: "كابلات", description: "", marginTarget: 0, icon: "🔌" },
      ],
    };
    const rows = ledgerToRows(l, "2026-11-20");
    expect(rows.stock.get(fridge.id)![14]).toBe("Electro Plus");
    expect(rows.categories.get("ثلاجات")![4]).toBe("1");
    expect(rows.categories.get("كابلات")![4]).toBe("0");
    const back = rowsToLedger(
      Object.fromEntries(Object.keys(TABS).map((k) => [k, [...(rows[k as keyof typeof rows]?.values() ?? [])]])) as never,
    );
    expect(back.stock.map((s) => s.supplier)).toEqual(["Electro Plus", undefined]);
    expect(back.categories).toEqual(l.categories);
  });

  it("read older rows (no new cells) and «نعم»", () => {
    const back = rowsToLedger({ ...Object.fromEntries(Object.keys(TABS).map((k) => [k, []])), categories: [["هواتف", "", "0", "📱", "نعم"], ["تلفزات", "", "0", "📺"]] } as never);
    expect(back.categories.map((c) => Boolean(c.hasSupplier))).toEqual([true, false]);
  });
});
