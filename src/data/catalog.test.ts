import { describe, it, expect } from 'vitest';
import { catalog, events, slugify, shortName, cleanName, buildEvents } from './catalog';
import enrichment from '../../data/enrichment.json';

describe('catalog', () => {
  it('has 137 communities with unique ids', () => {
    expect(catalog.length).toBe(137);
    expect(new Set(catalog.map((c) => c.id)).size).toBe(137);
  });
  it('slugifies', () => {
    expect(slugify("Men's Futsal Club")).toBe('mens-futsal-club');
    expect(slugify('Movie & Video Club (MVC)')).toBe('movie-video-club-mvc');
  });
  it('cleans scraper notes', () => {
    expect(cleanName('APU Maths Club (AMC) (index name: Maths Club)')).toBe('APU Maths Club (AMC)');
  });
  it('shortName strips brackets', () => {
    expect(shortName('APU Photography Club')).toBe('APU Photography Club');
    expect(shortName('APU Maths Club (AMC)')).toBe('APU Maths Club');
  });
  it('counts categories', () => {
    const n = { soc: 0, spo: 0, intl: 0 };
    catalog.forEach((c) => n[c.category]++);
    expect(n).toEqual({ soc: 78, spo: 31, intl: 28 });
  });
  it('enrichment keys exist in catalog', () => {
    const ids = new Set(catalog.map((c) => c.id));
    for (const k of Object.keys(enrichment.communities)) expect(ids.has(k)).toBe(true);
  });
  it('photography club enriched', () => {
    const p = catalog.find((c) => c.id === 'apu-photography-club')!;
    expect(p.finePrint?.fee).toBe('RM 20 / semester');
    expect(p.sample).toBe(true);
    expect(p.finePrint?.sample).toBe(true);
    expect(p.instagram).toBe('@apu.pc');
  });
  it('unenriched community defaults', () => {
    const u = catalog.find((c) => !(c.id in enrichment.communities))!;
    expect(u.sample).toBe(false);
    expect(u.eligibility.openToAll).toBe(true);
    expect(u.activity).toBeGreaterThanOrEqual(1);
    expect(u.activity).toBeLessThanOrEqual(4);
  });
  it('every community has a tag', () => {
    for (const c of catalog) expect(c.tags.length).toBeGreaterThanOrEqual(1);
  });
  it('omits president/advisors', () => {
    for (const c of catalog) {
      expect(c).not.toHaveProperty('president');
      expect(c).not.toHaveProperty('advisors');
    }
  });
});

describe('events', () => {
  it('has 6-8 events referencing real communities', () => {
    expect(events.length).toBeGreaterThanOrEqual(6);
    expect(events.length).toBeLessThanOrEqual(8);
    const ids = new Set(catalog.map((c) => c.id));
    for (const e of events) expect(ids.has(e.communityId)).toBe(true);
  });
  it('resolves against injected now', () => {
    const now = new Date(2030, 0, 15, 9, 0);
    const evs = buildEvents(enrichment.events as never, now);
    const b = evs.find((e) => e.title === 'Badminton social night')!;
    const d = new Date(b.start);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2030, 0, 15, 20, 0]);
    expect(b.going).toBe(18);
  });
});
