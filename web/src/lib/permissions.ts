// Rules about who may do what, as pure functions (used by the server routes, and tested).

import { CREDIT_OPS, SERVICE_CONTACTS_KEY, type Ledger, type LedgerOp } from "./ledger";
import { can, seesCost, type Me, type Permission } from "./roles";

/** May this user make this change (sent from a phone)? */
export function opAllowed(me: Me, op: LedgerOp): boolean {
  const any = (...perms: Permission[]) => perms.some((p) => can(me, p));
  switch (op.type) {
    case "client.add":
      return any("client_add", "sell_credit");
    case "client.update":
      return any("client_edit");
    case "client.delete":
      return any("client_delete");
    case "client.installment":
      return any("client_edit", "sell_credit");
    case "purchase.add":
      return any("sell_credit");
    case "purchase.update":
    case "purchase.delete":
    case "payment.update":
    case "payment.delete":
      return any("client_edit");
    case "payment.add":
      return any("payment", "sell_credit");
    case "stock.add":
    case "category.save":
      return any("stock_add");
    case "setting.save":
      // The brands' after-sales numbers: whoever follows the requests. The default
      // sticker look: whoever prints stickers (owner, stock manager).
      return op.key === SERVICE_CONTACTS_KEY ? any("claims") : any("stock_add");
    case "stock.adjust":
      // The stock manager adds deliveries; taking stock out needs full stock rights.
      return op.move && op.move.delta < 0 ? any("stock") : any("stock_add");
    case "stock.update":
    case "stock.delete":
      return any("stock");
    case "sale.add": {
      const lines = Array.isArray(op.lines) ? op.lines : [];
      return lines.every((l) => (l?.type === "كريدي" ? any("sell_credit") : any("sell_cash")));
    }
    case "sale.delete":
      return any("cancel_sale");
    case "caisse.close":
      return any("caisse");
    case "repair.add":
    case "repair.update":
    case "repair.delete":
      return any("repairs");
    case "claim.add":
    case "claim.update":
    case "claim.delete":
      return any("claims");
    // A seller's credit change kept for the owner: allowed when the change itself is.
    case "approval.add":
      return Boolean(op.op && typeof op.op === "object" && CREDIT_OPS.has(op.op.type)) && opAllowed(me, op.op);
    // Only the owner accepts or refuses.
    case "approval.decide":
      return any("owner_only");
    default:
      return false;
  }
}

/**
 * What the server records about who did it, whatever the phone sent, and
 * what a user who can't see costs isn't allowed to change.
 */
export function stampOp(me: Me, op: LedgerOp, ledger: Ledger): LedgerOp {
  switch (op.type) {
    case "sale.add":
      return {
        ...op,
        lines: (Array.isArray(op.lines) ? op.lines : []).map((l) => {
          const item = l?.stockId ? ledger.stock.find((s) => s.id === l.stockId) : undefined;
          // A seller who doesn't see costs sends none: take it from the stock card.
          const buyPrice = l.buyPrice === null && item && item.buyPrice > 0 ? Math.round(item.buyPrice * l.quantity * 100) / 100 : l.buyPrice;
          return { ...l, seller: me.name, buyPrice };
        }),
      };
    case "stock.adjust":
      return op.move ? { ...op, move: { ...op.move, seller: me.name } } : op;
    case "caisse.close":
      return op.close ? { ...op, close: { ...op.close, clerk: me.name } } : op;
    case "approval.add":
      // The change inside is stamped like any other (who sold, the cost of a credit sale).
      return op.op && typeof op.op === "object" ? { ...op, op: { ...stampOp(me, op.op, ledger), by: me.name, device: op.device } } : op;
    case "stock.update": {
      if (seesCost(me) || !op.patch) return op;
      // Can't see the cost, so can't change it (the form had none to show).
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { buyPrice, ...patch } = op.patch;
      return { ...op, patch };
    }
    default:
      return op;
  }
}

/** The ledger as this user may see it. */
export function ledgerFor(me: Me, ledger: Ledger): Ledger {
  // Repairs hold customers' names and phones: only for accounts that do repairs. Whoever
  // closes the cash drawer still gets their advances (amount, time, device), nothing personal.
  if (!can(me, "repairs")) {
    const forDrawer = can(me, "caisse") ? ledger.repairs.filter((r) => r.advance > 0 || r.paid > 0) : [];
    ledger = { ...ledger, repairs: forDrawer.map((r) => ({ ...r, owner: "", phone: "", problem: "", notes: "", photo: "" })) };
  }
  // Requests to the brands' services hold customers' names and phones too.
  if (!can(me, "claims")) ledger = { ...ledger, claims: [] };
  const cost = seesCost(me);
  const stock = cost ? ledger.stock : ledger.stock.map((s) => ({ ...s, buyPrice: 0 }));
  if (me.role === "stock") return { ...ledger, clients: [], purchases: [], payments: [], changes: [], sales: [], closings: [], approvals: [], stock };
  if (cost) return { ...ledger, stock };
  // Credit sales waiting for the owner carry their cost too.
  const approvals = ledger.approvals.map((a) =>
    a.op.type === "sale.add" ? { ...a, op: { ...a.op, lines: (a.op.lines ?? []).map((l) => ({ ...l, buyPrice: null })) } } : a,
  );
  return { ...ledger, stock, approvals, sales: ledger.sales.map((s) => ({ ...s, buyPrice: null })) };
}
