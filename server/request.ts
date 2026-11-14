import type { Slot } from '../src/data/types';
import { DAYS, LEVELS, type Level, type Profile } from '../src/profile/profile';
import { MAX_MESSAGES, MAX_TEXT, type Turn } from '../shared/conversation';
import { sanitizeExtracted, type Extracted } from '../src/data/extracted';

/** ChatRequest: untrusted JSON in, a validated conversation (or one precise error) out. */
export type ChatRequest =
  | { ok: true; turns: Turn[]; profile: Profile | null; extracted: Extracted }
  | { ok: false; error: string };

const HHMM = /^\d{2}:\d{2}$/;

export function parseChatRequest(body: unknown, validIds: Set<string> = new Set()): ChatRequest {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be a JSON object' };
  const { messages, profile, extracted } = body as { messages?: unknown; profile?: unknown; extracted?: unknown };
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, error: 'messages must be a non-empty array' };
  if (messages.length > MAX_MESSAGES) return { ok: false, error: `messages may hold at most ${MAX_MESSAGES} items` };
  const turns: Turn[] = [];
  for (const m of messages) {
    const role = (m as { role?: unknown })?.role;
    const text = (m as { text?: unknown })?.text;
    if (role !== 'user' && role !== 'model') return { ok: false, error: "each message role must be 'user' or 'model'" };
    if (typeof text !== 'string') return { ok: false, error: 'each message text must be a string' };
    if (text.length > MAX_TEXT) return { ok: false, error: `each message text may be at most ${MAX_TEXT} characters` };
    turns.push({ role, text });
  }
  if (!turns.some((m) => m.role === 'user' && m.text.trim())) return { ok: false, error: 'messages must include a user message' };
  return { ok: true, turns, profile: sanitizeProfile(profile), extracted: sanitizeExtracted(extracted, validIds) };
}

/** Rebuilds a Profile from untrusted input; anything malformed is dropped rather than rejected. */
export function sanitizeProfile(p: unknown): Profile | null {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const o = p as Record<string, unknown>;
  const strings = (v: unknown, max: number) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 80).slice(0, max) : [];
  const year = [1, 2, 3, 4].includes(o.year as number) ? (o.year as Profile['year']) : 1;
  const level = typeof o.level === 'string' && (LEVELS as string[]).includes(o.level) ? (o.level as Level) : 'degree';
  const free = Array.isArray(o.free)
    ? (o.free as Record<string, unknown>[])
        .filter(
          (s) =>
            s && typeof s === 'object' && (DAYS as string[]).includes(s.day as string) && HHMM.test(String(s.start)) && HHMM.test(String(s.end)),
        )
        .slice(0, 28)
        .map((s) => ({ day: s.day, start: s.start, end: s.end }) as Slot)
    : [];
  return { year, level, interests: strings(o.interests, 20), free, going: strings(o.going, 50), week: strings(o.week, 50) };
}
