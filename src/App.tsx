import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GuideReply } from '../shared/guide';
import DetailCard from './card/DetailCard';
import ChatPanel from './chat/ChatPanel';
import { catalog, events } from './data/catalog';
import { applyExtracted, loadExtracted, saveExtracted, type Extracted } from './data/extracted';
import type { CampusEvent, FinePrint } from './data/types';
import CampusGraph from './graph/CampusGraph';
import type { GraphFilter } from './graph/layout';
import { emptyProfile, loadProfile, saveProfile, toggleId, type Profile } from './profile/profile';
import ProfileSheet from './profile/ProfileSheet';
import { MOBILE_QUERY, useMediaQuery } from './useMediaQuery';

const THEME_KEY = 'apu-campus-graph/theme';
const TABS = ['Dashboard', 'Timetable', 'Attendance', 'Campus Life', 'More'];
/** Status-bar colour per theme (matches --surface) so the phone chrome blends with the top bar. */
const THEME_COLOR: Record<'dark' | 'light', string> = { dark: '#191919', light: '#ffffff' };


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

const tabIcon = { ...svgProps, width: 24, height: 24, strokeWidth: 1.8 };
/** APSpace's phone tab bar, in its order; Campus Life is this app. */
const MOBILE_TABS = [
  {
    label: 'Dashboard',
    icon: <svg {...tabIcon}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>,
  },
  {
    label: 'Timetable',
    icon: <svg {...tabIcon}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  },
  {
    label: 'Campus Life',
    icon: <svg {...tabIcon}><circle cx="12" cy="12" r="2.6" /><circle cx="5" cy="6" r="1.9" /><circle cx="19" cy="7" r="1.9" /><circle cx="17.5" cy="18.5" r="1.9" /><circle cx="5.5" cy="17.5" r="1.9" /><path d="m6.6 7.3 3.3 3M17.3 8l-3.1 2.6M16.2 17.2l-2.4-3.3M7.2 16.5l2.8-2.6" /></svg>,
  },
  {
    label: 'Attendance',
    icon: <svg {...tabIcon}><rect x="5" y="4.5" width="14" height="16" rx="2" /><path d="M9 3h6v3H9zM9 13l2 2 4-4.5" /></svg>,
  },
  {
    label: 'More',
    icon: <svg {...tabIcon}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>,
  },
];

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
  const isMobile = useMediaQuery(MOBILE_QUERY);

  // Fine print read from club posts on this device overrides sample fine print (card + guide).
  const [extracted, setExtracted] = useState<Extracted>(() => loadExtracted(new Set(catalog.map((c) => c.id))));
  const liveCatalog = useMemo(() => applyExtracted(catalog, extracted), [extracted]);
  const onExtracted = useCallback((id: string, fp: FinePrint) => {
    setExtracted((e) => {
      const next = { ...e, [id]: fp };
      saveExtracted(next);
      return next;
    });
  }, []);

  const selected = useMemo(() => liveCatalog.find((c) => c.id === selectedId) ?? null, [selectedId, liveCatalog]);

  useEffect(() => {
    if (profile) saveProfile(profile);
  }, [profile]);

  /** Opens the profile sheet (toolbar avatar, card, and the chat's first-reply prompt). */
  const openProfile = useCallback(() => setProfileOpen(true), []);

  /** Focus the graph through the focusIds prop, the same path as ?focus=, so breadcrumb and hint show. */
  const [focusSource, setFocusSource] = useState<'ai' | 'user'>('user');
  const focusGraph = useCallback((ids: string[], src: 'ai' | 'user' = 'user') => {
    setFocusSource(src);
    setFocusIds([...ids]);
  }, []);
  const onGuideReply = useCallback(
    (r: GuideReply) => {
      if (r.focusIds.length) focusGraph(r.focusIds, r.source === 'gemini' ? 'ai' : 'user');
      if (r.openId) setSelectedId(r.openId);
      // Agent action: add (never remove) the verified communities to the student's week.
      const adds = r.actions?.filter((a) => a.type === 'add_to_week').flatMap((a) => a.ids) ?? [];
      if (adds.length)
        setProfile((p) => {
          const base = p ?? emptyProfile();
          return { ...base, week: [...new Set([...base.week, ...adds])] };
        });
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
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
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
          <nav className="tabs desktop-only" aria-label="Primary">
            {TABS.map((t) => (
              <button key={t} type="button" className={t === 'Campus Life' ? 'tab active' : 'tab'}>
                {t}
              </button>
            ))}
          </nav>
          <button type="button" className="icon-btn desktop-only" aria-label="Search"><SearchIcon /></button>
          <button type="button" className="icon-btn desktop-only" aria-label="Notifications"><BellIcon /></button>
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
            focusIds={focusIds}
            focusSource={focusSource}
            selectedId={selectedId}
            filter={filter}
            onSelect={setSelectedId}
            onFilterChange={setFilter}
            onReset={() => setFocusIds([])}
            rightInset={selected && !isMobile ? CARD_INSET : 0}
          />
          {selected && (
            <div className="card-dock">
              <div className="card-scrim" aria-hidden="true" onClick={closeCard} />
              <DetailCard
                key={selected.id}
                community={selected}
                profile={profile}
                onClose={closeCard}
                onToggleGoing={toggleGoing}
                onToggleWeek={toggleWeek}
                onEditProfile={openProfile}
                events={events}
                onExtracted={onExtracted}
              />
            </div>
          )}
        </section>
        <ChatPanel
          catalog={liveCatalog}
          extracted={extracted}
          events={events}
          profile={profile}
          onReply={onGuideReply}
          onEvent={onEvent}
          onOpen={setSelectedId}
          onEditProfile={openProfile}
          sheet={isMobile}
        />
      </main>
      <nav className="tabbar" aria-label="APSpace">
        {MOBILE_TABS.map((t) => (
          <button
            key={t.label}
            type="button"
            className={t.label === 'Campus Life' ? 'tabbar-btn active' : 'tabbar-btn'}
            aria-current={t.label === 'Campus Life' ? 'page' : undefined}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
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
