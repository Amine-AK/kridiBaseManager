"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { eventText, noteEvents, type NoteEvent } from "@/lib/notes";
import type { LedgerState } from "./useLedger";

// The notebook as notifications: what other accounts wrote, ticked or changed
// since this account last opened الكناش on this device. Unread count on the tab,
// a popup in the app, and a phone notification when the app is in the background
// (once allowed). When it was last opened is kept per account on the device.

const SEEN_KEY = "notes-seen";

function readSeen(account: string): string {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") as Record<string, string>;
    return typeof all[account] === "string" ? all[account] : "";
  } catch {
    return "";
  }
}

function writeSeen(account: string, at: string) {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") as Record<string, string>;
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...all, [account]: at }));
  } catch {}
}

export type NotifyPermission = NotificationPermission | "unsupported";

const permissionNow = (): NotifyPermission => (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");

/** A phone / PC notification (through the service worker: Android doesn't allow `new Notification`). */
async function showSystem(title: string, body: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return void (await reg.showNotification(title, { body, tag: "notes", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { open: "notes" } }));
    new Notification(title, { body, tag: "notes" });
  } catch {}
}

export interface NoteAlerts {
  /** Unread changes by others, newest first. */
  events: NoteEvent[];
  /** The notebook was looked at: nothing unread anymore. */
  markSeen: () => void;
  permission: NotifyPermission;
  enable: () => Promise<void>;
}

/** `onNotebook`: the notebook is on screen (no popup then, the lines are there). */
export function useNoteAlerts(data: LedgerState, onToast: (msg: string) => void, onNotebook: boolean): NoteAlerts {
  const account = data.me?.name ?? "";
  const [seen, setSeen] = useState("");
  const [permission, setPermission] = useState<NotifyPermission>("unsupported");
  const announced = useRef<Set<string> | null>(null);
  const notes = data.ledger?.notes;

  useEffect(() => setPermission(permissionNow()), []);

  // First time on this device for this account: start from now, not the whole history.
  useEffect(() => {
    if (!account) return;
    let at = readSeen(account);
    if (!at) {
      at = new Date().toISOString();
      writeSeen(account, at);
    }
    setSeen(at);
    announced.current = null;
  }, [account]);

  const events = notes && seen ? noteEvents(notes, seen, account) : [];

  useEffect(() => {
    if (!notes || !seen) return;
    // What was already there when the app opened is shown as unread, not announced again.
    if (!announced.current) {
      announced.current = new Set(events.map((e) => e.key));
      return;
    }
    const fresh = events.filter((e) => !announced.current!.has(e.key));
    for (const e of fresh) announced.current.add(e.key);
    if (!fresh.length) return;
    const text = fresh.length === 1 ? eventText(fresh[0]) : `📝 ${fresh.length} حوايج جداد فالكناش · ${eventText(fresh[0])}`;
    if (!onNotebook) onToast(text);
    if (typeof document !== "undefined" && document.visibilityState === "hidden" && permissionNow() === "granted") {
      void showSystem("📝 الكناش · ELECTRO-LMESTOUR", text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, seen]);

  const markSeen = useCallback(() => {
    if (!account) return;
    // Another device's clock may be ahead: never mark seen before the newest change.
    const newest = (notes ?? []).reduce((m, n) => (n.updatedAt > m ? n.updatedAt : m), "");
    const now = new Date().toISOString();
    const at = newest > now ? newest : now;
    writeSeen(account, at);
    setSeen(at);
  }, [account, notes]);

  const enable = useCallback(async () => {
    if (permissionNow() === "unsupported") return;
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      setPermission(permissionNow());
    }
  }, []);

  return { events, markSeen, permission, enable };
}
