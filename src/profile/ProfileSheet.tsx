import { useEffect, useRef, useState } from 'react';
import { TAGS } from '../data/catalog';
import type { Slot } from '../data/types';
import { emptyProfile, INTEREST_LABEL, type Level, type Profile } from './profile';

export interface ProfileSheetProps {
  profile: Profile | null;
  onSave(p: Profile): void;
  onClose(): void;
}

const DAYS: Slot['day'][] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PARTS = [
  { key: 'morning', label: 'Morning', start: '08:00', end: '12:00' },
  { key: 'afternoon', label: 'Afternoon', start: '12:00', end: '18:00' },
  { key: 'evening', label: 'Evening', start: '18:00', end: '23:00' },
] as const;
type Part = (typeof PARTS)[number];
const LEVELS: { key: Level; label: string }[] = [
  { key: 'foundation', label: 'Foundation' },
  { key: 'diploma', label: 'Diploma' },
  { key: 'degree', label: 'Degree' },
  { key: 'masters', label: 'Masters' },
];
const YEARS = [1, 2, 3, 4] as const;

const cellKey = (day: Slot['day'], p: Part) => `${day}-${p.key}`;

/** Free slots → set of grid cells that lie fully inside them. */
function cellsFrom(free: Slot[]): Set<string> {
  const out = new Set<string>();
  for (const d of DAYS)
    for (const p of PARTS)
      if (free.some((s) => s.day === d && s.start <= p.start && p.end <= s.end)) out.add(cellKey(d, p));
  return out;
}

/** Grid cells → slots, merging adjacent parts of the same day. */
function slotsFrom(cells: Set<string>): Slot[] {
  const out: Slot[] = [];
  for (const d of DAYS) {
    let cur: Slot | null = null;
    for (const p of PARTS) {
      if (cells.has(cellKey(d, p))) {
        if (cur && cur.end === p.start) cur.end = p.end;
        else out.push((cur = { day: d, start: p.start, end: p.end }));
      } else cur = null;
    }
  }
  return out;
}

const PRESETS: { label: string; cells: () => string[] }[] = [
  { label: 'Weekday evenings', cells: () => DAYS.slice(0, 5).map((d) => cellKey(d, PARTS[2])) },
  { label: 'Weekday afternoons', cells: () => DAYS.slice(0, 5).map((d) => cellKey(d, PARTS[1])) },
  { label: 'Weekends', cells: () => DAYS.slice(5).flatMap((d) => PARTS.map((p) => cellKey(d, p))) },
];

export default function ProfileSheet({ profile, onSave, onClose }: ProfileSheetProps) {
  const base = profile ?? emptyProfile();
  const [year, setYear] = useState(base.year);
  const [level, setLevel] = useState<Level>(base.level);
  const [interests, setInterests] = useState<string[]>(base.interests);
  const [cells, setCells] = useState<Set<string>>(() => cellsFrom(base.free));
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleCell = (k: string) =>
    setCells((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const applyPreset = (keys: string[]) =>
    setCells((s) => {
      const all = keys.every((k) => s.has(k));
      const n = new Set(s);
      keys.forEach((k) => (all ? n.delete(k) : n.add(k)));
      return n;
    });
  const toggleInterest = (t: string) =>
    setInterests((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));

  const save = () => onSave({ ...base, year, level, interests, free: slotsFrom(cells) });

  return (
    <div className="ps-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ps" role="dialog" aria-modal="true" aria-labelledby="ps-title" tabIndex={-1} ref={dialogRef}>
        <header className="ps-head">
          <div>
            <h2 id="ps-title">Your campus profile</h2>
            <p>Four quick questions. It stays on this device and powers “Can I join?” and “Fits your timetable”.</p>
          </div>
          <button type="button" className="dc-close" aria-label="Close" onClick={onClose}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="ps-body">
          <fieldset className="ps-q">
            <legend><span className="ps-num">1</span>Which year are you in?</legend>
            <div className="ps-seg" role="radiogroup" aria-label="Year">
              {YEARS.map((y) => (
                <button key={y} type="button" role="radio" aria-checked={year === y} className={year === y ? 'on' : ''} onClick={() => setYear(y)}>
                  Year {y}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="ps-q">
            <legend><span className="ps-num">2</span>What are you studying?</legend>
            <div className="ps-seg" role="radiogroup" aria-label="Level">
              {LEVELS.map((l) => (
                <button key={l.key} type="button" role="radio" aria-checked={level === l.key} className={level === l.key ? 'on' : ''} onClick={() => setLevel(l.key)}>
                  {l.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="ps-q">
            <legend><span className="ps-num">3</span>What are you into?<span className="ps-hint">Pick any</span></legend>
            <div className="ps-chips">
              {TAGS.map((t) => {
                const on = interests.includes(t);
                return (
                  <button key={t} type="button" aria-pressed={on} className={on ? 'ps-chip on' : 'ps-chip'} onClick={() => toggleInterest(t)}>
                    {INTEREST_LABEL[t] ?? t}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="ps-q">
            <legend><span className="ps-num">4</span>When are you usually free?</legend>
            <div className="ps-presets">
              {PRESETS.map((p) => (
                <button key={p.label} type="button" className="ps-chip" onClick={() => applyPreset(p.cells())}>
                  {p.label}
                </button>
              ))}
              {cells.size > 0 && (
                <button type="button" className="ps-clear" onClick={() => setCells(new Set())}>Clear</button>
              )}
            </div>
            <div className="ps-grid" role="group" aria-label="Free time">
              <span />
              {DAYS.map((d) => (
                <span key={d} className="ps-day">{d}</span>
              ))}
              {PARTS.map((p) => (
                <FragmentRow key={p.key} part={p} cells={cells} onToggle={toggleCell} />
              ))}
            </div>
          </fieldset>
        </div>

        <footer className="ps-foot">
          <span className="ps-muted">{cells.size ? `${slotsFrom(cells).length} free blocks a week` : 'No free time set yet'}</span>
          <div className="ps-foot-btns">
            <button type="button" className="dc-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="dc-btn primary" onClick={save}>Save profile</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function FragmentRow({ part, cells, onToggle }: { part: Part; cells: Set<string>; onToggle(k: string): void }) {
  return (
    <>
      <span className="ps-part">
        {part.label}
        <small>{part.start}–{part.end}</small>
      </span>
      {DAYS.map((d) => {
        const k = cellKey(d, part);
        const on = cells.has(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            aria-label={`${d} ${part.label.toLowerCase()}`}
            className={on ? 'ps-cell on' : 'ps-cell'}
            onClick={() => onToggle(k)}
          />
        );
      })}
    </>
  );
}
