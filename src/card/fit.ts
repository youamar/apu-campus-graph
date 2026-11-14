import type { Community, Slot } from '../data/types';
import { provenance, type Source } from '../data/provenance';
import type { Profile } from '../profile/profile';

export const STUDENT_AFFAIRS_URL = 'https://studentaffairs.apu.edu.my/club-and-society/';
export const NO_FREE_TIMES = 'Set your free times to check';

export interface JoinCheck {
  ok: boolean;
  reason: string;
}

export interface FitCheck {
  status: 'fits' | 'clash' | 'unknown';
  reason: string;
  /** Where the schedule behind this verdict comes from (Provenance). */
  source: Source;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Free intervals for one day, sorted and merged so back-to-back slots count as one. */
function freeOn(day: Slot['day'], free: Slot[]): [number, number][] {
  const iv = free
    .filter((s) => s.day === day)
    .map((s) => [toMin(s.start), toMin(s.end)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [s, e] of iv) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Minutes of a slot that fall inside the free intervals. */
function coveredMinutes(slot: Slot, free: Slot[]): number {
  const s = toMin(slot.start);
  const e = toMin(slot.end);
  return freeOn(slot.day, free).reduce((sum, [fs, fe]) => sum + Math.max(0, Math.min(e, fe) - Math.max(s, fs)), 0);
}

const slotFits = (slot: Slot, free: Slot[]) =>
  freeOn(slot.day, free).some(([fs, fe]) => fs <= toMin(slot.start) && toMin(slot.end) <= fe);

/** "Fri 7–9 PM", "Sat 8 AM–5 PM", "Tue 6:30–8:30 PM". */
export function formatSlot(s: Slot): string {
  const part = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return { t: m ? `${h12}:${String(m).padStart(2, '0')}` : `${h12}`, ap: h < 12 ? 'AM' : 'PM' };
  };
  const a = part(s.start);
  const b = part(s.end);
  return a.ap === b.ap ? `${s.day} ${a.t}–${b.t} ${b.ap}` : `${s.day} ${a.t} ${a.ap}–${b.t} ${b.ap}`;
}

export function canJoin(c: Community, _p: Profile | null): JoinCheck {
  // Student Affairs states every club and society is open to all APU students.
  if (c.eligibility.openToAll) return { ok: true, reason: 'Open to all APU students' };
  return { ok: false, reason: c.eligibility.note ?? 'Membership is restricted. Ask the club first' };
}

export function timeFit(c: Community, p: Profile | null): FitCheck {
  const source = provenance(c).schedule;
  if (!c.schedule?.length) return { status: 'unknown', reason: 'Meeting times not published yet', source };
  if (!p || !p.free.length) return { status: 'unknown', reason: NO_FREE_TIMES, source };
  const clashes = c.schedule.filter((s) => !slotFits(s, p.free));
  if (!clashes.length) return { status: 'fits', reason: 'Fits your timetable — no clashes', source };
  return { status: 'clash', reason: `Clashes with your free time: ${clashes.map(formatSlot).join(', ')}`, source };
}

/** Share (0..1) of the community's scheduled minutes that sit inside the profile's free time. */
export function scheduleCoverage(c: Community, p: Profile | null): number {
  if (!c.schedule?.length || !p?.free.length) return 0;
  let total = 0;
  let covered = 0;
  for (const s of c.schedule) {
    total += toMin(s.end) - toMin(s.start);
    covered += coveredMinutes(s, p.free);
  }
  return total > 0 ? covered / total : 0;
}

/** The URL if it parses as http(s), else null. Scraped links must never become javascript:/data: hrefs. */
export function safeUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? raw.trim() : null;
  } catch {
    return null;
  }
}

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** joinUrl → moreInfoUrl → mailto:email → Student Affairs subpage → Student Affairs index; unsafe values are skipped. */
export function joinHref(c: Community): string {
  const url = safeUrl(c.joinUrl) ?? safeUrl(c.moreInfoUrl);
  if (url) return url;
  const email = c.email?.trim();
  if (email && EMAIL.test(email)) return `mailto:${email}`;
  return safeUrl(c.subpageUrl) ?? STUDENT_AFFAIRS_URL;
}

/** Button label that says where the join link goes. */
export function joinLabel(c: Community): string {
  const href = joinHref(c);
  if (href.startsWith('mailto:')) return 'Email to join';
  let host = '';
  try {
    host = new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return 'Join';
  }
  if (/forms\.gle|docs\.google\.com/.test(host)) return 'Join via Google Form';
  if (/linktr\.ee/.test(host)) return 'Join via Linktree';
  if (/instagram\.com/.test(host)) return 'Join via Instagram';
  if (/facebook\.com|fb\.com/.test(host)) return 'Join via Facebook';
  if (/t\.me|telegram/.test(host)) return 'Join via Telegram';
  if (/whatsapp|wa\.me/.test(host)) return 'Join via WhatsApp';
  if (/discord/.test(host)) return 'Join via Discord';
  if (/studentaffairs\.apu\.edu\.my/.test(host)) return 'How to join · Student Affairs';
  return 'Join';
}
