"use client";

import { useState, type FormEvent } from "react";
import { whatsappLink } from "@/lib/receipt";
import { bySupplier, sameName, SUPPLIERS_KEY, suppliersOf, suppliersValue, type Supplier } from "@/lib/suppliers";
import { Modal } from "./Modal";
import type { LedgerState } from "./useLedger";
import { Confirm, Field } from "./ui";

/**
 * ⚙️ «🚚 الموردين»: the shop's suppliers (name, phone, notes), kept in the
 * shop settings and offered in the product form of the categories that ask
 * for the supplier.
 */
export function SuppliersDialog({ data, onClose, onToast }: { data: LedgerState; onClose: () => void; onToast: (msg: string) => void }) {
  const ledger = data.ledger!;
  const suppliers = suppliersOf(ledger);
  const empty: Supplier = { id: "", name: "", phone: "", notes: "" };
  const [v, setV] = useState<Supplier | null>(suppliers.length ? null : empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<Supplier | null>(null);

  const save = (label: string, list: Supplier[]) => data.run(label, { type: "setting.save", key: SUPPLIERS_KEY, value: suppliersValue(list) });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!v) return;
    const next = { ...v, name: v.name.trim(), phone: v.phone.trim(), notes: v.notes.trim() };
    const err: Record<string, string> = {};
    if (!next.name) err.name = "اسم المورد ضروري";
    else if (next.name.length > 100) err.name = "الاسم طويل بزاف";
    else if (sameName(suppliers, next.name, next.id)) err.name = "هاد المورد مسجل ديجا";
    // The phone is optional; when given it must be a number WhatsApp / a call can use.
    if (next.phone && !whatsappLink(next.phone, "")) err.phone = "رقم الهاتف غير صحيح";
    if (next.notes.length > 300) err.notes = "الملاحظات طويلة بزاف";
    setErrors(err);
    if (Object.keys(err).length) return;
    if (next.id) save(`🚚 مورد · ${next.name}`, suppliers.map((s) => (s.id === next.id ? next : s)));
    else save(`🚚 مورد جديد · ${next.name}`, [...suppliers, { ...next, id: Math.random().toString(36).slice(2, 10) }]);
    onToast("تسجل المورد");
    setV(null);
  }

  const edit = (s: Supplier) => {
    setErrors({});
    setV(s);
  };

  return (
    <Modal title="🚚 قائمة الموردين" onClose={onClose}>
      <p className="muted small">
        سجل هنا الموردين لي كتشري منهم. فالفئات لي فيها «طلب اسم المورد» (مثلا ثلاجات، هواتف) كتختار المورد ملي تزيد سلعة، ومن بعد تقدر تقلب بيه فالمخزون.
      </p>
      {suppliers.length > 0 && (
        <ul className="rows">
          {suppliers.map((s) => {
            const count = bySupplier(ledger.stock, s.name).length;
            const tel = s.phone.replace(/[^\d+]/g, "");
            return (
              <li key={s.id}>
                <div className="row-main">
                  <strong>🚚 {s.name}</strong>
                  <span className="muted small">
                    {s.phone && <bdi dir="ltr">{s.phone}</bdi>}
                    {s.phone && " · "}
                    <bdi dir="ltr">{count}</bdi> سلعة
                    {s.notes && ` · ${s.notes}`}
                  </span>
                </div>
                <div className="row-actions">
                  {tel && (
                    <a className="link-btn" href={`tel:${tel}`} aria-label={`عيط لـ ${s.name}`}>
                      📞
                    </a>
                  )}
                  <button type="button" className="link-btn" onClick={() => edit(s)}>
                    تعديل
                  </button>
                  <button type="button" className="link-btn danger-text" onClick={() => setDeleting(s)}>
                    حذف
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {v ? (
        <form className="form-grid contact-form" noValidate onSubmit={submit}>
          <Field id="sp-name" label="اسم المورد" error={errors.name} hint="مثلا: Electro Plus، مخزن الشمال">
            <input id="sp-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={100} autoFocus />
          </Field>
          <Field id="sp-phone" label="رقم الهاتف" error={errors.phone} hint="اختياري">
            <input id="sp-phone" type="tel" inputMode="tel" dir="ltr" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          </Field>
          <Field id="sp-notes" label="ملاحظات" error={errors.notes} wide hint="اختياري · مثلا: نهار التوصيل، شنو كيبيع">
            <input id="sp-notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={300} />
          </Field>
          <div className="actions-row in-flow wide">
            {suppliers.length > 0 && (
              <button type="button" className="btn" onClick={() => setV(null)}>
                إلغاء
              </button>
            )}
            <button type="submit" className="btn primary">
              {v.id ? "حفظ" : "＋ سجل المورد"}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn primary" onClick={() => edit(empty)}>
          ＋ زيد مورد جديد
        </button>
      )}
      {deleting && (
        <Confirm
          title="حذف المورد"
          confirmLabel="حذف"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            save(`حذف مورد · ${deleting.name}`, suppliers.filter((s) => s.id !== deleting.id));
            setDeleting(null);
          }}
        >
          <p className="lead">نحيدو «{deleting.name}» من اللائحة؟ السلع لي مكتوب فيها كيبقى فيها الاسم.</p>
        </Confirm>
      )}
    </Modal>
  );
}
