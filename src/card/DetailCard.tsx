import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Community, FinePrint } from '../data/types';
import { CATEGORY_COLOR, CATEGORY_NAME } from '../graph/layout';
import type { Profile } from '../profile/profile';
import { canJoin, formatSlot, joinHref, joinLabel, NO_FREE_TIMES, scheduleCoverage, timeFit } from './fit';
import { initials, vibeCaptions } from './vibe';

export interface DetailCardProps {
  community: Community;
  profile: Profile | null;
  onClose(): void;
  onToggleGoing(id: string): void;
  onToggleWeek(id: string): void;
  /** Opens the profile sheet, offered when the time-fit needs free times. */
  onEditProfile?(): void;
}

const icon = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};
const Check = () => <svg {...icon}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const Alert = () => <svg {...icon}><path d="M12 8v5M12 16.5v.01" /><circle cx="12" cy="12" r="9" /></svg>;
const Clock = () => <svg {...icon}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
const Close = () => <svg {...icon} width={18} height={18} strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>;
const Spark = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M12 1.5c.5 5.6 4.9 10 10.5 10.5-5.6.5-10 4.9-10.5 10.5C11.5 16.9 7.1 12.5 1.5 12 7.1 11.5 11.5 7.1 12 1.5z" />
  </svg>
);
const External = () => <svg {...icon} width={16} height={16} strokeWidth={2.2}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;

const FINE_ROWS: [keyof FinePrint, string][] = [
  ['fee', 'Fee'],
  ['register', 'Register'],
  ['booking', 'Booking'],
  ['slots', 'Slots'],
  ['deadline', 'Deadline'],
];

/** "~2-3 hrs/week" → "~2–3 hrs / week". */
const prettyHours = (h: string) => h.replace(/(\d)\s*-\s*(\d)/g, '$1–$2').replace(/\s*\/\s*/g, ' / ');

function Logo({ c }: { c: Community }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [c.logoUrl]);
  const showImg = c.logoUrl && !failed;
  return (
    <div className={showImg ? 'dc-logo has-img' : 'dc-logo'} aria-hidden="true">
      {showImg ? <img src={c.logoUrl} alt="" onError={() => setFailed(true)} /> : initials(c.shortName)}
    </div>
  );
}

function Box({ title, chip, children }: { title: string; chip?: ReactNode; children: ReactNode }) {
  return (
    <section className="dc-box">
      <header className="dc-box-head">
        <h3>{title}</h3>
        {chip}
      </header>
      {children}
    </section>
  );
}

const SampleChip = () => <span className="dc-sample">Sample data</span>;

