import { loadProfile, PROFILE_KEY, saveProfile, type Profile } from './profile';

const p: Profile = {
  year: 2,
  level: 'diploma',
  interests: ['photo', 'music'],
  free: [{ day: 'Fri', start: '18:00', end: '23:00' }],
  going: ['apu-photography-club'],
  week: [],
};

describe('profile storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('uses the apu-campus-graph/profile key', () => {
    expect(PROFILE_KEY).toBe('apu-campus-graph/profile');
  });

  it('saveProfile then loadProfile round-trips', () => {
    saveProfile(p);
    expect(loadProfile()).toEqual(p);
  });

  it('loadProfile returns null when nothing is stored', () => {
    expect(loadProfile()).toBeNull();
  });

  it('loadProfile returns null when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadProfile()).toBeNull();
  });

  it('saveProfile swallows storage errors', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveProfile(p)).not.toThrow();
  });

  it('loadProfile returns null for malformed JSON', () => {
    localStorage.setItem(PROFILE_KEY, '{nope');
    expect(loadProfile()).toBeNull();
  });
});
