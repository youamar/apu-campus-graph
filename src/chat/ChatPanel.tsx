import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { GuideReply } from '../../shared/guide';
import type { CampusEvent, Community } from '../data/types';
import type { Profile } from '../profile/profile';
import { useGuide, type ChatMsg } from './useGuide';

const GREETING =
  "Hi! I'm your campus guide. Tell me what you enjoy, when you're free, or what you'd like to try, and I'll light up the clubs and events that fit you on the map.";

export const TRY_ASKING = [
  "I'm free Friday nights, what fits?",
  'Can a Year 1 join the AI Club?',
  'Something chill to meet people',
  'Clubs with no membership fee',
  'Find people from Indonesia',
];

const PROMPT_KEY = 'apu-campus-graph/profile-prompt-shown';
/** Events stay listed for two hours after they start. */
const EVENT_GRACE_MS = 2 * 60 * 60 * 1000;

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Today's events that have not ended yet (start >= now - 2h), soonest first, at most `max`. */
export function happeningToday(events: CampusEvent[], now: Date, max = 3): CampusEvent[] {
  return events
    .filter((e) => {
      const d = new Date(e.start);
      return sameLocalDay(d, now) && d.getTime() >= now.getTime() - EVENT_GRACE_MS;
    })
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, max);
}

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

function readFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeFlag(key: string) {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    /* storage unavailable: the prompt may show again next load */
  }
}

const Sparkle = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 1.5c.5 5.6 4.9 10 10.5 10.5-5.6.5-10 4.9-10.5 10.5C11.5 16.9 7.1 12.5 1.5 12 7.1 11.5 11.5 7.1 12 1.5Z"
    />
  </svg>
);
const ArrowIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export interface ChatPanelProps {
  catalog: Community[];
  events: CampusEvent[];
  profile: Profile | null;
  /** A reply arrived: focus the graph and/or open a card. */
  onReply(reply: GuideReply): void;
  /** A "Happening today" card was clicked. */
  onEvent(event: CampusEvent): void;
  /** A numbered community in an AI bubble was clicked. */
  onOpen(id: string): void;
  onEditProfile(): void;
}

