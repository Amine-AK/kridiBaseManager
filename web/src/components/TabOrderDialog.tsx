"use client";

import { moveTab } from "@/lib/tab-order";
import { Modal } from "./Modal";

interface Tab {
  value: string;
  icon: string;
  label: string;
}

/**
 * ⚙️ «↕️ ترتيب الأقسام»: put the main tabs in the order you like with ↑ / ↓.
 * Saved on this device at each move; the first one is where the app opens.
 */
export function TabOrderDialog({ tabs, onChange, onReset, onClose }: { tabs: Tab[]; onChange: (order: string[]) => void; onReset: () => void; onClose: () => void }) {
  const move = (i: number, by: -1 | 1) => onChange(moveTab(tabs, i, by).map((t) => t.value));
  return (
    <Modal
      title="↕️ ترتيب الأقسام"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onReset}>
            ↩️ الترتيب العادي
          </button>
          <button type="button" className="btn primary" onClick={onClose}>
            ✓ سالينا
          </button>
        </>
      }
    >
      <p className="muted small">طلّع ولا هبّط كل قسم. الأول هو اللي كيتحل عليه التطبيق. الترتيب كيتحفظ فهاد الجهاز.</p>
      <ol className="tab-order">
        {tabs.map((t, i) => (
          <li key={t.value}>
            <bdi dir="ltr" className="tab-order-n">
              {i + 1}
            </bdi>
            <span className="tab-order-name">
              <span aria-hidden="true">{t.icon}</span> {t.label}
              {i === 0 && <span className="tab-order-first">كيتحل عليه</span>}
            </span>
            <button type="button" className="icon-btn" aria-label={`طلّع ${t.label}`} disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button type="button" className="icon-btn" aria-label={`هبّط ${t.label}`} disabled={i === tabs.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
