// `date.toISOString().slice(0, 10)` always renders the UTC calendar date,
// not the LOCAL one — so in any timezone ahead of UTC (e.g. IST, UTC+5:30),
// anything done between midnight and the UTC offset's worth of hours past it
// silently gets tagged with YESTERDAY's date instead of today's. That's not
// cosmetic: a "This month" report filter checks the stored date against the
// real local month, so a mis-dated record near a month boundary just
// vanishes from reports without any error — exactly what happened with an
// expense added at 12:32 AM IST landing on "Aug 31" instead of "Sep 1".
//
// This shifts the timestamp by the timezone offset first, so toISOString()'s
// UTC rendering ends up matching the local wall-clock date instead.
export function toLocalDateInputValue(date = new Date()) {
  const d = new Date(date);
  const shifted = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}

// The mirror-image bug: `new Date("2026-09-01")` parses a date-only string
// as UTC midnight, which is fine for timezones ahead of UTC but rolls back
// to the previous day for any timezone BEHIND it. The multi-arg Date
// constructor is always local-time by spec, so building the date that way
// sidesteps the ambiguity entirely rather than trading one offset bug for
// its opposite.
export function fromLocalDateInputValue(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}
