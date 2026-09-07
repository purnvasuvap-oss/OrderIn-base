import { useCallback, useEffect, useState } from "react";

const KEY = "orderin_group_order";

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
};

const write = (v) => {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("group-order:updated", { detail: v }));
  } catch {
    /* ignore */
  }
};

const makeCode = () =>
  Math.random().toString(36).slice(2, 6).toUpperCase();

/**
 * Game Day group ordering — a shared table tab ordered in "rounds".
 *
 * NOTE: this is the local-first cut. `session` is persisted to localStorage
 * and broadcast within the tab; wiring it to Firestore so separate devices
 * on the same table see each other's items in real time is the next step
 * (see project_stadium_newui memory).
 */
export function useGroupOrder(tableNumber) {
  const [session, setSession] = useState(read);

  useEffect(() => {
    const onUpdate = (e) => setSession(e.detail ?? read());
    window.addEventListener("group-order:updated", onUpdate);
    return () => window.removeEventListener("group-order:updated", onUpdate);
  }, []);

  const start = useCallback(
    (name) => {
      const next = {
        code: makeCode(),
        table: tableNumber || null,
        host: name || "Host",
        round: 1,
        startedAt: Date.now(),
        members: [name || "Host"],
      };
      write(next);
      setSession(next);
      return next;
    },
    [tableNumber]
  );

  const join = useCallback((code, name) => {
    const cur = read();
    const base =
      cur && cur.code === code.toUpperCase()
        ? cur
        : { code: code.toUpperCase(), table: null, host: "Host", round: 1, startedAt: Date.now(), members: [] };
    const next = { ...base, members: Array.from(new Set([...(base.members || []), name || "Guest"])) };
    write(next);
    setSession(next);
    return next;
  }, []);

  const nextRound = useCallback(() => {
    const cur = read();
    if (!cur) return;
    const next = { ...cur, round: (cur.round || 1) + 1 };
    write(next);
    setSession(next);
  }, []);

  const leave = useCallback(() => {
    write(null);
    setSession(null);
  }, []);

  return { session, start, join, nextRound, leave, active: !!session };
}
