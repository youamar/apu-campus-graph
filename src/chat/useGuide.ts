import { useCallback, useMemo, useRef, useState } from 'react';
import type { GuideReply } from '../../shared/guide';
import { answerOffline, groundReply, SAFE_REPLY, toWire as toWireTurns, type TurnRole } from '../../shared/conversation';
import type { Extracted } from '../data/extracted';
import type { CampusEvent, Community } from '../data/types';
import type { Profile } from '../profile/profile';

export type ChatRole = TurnRole;

export interface ChatMsg {
  id: string;
  role: ChatRole;
  text: string;
  /** Present on model messages: the structured reply behind the text. */
  reply?: GuideReply;
}

export interface UseGuideOptions {
  profile: Profile | null;
  /** The communities and events replies are grounded in (and answered from offline). */
  catalog: Community[];
  events: CampusEvent[];
  /** Fine print read from club posts on this device; sent so the guide uses it. */
  extracted?: Extracted;
  /** Called once per reply, after it is appended. */
  onReply?(reply: GuideReply): void;
}

export interface UseGuide {
  messages: ChatMsg[];
  send(text: string): Promise<void>;
  pending: boolean;
  last: GuideReply | null;
}

/** The newest turns the server accepts (shared contract), as plain wire turns. */
export const toWire = (messages: ChatMsg[]) => toWireTurns(messages.map(({ role, text }) => ({ role, text })));

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function useGuide({ profile, catalog, events, extracted, onReply }: UseGuideOptions): UseGuide {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<GuideReply | null>(null);
  // Refs keep send() stable while always reading the latest history, inputs and callback.
  const history = useRef<ChatMsg[]>([]);
  const busy = useRef(false);
  const validIds = useMemo(() => new Set(catalog.map((c) => c.id)), [catalog]);
  const latest = useRef({ profile, catalog, events, extracted, onReply, validIds });
  latest.current = { profile, catalog, events, extracted, onReply, validIds };

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy.current) return;
    busy.current = true;

    const userMsg: ChatMsg = { id: nextId(), role: 'user', text };
    history.current = [...history.current, userMsg];
    setMessages(history.current);
    setPending(true);

    const { profile: prof, catalog: cat, events: evs, extracted: ext, validIds } = latest.current;
    const turns = toWire(history.current);
    let reply: GuideReply = SAFE_REPLY;
    try {
      let fromServer: GuideReply | null = null;
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: turns, profile: prof, ...(ext && Object.keys(ext).length ? { extracted: ext } : {}) }),
        });
        if (res.ok) {
          const body = (await res.json()) as { source?: unknown };
          // Defence in depth: only catalog ids reach the graph and the card.
          fromServer = groundReply(body, validIds, body?.source === 'gemini' ? 'gemini' : 'offline');
        }
      } catch {
        /* server unreachable: answer offline below */
      }
      // Same offline policy as the server (shared/conversation), with history and events.
      reply = fromServer ?? groundReply(answerOffline(turns, { catalog: cat, events: evs, profile: prof }), validIds, 'offline') ?? SAFE_REPLY;
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
