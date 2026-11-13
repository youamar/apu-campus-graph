import type { Request, Response } from 'express';
import type { CampusEvent, Community, Slot } from '../src/data/types';
import type { Level, Profile } from '../src/profile/profile';
import { catalog as defaultCatalog, events as defaultEvents } from '../src/data/catalog';
import { localMatch, type GuideReply } from '../shared/guide';

export type ChatRole = 'user' | 'model';
export interface ChatMessage {
  role: ChatRole;
  text: string;
}
export interface ChatContent {
  role: ChatRole;
  parts: { text: string }[];
}
/** Everything the model call needs; the transport (Gemini) lives in gemini.ts. */
export interface ChatPrompt {
  systemInstruction: string;
  contents: ChatContent[];
}
export type Generate = (prompt: ChatPrompt, signal: AbortSignal) => Promise<string>;

export interface ChatDeps {
  /** null when no API key is configured: every request is answered offline. */
  generate: Generate | null;
  timeoutMs?: number;
  catalog?: Community[];
  events?: CampusEvent[];
}

export const MAX_MESSAGES = 20;
export const MAX_TEXT = 1000;
export const HISTORY = 8;
export const MAX_FOCUS = 6;
export const TIMEOUT_MS = 8000;

export const DEFAULT_SUGGESTIONS = [
  'What fits my free times?',
  'Show me sports clubs',
  'Any tech or coding communities?',
];

const RULES = `You are the APU Campus Graph guide. You help Asia Pacific University (APU) students find clubs, societies and communities.

Rules:
- Answer only from the CATALOG.
- Never invent communities, fees or dates.
- When a value is marked sample, say it is an example (e.g. "an example schedule is Fri 19:00-21:00").
- Keep replies under 90 words, friendly, and in the user's language.
- Return 1-6 focusIds, ordered best first.
- Set openId only when the user asks about one specific community.
- focusIds and openId must be ids copied exactly from the CATALOG. If nothing in the CATALOG fits (or the question is not about APU communities), say so briefly, return an empty focusIds and suggest what you can help with.
- suggestions: exactly 3 short follow-up questions the user could ask next.
- The user's turn may start with a [Student profile] block; use it to rank by interests and free times, but do not repeat it back.

The catalog is serialised one line per community: id | name | category | tags | description | eligibility | hours | schedule | join | flags | finePrint
- Use description to explain what a community does, and join to say how to join. Links in join are official club channels; you may share them.`;

const CATEGORY: Record<Community['category'], string> = { soc: 'society', spo: 'sports', intl: 'international' };
const slotText = (s: Slot) => `${s.day} ${s.start}-${s.end}`;
const clean = (s: string) => s.replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

const DESCRIPTION_MAX = 160;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + '…';
}

/**
 * How to join: the fine-print registration step if known, else the first public club link/handle.
 * These are club channels (join form, info page, club Instagram, club mailbox), never a person's details.
 */
function joinText(c: Community): string {
  const sampleTag = c.sample ? ' (sample)' : '';
  const via = c.joinUrl ?? c.moreInfoUrl ?? c.instagram ?? c.email;
  if (c.finePrint?.register) {
    // The register step may be sample enrichment; the scraped link is real, so keep it alongside.
    return c.finePrint.register + (c.finePrint.sample ? ' (sample)' : sampleTag) + (via ? `; link: ${via}` : '');
  }
  return via ? `via ${via}` : 'ask Student Affairs';
}

function communityLine(c: Community): string {
  const sampleTag = c.sample ? ' (sample)' : '';
  const elig = (c.eligibility.openToAll ? 'open to all' : 'restricted') + (c.eligibility.note ? `: ${c.eligibility.note}` : '');
  const fp = c.finePrint;
  let fine = '-';
  if (fp) {
    const parts = (['fee', 'booking', 'slots', 'deadline'] as const)
      .filter((k) => fp[k])
      .map((k) => `${k}: ${fp[k]}`);
    if (parts.length) fine = parts.join('; ') + (fp.sample ? ' (sample)' : '');
  }
  const flags = [c.beginnerFriendly ? 'beginner-friendly' : '', c.recruiting ? 'recruiting' : ''].filter(Boolean);
  const fields = [
    c.id,
    c.name,
    CATEGORY[c.category],
    c.tags.join(', '),
    c.description ? truncate(clean(c.description), DESCRIPTION_MAX) : '-',
    elig,
    c.hoursPerWeek ? c.hoursPerWeek + sampleTag : '-',
    c.schedule?.length ? c.schedule.map(slotText).join(', ') + sampleTag : '-',
    `join: ${joinText(c)}`,
    flags.length ? flags.join(', ') + sampleTag : '-',
    fine,
  ].map((f) => clean(String(f)));
  return fields.join(' | ') + (c.sample ? ' [sample: eligibility, hours, schedule, join steps, flags and fine print are examples]' : '');
}

function eventLine(e: CampusEvent): string {
  return [e.communityId, e.title, e.place, e.start].map(clean).join(' | ') + (e.sample ? ' [sample]' : '');
}

