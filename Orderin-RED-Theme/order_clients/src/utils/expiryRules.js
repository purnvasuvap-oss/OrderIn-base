// src/utils/expiryRules.js
// Expiry ("rot") rules for inventory batches. Pure functions, no Firestore.
//
// A batch gets its expiry one of two ways:
//   - "date":     the pack has a printed expiry date (milk, bread, sauces).
//   - "duration": no printed date, it lasts a known time in storage
//                 (rice bags: about 6 months once opened or exposed).
//                 Expiry = arrival date + duration.
//
// A buffer is a safety margin taken off the expiry: stock is treated as
// "use before" (expiry - buffer). Duration-based stock defaults to a 15-day
// buffer because the real lifespan is an estimate.
//
// The alert fires a chosen time before the use-before date: 1 hour, 2 hours,
// 2 days, 10 days, 15 days, 2 weeks, 1 month, and so on.

export const TIME_UNITS = ["hours", "days", "weeks", "months"];

export const TIME_UNIT_LABELS = {
  hours: "Hours",
  days: "Days",
  weeks: "Weeks",
  months: "Months",
};

export const EXPIRY_MODES = { DATE: "date", DURATION: "duration" };

export const DEFAULT_ALERT_BEFORE = { value: 2, unit: "days" };
export const DEFAULT_DURATION_BUFFER = { value: 15, unit: "days" };

// Quick-pick chips shown in the form, from most to least urgent.
export const ALERT_PRESETS = [
  { value: 1, unit: "hours" },
  { value: 2, unit: "hours" },
  { value: 1, unit: "days" },
  { value: 2, unit: "days" },
  { value: 10, unit: "days" },
  { value: 12, unit: "days" },
  { value: 15, unit: "days" },
  { value: 1, unit: "months" },
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && typeof value.seconds === "number") return new Date(value.seconds * 1000);
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    // "YYYY-MM-DD" from <input type="date"> is read as local midnight, not UTC,
    // so an expiry of "2026-12-01" does not shift to the previous evening in India.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Normalise {value, unit}; returns null when the value is empty or zero. */
export const normalizeSpan = (span) => {
  if (!span) return null;
  const value = toNumber(span.value);
  const unit = TIME_UNITS.includes(span.unit) ? span.unit : "days";
  return value ? { value, unit } : null;
};

/** Add (or with sign = -1, subtract) a span to a date. Months are calendar months. */
export const addSpan = (date, span, sign = 1) => {
  const base = toDate(date);
  const s = normalizeSpan(span);
  if (!base) return null;
  if (!s) return new Date(base.getTime());
  const out = new Date(base.getTime());
  switch (s.unit) {
    case "hours":
      out.setTime(out.getTime() + sign * s.value * HOUR_MS);
      break;
    case "weeks":
      out.setTime(out.getTime() + sign * s.value * 7 * DAY_MS);
      break;
    case "months": {
      const whole = Math.trunc(s.value);
      const frac = s.value - whole;
      out.setMonth(out.getMonth() + sign * whole);
      if (frac) out.setTime(out.getTime() + sign * frac * 30 * DAY_MS);
      break;
    }
    case "days":
    default:
      out.setTime(out.getTime() + sign * s.value * DAY_MS);
  }
  return out;
};

export const spanToMs = (span) => {
  const s = normalizeSpan(span);
  if (!s) return 0;
  const now = new Date(2026, 0, 1);
  return addSpan(now, s).getTime() - now.getTime();
};

export const formatSpan = (span) => {
  const s = normalizeSpan(span);
  if (!s) return "—";
  const singular = s.unit.replace(/s$/, "");
  return `${s.value} ${s.value === 1 ? singular : s.unit}`;
};

/**
 * Work out every date for a batch from the form input.
 *
 * input = {
 *   mode: "date" | "duration",
 *   arrivalDate,                       // Date | "YYYY-MM-DD" (defaults to now)
 *   expiryDate,                        // used when mode = "date"
 *   duration: { value, unit },         // used when mode = "duration"
 *   buffer: { value, unit },           // optional safety margin
 *   alertBefore: { value, unit },      // when to warn, before use-before date
 * }
 *
 * Returns null when there isn't enough to compute an expiry, otherwise
 * { arrival, expiry, useBefore, alertAt, shelfLifeDays, ... }.
 */
