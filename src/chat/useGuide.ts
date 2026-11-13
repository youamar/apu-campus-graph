import { useCallback, useRef, useState } from 'react';
import { localMatch, type GuideReply } from '../../shared/guide';
import { catalog } from '../data/catalog';
import type { Profile } from '../profile/profile';

export type ChatRole = 'user' | 'model';

export interface ChatMsg {
  id: string;
  role: ChatRole;
  text: string;
  /** Present on model messages: the structured reply behind the text. */
  reply?: GuideReply;
}

export interface UseGuideOptions {
  profile: Profile | null;
  /** Called once per reply, after it is appended. */
  onReply?(reply: GuideReply): void;
}

export interface UseGuide {
  messages: ChatMsg[];
  send(text: string): Promise<void>;
  pending: boolean;
  last: GuideReply | null;
}

/** Server limits (server/chat.ts): at most 20 turns, 1000 chars each. */
const MAX_MESSAGES = 20;
const MAX_TEXT = 1000;

/** The newest turns the server accepts, starting on a user turn, each clipped to the server's limit. */
export function toWire(messages: ChatMsg[]): { role: ChatRole; text: string }[] {
  let recent = messages.slice(-MAX_MESSAGES);
  while (recent.length && recent[0].role !== 'user') recent = recent.slice(1);
  return recent.map((m) => ({ role: m.role, text: m.text.slice(0, MAX_TEXT) }));
}

function isGuideReply(v: unknown): v is GuideReply {
  const r = v as GuideReply;
  return !!r && typeof r.reply === 'string' && Array.isArray(r.focusIds) && Array.isArray(r.suggestions);
}

/** Last-resort reply when both the server and the local matcher fail. */
const SAFE_REPLY: GuideReply = {
  reply: "I can't reach the guide right now. Try the category filters on the map to browse every community, or ask again in a moment.",
  focusIds: [],
  openId: null,
  suggestions: ['Show me sports clubs', 'Any tech or coding communities?', 'Show international communities'],
  source: 'offline',
};

const KNOWN_IDS = new Set(catalog.map((c) => c.id));

/** Defence in depth: only ids that exist in the bundled catalog reach the graph and the card. */
export function grounded(r: GuideReply): GuideReply {
  const focusIds = [...new Set(r.focusIds.filter((id) => typeof id === 'string' && KNOWN_IDS.has(id)))];
  const openId = r.openId && KNOWN_IDS.has(r.openId) ? r.openId : null;
  const suggestions = r.suggestions.filter((s) => typeof s === 'string' && s.trim()).slice(0, 3);
  return { ...r, focusIds, openId, suggestions, source: r.source === 'gemini' ? 'gemini' : 'offline' };
}

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function useGuide({ profile, onReply }: UseGuideOptions): UseGuide {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<GuideReply | null>(null);
  // Refs keep send() stable while always reading the latest history, profile and callback.
  const history = useRef<ChatMsg[]>([]);
  const busy = useRef(false);
  const latest = useRef({ profile, onReply });
  latest.current = { profile, onReply };

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy.current) return;
    busy.current = true;

    const userMsg: ChatMsg = { id: nextId(), role: 'user', text };
    history.current = [...history.current, userMsg];
    setMessages(history.current);
    setPending(true);

    const prof = latest.current.profile;
    let reply: GuideReply = SAFE_REPLY;
    try {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: toWire(history.current), profile: prof }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: unknown = await res.json();
        if (!isGuideReply(body)) throw new Error('Malformed reply');
        reply = body;
      } catch {
        // Server unreachable or unhappy: answer from the bundled catalog instead of showing an error.
        try {
          reply = { ...localMatch(text, catalog, prof), source: 'offline' };
        } catch {
          reply = SAFE_REPLY;
        }
      }
      reply = grounded(reply);
      const modelMsg: ChatMsg = { id: nextId(), role: 'model', text: reply.reply, reply };
      history.current = [...history.current, modelMsg];
      setMessages(history.current);
      setLast(reply);
    } finally {
      // Whatever happened above, the guide must never stay stuck in "pending".
      setPending(false);
      busy.current = false;
    }
    try {
      latest.current.onReply?.(reply);
    } catch {
      /* a consumer error must not break the chat */
    }
  }, []);

  return { messages, send, pending, last };
}
