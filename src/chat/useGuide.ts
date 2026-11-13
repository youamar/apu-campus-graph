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
    let reply: GuideReply;
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
      reply = { ...localMatch(text, catalog, prof), source: 'offline' };
    }

    const modelMsg: ChatMsg = { id: nextId(), role: 'model', text: reply.reply, reply };
    history.current = [...history.current, modelMsg];
    setMessages(history.current);
    setLast(reply);
    setPending(false);
    busy.current = false;
    latest.current.onReply?.(reply);
  }, []);

  return { messages, send, pending, last };
}
