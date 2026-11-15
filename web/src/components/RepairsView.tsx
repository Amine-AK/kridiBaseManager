"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { downloadStickerPng, stickerCanvas } from "@/lib/barcode-image";
import { money } from "@/lib/format";
import { photoForCell } from "@/lib/image";
import { pageCss, paperWidth, pitch } from "@/lib/label-layout";
import { newLedgerId, nowParts, REPAIR_STATUSES, STICKER_LOOK_KEY, type Repair, type RepairStatus } from "@/lib/ledger";
import { displayDate, SHOP, whatsappLink } from "@/lib/receipt";
import { inShop, newRepairCode, readyMessage, receivedMessage, repairByCode, repairRemaining, searchRepairs, STATUS_INFO } from "@/lib/repairs";
import { fixAzertyDigits } from "@/lib/scanner-input";
import { BarcodeScanner } from "./BarcodeScanner";
import { Ean13 } from "./LabelPrint";
import { useLabelSetup } from "./LabelSetup";
import { Modal } from "./Modal";
import { Confirm, Field, parseAmount } from "./ui";
import { useScannerInput } from "./useScannerInput";
import type { LedgerState } from "./useLedger";

type Filter = "shop" | "ready" | "all";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "shop", label: "فالمحل" },
  { value: "ready", label: "✅ واجدين" },
  { value: "all", label: "الكل" },
];

type Sub = { kind: "add" } | { kind: "edit"; id: string } | { kind: "open"; id: string; justAdded?: boolean } | { kind: "delete"; id: string } | null;

/**
 * الإصلاح: devices customers bring to be repaired. Each gets a photo, its
 * owner, the problem, the price and the advance, a status, and its own
 * barcode on a sticker stuck on the device (scan it to find the repair).
 */
