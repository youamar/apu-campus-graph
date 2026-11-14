import type { CampusEvent, Community } from '../src/data/types';
import type { Profile } from '../src/profile/profile';
import { localMatch, type GuideAction, type GuideReply } from './guide';

/**
 * The conversation contract shared by the client and the server: wire limits, what makes a reply
 * grounded, and how a turn is answered offline. Both sides call this one module, so a failure on
 * either side gets the same answer.
 */

export type TurnRole = 'user' | 'model';
export interface Turn {
  role: TurnRole;
  text: string;
}

/** Server limits; the client trims to them before sending. */
export const MAX_MESSAGES = 20;
export const MAX_TEXT = 1000;
export const MAX_FOCUS = 6;
/** add_to_week: up to 3 per call x 3 tool rounds. */
export const MAX_WEEK_ACTION = 9;

export const DEFAULT_SUGGESTIONS = ['What fits my free times?', 'Show me sports clubs', 'Any tech or coding communities?'];

/** Last-resort reply when nothing else can answer. */
export const SAFE_REPLY: GuideReply = {
  reply: "I can't reach the guide right now. Try the category filters on the map to browse every community, or ask again in a moment.",
  focusIds: [],
  openId: null,
  suggestions: ['Show me sports clubs', 'Any tech or coding communities?', 'Show international communities'],
  source: 'offline',
};

/** The newest turns the server accepts, starting on a user turn, each clipped to the limit. */
export function toWire(turns: Turn[]): Turn[] {
  let recent = turns.slice(-MAX_MESSAGES);
  while (recent.length && recent[0].role !== 'user') recent = recent.slice(1);
  return recent.map((m) => ({ role: m.role, text: m.text.slice(0, MAX_TEXT) }));
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * A grounded reply: non-empty text, only catalog ids (openId first in focus, at most MAX_FOCUS),
 * exactly 3 distinct suggestions. Returns null when the value is unusable.
 */
export function groundReply(value: unknown, validIds: Set<string>, source: GuideReply['source']): GuideReply | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
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

  const trace = Array.isArray(o.trace) ? o.trace.filter((t): t is string => typeof t === 'string').slice(0, 12) : undefined;
  const actions: GuideAction[] = [];
  if (Array.isArray(o.actions)) {
    for (const a of o.actions as { type?: unknown; ids?: unknown }[]) {
      if (a?.type !== 'add_to_week' || !Array.isArray(a.ids)) continue;
      const ids = [...new Set(a.ids.filter((id): id is string => typeof id === 'string' && validIds.has(id)))].slice(0, MAX_WEEK_ACTION);
      if (ids.length) actions.push({ type: 'add_to_week', ids });
    }
  }
  return {
    reply,
    focusIds: focus.slice(0, MAX_FOCUS),
    openId,
    suggestions,
    source,
    ...(trace?.length ? { trace } : {}),
    ...(actions.length ? { actions } : {}),
  };
}

/** Model output text (possibly fenced JSON) to a grounded reply, or null. */
export function parseGuideJson(text: string, validIds: Set<string>): GuideReply | null {
  try {
    const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(body);
    // Actions come only from verified tool calls, never from the model's own text.
    if (parsed && typeof parsed === 'object') delete parsed.actions;
    return groundReply(parsed, validIds, 'gemini');
  } catch {
    return null;
  }
}

export interface OfflineContext {
  catalog: Community[];
  events: CampusEvent[];
  profile: Profile | null;
}

/**
 * Answers the latest user turn without a model. Follow-ups ("how do I join?") borrow the topic of the
 * previous user turn. Never throws.
 */
export function answerOffline(turns: Turn[], ctx: OfflineContext): GuideReply {
  try {
    const users = turns.filter((m) => m.role === 'user' && m.text.trim()).map((m) => m.text);
    const query = users.at(-1);
    if (!query) return SAFE_REPLY;
    const first = localMatch(query, ctx.catalog, ctx.profile, ctx.events);
    // Borrow the previous topic only for a follow-up the current turn can't answer on its own.
    const confident = /communities that fit|community that fits|closest match|sample events/.test(first.reply);
    if (users.length > 1 && !confident) {
      const withContext = localMatch(`${users[users.length - 2]} ${query}`, ctx.catalog, ctx.profile, ctx.events);
      if (withContext.focusIds.length && /fit|closest/.test(withContext.reply)) return withContext;
    }
    return first;
  } catch {
    return SAFE_REPLY;
  }
}
