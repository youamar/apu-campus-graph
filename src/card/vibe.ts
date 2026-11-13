import type { Community } from '../data/types';

/** Three moments that picture what a week in a community looks like, per interest tag. */
const CAPTIONS: Record<string, [string, string, string]> = {
  photo: ['Photo walk', 'Golden hour', 'Exhibition'],
  film: ['Shoot day', 'Editing jam', 'Screening'],
  music: ['Jam session', 'Rehearsal', 'Live set'],
  dance: ['Open class', 'Practice', 'Showcase'],
  tech: ['Workshop', 'Build night', 'Demo day'],
  ai: ['Paper club', 'Model hacking', 'Demo day'],
  cloud: ['Hands-on lab', 'Cert prep', 'Build day'],
  security: ['CTF night', 'Workshop', 'Talks'],
  business: ['Pitch night', 'Networking', 'Case study'],
  finance: ['Market talk', 'Workshop', 'Competition'],
  culture: ['Cultural night', 'Food fair', 'Festival'],
  faith: ['Gathering', 'Talks', 'Community'],
  volunteering: ['Outreach', 'Clean-up', 'Charity drive'],
  'sport-team': ['Training', 'Friendly match', 'Tournament'],
  'martial-arts': ['Training', 'Sparring', 'Grading'],
  outdoor: ['Weekend trip', 'Hike', 'Group photo'],
  games: ['Game night', 'Scrims', 'Tournament'],
  language: ['Practice', 'Talks', 'Debate'],
  leadership: ['Conference', 'Workshop', 'Summit'],
  women: ['Meetup', 'Workshop', 'Mentoring'],
  society: ['Meetup', 'Workshop', 'Events'],
  sports: ['Training', 'Match day', 'Social'],
  international: ['Cultural night', 'Food fair', 'Meetup'],
};

const titleCase = (t: string) => t.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function vibeCaptions(c: Community): string[] {
  const known = c.tags.find((t) => CAPTIONS[t]);
  if (known) return CAPTIONS[known];
  const generic = c.tags.slice(0, 3).map(titleCase);
  while (generic.length < 3) generic.push(['Meetup', 'Workshop', 'Events'][generic.length]);
  return generic;
}

const STOP = new Set(['apu', 'of', 'the', 'and', '&', 'at', 'for', '-']);

/** "APU Photography Club" → "PC", "Kazakh Community" → "KC". */
export function initials(name: string): string {
  const words = name.split(/[\s/]+/).filter((w) => w && !STOP.has(w.toLowerCase()) && /[a-z0-9]/i.test(w));
  const letters = words.slice(0, 2).map((w) => w.replace(/[^a-z0-9]/gi, '')[0] ?? '');
  return (letters.join('') || name.slice(0, 2)).toUpperCase();
}
