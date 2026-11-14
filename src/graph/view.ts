import type { CategoryKey } from '../data/types';
import { nodeRadius, type PNode } from './draw';
import { CATEGORY_NAME, capFocusZoom, matchesFilter, type GraphFilter } from './layout';

/**
 * GraphView: the pure rules of what the map shows — dimming, which names get a label, where the
 * camera goes, and the focus copy. CampusGraph is the canvas adapter that paints this view.
 */

export const DIM_FILTER = 0.15;
export const DIM_FOCUS = 0.2;
/** Screen-space safe area the overview fits into, clear of the HTML overlays. */
export const SAFE = { top: 150, bottom: 64, left: 28, right: 28 };
export const LABEL_ZOOM = 2.5;
/** Screen padding around a focused set; wide sides leave room for the labels. */
export const FOCUS_PAD = { top: 120, bottom: 90, left: 150, right: 170 };
export const FOCUS_MAX_ZOOM = 3.2;

export interface Focus {
  /** id -> 1-based badge number, in the guide's best-first order. */
  index: Map<string, number>;
  /** Categories of the focused set: their hubs stay legible. */
  cats: Set<CategoryKey | undefined>;
}

export function focusOf(ids: string[], nodeById: Map<string, PNode>): Focus {
  return { index: new Map(ids.map((id, i) => [id, i + 1])), cats: new Set(ids.map((id) => nodeById.get(id)?.category)) };
}

export function nodeAlpha(n: PNode, focus: Focus, filter: GraphFilter): number {
  if (focus.index.size) {
    if (focus.index.has(n.id)) return 1;
    // The hub that anchors the focused set stays legible; everything else recedes.
    if (n.kind === 'hub' && focus.cats.has(n.category)) return 0.9;
    return DIM_FOCUS;
  }
  return matchesFilter(n, filter) ? 1 : DIM_FILTER;
}

export interface LabelContext {
  focus: Focus;
  selectedId: string | null;
  hoverId: string | null;
  alpha: number;
  scale: number;
}

/**
 * Label priority for a community this frame (higher wins a collision); -1 = no label.
 * Focus badges > selected > hovered > live today > featured > bright upcoming star > zoomed-in names.
 * Ranks >= 70 are forced on screen.
 */
export function labelRank(n: PNode, x: LabelContext): number {
  const idx = x.focus.index.get(n.id) ?? 0;
  const lit = x.alpha > 0.5;
  const exploring = !x.focus.index.size;
  if (idx > 0) return 100 - idx;
  if (n.id === x.selectedId) return 90;
  if (n.id === x.hoverId) return 85;
  if (lit && n.live) return 70;
  if (lit && exploring && n.community?.sample === true) return 50;
  if (lit && exploring && n.upcoming >= 0.7) return 40;
  if (lit && x.scale > LABEL_ZOOM) return 10 + n.size;
  return -1;
}

export interface Viewport {
  w: number;
  h: number;
}
export interface Camera {
  k: number;
  cx: number;
  cy: number;
}

/** Zoom and centre that fit the whole graph into the area left free by the overlays. */
export function overviewCamera(nodes: PNode[], vp: Viewport): Camera {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const n of nodes) {
    const r = nodeRadius(n) + (n.kind === 'hub' ? 6 : 2);
    x0 = Math.min(x0, (n.x ?? 0) - r);
    x1 = Math.max(x1, (n.x ?? 0) + r);
    y0 = Math.min(y0, (n.y ?? 0) - r);
    y1 = Math.max(y1, (n.y ?? 0) + r + (n.kind === 'hub' ? 40 : 0));
  }
  const aw = vp.w - SAFE.left - SAFE.right;
  const ah = vp.h - SAFE.top - SAFE.bottom;
  const k = Math.min(aw / (x1 - x0), ah / (y1 - y0));
  // Graph point that must land at the canvas centre so the bbox centres in the safe area.
  const sx = SAFE.left + aw / 2 - vp.w / 2;
  const sy = SAFE.top + ah / 2 - vp.h / 2;
  return { k, cx: (x0 + x1) / 2 - sx / k, cy: (y0 + y1) / 2 - sy / k };
}

/** Frame the focused nodes in the area left of `rightInset`; null when none of the ids exist. */
export function focusCamera(nodes: PNode[], ids: string[], vp: Viewport, rightInset: number): Camera | null {
  const set = new Set(ids);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const n of nodes) {
    if (!set.has(n.id)) continue;
    x0 = Math.min(x0, n.x ?? 0);
    x1 = Math.max(x1, n.x ?? 0);
    y0 = Math.min(y0, n.y ?? 0);
    y1 = Math.max(y1, n.y ?? 0);
  }
  if (x0 === Infinity) return null;
  const left = FOCUS_PAD.left;
  // Beside an overlay, right-hand labels only need room up to its edge.
  const right = rightInset > 0 ? rightInset + 110 : FOCUS_PAD.right;
  const aw = Math.max(80, vp.w - left - right);
  const ah = Math.max(80, vp.h - FOCUS_PAD.top - FOCUS_PAD.bottom);
  // A single match (or a tight cluster) would otherwise zoom right in; keep its neighbourhood in view.
  const k = capFocusZoom(Math.min(aw / Math.max(x1 - x0, 1), ah / Math.max(y1 - y0, 1), FOCUS_MAX_ZOOM), overviewCamera(nodes, vp).k);
  const sx = left + aw / 2 - vp.w / 2;
  const sy = FOCUS_PAD.top + ah / 2 - vp.h / 2;
  return { k, cx: (x0 + x1) / 2 - sx / k, cy: (y0 + y1) / 2 - sy / k };
}

/** Bottom hint while focused. */
export function focusHint(n: number, total: number, source?: 'ai' | 'user'): string {
  return source === 'ai' ? `Gemini zoomed in to ${n} of ${total} communities` : `Showing ${n} of ${total} communities`;
}

/** Breadcrumb title: the focused set's world, or "Across worlds". */
export function focusTitle(ids: string[], nodeById: Map<string, PNode>): string {
  const cats = new Set(ids.map((id) => nodeById.get(id)?.category).filter(Boolean));
  return cats.size === 1 ? CATEGORY_NAME[[...cats][0] as CategoryKey] : 'Across worlds';
}
