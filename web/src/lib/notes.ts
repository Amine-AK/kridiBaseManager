// الكناش: the shop's notebook. Anything to remember, or what a customer asked
// for («جيب ليا شارجور Type-C»), written by any account and ticked off when done.
// Pure rules, shared by the screen (components/NotesView.tsx) and the tests.

import type { Note } from "./ledger";
import { displayDate } from "./receipt";
import { addDays } from "./sheet-logic";
import { normalizeText } from "./shop";

/** A customer's request still to do. */
export const isOpenRequest = (n: Pick<Note, "kind" | "done">) => n.kind === "طلب زبون" && !n.done;

export type NoteFilter = "all" | "requests" | "open" | "done";

const digits = (s: string) => s.replace(/\D/g, "").replace(/^(00)?212/, "0");

/** Search in the text, the customer and the phone (any format); then the filter. Newest first. */
export function searchNotes(notes: Note[], query: string, filter: NoteFilter = "all"): Note[] {
  const q = normalizeText(query);
  const qd = digits(query);
  return notes
    .filter((n) => {
      if (filter === "requests" && !isOpenRequest(n)) return false;
      if (filter === "open" && n.done) return false;
      if (filter === "done" && !n.done) return false;
      if (!q) return true;
      return [n.text, n.customer, n.author].some((x) => normalizeText(x).includes(q)) || (qd.length >= 3 && digits(n.phone).includes(qd));
    })
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`) || b.createdAt.localeCompare(a.createdAt));
}

/** «اليوم», «البارح», else the date. */
export function dayLabel(date: string, today: string): string {
  if (date === today) return "اليوم";
  if (date === addDays(today, -1)) return "البارح";
  return displayDate(date);
}

/** Notes in pages, one per day, in the order given. */
export function notePages(notes: Note[]): { date: string; notes: Note[] }[] {
  const pages: { date: string; notes: Note[] }[] = [];
  for (const n of notes) {
    const last = pages[pages.length - 1];
    if (last?.date === n.date) last.notes.push(n);
    else pages.push({ date: n.date, notes: [n] });
  }
  return pages;
}
