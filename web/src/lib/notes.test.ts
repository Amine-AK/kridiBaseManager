import { describe, expect, it } from "vitest";
import { applyOp, emptyLedger, type LedgerOp, type Note } from "./ledger";
import { dayLabel, eventText, isOpenRequest, noteEvents, notePages, searchNotes } from "./notes";
import { opAllowed } from "./permissions";
import type { Me } from "./roles";

const note = (over: Partial<Note> = {}): Note => ({
  id: "N-AAAA0001", date: "2026-11-16", time: "10:00", kind: "طلب زبون", text: "بغا شارجور Type-C", customer: "Amine", phone: "0661234567",
  done: false, doneBy: "", doneAt: "", createdAt: "2026-11-16T09:00:00.000Z", updatedAt: "2026-11-16T09:00:00.000Z", author: "Said", ...over,
});
let n = 0;
const op = (body: object, by = "Said") => ({ ...body, opId: `O-N${++n}`, at: `2026-11-16T1${n}:00:00.000Z`, by, device: "📱" }) as unknown as LedgerOp;
const me = (role: Me["role"]): Me => ({ id: "x", name: "x", role, services: [], seeCost: false });

describe("notebook", () => {
  it("writes, ticks off (who, when), unticks", () => {
    let l = applyOp(emptyLedger(), op({ type: "note.add", note: note() })).ledger;
    expect(l.notes[0]).toMatchObject({ author: "Said", done: false });
    const t = applyOp(l, op({ type: "note.update", id: "N-AAAA0001", base: l.notes[0].updatedAt, patch: { done: true } }, "Mustapha"));
    expect(t.ledger.notes[0]).toMatchObject({ done: true, doneBy: "Mustapha", author: "Said" });
    l = t.ledger;
    const u = applyOp(l, op({ type: "note.update", id: "N-AAAA0001", base: l.notes[0].updatedAt, patch: { done: false } }));
    expect(u.ledger.notes[0]).toMatchObject({ done: false, doneBy: "", doneAt: "" });
    expect(applyOp(emptyLedger(), op({ type: "note.add", note: note({ text: "  " }) })).result).toBe("invalid");
  });
  it("every account writes; only the owner deletes", () => {
    expect(opAllowed(me("seller"), op({ type: "note.add", note: note() }))).toBe(true);
    expect(opAllowed(me("stock"), op({ type: "note.update", id: "N-1", base: "", patch: {} }))).toBe(true);
    expect(opAllowed(me("seller"), op({ type: "note.delete", id: "N-1" }))).toBe(false);
    expect(opAllowed(me("owner"), op({ type: "note.delete", id: "N-1" }))).toBe(true);
  });
  it("searches, filters and makes pages per day", () => {
    const list = [
      note(),
      note({ id: "N-2", kind: "ملاحظة", text: "الضو ديال الفترينة طافي", customer: "", phone: "", date: "2026-11-15", time: "18:00" }),
      note({ id: "N-3", done: true, text: "تيليكوموند LG", date: "2026-11-16", time: "12:00" }),
    ];
    expect(searchNotes(list, "").map((x) => x.id)).toEqual(["N-3", "N-AAAA0001", "N-2"]);
    expect(searchNotes(list, "", "requests").map((x) => x.id)).toEqual(["N-AAAA0001"]);
    expect(searchNotes(list, "", "done").map((x) => x.id)).toEqual(["N-3"]);
    expect(searchNotes(list, "+212 661").length).toBe(2);
    expect(searchNotes(list, "type-c").map((x) => x.id)).toEqual(["N-AAAA0001"]);
    expect(notePages(searchNotes(list, "")).map((p) => [p.date, p.notes.length])).toEqual([["2026-11-16", 2], ["2026-11-15", 1]]);
    expect(dayLabel("2026-11-16", "2026-11-16")).toBe("اليوم");
    expect(dayLabel("2026-11-15", "2026-11-16")).toBe("البارح");
    expect(dayLabel("2026-11-01", "2026-11-16")).toBe("01/11/2026");
    expect(isOpenRequest(list[0])).toBe(true);
  });
  it("tells what others did since the last look, never one's own changes", () => {
    const since = "2026-11-16T10:00:00.000Z";
    const list = [
      note({ id: "N-1", author: "Said", createdAt: "2026-11-16T11:00:00.000Z", updatedAt: "2026-11-16T11:00:00.000Z" }),
      note({ id: "N-2", author: "Mustapha", createdAt: "2026-11-16T11:30:00.000Z", updatedAt: "2026-11-16T11:30:00.000Z" }),
      note({ id: "N-3", author: "Mustapha", done: true, doneBy: "Karim", doneAt: "2026-11-16T12:00:00.000Z", updatedAt: "2026-11-16T12:00:00.000Z", by: "Karim" }),
      note({ id: "N-4", author: "Mustapha", updatedAt: "2026-11-16T12:30:00.000Z", by: "Said", kind: "ملاحظة", text: "الضو طافي" }),
      note({ id: "N-5", author: "Said", updatedAt: "2026-11-16T09:00:00.000Z", by: "Said" }),
    ];
    const ev = noteEvents(list, since, "Mustapha");
    expect(ev.map((e) => [e.note.id, e.kind, e.by])).toEqual([["N-4", "edit", "Said"], ["N-3", "done", "Karim"], ["N-1", "new", "Said"]]);
    expect(eventText(ev[2])).toBe("🙋 Said كتب طلب زبون: بغا شارجور Type-C");
    expect(eventText(ev[0])).toBe("✏️ Said بدل: الضو طافي");
    // Seen later: nothing new.
    expect(noteEvents(list, "2026-11-16T13:00:00.000Z", "Mustapha")).toEqual([]);
  });
});