export default function DetailCard({
  community: c,
  profile,
  onClose,
  onToggleGoing,
  onToggleWeek,
  onEditProfile,
}: DetailCardProps) {
  const join = canJoin(c, profile);
  const fit = timeFit(c, profile);
  const coverage = scheduleCoverage(c, profile);
  const going = profile?.going.includes(c.id) ?? false;
  const inWeek = profile?.week.includes(c.id) ?? false;
  const interested = (c.interested ?? 0) + (going ? 1 : 0);
  const captions = vibeCaptions(c);
  const fp = c.finePrint;
  const fineRows = fp ? FINE_ROWS.filter(([k]) => typeof fp[k] === 'string' && fp[k]) : [];
  const href = joinHref(c);
  const external = !href.startsWith('mailto:');
  const scheduleText = c.schedule?.length ? c.schedule.map(formatSlot).join(' · ') : '';
  const style = { '--cat': CATEGORY_COLOR[c.category] } as CSSProperties;

  // Esc closes the card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <article className="dc" style={style} aria-labelledby="dc-title" data-graph-overlay="">
      <header className="dc-head">
        <Logo c={c} />
        <div className="dc-title">
          <h2 id="dc-title">{c.name}</h2>
          <p>
            {CATEGORY_NAME[c.category]}
            {c.instagram && <span className="dc-handle"> · {c.instagram}</span>}
          </p>
        </div>
        <button type="button" className="dc-close" aria-label="Close" onClick={onClose}>
          <Close />
        </button>
      </header>

      <div className="dc-scroll">
        <div className="dc-vibe" aria-label="What it's like">
          {captions.map((cap, i) => (
            <div key={cap + i} className={`dc-tile dc-tile-${i}`}>
              <span>{cap}</span>
            </div>
          ))}
        </div>

        {c.vibeQuote ? (
          <blockquote className="dc-quote">
            “{c.vibeQuote}” <cite>— Club member{c.sample ? ' · sample data' : ''}</cite>
          </blockquote>
        ) : (
          <p className="dc-desc">
            {c.description ||
              `One of APU's ${CATEGORY_NAME[c.category]} communities. Ask the guide what they're up to this month.`}
          </p>
        )}

        <div className="dc-badges">
          <span className={join.ok ? 'dc-badge ok' : 'dc-badge warn'} title={c.eligibility.note}>
            {join.ok ? <Check /> : <Alert />}
            {join.ok ? `You can join · ${join.reason.replace(/^Open/, 'open')}` : `Ask first · ${join.reason}`}
          </span>
          {c.beginnerFriendly && <span className="dc-badge info">Beginner-friendly</span>}
          {c.recruiting && <span className="dc-badge hot">Recruiting now</span>}
        </div>

        <Box title="Time commitment">
          <div className="dc-hours">
            <strong className={c.hoursPerWeek ? undefined : 'dc-none'}>
              {c.hoursPerWeek ? prettyHours(c.hoursPerWeek) : 'Hours not published yet'}
            </strong>
            {scheduleText && <span>{scheduleText}</span>}
          </div>
          {c.schedule?.length ? (
            <div
              className={`dc-bar ${fit.status}`}
              role="meter"
              aria-label="Share of meetings inside your free time"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(coverage * 100)}
            >
              <i style={{ width: `${fit.status === 'unknown' ? 0 : Math.max(coverage * 100, 6)}%` }} />
            </div>
          ) : null}
          <p className={`dc-fit ${fit.status}`}>
            {fit.status === 'fits' ? <Check /> : fit.status === 'clash' ? <Alert /> : <Clock />}
            {fit.reason === NO_FREE_TIMES && onEditProfile ? (
              <button type="button" className="dc-link" onClick={onEditProfile}>
                {fit.reason}
              </button>
            ) : (
              <span>{fit.reason}</span>
            )}
          </p>
        </Box>

        <Box title="The fine print" chip={fp?.sample ? <SampleChip /> : undefined}>
          {fineRows.length ? (
            <dl className="dc-fine">
              {fineRows.map(([k, label]) => (
                <div key={k}>
                  <dt>{label}</dt>
                  <dd>{fp![k] as string}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="dc-empty">Not published yet. Ask the guide to check their latest post.</p>
          )}
          {fp?.source && !fp.sample && (
            <p className="dc-source">
              <Spark />
              <span>
                Extracted by Gemini from {fp.source}
                {fp.extractedAt && <span className="dc-muted"> · {fp.extractedAt}</span>}
              </span>
            </p>
          )}
        </Box>
      </div>

      <footer className="dc-actions">
        <a className="dc-btn primary" href={href} target={external ? '_blank' : undefined} rel="noreferrer">
          {joinLabel(c)}
          {external && <External />}
        </a>
        <div className="dc-row">
          <button
            type="button"
            className={going ? 'dc-btn on' : 'dc-btn'}
            aria-pressed={going}
            onClick={() => onToggleGoing(c.id)}
          >
            {going && <Check />}
            {interested > 0 ? `Go together · ${interested} interested` : 'Go together'}
          </button>
          <button
            type="button"
            className={inWeek ? 'dc-btn on' : 'dc-btn'}
            aria-pressed={inWeek}
            onClick={() => onToggleWeek(c.id)}
          >
            {inWeek && <Check />}
            {inWeek ? 'In my week' : 'Add to my week'}
          </button>
        </div>
      </footer>
    </article>
  );
}