export const computeExpiryPlan = (input = {}, now = new Date()) => {
  const mode = input.mode === EXPIRY_MODES.DURATION ? EXPIRY_MODES.DURATION : EXPIRY_MODES.DATE;
  const arrival = toDate(input.arrivalDate) || new Date(now.getTime());

  let expiry = null;
  let duration = null;
  if (mode === EXPIRY_MODES.DURATION) {
    duration = normalizeSpan(input.duration);
    if (duration) expiry = addSpan(arrival, duration);
  } else {
    expiry = toDate(input.expiryDate);
    // A date-only expiry means "good through that day".
    if (expiry && typeof input.expiryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.expiryDate)) {
      expiry.setHours(23, 59, 0, 0);
    }
  }
  if (!expiry) return null;

  const buffer = normalizeSpan(input.buffer);
  let useBefore = buffer ? addSpan(expiry, buffer, -1) : new Date(expiry.getTime());
  if (useBefore.getTime() < arrival.getTime()) useBefore = new Date(arrival.getTime());

  const alertBefore = normalizeSpan(input.alertBefore) || { ...DEFAULT_ALERT_BEFORE };
  let alertAt = addSpan(useBefore, alertBefore, -1);
  if (alertAt.getTime() < arrival.getTime()) alertAt = new Date(arrival.getTime());

  const shelfLifeDays = Math.max(0, Math.round(((useBefore - arrival) / DAY_MS) * 10) / 10);

  return {
    mode,
    arrival,
    expiry,
    useBefore,
    alertAt,
    duration,
    buffer,
    alertBefore,
    shelfLifeDays,
  };
};

export const EXPIRY_STATUS = {
  FRESH: "fresh",
  ALERT: "alert",
  EXPIRED: "expired",
  UNKNOWN: "unknown",
};

/** "3 days", "5 hours", "40 min". Always positive; callers add "in"/"ago". */
export const formatDuration = (ms) => {
  const abs = Math.abs(ms);
  if (abs >= 2 * DAY_MS) return `${Math.round(abs / DAY_MS)} days`;
  if (abs >= DAY_MS) return "1 day";
  if (abs >= 2 * HOUR_MS) return `${Math.round(abs / HOUR_MS)} hours`;
  if (abs >= HOUR_MS) return "1 hour";
  return `${Math.max(1, Math.round(abs / 60000))} min`;
};

/**
 * Read a batch document (new fields, or the older expiryDate + warningPeriodDays)
 * and say where it stands right now.
 */
export const getBatchExpiryState = (batch, now = new Date()) => {
  if (!batch) return { status: EXPIRY_STATUS.UNKNOWN };
  const useBefore = toDate(batch.useBefore) || toDate(batch.expiryDate);
  if (!useBefore) return { status: EXPIRY_STATUS.UNKNOWN };

  let alertAt = toDate(batch.alertAt);
  if (!alertAt) {
    const legacyDays = Number(batch.warningPeriodDays);
    alertAt = addSpan(useBefore, { value: legacyDays > 0 ? legacyDays : DEFAULT_ALERT_BEFORE.value, unit: "days" }, -1);
  }

  const msLeft = useBefore.getTime() - now.getTime();
  let status = EXPIRY_STATUS.FRESH;
  if (msLeft <= 0) status = EXPIRY_STATUS.EXPIRED;
  else if (now.getTime() >= alertAt.getTime()) status = EXPIRY_STATUS.ALERT;

  return {
    status,
    useBefore,
    alertAt,
    msLeft,
    label: msLeft <= 0 ? `expired ${formatDuration(msLeft)} ago` : `use within ${formatDuration(msLeft)}`,
  };
};

/**
 * Flatten {itemName: [batches]} into active batches that are in their alert
 * window or already past use-before, soonest first.
 */
export const collectExpiringBatches = (batchesByItem = {}, now = new Date(), { includeExpired = true } = {}) => {
  const out = [];
  Object.entries(batchesByItem || {}).forEach(([itemName, batches]) => {
    (batches || []).forEach((batch) => {
      if (batch.status && batch.status !== "active") return;
      if (Number(batch.remainingQty) <= 0) return;
      const state = getBatchExpiryState(batch, now);
      if (state.status === EXPIRY_STATUS.ALERT || (includeExpired && state.status === EXPIRY_STATUS.EXPIRED)) {
        out.push({ ...batch, itemName: batch.itemName || itemName, expiryState: state });
      }
    });
  });
  return out.sort((a, b) => a.expiryState.useBefore - b.expiryState.useBefore);
};

/** Values for <input type="date">. */
export const toDateInputValue = (date) => {
  const d = toDate(date);
  if (!d) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const formatDateTime = (date) => {
  const d = toDate(date);
  if (!d) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
};

export const formatDate = (date) => {
  const d = toDate(date);
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
