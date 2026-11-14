import { UPCOMING_WINDOW_MS } from '../data/provenance';
import type { CampusEvent, CategoryKey, Community } from '../data/types';

export interface GNode {
  id: string;
  kind: 'center' | 'hub' | 'community';
  category?: CategoryKey;
  label: string;
  size: number;
  live: boolean;
  /**
   * How soon the community's next event is, 0..1: 1 within 24h (and for
   * anything today), falling linearly to 0 at 7 days; 0 with no event in
   * [now, now + 7 days). Hubs and the centre are always 0.
   */
  upcoming: number;
  community?: Community;
}

export interface GLink {
  source: string;
  target: string;
  kind: 'hub' | 'member' | 'shared';
}

const HUBS: { key: CategoryKey; id: string; label: string; name: string; fallback: string }[] = [
  { key: 'soc', id: 'hub-soc', label: 'Societies & SIGs', name: 'Societies & SIGs', fallback: 'society' },
  { key: 'spo', id: 'hub-spo', label: 'Sports & Recreation', name: 'Sports & Recreation', fallback: 'sports' },
  { key: 'intl', id: 'hub-intl', label: 'International', name: 'International', fallback: 'international' },
];

const SHARED_CAP = 40;

/** Tags that name a category (key, display name or fallback name) and so never count as shared interests. */
const CATEGORY_TAGS = new Set<string>(
  HUBS.flatMap((h) => [h.key, h.name, h.fallback]),
);

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_DAYS = UPCOMING_WINDOW_MS / DAY_MS;

/** 1 within a day, linear down to 0 at UPCOMING_DAYS; 0 for past or later events. */
export function upcomingScore(startMs: number, nowMs: number): number {
  const days = (startMs - nowMs) / DAY_MS;
  if (days < 0 || days >= UPCOMING_DAYS) return 0;
  if (days <= 1) return 1;
  return 1 - (days - 1) / (UPCOMING_DAYS - 1);
}

export function toGraph(
  c: Community[],
  e: CampusEvent[],
  now: Date = new Date(),
): { nodes: GNode[]; links: GLink[] } {
  const liveIds = new Set(
    e.filter((ev) => sameLocalDay(new Date(ev.start), now)).map((ev) => ev.communityId),
  );

  // Nearest upcoming event wins, so keep the highest score per community.
  const upcoming = new Map<string, number>();
  const nowMs = now.getTime();
  for (const ev of e) {
    const u = liveIds.has(ev.communityId) ? 1 : upcomingScore(new Date(ev.start).getTime(), nowMs);
    if (u > (upcoming.get(ev.communityId) ?? 0)) upcoming.set(ev.communityId, u);
  }

  const nodes: GNode[] = [{ id: 'apu', kind: 'center', label: 'APU', size: 12, live: false, upcoming: 0 }];
  const links: GLink[] = [];

  for (const h of HUBS) {
    nodes.push({ id: h.id, kind: 'hub', category: h.key, label: h.label, size: 8, live: false, upcoming: 0 });
    links.push({ source: h.id, target: 'apu', kind: 'hub' });
  }

  const hubOf = new Map<CategoryKey, string>(HUBS.map((h) => [h.key, h.id]));
  for (const com of c) {
    nodes.push({
      id: com.id,
      kind: 'community',
      category: com.category,
      label: com.shortName,
      size: 3 + com.activity * 1.2,
      live: liveIds.has(com.id),
      upcoming: upcoming.get(com.id) ?? 0,
      community: com,
    });
    links.push({ source: com.id, target: hubOf.get(com.category)!, kind: 'member' });
  }

  // Shared-interest links: candidate pairs across categories sharing a non-category tag.
  const pairs: { key: string; a: Community; b: Community }[] = [];
  for (let i = 0; i < c.length; i++) {
    for (let j = i + 1; j < c.length; j++) {
      const x = c[i];
      const y = c[j];
      if (x.category === y.category) continue;
      const [a, b] = x.id < y.id ? [x, y] : [y, x];
      const shares = a.tags.some((t) => !CATEGORY_TAGS.has(t) && b.tags.includes(t));
      if (shares) pairs.push({ key: `${a.id}|${b.id}`, a, b });
    }
  }
  pairs.sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
  for (const p of pairs.slice(0, SHARED_CAP)) {
    links.push({ source: p.a.id, target: p.b.id, kind: 'shared' });
  }

  return { nodes, links };
}
