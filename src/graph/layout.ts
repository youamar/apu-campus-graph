import type { CategoryKey } from '../data/types';
import type { GNode } from './model';

export type GraphFilter = CategoryKey | 'all' | 'today';

/** Fixed positions for the center and the three hubs (graph units). */
export const HUB_POS: Record<CategoryKey, { x: number; y: number }> = {
  soc: { x: -290, y: 35 },
  spo: { x: 250, y: -185 },
  intl: { x: 245, y: 215 },
};

/** Outer radius of each hub's community cloud (graph units). */
export const CLOUD_RADIUS: Record<CategoryKey, number> = { soc: 215, spo: 160, intl: 140 };
const CLOUD_R = CLOUD_RADIUS;
const INNER_R = 52;
/** Clouds are wider than tall: the canvas is landscape. */
const X_STRETCH = 1.22;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export const CATEGORY_COLOR: Record<CategoryKey, string> = {
  soc: '#2a83ff',
  spo: '#42ba96',
  intl: '#ff8b33',
};

export const CATEGORY_NAME: Record<CategoryKey, string> = {
  soc: 'Societies & SIGs',
  spo: 'Sports & Recreation',
  intl: 'International',
};

export const LIVE_COLOR = '#e04a5a';

/** Deterministic 0..1 hash of a string (FNV-1a). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10007) / 10007;
}

export interface HomeTarget {
  x: number;
  y: number;
}

/**
 * Sunflower placement of each category's communities around its hub,
 * nudged away from the APU center so the three worlds read as separate clouds.
 */
export function homeTargets(nodes: GNode[]): Map<string, HomeTarget> {
  const out = new Map<string, HomeTarget>();
  const byCat: Record<CategoryKey, GNode[]> = { soc: [], spo: [], intl: [] };
  for (const n of nodes) if (n.kind === 'community' && n.category) byCat[n.category].push(n);

  (Object.keys(byCat) as CategoryKey[]).forEach((cat) => {
    const list = [...byCat[cat]].sort((a, b) => hash01(a.id) - hash01(b.id));
    const hub = HUB_POS[cat];
    const len = Math.hypot(hub.x, hub.y) || 1;
    const away = { x: hub.x / len, y: hub.y / len };
    const R = CLOUD_R[cat];
    list.forEach((n, i) => {
      const t = Math.sqrt((i + 0.5) / list.length);
      const jitter = (hash01(n.id + '#r') - 0.5) * 0.18;
      const r = INNER_R + (R - INNER_R) * Math.min(1, Math.max(0, t + jitter));
      const a = i * GOLDEN + (hash01(n.id + '#a') - 0.5) * 0.5;
      out.set(n.id, {
        x: hub.x + Math.cos(a) * r * X_STRETCH + away.x * r * 0.18,
        y: hub.y + Math.sin(a) * r + away.y * r * 0.18,
      });
    });
  });
  return out;
}

export function matchesFilter(n: GNode, filter: GraphFilter): boolean {
  if (filter === 'all' || n.kind === 'center') return true;
  if (filter === 'today') return n.kind === 'community' ? n.live : true;
  return n.category === filter;
}

/** Which side of the node its label pill goes on: away from its hub. */
export function labelSide(n: { x?: number; category?: CategoryKey }): 'left' | 'right' {
  if (!n.category) return 'right';
  return (n.x ?? 0) < HUB_POS[n.category].x ? 'left' : 'right';
}

interface Body {
  id: string;
  x: number;
  y: number;
  r: number;
  fixed: boolean;
}

/**
 * Positions every node deterministically: center and hubs are pinned, and each
 * community starts at its sunflower home, then a short relaxation pushes
 * overlapping nodes apart while springing them back toward home.
 */
export function layoutNodes<T extends GNode>(
  nodes: T[],
  radius: (n: GNode) => number,
  iterations = 140,
): (T & { x: number; y: number; fx: number; fy: number })[] {
  const homes = homeTargets(nodes);
  const bodies: Body[] = nodes.map((n) => {
    if (n.kind === 'center') return { id: n.id, x: 0, y: 0, r: radius(n) + 14, fixed: true };
    if (n.kind === 'hub') {
      const p = HUB_POS[n.category as CategoryKey];
      return { id: n.id, x: p.x, y: p.y, r: radius(n) + 18, fixed: true };
    }
    const h = homes.get(n.id) ?? { x: 0, y: 0 };
    return { id: n.id, x: h.x, y: h.y, r: radius(n) + 3, fixed: false };
  });
  // Keep the strip under each hub clear for its name pill.
  for (const n of nodes) {
    if (n.kind !== 'hub') continue;
    const p = HUB_POS[n.category as CategoryKey];
    const below = p.y + radius(n) + 18;
    for (const dx of [-58, -20, 20, 58]) bodies.push({ id: `${n.id}#pill${dx}`, x: p.x + dx, y: below, r: 16, fixed: true });
  }

  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (a.fixed && b.fixed) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) / d;
        const ux = dx * push;
        const uy = dy * push;
        if (a.fixed) { b.x += ux; b.y += uy; }
        else if (b.fixed) { a.x -= ux; a.y -= uy; }
        else { a.x -= ux / 2; a.y -= uy / 2; b.x += ux / 2; b.y += uy / 2; }
      }
    }
    for (const b of bodies) {
      if (b.fixed) continue;
      const h = homes.get(b.id)!;
      b.x += (h.x - b.x) * 0.06;
      b.y += (h.y - b.y) * 0.06;
    }
  }

  return nodes.map((n, i) => {
    const b = bodies[i];
    // Pin everything: the layout is final, so the view never jiggles. The pulse animation supplies the life.
    return { ...n, x: b.x, y: b.y, fx: b.x, fy: b.y };
  });
}

/** "1 match" / "4 matches" for the focus breadcrumb. */
export function matchCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'match' : 'matches'}`;
}

/** Focus zoom never exceeds this multiple of the overview zoom, so one match still shows its neighbourhood.
 *  (2.6x measured as no cap at all: the overview zoom is ~1.3, so 2.6x sat above FOCUS_MAX_ZOOM.) */
export const FOCUS_ZOOM_FACTOR = 1.8;

/** Caps a focus zoom `k` relative to the overview (fit-all) zoom. */
export function capFocusZoom(k: number, overviewK: number): number {
  return Math.min(k, overviewK * FOCUS_ZOOM_FACTOR);
}
