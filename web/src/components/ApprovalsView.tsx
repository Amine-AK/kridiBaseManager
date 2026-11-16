"use client";

import { useState } from "react";
import { approvalChain } from "@/lib/approval-deps";
import { describe, waitingOf } from "@/lib/approvals";
import { nowParts, type Approval, type ApprovalStatus } from "@/lib/ledger";
import { displayDateTime } from "@/lib/receipt";
import { Modal } from "./Modal";
import type { LedgerState } from "./useLedger";

const TABS: { value: ApprovalStatus; label: string }[] = [
  { value: "كتسنى", label: "⏳ كتسنى" },
  { value: "ترفض", label: "❌ ترفضو" },
  { value: "تقبل", label: "✓ تقبلو" },
];

/** Refusals a seller should still see (the last 7 days). */
const RECENT_MS = 7 * 24 * 3600_000;
export const recentRefusals = (approvals: Approval[], now = Date.now()) =>
  approvals.filter((a) => a.status === "ترفض" && now - Date.parse(a.decidedAt) < RECENT_MS);

const when = (iso: string) => {
  if (Number.isNaN(Date.parse(iso))) return "";
  const p = nowParts(new Date(iso));
  return displayDateTime(p.date, p.time);
};

/**
 * In الكريدي: what the sellers changed and waits for the owner. The owner accepts
 * (the change goes into the sheet) or refuses with a reason; a seller only sees
 * where their changes are. `clientId`: only this customer's.
 */
