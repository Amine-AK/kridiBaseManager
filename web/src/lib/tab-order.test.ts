import { describe, expect, it } from "vitest";
import { moveTab, orderTabs } from "./tab-order";

const tabs = ["credit", "sell", "stock", "repairs", "budget", "notes"].map((value) => ({ value }));
const values = (l: { value: string }[]) => l.map((t) => t.value);

describe("main tabs order", () => {
  it("keeps the default order when nothing is saved", () => {
    expect(values(orderTabs(tabs, []))).toEqual(["credit", "sell", "stock", "repairs", "budget", "notes"]);
  });
  it("puts the saved order first; tabs it doesn't know come after, in their default order", () => {
    expect(values(orderTabs(tabs, ["sell", "notes", "credit"]))).toEqual(["sell", "notes", "credit", "stock", "repairs", "budget"]);
  });
  it("skips saved tabs this account can't open", () => {
    const mine = tabs.filter((t) => t.value === "stock" || t.value === "notes");
    expect(values(orderTabs(mine, ["sell", "notes", "credit", "stock"]))).toEqual(["notes", "stock"]);
  });
  it("moves a tab up or down, not past the edges", () => {
    expect(moveTab(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveTab(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveTab(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveTab(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});
