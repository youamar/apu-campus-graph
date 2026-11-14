import { catalog } from '../data/catalog';
import type { Community } from '../data/types';
import type { Profile } from '../profile/profile';
import { canJoin, joinHref, safeUrl, scheduleCoverage, timeFit } from './fit';

const photo = catalog.find((c) => c.id === 'apu-photography-club')!;
const kazakh = catalog.find((c) => c.id === 'kazakh-community')!;

const profile = (free: Profile['free']): Profile => ({
  year: 1,
  level: 'degree',
  interests: [],
  free,
  going: [],
  week: [],
});

describe('timeFit', () => {
  it('fits when every slot lies inside a free slot on the same day', () => {
    expect(photo.schedule).toEqual([{ day: 'Fri', start: '19:00', end: '21:00' }]);
    const r = timeFit(photo, profile([{ day: 'Fri', start: '18:00', end: '22:00' }]));
    expect(r.status).toBe('fits');
  });

  it('clashes when a slot is not covered', () => {
    expect(timeFit(photo, profile([{ day: 'Fri', start: '20:00', end: '22:00' }])).status).toBe('clash');
  });

  it('clashes when the free slot is on another day', () => {
    expect(timeFit(photo, profile([{ day: 'Thu', start: '18:00', end: '22:00' }])).status).toBe('clash');
  });

  it('is unknown with reason "Set your free times to check" when there is no profile', () => {
    expect(timeFit(photo, null)).toEqual({ status: 'unknown', reason: 'Set your free times to check', source: 'sample' });
  });

  it('is unknown when the profile has no free slots', () => {
    const r = timeFit(photo, profile([]));
    expect(r.status).toBe('unknown');
    expect(r.reason).toBe('Set your free times to check');
  });

  it('is unknown when the community has no schedule', () => {
    expect(kazakh.schedule).toBeUndefined();
    expect(timeFit(kazakh, profile([{ day: 'Fri', start: '08:00', end: '23:00' }])).status).toBe('unknown');
  });

  it('merges back-to-back free slots before checking', () => {
    const r = timeFit(photo, profile([
      { day: 'Fri', start: '12:00', end: '19:30' },
      { day: 'Fri', start: '19:30', end: '23:00' },
    ]));
    expect(r.status).toBe('fits');
  });

  it('reports schedule coverage for the fit bar', () => {
    expect(scheduleCoverage(photo, profile([{ day: 'Fri', start: '18:00', end: '22:00' }]))).toBe(1);
    expect(scheduleCoverage(photo, profile([{ day: 'Fri', start: '20:00', end: '22:00' }]))).toBeCloseTo(0.5);
    expect(scheduleCoverage(photo, null)).toBe(0);
  });
});

describe('canJoin', () => {
  it('an unenriched community is open to all APU students', () => {
    expect(kazakh.sample).toBe(false);
    expect(canJoin(kazakh, null)).toEqual({ ok: true, reason: 'Open to all APU students' });
  });

  it('a restricted community is not ok and explains why', () => {
    const c: Community = { ...kazakh, eligibility: { openToAll: false, note: 'Organising team by interview' } };
    expect(canJoin(c, null)).toEqual({ ok: false, reason: 'Organising team by interview' });
  });
});

describe('joinHref', () => {
  const base: Community = { ...kazakh, joinUrl: undefined, moreInfoUrl: undefined, email: undefined, subpageUrl: undefined };
  it('prefers joinUrl', () => {
    expect(joinHref({ ...base, joinUrl: 'https://forms.gle/x', moreInfoUrl: 'https://a', email: 'a@b.c' })).toBe(
      'https://forms.gle/x',
    );
  });
  it('then moreInfoUrl', () => {
    expect(joinHref({ ...base, moreInfoUrl: 'https://linktr.ee/x', email: 'a@b.c' })).toBe('https://linktr.ee/x');
  });
  it('then mailto: email', () => {
    expect(joinHref({ ...base, email: 'a@b.c' })).toBe('mailto:a@b.c');
  });
  it('then the Student Affairs subpage', () => {
    expect(joinHref({ ...base, subpageUrl: 'https://studentaffairs.apu.edu.my/international-communities/#kazakh' })).toBe(
      'https://studentaffairs.apu.edu.my/international-communities/#kazakh',
    );
    expect(joinHref(base)).toBe('https://studentaffairs.apu.edu.my/club-and-society/');
  });
  it('skips a javascript: joinUrl and falls through to moreInfoUrl', () => {
    expect(joinHref({ ...base, joinUrl: 'javascript:alert(1)', moreInfoUrl: 'https://linktr.ee/x' })).toBe(
      'https://linktr.ee/x',
    );
  });
  it('skips data: and malformed URLs', () => {
    expect(joinHref({ ...base, joinUrl: 'data:text/html,hi', moreInfoUrl: 'not a url', email: 'a@b.co' })).toBe(
      'mailto:a@b.co',
    );
  });
  it('skips an invalid email', () => {
    expect(joinHref({ ...base, email: 'bad email?subject=x' })).toBe('https://studentaffairs.apu.edu.my/club-and-society/');
  });
  it('ignores an unsafe subpage URL', () => {
    expect(joinHref({ ...base, subpageUrl: 'javascript:void(0)' })).toBe('https://studentaffairs.apu.edu.my/club-and-society/');
  });
});

describe('safeUrl', () => {
  it('accepts only http and https', () => {
    expect(safeUrl('https://a.b/c')).toBe('https://a.b/c');
    expect(safeUrl('http://a.b')).toBe('http://a.b');
    expect(safeUrl(' JavaScript:alert(1)')).toBeNull();
    expect(safeUrl('ftp://a.b')).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
  });
});

describe('Provenance and ClubFacts', () => {
  it('labels real vs sample in one place', async () => {
    const { provenance } = await import('../data/provenance');
    const { catalog } = await import('../data/catalog');
    const football = catalog.find((c) => c.id === 'apu-football-club-afc')!;
    const photoClub = catalog.find((c) => c.id === 'apu-photography-club')!;
    expect(provenance(football)).toMatchObject({ schedule: 'official', finePrint: 'none', eligibility: 'none' });
    expect(provenance(photoClub)).toMatchObject({ schedule: 'sample', finePrint: 'sample', flags: 'sample' });
  });
  it('clubFacts carries the fit source and a safe channel', async () => {
    const { clubFacts } = await import('./facts');
    const { catalog, events } = await import('../data/catalog');
    const football = catalog.find((c) => c.id === 'apu-football-club-afc')!;
    const f = clubFacts(football, { year: 1, level: 'degree', interests: [], free: [{ day: 'Fri', start: '18:00', end: '22:00' }], going: [], week: [] }, events);
    expect(f.fit).toMatchObject({ status: 'clash', source: 'official' });
    expect(f.channel.href).toMatch(/^(https:|mailto:)/);
  });
});
