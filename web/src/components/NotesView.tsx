"use client";

import { useMemo, useState, type FormEvent } from "react";
import { newLedgerId, nowParts, NOTE_KINDS, type Note, type NoteKind } from "@/lib/ledger";
import { dayLabel, isOpenRequest, notePages, searchNotes, type NoteFilter } from "@/lib/notes";
import { displayDate } from "@/lib/receipt";
import { ownerForPhone } from "@/lib/repairs";
import { can } from "@/lib/roles";
import { Modal } from "./Modal";
import { Confirm, Field } from "./ui";
import type { LedgerState } from "./useLedger";

const KIND_ICON: Record<NoteKind, string> = { ملاحظة: "📝", "طلب زبون": "🙋" };

const FILTERS: { value: NoteFilter; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "requests", label: "🙋 طلبات باقية" },
  { value: "open", label: "ما تداروش" },
  { value: "done", label: "✓ تدارو" },
];

/** Pages shown at first; the rest with «صفحات قبل». */
const PAGE_STEP = 14;

/**
 * الكناش: the shop's notebook, like the paper one next to the till. Anyone writes
 * what to remember or what a customer asked for, and ticks it off when it's done.
 */
export function NotesView({ data, onToast }: { data: LedgerState; onToast: (msg: string) => void }) {
  const ledger = data.ledger!;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [shown, setShown] = useState(PAGE_STEP);
  const [editing, setEditing] = useState<Note | null>(null);

  const list = useMemo(() => searchNotes(ledger.notes, query, filter), [ledger.notes, query, filter]);
  const pages = notePages(list);
  const open = ledger.notes.filter(isOpenRequest).length;

  function tick(n: Note) {
    data.run(`${n.done ? "↩️" : "✓"} الكناش · ${n.text.slice(0, 40)}`, { type: "note.update", id: n.id, base: n.updatedAt, patch: { done: !n.done } });
  }

  return (
    <div className="view">
      <section className="summary" aria-label="ملخص الكناش">
        <div className="stat">
          <span className="stat-label">طلبات الزبناء الباقية</span>
          <span className={`stat-value ${open ? "warn-text" : ""}`}>{open}</span>
          <span className="stat-sub">{open ? "خاصهم يتدارو" : "كلشي تدار ✓"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">اليوم</span>
          <span className="stat-value">{ledger.notes.filter((n) => n.date === data.today).length}</span>
          <span className="stat-sub">سطر تكتب</span>
        </div>
      </section>

      <NoteWriter data={data} onToast={onToast} />

      <div className="search-row">
        <label className="visually-hidden" htmlFor="note-search">
          قلب فالكناش
        </label>
        <input id="note-search" type="search" className="search" placeholder="قلب فالكناش: كلمة، زبون ولا تيليفون…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="chips" role="group" aria-label="شنو نشوفو">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" className={`chip ${filter === f.value ? "on" : ""}`} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="notebook" aria-label="صفحات الكناش">
        {pages.length === 0 && <p className="notebook-empty">{ledger.notes.length ? "ما لقينا والو هنا." : "الكناش خاوي. كتب أول سطر لفوق ✍️"}</p>}
        {pages.slice(0, shown).map((p) => (
          <section key={p.date} aria-label={dayLabel(p.date, data.today)}>
            <h3 className="notebook-day">
              {dayLabel(p.date, data.today)}
            </h3>
            <ul className="notebook-lines">
              {p.notes.map((n) => (
                <li key={n.id} className={`note-line ${n.done ? "done" : ""}`}>
                  <bdi dir="ltr" className="note-time">
                    {n.time}
                  </bdi>
                  <button
                    type="button"
                    className="note-tick"
                    onClick={() => tick(n)}
                    aria-pressed={n.done}
                    aria-label={n.done ? "رجعها ما تداراتش" : "تدارت"}
                    title={n.done ? `تدارت${n.doneBy ? ` · ${n.doneBy}` : ""}` : "تدارت؟"}
                  >
                    {n.done ? "✓" : ""}
                  </button>
                  <button type="button" className="note-body" onClick={() => setEditing(n)}>
                    {n.kind === "طلب زبون" && <span className="note-kind">🙋 طلب</span>}
                    <span className="note-text">{n.text}</span>
                    {(n.customer || n.phone) && (
                      <span className="note-meta">
                        {" "}
                        · 👤 {n.customer}
                        {n.phone && (
                          <>
                            {" "}
                            <bdi dir="ltr">{n.phone}</bdi>
                          </>
                        )}
                      </span>
                    )}
                    <span className="note-meta">
                      {" "}
                      · ✍️ {n.author || "—"}
                      {n.done && n.doneBy && ` · ✓ ${n.doneBy}`}
                    </span>
                  </button>
                  {n.phone && (
                    <a className="note-call" href={`tel:${n.phone.replace(/[^\d+]/g, "")}`} aria-label={`اتصل بـ ${n.customer || n.phone}`}>
                      📞
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {pages.length > shown && (
        <button type="button" className="btn" onClick={() => setShown((x) => x + PAGE_STEP)}>
          📖 صفحات قبل
        </button>
      )}

      {editing && ledger.notes.some((n) => n.id === editing.id) && (
        <NoteEditor data={data} note={ledger.notes.find((n) => n.id === editing.id)!} onClose={() => setEditing(null)} onToast={onToast} />
      )}
    </div>
  );
}

/** Customer's name from the phone, from the data on the device (customers, earlier repairs). */
function useCustomerFill(data: LedgerState) {
  return (phone: string) => ownerForPhone(phone, data.ledger!)?.name ?? "";
}

/** The top of the page: write a line at once, with a customer if it's about one. */
function NoteWriter({ data, onToast }: { data: LedgerState; onToast: (msg: string) => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<NoteKind>("ملاحظة");
  const [withCustomer, setWithCustomer] = useState(false);
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const fill = useCustomerFill(data);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const now = nowParts();
    const at = new Date().toISOString();
    data.run(`✍️ الكناش · ${text.trim().slice(0, 40)}`, {
      type: "note.add",
      note: {
        id: newLedgerId("N"),
        date: now.date,
        time: now.time,
        kind,
        text: text.trim(),
        customer: withCustomer ? customer.trim() : "",
        phone: withCustomer ? phone.trim() : "",
        done: false,
        doneBy: "",
        doneAt: "",
        author: data.me?.name ?? "",
        createdAt: at,
        updatedAt: at,
      },
    });
    onToast("✍️ تكتبات فالكناش");
    setText("");
    setCustomer("");
    setPhone("");
    setWithCustomer(false);
    setKind("ملاحظة");
  }

  return (
    <form className="notebook" onSubmit={submit} aria-label="كتب فالكناش">
      <div className="notebook-write">
        <div className="notebook-tools" role="group" aria-label="النوع">
          {NOTE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip ${kind === k ? "on" : ""}`}
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                if (k === "طلب زبون") setWithCustomer(true);
              }}
            >
              {KIND_ICON[k]} {k}
            </button>
          ))}
          {!withCustomer && (
            <button type="button" className="chip" onClick={() => setWithCustomer(true)}>
              👤 زبون
            </button>
          )}
        </div>
        <label className="visually-hidden" htmlFor="note-text">
          الملاحظة
        </label>
        <textarea
          id="note-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === "طلب زبون" ? "شنو طلب الزبون؟ مثلا: بغا شارجور Type-C، يدوز الخميس…" : "كتب أي حاجة بغيتي تفكرها…"}
        />
        {withCustomer && (
          <div className="notebook-who">
            <input
              type="tel"
              inputMode="tel"
              dir="ltr"
              aria-label="تيليفون الزبون"
              placeholder="التيليفون"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                const name = fill(e.target.value);
                if (name && !customer.trim()) setCustomer(name);
              }}
            />
            <input aria-label="سمية الزبون" placeholder="السمية" value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </div>
        )}
        <div className="notebook-tools">
          <button type="submit" className="btn primary small-btn" disabled={!text.trim()}>
            ✍️ كتب فالكناش
          </button>
          {withCustomer && (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setWithCustomer(false);
                setCustomer("");
                setPhone("");
              }}
            >
              بلا زبون
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

/** A line opened: change it, tick it off, or (owner) tear it out. */
function NoteEditor({ data, note: n, onClose, onToast }: { data: LedgerState; note: Note; onClose: () => void; onToast: (msg: string) => void }) {
  const [v, setV] = useState({ text: n.text, kind: n.kind, customer: n.customer, phone: n.phone, done: n.done });
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const fill = useCustomerFill(data);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.text.trim()) return setError("كتب شي حاجة");
    const patch = { ...v, text: v.text.trim(), customer: v.customer.trim(), phone: v.phone.trim() };
    data.run(`✏️ الكناش · ${patch.text.slice(0, 40)}`, { type: "note.update", id: n.id, base: n.updatedAt, patch });
    onToast("تبدلات");
    onClose();
  }

  return (
    <Modal
      title="📝 الكناش"
      onClose={onClose}
      footer={
        <>
          {can(data.me, "owner_only") && (
            <button type="button" className="btn danger-ghost" onClick={() => setDeleting(true)}>
              حذف
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            رجوع
          </button>
          <button type="submit" form="note-form" className="btn primary">
            حفظ
          </button>
        </>
      }
    >
      <p className="muted small">
        ✍️ {n.author || "—"} · <bdi dir="ltr">{displayDate(n.date)} · {n.time}</bdi>
        {n.done && n.doneBy && (
          <>
            {" "}
            · ✓ {n.doneBy}
          </>
        )}
        {n.by && n.by !== n.author && ` · آخر تعديل: ${n.by}`}
      </p>
      <form id="note-form" className="form-grid" noValidate onSubmit={submit}>
        <div className="field wide">
          <span>النوع</span>
          <div className="chips" role="group" aria-label="النوع">
            {NOTE_KINDS.map((k) => (
              <button key={k} type="button" className={`chip ${v.kind === k ? "on" : ""}`} aria-pressed={v.kind === k} onClick={() => setV({ ...v, kind: k })}>
                {KIND_ICON[k]} {k}
              </button>
            ))}
          </div>
        </div>
        <Field id="note-edit-text" label="الملاحظة" error={error} wide>
          <textarea id="note-edit-text" rows={4} value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} />
        </Field>
        <Field id="note-edit-phone" label="تيليفون الزبون">
          <input
            id="note-edit-phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            value={v.phone}
            onChange={(e) => {
              const name = fill(e.target.value);
              setV({ ...v, phone: e.target.value, customer: name && !v.customer.trim() ? name : v.customer });
            }}
          />
        </Field>
        <Field id="note-edit-customer" label="سمية الزبون">
          <input id="note-edit-customer" value={v.customer} onChange={(e) => setV({ ...v, customer: e.target.value })} />
        </Field>
        <label className="check wide">
          <input type="checkbox" checked={v.done} onChange={(e) => setV({ ...v, done: e.target.checked })} /> ✓ تدارت
        </label>
      </form>
      {deleting && (
        <Confirm
          title="حذف من الكناش"
          confirmLabel="حذف"
          danger
          onClose={() => setDeleting(false)}
          onConfirm={() => {
            data.run(`🗑️ الكناش · ${n.text.slice(0, 40)}`, { type: "note.delete", id: n.id });
            onToast("تحذفات");
            onClose();
          }}
        >
          <p className="lead">نقطعو هاد السطر من الكناش؟</p>
        </Confirm>
      )}
    </Modal>
  );
}
