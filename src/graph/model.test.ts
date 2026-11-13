import { describe, it, expect } from 'vitest';
import { toGraph, type GNode, type GLink } from './model';
import { catalog } from '../data/catalog';
import type { CampusEvent, Community } from '../data/types';

// Fixed "now": 13 Nov 2026, 09:00 local time.
const now = new Date(2026, 10, 13, 9, 0, 0);
const atLocal = (dayOffset: number, hh = 12, mm = 0) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hh, mm, 0, 0).toISOString();

const PHOTO = 'apu-photography-club';
const eventFor = (communityId: string, dayOffset: number): CampusEvent => ({
  id: `ev-${communityId}-${dayOffset}`,
  communityId,
  title: 'Test event',
  place: 'Somewhere',
  start: atLocal(dayOffset),
  going: 1,
  sample: true,
});

const byId = (nodes: GNode[], id: string) => nodes.find((n) => n.id === id)!;

describe('toGraph', () => {
  it('produces 141 nodes: centre, 3 hubs and 137 communities', () => {
    const { nodes } = toGraph(catalog, [], now);
    expect(nodes.length).toBe(141);
    expect(nodes.filter((n) => n.kind === 'center').length).toBe(1);
    expect(nodes.filter((n) => n.kind === 'hub').length).toBe(3);
    expect(nodes.filter((n) => n.kind === 'community').length).toBe(137);
    expect(byId(nodes, 'apu').label).toBe('APU');
    expect(byId(nodes, 'hub-soc').label).toBe('Societies & SIGs');
    expect(byId(nodes, 'hub-spo').label).toBe('Sports & Recreation');
    expect(byId(nodes, 'hub-intl').label).toBe('International');
  });

  it('creates one member link per community and one hub link per hub', () => {
    const { links } = toGraph(catalog, [], now);
    const member = links.filter((l) => l.kind === 'member');
    const hub = links.filter((l) => l.kind === 'hub');
    expect(member.length).toBe(137);
    expect(hub.length).toBe(3);
    for (const l of hub) {
      expect(l.target).toBe('apu');
      expect(['hub-soc', 'hub-spo', 'hub-intl']).toContain(l.source);
    }
    for (const l of member) {
      expect(l.target).toMatch(/^hub-/);
      expect(l.source).not.toMatch(/^hub-/);
    }
  });

  it('caps shared links at 40 and only links different categories sharing a non-category tag', () => {
    const { nodes, links } = toGraph(catalog, [], now);
    const shared: GLink[] = links.filter((l) => l.kind === 'shared');
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.length).toBeLessThanOrEqual(40);

    const community = new Map<string, Community>();
    for (const n of nodes) if (n.community) community.set(n.id, n.community);
    const excluded = new Set(['soc', 'spo', 'intl', 'society', 'sports', 'international', 'Societies & SIGs', 'Sports & Recreation', 'International']);

    for (const l of shared) {
      const a = community.get(l.source)!;
      const b = community.get(l.target)!;
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(a.category).not.toBe(b.category);
      const common = a.tags.filter((t) => !excluded.has(t) && b.tags.includes(t));
      expect(common.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for shared links', () => {
    const a = toGraph(catalog, [], now).links.filter((l) => l.kind === 'shared');
    const b = toGraph(catalog, [], now).links.filter((l) => l.kind === 'shared');
    expect(b).toEqual(a);
  });

  it('sizes communities as 3 + activity * 1.2', () => {
    const { nodes } = toGraph(catalog, [], now);
    const p = byId(nodes, PHOTO);
    const c = catalog.find((x) => x.id === PHOTO)!;
    expect(p.size).toBeCloseTo(3 + c.activity * 1.2, 10);
  });

  it('marks the photography node live when it has an event today', () => {
    const { nodes } = toGraph(catalog, [eventFor(PHOTO, 0)], now);
    expect(byId(nodes, PHOTO).live).toBe(true);
  });

  it('does not mark the photography node live for an event tomorrow', () => {
    const { nodes } = toGraph(catalog, [eventFor(PHOTO, 1)], now);
    expect(byId(nodes, PHOTO).live).toBe(false);
  });

  it('keeps non-live communities not live when there are no events', () => {
    const { nodes } = toGraph(catalog, [], now);
    expect(nodes.filter((n) => n.kind === 'community' && n.live).length).toBe(0);
  });
});
