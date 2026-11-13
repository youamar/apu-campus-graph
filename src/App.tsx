import { useEffect, useState } from 'react';

const THEME_KEY = 'apu-campus-graph/theme';
const TABS = ['Dashboard', 'Timetable', 'Attendance', 'Campus Life', 'More'];

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
          <button type="button" className="icon-btn" aria-label="Search">🔍</button>
          <button type="button" className="icon-btn" aria-label="Notifications">🔔</button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <div className="avatar" aria-label="Profile">AP</div>
        </div>
      </header>
      <main className="main" />
    </div>
  );
}
