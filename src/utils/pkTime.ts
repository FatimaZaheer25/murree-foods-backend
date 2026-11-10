// Pakistan ka waqt: UTC+5, daylight saving nahi hoti. Server UTC par chalta hai,
// is liye "aaj" ka hisaab yahan se: raat 12 baje Pakistan time naya din
export const PK_TIMEZONE = "+05:00";
const PK_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Pakistan ke kisi din ka shuru (UTC Date). 0 = aaj, 1 = kal, -1 = agla din
export const pkDayStart = (daysAgo = 0, now = new Date()) => {
  const pk = new Date(now.getTime() + PK_OFFSET_MS);
  return new Date(Date.UTC(pk.getUTCFullYear(), pk.getUTCMonth(), pk.getUTCDate() - daysAgo) - PK_OFFSET_MS);
};

// "2026-11-10" (Pakistan ki tareekh)
export const pkDateKey = (date: Date) => new Date(date.getTime() + PK_OFFSET_MS).toISOString().slice(0, 10);

// from se shuru ho kar `days` din ki tareekhen
export const pkDateKeys = (from: Date, days: number) =>
  Array.from({ length: days }, (_, i) => pkDateKey(new Date(from.getTime() + i * DAY_MS)));
