import type { GraphFilter } from './layout';

export interface FilterCounts {
  all: number;
  soc: number;
  spo: number;
  intl: number;
  today: number;
}

const CHIPS: { key: GraphFilter; label: string; dot?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'soc', label: 'Societies & SIGs', dot: 'var(--soc)' },
  { key: 'spo', label: 'Sports', dot: 'var(--spo)' },
  { key: 'intl', label: 'International', dot: 'var(--intl)' },
  { key: 'today', label: 'Happening today' },
];

export default function Filters({
  filter,
  counts,
  onChange,
}: {
  filter: GraphFilter;
  counts: FilterCounts;
  onChange(f: GraphFilter): void;
}) {
  return (
    <div className="cg-chips" role="group" aria-label="Filter communities">
      {CHIPS.map((c) => (
        <button
          key={c.key}
          type="button"
          aria-pressed={filter === c.key}
          className={`cg-chip${filter === c.key ? ' active' : ''}${c.key === 'today' ? ' today' : ''}`}
          onClick={() => onChange(c.key)}
        >
          {c.dot && <span className="cg-dot" style={{ background: c.dot }} />}
          <span>{c.label}</span>
          <span className="cg-chip-count">{counts[c.key]}</span>
        </button>
      ))}
    </div>
  );
}
