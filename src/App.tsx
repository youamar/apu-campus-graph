import { useEffect, useRef, useState } from 'react';
import CampusGraph, { type CampusGraphHandle } from './graph/CampusGraph';
import type { GraphFilter } from './graph/layout';

const THEME_KEY = 'apu-campus-graph/theme';
const TABS = ['Dashboard', 'Timetable', 'Attendance', 'Campus Life', 'More'];


const svgProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};
const SearchIcon = () => (
  <svg {...svgProps}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
const BellIcon = () => (
  <svg {...svgProps}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
);
const SunIcon = () => (
  <svg {...svgProps}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
const MoonIcon = () => (
  <svg {...svgProps}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
);

type Theme = 'dark' | 'light';

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [filter, setFilter] = useState<GraphFilter>('all');
  const [focusIds, setFocusIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const graphRef = useRef<CampusGraphHandle>(null);

  useEffect(() => {
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          <div className="logo" aria-hidden="true">A</div>
          <span className="brand">APSpace</span>
          <span className="divider" aria-hidden="true" />
          <span className="section">Campus Life</span>
        </div>
        <div className="toolbar-right">
          <nav className="tabs" aria-label="Primary">
            {TABS.map((t) => (
              <button key={t} type="button" className={t === 'Campus Life' ? 'tab active' : 'tab'}>
                {t}
              </button>
            ))}
          </nav>
          <button type="button" className="icon-btn" aria-label="Search"><SearchIcon /></button>
          <button type="button" className="icon-btn" aria-label="Notifications"><BellIcon /></button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <div className="avatar" aria-label="Profile">AP</div>
        </div>
      </header>
      <main className="main">
        <section className="graph-area" aria-label="Campus communities graph">
          <CampusGraph
            ref={graphRef}
            focusIds={focusIds}
            selectedId={selectedId}
            filter={filter}
            onSelect={setSelectedId}
            onFilterChange={setFilter}
            onReset={() => setFocusIds([])}
          />
        </section>
        <aside className="side-panel" aria-label="Campus guide" />
      </main>
    </div>
  );
}
