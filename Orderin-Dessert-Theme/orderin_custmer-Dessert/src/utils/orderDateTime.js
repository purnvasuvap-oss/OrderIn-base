const SLASH_DATE_TIME_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i;

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const normalizeYear = (year) => {
  const numericYear = Number(year);
  if (String(year).length === 2) {
    return numericYear >= 70 ? 1900 + numericYear : 2000 + numericYear;
  }
  return numericYear;
};

const parseSlashDateTime = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = trimmed.match(SLASH_DATE_TIME_REGEX);
  if (!match) return null;

  const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw, secondRaw, meridiemRaw] = match;
  const day = Number(dayRaw);
  const monthIndex = Number(monthRaw) - 1;
  const year = normalizeYear(yearRaw);
  let hours = hourRaw ? Number(hourRaw) : 0;
  const minutes = minuteRaw ? Number(minuteRaw) : 0;
  const seconds = secondRaw ? Number(secondRaw) : 0;
  const meridiem = meridiemRaw ? meridiemRaw.toUpperCase() : null;

  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  const parsed = new Date(year, monthIndex, day, hours, minutes, seconds);
  return isValidDate(parsed) ? parsed : null;
};

const parseTimestampValue = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return isValidDate(parsed) ? parsed : null;
  }

  if (typeof value?.toDate === "function") {
    const parsed = value.toDate();
    return isValidDate(parsed) ? parsed : null;
  }

  if (typeof value === "string") {
    const slashParsed = parseSlashDateTime(value);
    if (slashParsed) return slashParsed;

    const parsed = new Date(value);
    return isValidDate(parsed) ? parsed : null;
  }

  return null;
};

export const createOrderTimestamp = (baseDate = new Date()) => {
  const createdAtDate = baseDate instanceof Date ? baseDate : new Date(baseDate);
  const safeDate = isValidDate(createdAtDate) ? createdAtDate : new Date();

  return {
    createdAt: safeDate.toISOString(),
    createdAtMs: safeDate.getTime(),
    time: safeDate.toISOString(),
    timestamp: safeDate,
  };
};

export const parseOrderTimestamp = (orderLike) => {
  if (!orderLike) return new Date();

  const candidates = [
    orderLike.createdAt,
    orderLike.createdAtMs,
    orderLike.timestamp,
    orderLike.time,
    orderLike.paidAt,
    orderLike.deliveredAt,
  ];

  for (const candidate of candidates) {
    const parsed = parseTimestampValue(candidate);
    if (parsed) return parsed;
  }

  return new Date();
};
