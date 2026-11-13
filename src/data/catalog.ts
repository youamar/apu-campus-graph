import raw from '../../data/clubs.json';
import enrichmentJson from '../../data/enrichment.json';
import type { CampusEvent, CategoryKey, Community, Enrichment, RawClub, RawEvent } from './types';

const GROUPS: Record<string, CategoryKey> = {
  'Sports & Recreation': 'spo',
  "Societies & Special Interest Groups (SIG's)": 'soc',
  'International communities': 'intl',
};
const CATEGORY_NAME: Record<CategoryKey, string> = { soc: 'society', spo: 'sports', intl: 'international' };

/** Remove scraper-note parentheticals such as "(index name: ...)". */
export function cleanName(name: string): string {
  return name.replace(/\s*\([^)]*:[^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function shortName(name: string): string {
  return name.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
}

const TAG_KEYWORDS: [string, RegExp][] = [
  ['photo', /photo|camera/],
  ['film', /film|movie|video|cinemat/],
  ['music', /music|band|choir|guitar|sing/],
  ['dance', /dance|cheer/],
  ['tech', /tech|coding|programming|software|developer|robot|computer|cyber/],
  ['ai', /\bai\b|artificial intelligence|machine learning|deai/],
  ['cloud', /cloud|aws|azure/],
  ['security', /security|cyber|hack/],
  ['business', /business|entrepreneur|marketing|startup|aiesec/],
  ['finance', /financ|invest|trading|crypto|blockchain|account/],
  ['culture', /cultur|heritage|tradition|festival/],
  ['faith', /islam|muslim|christian|buddhis|hindu|faith|church|bible|dakwah/],
  ['volunteering', /volunteer|charity|community service|sustainab|rotaract|environment/],
  ['sport-team', /badminton|basketball|football|futsal|volleyball|cricket|rugby|tennis|swim|netball|hockey|sepak|\bfc\b|sports|running|bowling|squash|golf|frisbee|cheer/],
  ['martial-arts', /taekwondo|karate|muay|judo|jiu|bjj|grappling|silat|boxing|kung fu|martial|wushu|fencing/],
  ['outdoor', /hik|climb|outdoor|travel|cycl|camp|adventure|trek/],
  ['games', /game|esport|chess|board|gaming/],
  ['language', /language|linguist|debate|toastmaster|speaking|english|mandarin|japanese|korean/],
  ['leadership', /leader|model united|\bmun\b|\bted|council/],
  ['women', /women|girls|ladies|female/],
];

export function deriveTags(name: string, description: string, category: CategoryKey): string[] {
  const text = `${name} ${description}`.toLowerCase();
  const tags = TAG_KEYWORDS.filter(([, re]) => re.test(text)).map(([t]) => t);
  return tags.length ? tags : [CATEGORY_NAME[category]];
}

function hashActivity(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 4) + 1;
}

function parseInstagram(social: string | null): string | undefined {
  if (!social || !/instagram/i.test(social)) return undefined;
  const m = social.match(/@[\w.]+/);
  return m ? m[0] : undefined;
}

export function buildCatalog(rawClubs: RawClub[], enrichment: Enrichment): Community[] {
  return rawClubs.map((r) => {
    const name = cleanName(r.name);
    const id = slugify(name);
    const category = GROUPS[r.group] ?? 'soc';
    const description = r.description ?? '';
    const base: Community = {
      id,
      name,
      shortName: shortName(name),
      category,
      description,
      email: r.email ?? undefined,
      instagram: parseInstagram(r.social),
      moreInfoUrl: r.more_info_url ?? undefined,
      joinUrl: r.join_url ?? undefined,
      logoUrl: r.logo_url ?? undefined,
      activity: hashActivity(id),
      tags: deriveTags(name, description, category),
      eligibility: { openToAll: true },
      sample: false,
    };
    const extra = enrichment.communities[id];
    return extra ? { ...base, ...extra, id, sample: true } : base;
  });
}

export function buildEvents(rawEvents: RawEvent[], now: Date = new Date()): CampusEvent[] {
  return rawEvents.map((e) => {
    const [hh, mm] = e.time.split(':').map(Number);
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + e.dayOffset, hh, mm, 0, 0);
    return {
      id: e.id,
      communityId: e.communityId,
      title: e.title,
      place: e.place,
      start: d.toISOString(),
      going: e.going,
      sample: true as const,
    };
  });
}

const enrichment = enrichmentJson as unknown as Enrichment;
export const catalog: Community[] = buildCatalog(raw as unknown as RawClub[], enrichment);
export const events: CampusEvent[] = buildEvents(enrichment.events);