export default function ChatPanel({ catalog, events, profile, onReply, onEvent, onOpen, onEditProfile }: ChatPanelProps) {
  const { messages, send, pending } = useGuide({ profile, onReply });
  const [draft, setDraft] = useState('');
  const [promptEligible] = useState(() => !readFlag(PROMPT_KEY));
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const today = useMemo(() => happeningToday(events, new Date()), [events]);

  const inConvo = messages.length > 0;
  const lastModel = [...messages].reverse().find((m) => m.role === 'model');
  const needsProfile = !profile || !profile.free.length;

  // First AI reply of the session: offer the profile sheet once, inline. Eligibility is fixed at
  // mount so the prompt stays put in this conversation; the flag stops it in later mounts.
  const firstModel = messages.find((m) => m.role === 'model');
  const promptAfter = promptEligible && needsProfile ? firstModel?.id ?? null : null;
  useEffect(() => {
    if (promptAfter) writeFlag(PROMPT_KEY);
  }, [promptAfter]);

  // Chat-style scrolling: keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending, promptAfter]);

  // The field is disabled while pending; hand focus back once the reply lands.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) inputRef.current?.focus();
    wasPending.current = pending;
  }, [pending]);

  // Grow the field with its content, up to a few lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const submit = (text: string) => {
    if (pending || !text.trim()) return;
    setDraft('');
    void send(text);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(draft);
    }
  };

  const renderModel = (m: ChatMsg) => {
    const r = m.reply;
    const list = r && !r.openId ? r.focusIds.map((id) => byId.get(id)).filter((c): c is Community => !!c) : [];
    const opened = r?.openId ? byId.get(r.openId) : undefined;
    return (
      <div className="chat-ai">
        <div className="chat-bubble ai">
          <p className="chat-text">{m.text}</p>
          {list.length > 0 && (
            <ol className="chat-matches">
              {list.map((c, i) => (
                <li key={c.id}>
                  <button type="button" className="chat-match" onClick={() => onOpen(c.id)}>
                    <span className="chat-num" aria-hidden="true">{i + 1}</span>
                    <span className="chat-match-body">
                      <strong>{c.shortName}</strong>
                      <span className="chat-match-desc">{c.description}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {opened && (
            <button type="button" className="chat-opened" onClick={() => onOpen(opened.id)}>
              <Sparkle size={12} /> {opened.shortName} card opened
            </button>
          )}
        </div>
        {r?.source === 'offline' && (
          <p className="chat-offline">Offline mode · answered from the bundled club list</p>
        )}
      </div>
    );
  };

  return (
    <aside className="side-panel chat" aria-label="Ask APU, campus guide">
      <header className="chat-head">
        <div className="chat-mark"><Sparkle size={22} /></div>
        <div>
          <h2>Ask APU</h2>
          <p>Your campus guide <span aria-hidden="true">·</span> powered by Gemini</p>
        </div>
      </header>

      <div className="chat-scroll" ref={scrollRef}>
        <div className={inConvo ? 'chat-log convo' : 'chat-log'} role="log" aria-live="polite" aria-label="Conversation">
          {!inConvo && (
            <>
              <div className="chat-bubble ai greeting">{GREETING}</div>
              {today.length > 0 && (
                <section className="chat-section" aria-labelledby="chat-today">
                  <h3 id="chat-today">Happening today</h3>
                  <ul className="chat-events">
                    {today.map((ev) => {
                      const cat = byId.get(ev.communityId)?.category ?? 'soc';
                      return (
                        <li key={ev.id}>
                          <button
                            type="button"
                            className="chat-event"
                            style={{ '--cat': `var(--${cat})` } as React.CSSProperties}
                            onClick={() => onEvent(ev)}
                          >
                            <span className="chat-event-bar" aria-hidden="true" />
                            <span className="chat-event-body">
                              <strong>{ev.title}</strong>
                              <span className="chat-event-meta">
                                {ev.place} <span aria-hidden="true">·</span> {timeFmt.format(new Date(ev.start))}
                                {ev.sample && <span className="chat-sample">Sample</span>}
                              </span>
                            </span>
                            <span className="chat-going">{ev.going} going</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
              <section className="chat-section" aria-labelledby="chat-try">
                <h3 id="chat-try">Try asking</h3>
                <div className="chat-try">
                  {TRY_ASKING.map((q) => (
                    <button key={q} type="button" className="chat-chip" onClick={() => submit(q)}>{q}</button>
                  ))}
                </div>
              </section>
            </>
          )}

          {messages.map((m) => (
            <Fragment key={m.id}>
              {m.role === 'user' ? <div className="chat-bubble user">{m.text}</div> : renderModel(m)}
              {m.id === promptAfter && (
                <div className="chat-profile">
                  <p>Want smarter matches? Tell me your year and free times.</p>
                  <button type="button" onClick={onEditProfile}>Set up profile</button>
                </div>
              )}
            </Fragment>
          ))}

          {pending && (
            <div className="chat-bubble ai chat-typing" role="status" aria-label="Ask APU is typing">
              <span /><span /><span />
            </div>
          )}

          {!pending && lastModel?.reply && lastModel === messages[messages.length - 1] && (
            <div className="chat-suggestions">
              {lastModel.reply.suggestions.slice(0, 3).map((s) => (
                <button key={s} type="button" className="chat-suggest" onClick={() => submit(s)}>{s}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <form className="chat-input" onSubmit={onSubmit}>
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          disabled={pending}
          maxLength={1000}
          aria-label="Ask APU a question"
          placeholder={inConvo ? 'Ask a follow-up…' : 'Ask anything about clubs, events, how to join…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="chat-send" aria-label="Send" disabled={pending || !draft.trim()}>
          <ArrowIcon />
        </button>
      </form>
      <p className="chat-foot">
        Answers use APU Student Affairs data <span aria-hidden="true">·</span> {catalog.length} communities
      </p>
    </aside>
  );
}
