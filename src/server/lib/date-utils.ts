import "server-only";

/**
 * Format a Date as YYYY-MM-DD in *local* time.
 * Using `toISOString().slice(0, 10)` rolls the date back to UTC midnight,
 * which can shift it by a day in timezones east of UTC (e.g., Asia/Jerusalem).
 */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const JERUSALEM_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Normalize a scraped transaction date (full ISO timestamp or plain day)
 * to the YYYY-MM-DD day it belongs to in Israel local time.
 *
 * israeli-bank-scrapers reports timestamps in UTC while banks post rows at
 * local midnight, so a transaction from the 1st of a month arrives as
 * 21:00/22:00 UTC on the last day of the previous month. Compared as a
 * string against YYYY-MM-DD range bounds, such a row falls into NEITHER
 * month's view. Storing the local day fixes filtering, grouping, and
 * summaries in one place. Asia/Jerusalem is hardcoded to match the
 * scraper library, which pins that timezone itself.
 */
export function toJerusalemDay(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return JERUSALEM_DAY_FORMAT.format(parsed);
}
