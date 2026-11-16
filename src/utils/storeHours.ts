// Kya abhi orders liye ja rahe hain? Admin ka switch + roz ke auqaat (Pakistan time)
const PK_OFFSET_MS = 5 * 60 * 60 * 1000;

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/; // "09:30", "23:00"

const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

// "23:00" -> "11:00 pm"
export const formatTime = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

type StoreSettings = { acceptingOrders: boolean; openTime: string; closeTime: string };

export const CLOSED_MESSAGE = "We're not taking orders right now. Please check back soon.";

export function storeStatus(settings: StoreSettings, now = new Date()) {
  if (!settings.acceptingOrders) return { open: false, message: CLOSED_MESSAGE };
  const { openTime, closeTime } = settings;
  if (!openTime || !closeTime) return { open: true, message: "" };

  const pk = new Date(now.getTime() + PK_OFFSET_MS);
  const nowMin = pk.getUTCHours() * 60 + pk.getUTCMinutes();
  const from = minutesOf(openTime);
  const to = minutesOf(closeTime);
  // Raat 12 ke baad tak (jaise 18:00 se 02:00) bhi chalta hai
  const open = from === to ? true : from < to ? nowMin >= from && nowMin < to : nowMin >= from || nowMin < to;

  return open
    ? { open: true, message: "" }
    : { open: false, message: `We're closed right now. We take orders from ${formatTime(openTime)} to ${formatTime(closeTime)}.` };
}