export function ApprovalsDialog({ data, clientId, onClose, onToast }: { data: LedgerState; clientId?: string; onClose: () => void; onToast: (msg: string) => void }) {
  const ledger = data.ledger!;
  const owner = data.me?.role === "owner";
  const [tab, setTab] = useState<ApprovalStatus>("كتسنى");
  const [refusing, setRefusing] = useState<{ ids: string[]; label: string } | null>(null);
  const [reason, setReason] = useState("");

  const info = (a: Approval) => describe(a.op, ledger);
  const list = ledger.approvals
    .filter((a) => a.status === tab && (!clientId || info(a).clientId === clientId))
    .sort((a, b) => (tab === "كتسنى" ? a.createdAt.localeCompare(b.createdAt) : b.decidedAt.localeCompare(a.decidedAt)))
    .slice(0, tab === "كتسنى" ? undefined : 100);
  const groups = new Map<string, Approval[]>();
  for (const a of list) groups.set(info(a).clientId, [...(groups.get(info(a).clientId) ?? []), a]);
  const counts = Object.fromEntries(TABS.map((t) => [t.value, ledger.approvals.filter((a) => a.status === t.value && (!clientId || info(a).clientId === clientId)).length]));

  /** Accept these (oldest first); one already taken with an earlier one's needs is not sent twice. */
  function accept(items: Approval[]) {
    const waiting = waitingOf(ledger);
    const taken = new Set<string>();
    let n = 0;
    for (const a of [...items].sort((x, y) => x.createdAt.localeCompare(y.createdAt))) {
      if (taken.has(a.id)) continue;
      for (const x of approvalChain(waiting, a)) taken.add(x.id);
      data.run(`✓ موافقة · ${info(a).client} · ${info(a).text}`, { type: "approval.decide", id: a.id, decision: "accept", reason: "" });
      n++;
    }
    if (n) onToast(taken.size > 1 ? `✓ تقبلو ${taken.size} تعديلات` : "✓ تقبل");
  }

  function refuse() {
    if (!refusing) return;
    for (const id of refusing.ids) data.run(`❌ رفض · ${refusing.label}`, { type: "approval.decide", id, decision: "refuse", reason: reason.trim() });
    onToast("❌ ترفض");
    setRefusing(null);
    setReason("");
  }

  return (
    <Modal title={owner ? "⏳ تعديلات البائعين: الموافقة" : "⏳ التعديلات ديالي عند المالك"} onClose={onClose}>
      <p className="muted small">
        {owner
          ? "هادو تعديلات الكريدي لي دارو البائعين. ما كيدخلو للـ Google Sheet حتى توافق. الزبون كيشوف المبلغ منقوص فالوصل، والفلوس كتحسب فالصندوق."
          : "تعديلات الكريدي ديالك كيتسناو موافقة المالك قبل ما يتسجلو فالـ Google Sheet."}
      </p>
      <div className="chips" role="group" aria-label="الحالة">
        {TABS.map((t) => (
          <button key={t.value} type="button" className={`chip ${tab === t.value ? "on" : ""}`} aria-pressed={tab === t.value} onClick={() => setTab(t.value)}>
            {t.label} <bdi dir="ltr">({counts[t.value]})</bdi>
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="empty">{tab === "كتسنى" ? "ما كاين حتى تعديل كيتسنى ✓" : "ما كاين والو هنا."}</p>}
      {[...groups.entries()].map(([cid, items]) => (
        <section key={cid || "none"} className="approval-group" aria-label={info(items[0]).client || "زبون"}>
          <div className="approval-head">
            <h3>👤 {info(items[0]).client || "زبون"}</h3>
            {owner && tab === "كتسنى" && items.length > 1 && (
              <button type="button" className="btn primary small-btn" onClick={() => accept(items)} disabled={items.some((a) => data.brokenApprovals.has(a.id))}>
                ✓ قبل الكل ({items.length})
              </button>
            )}
          </div>
          <ul className="approval-list">
            {items.map((a) => {
              const i = info(a);
              const broken = data.brokenApprovals.get(a.id);
              return (
                <li key={a.id} className={`approval-item status-${a.status === "كتسنى" ? "wait" : a.status === "تقبل" ? "ok" : "no"}`}>
                  <div className="approval-main">
                    <strong>
                      {i.icon} {i.text}
                    </strong>
                    <span className="muted small">
                      {a.op.by || "—"} · <bdi dir="ltr">{when(a.createdAt)}</bdi>
                      {a.op.device && ` · ${a.op.device}`}
                    </span>
                    {a.status !== "كتسنى" && (
                      <span className="muted small">
                        {a.status === "تقبل" ? "✓ قبلو" : "❌ رفضو"} {a.decidedBy} · <bdi dir="ltr">{when(a.decidedAt)}</bdi>
                      </span>
                    )}
                    {a.reason && <span className="danger-text small">السبب: {a.reason}</span>}
                    {broken && <span className="warn-text small">⚠️ ما بقاش كيتطبق: {broken}</span>}
                  </div>
                  {owner && a.status === "كتسنى" && (
                    <div className="approval-actions">
                      <button type="button" className="btn primary small-btn" onClick={() => accept([a])} disabled={Boolean(broken)}>
                        ✓ قبول
                      </button>
                      <button type="button" className="btn danger-ghost small-btn" onClick={() => setRefusing({ ids: [a.id], label: `${i.client} · ${i.text}` })}>
                        ✕ رفض
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {refusing && (
        <Modal
          title="❌ رفض التعديل"
          onClose={() => setRefusing(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setRefusing(null)}>
                رجوع
              </button>
              <button type="button" className="btn danger" onClick={refuse}>
                رفض
              </button>
            </>
          }
        >
          <p className="lead">{refusing.label}</p>
          <p className="muted small">التعديلات لي مبنية على هادا (مثلا دفعة ديال زبون جديد) كيترفضو معاه.</p>
          <div className="field">
            <label htmlFor="refuse-reason">السبب (كيشوفو البائع)</label>
            <input id="refuse-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus placeholder="مثلا: المبلغ غلط، الزبون ما خلصش…" />
          </div>
        </Modal>
      )}
    </Modal>
  );
}

/** The bar in الكريدي: what waits for the owner (owner), or for the seller where their changes are. */
export function ApprovalsBar({ data, onOpen }: { data: LedgerState; onOpen: () => void }) {
  const ledger = data.ledger;
  if (!ledger || !data.me || data.me.role === "stock") return null;
  const waiting = waitingOf(ledger);
  const owner = data.me.role === "owner";
  const refused = owner ? [] : recentRefusals(ledger.approvals).filter((a) => a.op.by === data.me!.name);
  if (!waiting.length && !refused.length) return null;
  const clients = new Set(waiting.map((a) => describe(a.op, ledger).clientId)).size;
  return (
    <button type="button" className={`approvals-bar ${owner && waiting.length ? "attention" : ""}`} onClick={onOpen}>
      <span>
        {waiting.length > 0 &&
          (owner ? (
            <>
              ⏳ <strong>{clients}</strong> زبون عندهم <strong>{waiting.length}</strong> تعديل كيتسنى الموافقة ديالك
            </>
          ) : (
            <>
              ⏳ <strong>{waiting.length}</strong> تعديل كيتسنى موافقة المالك
            </>
          ))}
        {refused.length > 0 && (
          <>
            {waiting.length > 0 && " · "}❌ <strong>{refused.length}</strong> ترفضو
          </>
        )}
      </span>
      <span className="approvals-go">{owner && waiting.length ? "شوف ووافق ←" : "شوف ←"}</span>
    </button>
  );
}