export function RepairsView({ data, onToast }: { data: LedgerState; onToast: (msg: string) => void }) {
  const repairs = data.ledger!.repairs;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("shop");
  const [sub, setSub] = useState<Sub>(null);
  const [scanning, setScanning] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    const found = searchRepairs(repairs, query);
    if (query.trim()) return found;
    return found.filter((r) => (filter === "all" ? true : filter === "ready" ? r.status === "واجد" : inShop(r)));
  }, [repairs, query, filter]);

  const here = repairs.filter(inShop);
  const ready = repairs.filter((r) => r.status === "واجد");
  const toCollect = ready.reduce((t, r) => t + repairRemaining(r), 0);

  /** A repair's sticker scanned (USB scanner or camera): open it. */
  function scanned(code: string) {
    const r = repairByCode(repairs, fixAzertyDigits(code));
    if (r) setSub({ kind: "open", id: r.id });
    else onToast(`ما لقينا حتى إصلاح بالباركود ${code}`);
  }
  useScannerInput(scanned, viewRef, sub === null && !scanning);

  return (
    <div className="view" ref={viewRef}>
      <section className="summary" aria-label="ملخص الإصلاح">
        <div className="stat">
          <span className="stat-label">فالمحل</span>
          <span className="stat-value">{here.length}</span>
          <span className="stat-sub">جهاز</span>
        </div>
        <div className="stat">
          <span className="stat-label">واجدين</span>
          <span className="stat-value">{ready.length}</span>
          <span className="stat-sub">{toCollect ? `باقي ${money(toCollect)}` : "خاصهم يتسلمو"}</span>
        </div>
      </section>

      <div className="actions-row in-flow">
        <button type="button" className="btn" onClick={() => setScanning(true)}>
          📷 سكاني
        </button>
        <button type="button" className="btn primary" onClick={() => setSub({ kind: "add" })}>
          ＋ إصلاح جديد
        </button>
      </div>

      <div className="search-row">
        <label className="visually-hidden" htmlFor="repair-search">
          قلب فالإصلاح
        </label>
        <input
          id="repair-search"
          type="search"
          className="search"
          placeholder="قلب بالسمية، التيليفون، الجهاز ولا الباركود…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && repairByCode(repairs, fixAzertyDigits(query))) {
              e.preventDefault();
              scanned(query);
              setQuery("");
            }
          }}
        />
      </div>
      {!query.trim() && (
        <div className="chips" role="group" aria-label="شنو نشوفو">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" className={`chip ${filter === f.value ? "on" : ""}`} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      <p className="result-count muted">{list.length} جهاز</p>
      {list.length === 0 ? (
        <p className="empty">{repairs.length ? "ما لقينا حتى جهاز هنا." : "باقي ما تسجل حتى جهاز. ملي يجيبليك شي واحد جهاز يتصلح، ضغط «＋ إصلاح جديد»."}</p>
      ) : (
        <ul className="repair-list">
          {list.map((r) => (
            <li key={r.id} className={`repair-row tone-${STATUS_INFO[r.status].tone}`}>
              <button type="button" className="repair-open" onClick={() => setSub({ kind: "open", id: r.id })} aria-label={`${r.device} · ${r.owner}`}>
                {r.photo ? <img className="repair-thumb" src={r.photo} alt="" /> : <span className="repair-thumb empty-thumb" aria-hidden="true">🔧</span>}
                <span className="repair-main">
                  <span className="repair-device">{r.device}</span>
                  <span className="repair-sub">
                    {r.owner} · <bdi dir="ltr">{displayDate(r.date)}</bdi>
                  </span>
                </span>
                <span className="repair-side">
                  <span className={`repair-status tone-${STATUS_INFO[r.status].tone}`}>
                    {STATUS_INFO[r.status].icon} {r.status}
                  </span>
                  {r.price > 0 && <span className="repair-left">{repairRemaining(r) > 0 ? `باقي ${money(repairRemaining(r))}` : "خالص"}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {(sub?.kind === "add" || sub?.kind === "edit") && (
        <RepairForm
          data={data}
          repair={sub.kind === "edit" ? repairs.find((r) => r.id === sub.id) : undefined}
          onClose={() => setSub(sub.kind === "edit" ? { kind: "open", id: sub.id } : null)}
          onSaved={(id, isNew) => {
            onToast(isNew ? "تسجل الجهاز" : "تبدل الإصلاح");
            setSub({ kind: "open", id, justAdded: isNew });
          }}
        />
      )}
      {sub?.kind === "open" && repairs.some((r) => r.id === sub.id) && (
        <RepairDetail
          data={data}
          repair={repairs.find((r) => r.id === sub.id)!}
          justAdded={sub.justAdded}
          onClose={() => setSub(null)}
          onEdit={() => setSub({ kind: "edit", id: sub.id })}
          onDelete={() => setSub({ kind: "delete", id: sub.id })}
          onToast={onToast}
        />
      )}
      {sub?.kind === "delete" && (
        <Confirm
          title="حذف الإصلاح"
          confirmLabel="حذف"
          danger
          onClose={() => setSub({ kind: "open", id: sub.id })}
          onConfirm={() => {
            const r = repairs.find((x) => x.id === sub.id);
            data.run(`حذف إصلاح · ${r?.device ?? ""}`, { type: "repair.delete", id: sub.id });
            onToast("تحذف الإصلاح");
            setSub(null);
          }}
        >
          <p className="lead">نحيدو هاد الإصلاح؟ الصورة والمعلومات ديالو غادي يتمسحو.</p>
        </Confirm>
      )}
      {scanning && (
        <BarcodeScanner
          title="📷 سكاني الباركود ديال الجهاز"
          onClose={() => setScanning(false)}
          onResult={(code) => {
            setScanning(false);
            scanned(code);
          }}
        />
      )}
    </div>
  );
}

/** Add a repair, or change one: photo, owner, device, problem, price, advance, when. */
function RepairForm({ data, repair, onClose, onSaved }: { data: LedgerState; repair?: Repair; onClose: () => void; onSaved: (id: string, isNew: boolean) => void }) {
  const ledger = data.ledger!;
  const now = nowParts();
  const [v, setV] = useState({
    owner: repair?.owner ?? "",
    phone: repair?.phone ?? "",
    device: repair?.device ?? "",
    problem: repair?.problem ?? "",
    price: repair?.price ? String(repair.price) : "",
    advance: repair?.advance ? String(repair.advance) : "",
    date: repair?.date ?? now.date,
    time: repair?.time ?? now.time,
    notes: repair?.notes ?? "",
    photo: repair?.photo ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const saved = useRef(false);
  const set = (k: keyof typeof v) => (value: string) => {
    setV((o) => ({ ...o, [k]: value }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  async function takePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      set("photo")(await photoForCell(file));
    } catch (e) {
      setErrors((x) => ({ ...x, photo: e instanceof Error ? e.message : "ما قدرناش نقراو الصورة" }));
    } finally {
      setPhotoBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const price = v.price.trim() ? parseAmount(v.price) : 0;
    const advance = v.advance.trim() ? parseAmount(v.advance) : 0;
    const err: Record<string, string> = {};
    if (!v.owner.trim()) err.owner = "السمية ضرورية";
    if (!v.device.trim()) err.device = "شنو هو الجهاز؟";
    if (!(price >= 0)) err.price = "الثمن غير صحيح";
    if (!(advance >= 0)) err.advance = "التسبيق غير صحيح";
    else if (price > 0 && advance > price) err.advance = "التسبيق كبر من الثمن";
    if (!v.date) err.date = "التاريخ ضروري";
    setErrors(err);
    if (Object.keys(err).length || saved.current) return;
    saved.current = true;
    const fields = {
      owner: v.owner.trim(),
      phone: v.phone.trim(),
      device: v.device.trim(),
      problem: v.problem.trim(),
      price,
      advance,
      date: v.date,
      time: v.time || now.time,
      notes: v.notes.trim(),
      photo: v.photo,
    };
    if (repair) {
      data.run(`تعديل إصلاح · ${fields.device}`, { type: "repair.update", id: repair.id, base: repair.updatedAt, patch: fields });
      return onSaved(repair.id, false);
    }
    const id = newLedgerId("R");
    const at = new Date().toISOString();
    data.run(`إصلاح جديد · ${fields.device}`, {
      type: "repair.add",
      repair: { id, code: newRepairCode(id, ledger), status: "مستلم", ...fields, createdAt: at, updatedAt: at },
    });
    onSaved(id, true);
  }

  return (
    <Modal
      title={repair ? `تعديل: ${repair.device}` : "🔧 إصلاح جديد"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" form="repair-form" className="btn primary" disabled={photoBusy}>
            {repair ? "حفظ" : "سجل الجهاز"}
          </button>
        </>
      }
    >
      <form id="repair-form" className="form-grid" noValidate onSubmit={submit}>
        <div className="repair-photo-field wide">
          {v.photo ? <img className="repair-photo" src={v.photo} alt="تصويرة الجهاز" /> : <span className="repair-photo empty-photo">📷</span>}
          <div className="repair-photo-actions">
            <label className="btn">
              {photoBusy ? "كنصغرو الصورة…" : v.photo ? "📷 صورة أخرى" : "📷 صور الجهاز"}
              <input type="file" accept="image/*" capture="environment" className="visually-hidden" onChange={(e) => void takePhoto(e.target.files?.[0])} />
            </label>
            {v.photo && (
              <button type="button" className="link-btn" onClick={() => set("photo")("")}>
                حيد الصورة
              </button>
            )}
            {errors.photo && <span className="field-error">{errors.photo}</span>}
          </div>
        </div>
        <Field id="rp-owner" label="مول الجهاز" error={errors.owner}>
          <input id="rp-owner" value={v.owner} onChange={(e) => set("owner")(e.target.value)} autoFocus={!repair} />
        </Field>
        <Field id="rp-phone" label="التيليفون">
          <input id="rp-phone" type="tel" inputMode="tel" dir="ltr" value={v.phone} onChange={(e) => set("phone")(e.target.value)} />
        </Field>
        <Field id="rp-device" label="الجهاز" error={errors.device} hint="مثلا: Samsung A15، Machine à laver Candy" wide>
          <input id="rp-device" value={v.device} onChange={(e) => set("device")(e.target.value)} />
        </Field>
        <Field id="rp-problem" label="المشكل" wide>
          <textarea id="rp-problem" rows={2} value={v.problem} onChange={(e) => set("problem")(e.target.value)} />
        </Field>
        <Field id="rp-price" label="ثمن الإصلاح" error={errors.price} hint="درهم · إلا باقي ما عرفتيهش خليه خاوي">
          <input id="rp-price" inputMode="decimal" dir="ltr" value={v.price} onChange={(e) => set("price")(e.target.value)} />
        </Field>
        <Field id="rp-advance" label="التسبيق" error={errors.advance} hint="درهم">
          <input id="rp-advance" inputMode="decimal" dir="ltr" value={v.advance} onChange={(e) => set("advance")(e.target.value)} />
        </Field>
        <Field id="rp-date" label="التاريخ" error={errors.date}>
          <input id="rp-date" type="date" value={v.date} onChange={(e) => set("date")(e.target.value)} />
        </Field>
        <Field id="rp-time" label="الساعة">
          <input id="rp-time" type="time" value={v.time} onChange={(e) => set("time")(e.target.value)} />
        </Field>
        <Field id="rp-notes" label="ملاحظات" wide>
          <input id="rp-notes" value={v.notes} onChange={(e) => set("notes")(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

/** One repair: photo, details, status, its barcode (image / sticker) and WhatsApp messages to the owner. */
function RepairDetail({
  data,
  repair: r,
  justAdded,
  onClose,
  onEdit,
  onDelete,
  onToast,
}: {
  data: LedgerState;
  repair: Repair;
  justAdded?: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToast: (msg: string) => void;
}) {
  // Stickers look like the shop's default; the printer settings are this device's.
  const [setup] = useLabelSetup(data.ledger!.settings.find((x) => x.key === STICKER_LOOK_KEY));
  const [printUrl, setPrintUrl] = useState("");
  const sticker = { shop: SHOP.name, name: `${r.device} · ${r.owner}` };
  const left = repairRemaining(r);
  const received = whatsappLink(r.phone, receivedMessage(r));
  const readyLink = whatsappLink(r.phone, readyMessage(r));

  function setStatus(status: RepairStatus) {
    if (status === r.status) return;
    data.run(`${STATUS_INFO[status].icon} ${status} · ${r.device}`, { type: "repair.update", id: r.id, base: r.updatedAt, patch: { status } });
    onToast(`${STATUS_INFO[status].icon} ${status}`);
  }

  function printSticker() {
    setPrintUrl(stickerCanvas(r.code, setup, sticker).toDataURL("image/png"));
    window.addEventListener("afterprint", () => setPrintUrl(""), { once: true });
    setTimeout(() => window.print(), 100);
  }

  return (
    <Modal
      title={`🔧 ${r.device}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn danger-ghost" onClick={onDelete}>
            حذف
          </button>
          <button type="button" className="btn" onClick={onEdit}>
            ✏️ تعديل
          </button>
        </>
      }
    >
      {justAdded && <p className="alert info">✓ تسجل. طبع الملصق ولصقو على الجهاز، وصيفط الوصل للزبون فواتساب.</p>}
      {r.photo && <img className="repair-photo big" src={r.photo} alt={`تصويرة ${r.device}`} />}
      <dl className="facts">
        <div>
          <dt>مول الجهاز</dt>
          <dd>{r.owner}</dd>
        </div>
        <div>
          <dt>التيليفون</dt>
          <dd>
            <bdi dir="ltr">{r.phone || "—"}</bdi>
          </dd>
        </div>
        <div>
          <dt>جا نهار</dt>
          <dd>
            <bdi dir="ltr">
              {displayDate(r.date)} · {r.time}
            </bdi>
          </dd>
        </div>
        <div>
          <dt>ثمن الإصلاح</dt>
          <dd>{r.price ? money(r.price) : "—"}</dd>
        </div>
        <div>
          <dt>التسبيق</dt>
          <dd>{money(r.advance)}</dd>
        </div>
        <div>
          <dt>الباقي</dt>
          <dd className={left > 0 ? "warn-text" : "ok-text"}>{r.price ? money(left) : "—"}</dd>
        </div>
      </dl>
      {r.problem && (
        <p>
          <strong>المشكل:</strong> {r.problem}
        </p>
      )}
      {r.notes && <p className="muted small">{r.notes}</p>}

      <div className="field">
        <span>الحالة</span>
        <div className="segmented wide-seg repair-statuses" role="group" aria-label="الحالة">
          {REPAIR_STATUSES.map((s) => (
            <button key={s} type="button" className={r.status === s ? "on" : ""} aria-pressed={r.status === s} onClick={() => setStatus(s)}>
              {STATUS_INFO[s].icon} {s}
            </button>
          ))}
        </div>
      </div>

      <div className="repair-code">
        <Ean13 code={r.code} />
        <div className="setup-actions">
          <button type="button" className="btn" onClick={printSticker}>
            🖨️ طبع الملصق
          </button>
          <button type="button" className="btn" onClick={() => void downloadStickerPng(r.code, setup, sticker)}>
            ⬇️ صورة
          </button>
        </div>
      </div>

      <div className="setup-actions">
        {received && (
          <a className="btn" href={received} target="_blank" rel="noopener noreferrer">
            📲 وصل الاستلام
          </a>
        )}
        {readyLink && (r.status === "واجد" || r.status === "ما تصلحش") && (
          <a className="btn whatsapp" href={readyLink} target="_blank" rel="noopener noreferrer">
            📲 خبرو أنه واجد
          </a>
        )}
      </div>
      {(r.by || r.origin) && (
        <p className="muted small">
          آخر تعديل: {r.by} {r.origin && <bdi dir="ltr">{r.origin}</bdi>}
        </p>
      )}

      {printUrl &&
        createPortal(
          <div id="print-root" className="labels-print roll">
            <style>{pageCss(setup, [1])}</style>
            <div className="label-sheet">
              <div className="label-cell" style={{ width: `${paperWidth(setup)}mm`, height: `${pitch(setup)}mm` }}>
                <img src={printUrl} alt="" style={{ position: "absolute", left: `${setup.dx}mm`, top: `${setup.dy}mm`, width: `${setup.w}mm`, height: `${setup.h}mm` }} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </Modal>
  );
}
