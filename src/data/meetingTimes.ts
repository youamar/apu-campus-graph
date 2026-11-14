import type { Slot } from './types';

/** Whole day names (singular/plural/abbreviated) only: never "month", "Monash", "Sunway", "satellite". */
const DAY_RE = /\b(mon(?:day)?s?|tue(?:s(?:day)?)?s?|wed(?:nesday)?s?|thu(?:r(?:s(?:day)?)?)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?)\b/gi;
const DAY_OF: Record<string, Slot['day']> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const TIME = String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm)`;
/** "6:30-8:30pm" (am/pm on the end only) and "6:30pm-8:30pm" both read as one range. */
const RANGE = new RegExp(String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*${TIME}`, 'i');

function hhmm(h: string, m: string | undefined, ap: string): string {
  let hour = Number(h) % 12;
  if (ap.toLowerCase() === 'pm') hour += 12;
  return `${String(hour).padStart(2, '0')}:${m ?? '00'}`;
}
function addHours(t: string, hours: number): string {
  const [h, m] = t.split(':').map(Number);
  const total = Math.min(h * 60 + m + Math.round(hours * 60), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Parses Student Affairs' free-text meeting times into slots, e.g.
 * "Monday and Thursday, 6:30pm-8:30pm" or "Thursday 6:00pm and Sunday 4:00pm (2 hours)".
 * Returns [] when days or times are not stated.
 */
export function parseMeetingTimes(text: string | null | undefined): Slot[] {
  if (!text) return [];
  const days = [...text.matchAll(DAY_RE)].map((m) => ({ day: DAY_OF[m[1].slice(0, 3).toLowerCase()], at: m.index ?? 0 }));
  if (!days.length) return [];
  const range = text.match(RANGE);
  if (range) {
    const endAp = range[6];
    let startAp = range[3] ?? endAp;
    // "11-1pm": a start later than the end on the same half-day crosses noon.
    if (!range[3] && Number(range[1]) % 12 > Number(range[4]) % 12) startAp = endAp.toLowerCase() === 'pm' ? 'am' : 'pm';
    const start = hhmm(range[1], range[2], startAp);
    const end = hhmm(range[4], range[5], endAp);
    return days.map((d) => ({ day: d.day, start, end }));
  }
  const dur = Number(text.match(/\((\d+(?:\.\d+)?)\s*hours?/i)?.[1] ?? 2);
  const times = [...text.matchAll(new RegExp(TIME, 'gi'))].map((m) => ({ t: hhmm(m[1], m[2], m[3]), at: m.index ?? 0 }));
  const slots: Slot[] = [];
  for (const d of days) {
    const t = times.find((x) => x.at > d.at);
    if (t) slots.push({ day: d.day, start: t.t, end: addHours(t.t, dur) });
  }
  return slots;
}
