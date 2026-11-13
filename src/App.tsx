import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GuideReply } from '../shared/guide';
import DetailCard from './card/DetailCard';
import ChatPanel from './chat/ChatPanel';
import { catalog, events } from './data/catalog';
import type { CampusEvent } from './data/types';
import CampusGraph, { type CampusGraphHandle } from './graph/CampusGraph';
import type { GraphFilter } from './graph/layout';
import { emptyProfile, loadProfile, saveProfile, toggleId, type Profile } from './profile/profile';
import ProfileSheet from './profile/ProfileSheet';

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

/** Card width plus its 16px margins: the graph keeps focused nodes left of this. */
const CARD_INSET = 392 + 32;

/** Dev-only deep links for screenshots: ?card=<id>, ?profile=1, ?focus=<id,id>. */
function devParam(name: string): string | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

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
  const [focusIds, setFocusIds] = useState<string[]>(() => devParam('focus')?.split(',').filter(Boolean) ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(() => devParam('card'));
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  const [profileOpen, setProfileOpen] = useState(() => devParam('profile') === '1');
  const graphRef = useRef<CampusGraphHandle>(null);

  const selected = useMemo(() => catalog.find((c) => c.id === selectedId) ?? null, [selectedId]);

  useEffect(() => {
    if (profile) saveProfile(profile);
  }, [profile]);

  /** Opens the profile sheet (toolbar avatar, card, and the chat's first-reply prompt). */
  const openProfile = useCallback(() => setProfileOpen(true), []);

  /** Focus the graph through the focusIds prop, the same path as ?focus=, so breadcrumb and hint show. */
  const focusGraph = useCallback((ids: string[]) => setFocusIds([...ids]), []);
  const onGuideReply = useCallback(
    (r: GuideReply) => {
      if (r.focusIds.length) focusGraph(r.focusIds);
      if (r.openId) setSelectedId(r.openId);
    },
    [focusGraph],
  );
  const onEvent = useCallback(
    (ev: CampusEvent) => {
      focusGraph([ev.communityId]);
      setSelectedId(ev.communityId);
    },
    [focusGraph],
  );
  const closeCard = useCallback(() => setSelectedId(null), []);
  const toggleGoing = useCallback(
    (id: string) => setProfile((p) => {
      const base = p ?? emptyProfile();
      return { ...base, going: toggleId(base.going, id) };
    }),
    [],
  );
  const toggleWeek = useCallback(
    (id: string) => setProfile((p) => {
      const base = p ?? emptyProfile();
      return { ...base, week: toggleId(base.week, id) };
    }),
    [],
  );

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
          <button
            type="button"
            className={profile ? 'avatar set' : 'avatar'}
            aria-label="Your profile"
            aria-haspopup="dialog"
            onClick={openProfile}
          >
            {profile ? `Y${profile.year}` : 'AP'}
          </button>
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
            rightInset={selected ? CARD_INSET : 0}
          />
          {selected && (
            <div className="card-dock">
              <DetailCard
                key={selected.id}
                community={selected}
                profile={profile}
                onClose={closeCard}
                onToggleGoing={toggleGoing}
                onToggleWeek={toggleWeek}
                onEditProfile={openProfile}
              />
            </div>
          )}
        </section>
        <ChatPanel
          catalog={catalog}
          events={events}
          profile={profile}
          onReply={onGuideReply}
          onEvent={onEvent}
          onOpen={setSelectedId}
          onEditProfile={openProfile}
        />
      </main>
      {profileOpen && (
        <ProfileSheet
          profile={profile}
          onClose={() => setProfileOpen(false)}
          onSave={(p) => {
            setProfile(p);
            setProfileOpen(false);
          }}
        />
      )}
    </div>
  );
}
