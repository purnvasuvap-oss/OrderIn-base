// src/utils/rotIndex.js
// Rot Index: Score = (Days Since Arrival / Total Expected Shelf Life) * 100
// < 50 => Green (Fresh) | 50-75 => Amber (Warning) | > 75 => Red (Critical)

export const ROT_BANDS = {
  GREEN: "Green",
  AMBER: "Amber",
  RED: "Red",
  UNKNOWN: "Unknown",
};

/**
 * Normalize any Firestore/Date/ISO/ms value into a JS Date, or null.
 */
export const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

/**
 * Days elapsed between a date and now (fractional days truncated to whole days, min 0).
 */
export const daysSince = (date, now = new Date()) => {
  if (!date) return null;
  const diffMs = now.getTime() - date.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Compute the Rot Index score (0-100+) for an inventory item.
 * Requires item.arrivalDate and item.shelfLifeDays (> 0). Returns null if data is missing.
 */
export const computeRotIndex = (item, now = new Date()) => {
  if (!item) return null;
  const arrival = toDate(item.arrivalDate);
  const shelfLife = Number(item.shelfLifeDays);
  if (!arrival || !shelfLife || shelfLife <= 0) return null;

  const elapsed = daysSince(arrival, now);
  const score = (elapsed / shelfLife) * 100;
  return {
    score: Math.round(score * 10) / 10,
    daysElapsed: Math.round(elapsed * 10) / 10,
    shelfLifeDays: shelfLife,
    daysRemaining: Math.round((shelfLife - elapsed) * 10) / 10,
  };
};

export const bandForScore = (score) => {
  if (score === null || score === undefined || Number.isNaN(score)) return ROT_BANDS.UNKNOWN;
  if (score > 75) return ROT_BANDS.RED;
  if (score >= 50) return ROT_BANDS.AMBER;
  return ROT_BANDS.GREEN;
};

export const bandMeta = (band) => {
  switch (band) {
    case ROT_BANDS.RED:
      return { label: "Critical", color: "#dc2626", bg: "#fee2e2" };
    case ROT_BANDS.AMBER:
      return { label: "Warning", color: "#b45309", bg: "#fef3c7" };
    case ROT_BANDS.GREEN:
      return { label: "Fresh", color: "#15803d", bg: "#dcfce7" };
    default:
      return { label: "No shelf-life data", color: "#6b7280", bg: "#f1f5f9" };
  }
};

/**
 * Attach rotIndex + rotBand to every item in a list.
 */
export const withRotIndex = (items, now = new Date()) => {
  return (items || []).map((item) => {
    const rot = computeRotIndex(item, now);
    return {
      ...item,
      rotIndex: rot,
      rotBand: rot ? bandForScore(rot.score) : ROT_BANDS.UNKNOWN,
    };
  });
};
