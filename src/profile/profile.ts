import type { Slot } from '../data/types';

export type Level = 'foundation' | 'diploma' | 'degree' | 'masters';
export const LEVELS: Level[] = ['foundation', 'diploma', 'degree', 'masters'];
export const DAYS: Slot['day'][] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface Profile {
  year: 1 | 2 | 3 | 4;
  level: Level;
  interests: string[];
  free: Slot[];
  going: string[];
  week: string[];
}

export const PROFILE_KEY = 'apu-campus-graph/profile';

export const emptyProfile = (): Profile => ({
  year: 1,
  level: 'degree',
  interests: [],
  free: [],
  going: [],
  week: [],
});

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Profile>;
    if (!p || typeof p !== 'object') return null;
    // Fill anything an older save may lack so callers can rely on the shape.
    return { ...emptyProfile(), ...p } as Profile;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: the profile lives for this session only */
  }
}

/** Add the id if missing, remove it if present. */
export function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Human labels for the interest tags derived in the catalog. */
export const INTEREST_LABEL: Record<string, string> = {
  photo: 'Photography',
  film: 'Film & video',
  music: 'Music',
  dance: 'Dance',
  tech: 'Tech',
  ai: 'AI',
  cloud: 'Cloud',
  security: 'Cybersecurity',
  business: 'Business',
  finance: 'Finance',
  culture: 'Culture',
  faith: 'Faith',
  volunteering: 'Volunteering',
  'sport-team': 'Team sports',
  'martial-arts': 'Martial arts',
  outdoor: 'Outdoors & travel',
  games: 'Games',
  language: 'Language & debate',
  leadership: 'Leadership',
  women: "Women's groups",
};