/** Only the fields named above are serialised: president and advisor names never reach the model; join links are club channels. */
export function buildSystemPrompt(catalog: Community[], events: CampusEvent[]): string {
  const lines = [RULES, '', `CATALOG (${catalog.length} communities):`, ...catalog.map(communityLine)];
  if (events.length) {
    lines.push('', 'EVENTS (communityId | title | place | start; all are sample examples):', ...events.map(eventLine));
  }
  return lines.join('\n');
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Validates model output against the catalog. Returns null when it is unusable (caller falls back offline). */
export function parseGuideResponse(raw: string, validIds: Set<string>): GuideReply | null {
  let data: unknown;
  try {
    const body = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const reply = str(o.reply);
  if (!reply) return null;

  const openId = typeof o.openId === 'string' && validIds.has(o.openId) ? o.openId : null;
  const focus: string[] = [];
  if (Array.isArray(o.focusIds)) {
    for (const id of o.focusIds) if (typeof id === 'string' && validIds.has(id) && !focus.includes(id)) focus.push(id);
  }
  if (openId && !focus.includes(openId)) focus.unshift(openId);

  const suggestions: string[] = [];
  if (Array.isArray(o.suggestions)) {
    for (const s of o.suggestions) {
      const t = str(s);
      if (t && !suggestions.includes(t) && suggestions.length < 3) suggestions.push(t);
    }
  }
  for (const d of DEFAULT_SUGGESTIONS) if (suggestions.length < 3 && !suggestions.includes(d)) suggestions.push(d);

  return { reply, focusIds: focus.slice(0, MAX_FOCUS), openId, suggestions, source: 'gemini' };
}

// ---------- request validation ----------

const DAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
const LEVELS = new Set(['foundation', 'diploma', 'degree', 'masters']);
const HHMM = /^\d{2}:\d{2}$/;

type Parsed = { ok: true; messages: ChatMessage[]; profile: Profile | null } | { ok: false; error: string };

export function parseBody(body: unknown): Parsed {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be a JSON object' };
  const { messages, profile } = body as { messages?: unknown; profile?: unknown };
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, error: 'messages must be a non-empty array' };
  if (messages.length > MAX_MESSAGES) return { ok: false, error: `messages may hold at most ${MAX_MESSAGES} items` };
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const role = (m as { role?: unknown })?.role;
    const text = (m as { text?: unknown })?.text;
    if (role !== 'user' && role !== 'model') return { ok: false, error: "each message role must be 'user' or 'model'" };
    if (typeof text !== 'string') return { ok: false, error: 'each message text must be a string' };
    if (text.length > MAX_TEXT) return { ok: false, error: `each message text may be at most ${MAX_TEXT} characters` };
    out.push({ role, text });
  }
  if (!out.some((m) => m.role === 'user' && m.text.trim())) return { ok: false, error: 'messages must include a user message' };
  return { ok: true, messages: out, profile: sanitizeProfile(profile) };
}

/** Rebuilds a Profile from untrusted input; anything malformed is dropped rather than rejected. */
export function sanitizeProfile(p: unknown): Profile | null {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const o = p as Record<string, unknown>;
  const strings = (v: unknown, max: number) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 80).slice(0, max) : [];
  const year = [1, 2, 3, 4].includes(o.year as number) ? (o.year as Profile['year']) : 1;
  const level = typeof o.level === 'string' && LEVELS.has(o.level) ? (o.level as Level) : 'degree';
  const free = Array.isArray(o.free)
    ? (o.free as Record<string, unknown>[])
        .filter((s) => s && typeof s === 'object' && DAYS.has(s.day as string) && HHMM.test(String(s.start)) && HHMM.test(String(s.end)))
        .slice(0, 28)
        .map((s) => ({ day: s.day, start: s.start, end: s.end }) as Slot)
    : [];
  return { year, level, interests: strings(o.interests, 20), free, going: strings(o.going, 50), week: strings(o.week, 50) };
}

export function profileSummary(p: Profile): string {
  const interests = p.interests.length ? p.interests.map(clean).filter(Boolean).join(', ') : 'none set';
  const free = p.free.length ? p.free.map(slotText).join(', ') : 'not set';
  return `[Student profile] Year ${p.year}, ${p.level}; interests: ${interests}; free times: ${free}`;
}

/** Last <= 8 turns, starting on a user turn, with the profile folded into the final user turn. */
export function buildContents(messages: ChatMessage[], profile: Profile | null): ChatContent[] {
  let recent = messages.filter((m) => m.text.trim()).slice(-HISTORY);
  while (recent.length && recent[0].role !== 'user') recent = recent.slice(1);
  const lastUser = recent.map((m) => m.role).lastIndexOf('user');
  return recent.map((m, i) => {
    const text = i === lastUser && profile ? `${profileSummary(profile)}\n\n${m.text}` : m.text;
    return { role: m.role, parts: [{ text }] };
  });
}

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([run(ctrl.signal), timeout]).finally(() => clearTimeout(timer));
}

export function createChatHandler(deps: ChatDeps) {
  const catalog = deps.catalog ?? defaultCatalog;
  const events = deps.events ?? defaultEvents;
  const validIds = new Set(catalog.map((c) => c.id));
  const systemInstruction = buildSystemPrompt(catalog, events);
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;

  return async (req: Request, res: Response) => {
    const parsed = parseBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { messages, profile } = parsed;
    const query = [...messages].reverse().find((m) => m.role === 'user' && m.text.trim())!.text;
    const offline = () => {
      try {
        return localMatch(query, catalog, profile);
      } catch {
        return { reply: 'The guide is unavailable right now. Try the category filters to browse every community.', focusIds: [], openId: null, suggestions: [...DEFAULT_SUGGESTIONS], source: 'offline' } satisfies GuideReply;
      }
    };

    let reply: GuideReply | null = null;
    if (deps.generate) {
      const generate = deps.generate;
      try {
        const raw = await withTimeout((signal) => generate({ systemInstruction, contents: buildContents(messages, profile) }, signal), timeoutMs);
        reply = parseGuideResponse(raw, validIds);
        if (!reply) console.warn('[chat] unusable model output; answering offline');
      } catch (err) {
        const status = (err as { status?: number })?.status;
        console.warn(`[chat] model call failed${status ? ` (${status})` : ''}: ${(err as Error)?.message ?? err}; answering offline`);
      }
    }
    res.json(reply ?? offline());
  };
}
