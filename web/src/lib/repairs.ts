// Repairs (الإصلاح): devices customers bring to be repaired. Pure rules,
// shared by the screen (components/RepairsView.tsx) and the tests.

import { newShopCode, usedCodes } from "./barcode";
import { money } from "./format";
import type { Ledger, Repair, RepairStatus } from "./ledger";
import { displayDate, SHOP } from "./receipt";
import { normalizeText } from "./shop";

/** How each status looks: still in the shop, ready, given back. */
export const STATUS_INFO: Record<RepairStatus, { icon: string; tone: "wait" | "work" | "ready" | "done" | "bad" }> = {
  مستلم: { icon: "📥", tone: "wait" },
  فالإصلاح: { icon: "🔧", tone: "work" },
  واجد: { icon: "✅", tone: "ready" },
  تسلم: { icon: "🤝", tone: "done" },
  "ما تصلحش": { icon: "❌", tone: "bad" },
};

/** What is left to pay when the device is collected. */
export const repairRemaining = (r: Pick<Repair, "price" | "advance">) => Math.max(0, Math.round((r.price - r.advance) * 100) / 100);

/** Still in the shop (not given back). */
export const inShop = (r: Repair) => r.status !== "تسلم";

/**
 * The repair's own barcode: an EAN-13 starting with 2 like the shop's
 * products, never one already used by a product or another repair.
 */
export function newRepairCode(id: string, ledger: Pick<Ledger, "stock" | "repairs">): string {
  const taken = usedCodes(ledger.stock);
  for (const r of ledger.repairs) taken.add(r.code.toLowerCase());
  return newShopCode(id, taken);
}

/** The repair with this barcode (scanned on its sticker). */
export function repairByCode(repairs: Repair[], code: string): Repair | undefined {
  const c = code.trim();
  return c ? repairs.find((r) => r.code === c) : undefined;
}

const digitsOf = (s: string) => s.replace(/\D/g, "").replace(/^(00)?212/, "0");

/** Search by owner, phone (any format), device, problem or barcode; newest first. */
export function searchRepairs(repairs: Repair[], query: string): Repair[] {
  const q = normalizeText(query);
  const qd = digitsOf(query);
  const hit = (r: Repair) =>
    !q ||
    [r.owner, r.device, r.problem, r.notes].some((x) => normalizeText(x).includes(q)) ||
    (qd.length >= 3 && (digitsOf(r.phone).includes(qd) || r.code.includes(qd)));
  return repairs.filter(hit).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`) || b.createdAt.localeCompare(a.createdAt));
}

/** WhatsApp message when the device is left at the shop: a receipt with its number. */
export function receivedMessage(r: Repair): string {
  const lines = [`السلام عليكم ${r.owner} 👋`, `📥 توصلنا بالجهاز ديالكم «${r.device}» نهار ${displayDate(r.date)} على ${r.time}.`];
  if (r.problem) lines.push(`🔧 المشكل: ${r.problem}`);
  if (r.price) lines.push(`💰 ثمن الإصلاح: ${money(r.price)}`);
  if (r.advance) lines.push(`💵 التسبيق: ${money(r.advance)}`);
  if (r.price) lines.push(`⏳ الباقي: *${money(repairRemaining(r))}*`);
  lines.push(`🧾 رقم الإصلاح: ${r.code}`, "", `🏪 ${SHOP.name}`, `📞 ${SHOP.phone}`);
  return lines.join("\n");
}

/** WhatsApp message when the device is ready to be collected. */
export function readyMessage(r: Repair): string {
  const left = repairRemaining(r);
  const lines = [`السلام عليكم ${r.owner} 👋`, `✅ الجهاز ديالكم «${r.device}» واجد، تقدرو تجيو تاخدوه.`];
  if (left > 0) lines.push(`💰 الباقي للخلاص: *${money(left)}*`);
  else if (r.price) lines.push("💰 الإصلاح خالص.");
  lines.push(`🧾 رقم الإصلاح: ${r.code}`, "", `🏪 ${SHOP.name}`, `📞 ${SHOP.phone}`);
  return lines.join("\n");
}
