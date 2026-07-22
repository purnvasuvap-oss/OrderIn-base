// src/utils/auditWindow.js
// Enforces owner-configured "Stock In" / "Stock Out" time windows for inventory edits.

export const DEFAULT_AUDIT_WINDOWS = {
  enforce: false,
  stockIn: { start: "08:00", end: "11:00" },
  stockOut: { start: "23:00", end: "23:59" },
};

const toMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const nowMinutes = (date = new Date()) => date.getHours() * 60 + date.getMinutes();

/**
 * Checks whether `date` falls inside a [start,end] window (handles same-day windows only).
 */
const withinWindow = (date, window) => {
  const start = toMinutes(window?.start);
  const end = toMinutes(window?.end);
  if (start === null || end === null) return true; // misconfigured -> don't block
  const current = nowMinutes(date);
  if (start <= end) return current >= start && current <= end;
  // overnight window (e.g. 23:00 - 00:30)
  return current >= start || current <= end;
};

/**
 * Given an action category ("in" for received/added stock, "out" for taken/spoiled/discarded)
 * and the restaurant's configured windows, determine if the action is currently allowed.
 */
export const isActionAllowed = (actionCategory, windows = DEFAULT_AUDIT_WINDOWS, date = new Date()) => {
  const cfg = windows || DEFAULT_AUDIT_WINDOWS;
  if (!cfg.enforce) return { allowed: true };

  const window = actionCategory === "in" ? cfg.stockIn : cfg.stockOut;
  const allowed = withinWindow(date, window);
  return {
    allowed,
    window,
    label: actionCategory === "in" ? "Stock In" : "Stock Out",
  };
};

/**
 * Maps an audit action type to its "in"/"out" category for window enforcement.
 */
export const actionCategoryFor = (actionType) => {
  if (actionType === "received" || actionType === "add") return "in";
  return "out"; // spoiled, discarded, taken, correction-out, etc.
};
