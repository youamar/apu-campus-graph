const ITEMS: { label: string; color?: string; star?: boolean }[] = [
  { label: 'Society / SIG', color: 'var(--soc)' },
  { label: 'Sports', color: 'var(--spo)' },
  { label: 'International', color: 'var(--intl)' },
  { label: 'Happening today', color: 'var(--live)' },
  { label: 'Brighter star = event coming up', star: true },
];

export default function Legend() {
  return (
    <div className="cg-pill cg-legend" aria-label="Legend">
      {ITEMS.map((i) => (
        <span key={i.label} className="cg-legend-item">
          {i.star ? (
            <span className="cg-star" aria-hidden="true">✦</span>
          ) : (
            <span className="cg-dot" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
      <span className="cg-legend-sep" aria-hidden="true" />
      <span className="cg-muted">Bigger node = more info published · Events are sample data</span>
    </div>
  );
}
