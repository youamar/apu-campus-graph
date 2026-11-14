import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { GuideReply } from '../../shared/guide';
import type { Extracted } from '../data/extracted';
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

/**
 * How far (px) the on-screen keyboard covers the bottom of the layout viewport:
 * innerHeight − visualViewport.height − visualViewport.offsetTop, never negative.
 */
export function keyboardOverlap(innerHeight: number, vvHeight: number, vvOffsetTop: number): number {
  const v = Math.round(innerHeight - vvHeight - vvOffsetTop);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Drag distance (px) that snaps the bottom sheet to the other state. */
const SNAP_PX = 48;

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

/** Communities the agent added to the student's week in this reply. */
const weekAdds = (r?: GuideReply) => r?.actions?.filter((a) => a.type === 'add_to_week').flatMap((a) => a.ids) ?? [];

export interface ChatPanelProps {
  catalog: Community[];
  events: CampusEvent[];
  /** Fine print read from club posts on this device, sent so the guide knows it. */
  extracted?: Extracted;
  profile: Profile | null;
  /** A reply arrived: focus the graph and/or open a card. */
  onReply(reply: GuideReply): void;
  /** A "Happening today" card was clicked. */
  onEvent(event: CampusEvent): void;
  /** A numbered community in an AI bubble was clicked. */
  onOpen(id: string): void;
  onEditProfile(): void;
  /** Phone layout: render as a draggable bottom sheet (collapsed peek or 75dvh). */
  sheet?: boolean;
}

export default function ChatPanel({
  catalog,
  events,
  extracted,
  profile,
  onReply,
  onEvent,
  onOpen,
  onEditProfile,
  sheet = false,
}: ChatPanelProps) {
  const { messages, send, pending } = useGuide({ profile, catalog, events, extracted, onReply });
  const [draft, setDraft] = useState('');
  const [promptEligible] = useState(() => !readFlag(PROMPT_KEY));
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const today = useMemo(() => happeningToday(events, new Date()), [events]);
  const [expanded, setExpanded] = useState(false);
  /** Live sheet height while the handle is being dragged; null when at rest. */
  const [dragH, setDragH] = useState<number | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const drag = useRef<{ id: number; y0: number; h0: number; moved: boolean } | null>(null);
  /** The last gesture was a real drag: swallow the click it ends with. */
  const dragged = useRef(false);
  /** The field has focus in sheet mode; the sheet then follows the on-screen keyboard. */
  const [typing, setTyping] = useState(false);
  const [kb, setKb] = useState(0);
  const isOpen = sheet && expanded;

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
  }, [messages.length, pending, promptAfter, isOpen]);

  // The field is disabled while pending; hand focus back once the reply lands.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) inputRef.current?.focus();
    wasPending.current = pending;
  }, [pending]);

  // While typing in the sheet, lift it by the part of the layout viewport the keyboard covers
  // (iOS overlays the keyboard; Android with interactive-widget=resizes-content reports 0).
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!sheet || !typing || !vv) {
      setKb(0);
      return;
    }
    const update = () => setKb(keyboardOverlap(window.innerHeight, vv.height, vv.offsetTop));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [sheet, typing]);

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
  // Sheet drag: follow the finger, then snap open or closed by direction. Every click on the grab area
  // (mouse, touch tap, keyboard, screen reader or switch) toggles, except the click a real drag ends with.
  // The pointer is captured at once so that click still lands here if the sheet shifts under the finger
  // (the field blurs and the tab bar returns).
  const onGrabDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!sheet || !asideRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    dragged.current = false;
    drag.current = { id: e.pointerId, y0: e.clientY, h0: asideRef.current.getBoundingClientRect().height, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onGrabMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) < 6) return;
    d.moved = true;
    setDragH(Math.max(96, Math.min(window.innerHeight * 0.88, d.h0 - dy)));
  };
  const onGrabUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.moved) return;
    dragged.current = true;
    setDragH(null);
    if (e.type === 'pointercancel') return;
    const dy = e.clientY - d.y0;
    if (dy < -SNAP_PX) setExpanded(true);
    else if (dy > SNAP_PX) setExpanded(false);
  };
  const onGrabClick = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setExpanded((x) => !x);
  };

  // On a phone a card or event covers the map; drop the sheet so the map is there when it closes.
  const open = (id: string) => {
    if (sheet) setExpanded(false);
    onOpen(id);
  };
  const openEvent = (ev: CampusEvent) => {
    if (sheet) setExpanded(false);
    onEvent(ev);
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
                  <button type="button" className="chat-match" onClick={() => open(c.id)}>
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
          {weekAdds(r).length > 0 && (
            <p className="chat-week" role="status">
              <span aria-hidden="true">✓</span> Added to your week:{' '}
              {weekAdds(r)
                .map((id) => byId.get(id)?.shortName ?? id)
                .join(', ')}
            </p>
          )}
          {opened && (
            <button type="button" className="chat-opened" onClick={() => open(opened.id)}>
              <Sparkle size={12} /> {opened.shortName} card opened
            </button>
          )}
        </div>
        {r?.trace && r.trace.length > 0 && (
          <ol className="chat-trace" aria-label="What the guide did">
            {r.trace.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        )}
        {r?.source === 'offline' && (
          <p className="chat-offline">Offline mode · answered from the bundled club list</p>
        )}
      </div>
    );
  };

  const head = (
    <header className="chat-head">
      <div className="chat-mark"><Sparkle size={22} /></div>
      <div className="chat-head-text">
        <h2>Ask APU</h2>
        {sheet && !expanded && inConvo ? (
          <p className="chat-peek">{pending ? 'Thinking…' : lastModel?.text}</p>
        ) : (
          <p>Your campus guide <span aria-hidden="true">·</span> powered by Gemini</p>
        )}
      </div>
    </header>
  );

  const quick = sheet && !expanded ? (!pending && lastModel?.reply ? lastModel.reply.suggestions : TRY_ASKING).slice(0, 3) : [];

  const cls = ['side-panel', 'chat'];
  if (sheet) cls.push('sheet', expanded ? 'expanded' : 'collapsed');
  if (dragH !== null) cls.push('dragging');

  return (
    <>
    {isOpen && <div className="sheet-scrim" aria-hidden="true" onClick={() => setExpanded(false)} />}
    <aside
      ref={asideRef}
      className={cls.join(' ')}
      aria-label="Ask APU, campus guide"
      style={{ ...(dragH !== null ? { height: dragH } : null), ...(kb ? { '--kb': `${kb}px` } : null) } as CSSProperties}
    >
      {sheet ? (
        <div
          className="sheet-grab"
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
          onClick={onGrabClick}
        >
          <button type="button" className="sheet-handle" aria-expanded={expanded} aria-label={expanded ? 'Collapse chat' : 'Expand chat'}>
            <span aria-hidden="true" />
          </button>
          {head}
        </div>
      ) : (
        head
      )}

      {quick.length > 0 && (
        <div className="chat-quick" role="group" aria-label="Quick questions">
          {quick.map((q) => (
            <button key={q} type="button" className="chat-chip" onClick={() => submit(q)}>{q}</button>
          ))}
        </div>
      )}

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
                            onClick={() => openEvent(ev)}
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
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          rows={1}
          value={draft}
          disabled={pending}
          maxLength={1000}
          aria-label="Ask APU a question"
          placeholder={inConvo ? 'Ask a follow-up…' : sheet ? 'Ask about clubs, events, joining…' : 'Ask anything about clubs, events, how to join…'}
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
    </>
  );
}
