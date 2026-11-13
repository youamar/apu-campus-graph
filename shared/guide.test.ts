import { describe, expect, it } from 'vitest';
import { catalog } from '../src/data/catalog';
import { localMatch } from './guide';

describe('localMatch', () => {
  it('matches photography interest', () => {
    const r = localMatch('I love photography and want friends', catalog, null);
    expect(r.focusIds).toContain('apu-photography-club');
    expect(r.focusIds.length).toBeLessThanOrEqual(4);
    expect(r.source).toBe('offline');
  });
  it('opens a named community', () => {
    const r = localMatch('how do I join the Photography Club?', catalog, null);
    expect(r.openId).toBe('apu-photography-club');
    expect(r.reply).toContain("I've opened its card.");
  });
  it('does not open a card for interest-only queries', () => {
    expect(localMatch('I love photography and want friends', catalog, null).openId).toBeNull();
    expect(localMatch('I love photography and want friends', catalog, null).reply).not.toContain('opened');
    expect(localMatch('sports and music', catalog, null).openId).toBeNull();
  });
  it('does not open a card when two communities are named', () => {
    expect(localMatch('Photography Club and Badminton Club', catalog, null).openId).toBeNull();
  });
  it('handles no match', () => {
    const r = localMatch('zzzz', catalog, null);
    expect(r.focusIds).toEqual([]);
    expect(r.openId).toBeNull();
    expect(r.source).toBe('offline');
    expect(r.suggestions).toHaveLength(3);
    expect(r.reply).toMatch(/filter/i);
  });
  it('matches badminton', () => {
    expect(localMatch('badminton', catalog, null).focusIds).toContain('badminton-club');
  });
  it('maps country words to international communities', () => {
    expect(localMatch('anything for Pakistani students', catalog, null).focusIds).toContain('apu-pakistani-community');
  });
  it('keeps replies short and suggestions at 3', () => {
    const r = localMatch('sports and music', catalog, null);
    expect(r.reply.split(/\s+/).length).toBeLessThan(90);
    expect(r.suggestions).toHaveLength(3);
  });
});
