/**
 * Days are "YYYY-MM-DD" strings and periods are the Monday "YYYY-MM-DD" (a week), "YYYY-MM" (a month), "YYYY" (a
 * year) or "all" (all time, one period wider than any data). The math runs in UTC on those strings, so a time zone
 * never moves a payment to another day.
 */
export type Grain = 'week' | 'month' | 'year' | 'all';

const DAY = 86_400_000;

const pad = (value: number) => String(value).padStart(2, '0');
const timeOf = (date: string) => Date.parse(`${date}T00:00:00Z`);
const dateOf = (time: number) => new Date(time).toISOString().slice(0, 10);

export function addDays(date: string, days: number) {
  return dateOf(timeOf(date) + days * DAY);
}

/** Days from one date to another, both counted. */
export function daysBetween(from: string, to: string) {
  return Math.round((timeOf(to) - timeOf(from)) / DAY) + 1;
}

/** Today in the browser's time zone. */
export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 0 for Monday to 6 for Sunday. */
export function weekdayOf(date: string) {
  return (new Date(timeOf(date)).getUTCDay() + 6) % 7;
}

export function periodOf(date: string, grain: Grain) {
  if (grain === 'all') return 'all';
  if (grain === 'year') return date.slice(0, 4);
  return grain === 'month' ? date.slice(0, 7) : addDays(date, -weekdayOf(date));
}

export function shiftPeriod(period: string, grain: Grain, steps: number) {
  if (grain === 'all') return 'all';
  if (grain === 'year') return String(Number(period) + steps);
  if (grain === 'week') return addDays(period, steps * 7);
  const [year, month] = period.split('-').map(Number);
  const index = year * 12 + month - 1 + steps;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function periodStart(period: string, grain: Grain) {
  if (grain === 'all') return '0000-01-01';
  if (grain === 'year') return `${period}-01-01`;
  return grain === 'month' ? `${period}-01` : period;
}

/** The last day of the period. */
export function periodEnd(period: string, grain: Grain) {
  if (grain === 'all') return '9999-12-31';
  return addDays(periodStart(shiftPeriod(period, grain, 1), grain), -1);
}

/** "October 2026", "Week of 12 Oct", "2026" or "All time"; short: "Oct" (with the year in January) or "12 Oct". */
export function periodLabel(period: string, grain: Grain, short = false) {
  if (grain === 'all') return 'All time';
  if (grain === 'year') return period;
  const date = new Date(timeOf(periodStart(period, grain)));
  if (grain === 'month') {
    if (!short) return date.toLocaleDateString('en-GB', {month: 'long', year: 'numeric', timeZone: 'UTC'});
    const month = date.toLocaleDateString('en-GB', {month: 'short', timeZone: 'UTC'});
    return date.getUTCMonth() === 0 ? `${month} ${String(date.getUTCFullYear()).slice(2)}` : month;
  }
  const day = dayLabel(period);
  return short ? day : `Week of ${day}`;
}

/** The stepper's label on a phone: "Oct 2026", "19 Oct", "2026". */
export function compactPeriodLabel(period: string, grain: Grain) {
  if (grain === 'month') {
    return new Date(timeOf(periodStart(period, grain))).toLocaleDateString('en-GB', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  return grain === 'week' ? dayLabel(period) : periodLabel(period, grain);
}

/** "12 Oct", or "12 Oct 2025" with the year. */
export function dayLabel(date: string, withYear = false) {
  return new Date(timeOf(date)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
}

/** "Today", "Yesterday", or the day as weekdayLabel writes it: the payments' days. */
export function recentDayLabel(date: string, withYear = false) {
  if (date === today()) return 'Today';
  if (date === addDays(today(), -1)) return 'Yesterday';
  return weekdayLabel(date, withYear);
}

/** "Mon 12 Oct", or "Mon 12 Oct 2026" with the year: the payment list's day headings, the calendar's days. */
export function weekdayLabel(date: string, withYear = false) {
  return new Date(timeOf(date))
    .toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: withYear ? 'numeric' : undefined,
      timeZone: 'UTC',
    })
    .replace(',', '');
}

/** "Aug 25": an axis that spans years, each label with its own. */
export function shortMonth(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The months of the year, short, for the charts' labels. */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
