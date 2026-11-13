import type { CategoryKey } from '../data/types';
import type { GLink, GNode } from './model';
import { CATEGORY_COLOR, CLOUD_RADIUS, HUB_POS } from './layout';

/** A graph node once the force engine has given it a position. */
export type PNode = GNode & { x?: number; y?: number; fx?: number; fy?: number };
export type PLink = Omit<GLink, 'source' | 'target'> & {
  source: string | PNode;
  target: string | PNode;
};

export interface NodeDrawState {
  /** performance.now() for this frame. */
  t: number;
  /** 1 normally; 0.15 when filtered out; 0.2 when outside focus. */
  alpha: number;
  /** 1-based badge number when focused, 0 otherwise. */
  focusIndex: number;
  selected: boolean;
  hovered: boolean;
  /** Hub member count (hubs only). */
  count?: number;
}

const FONT = 'Roboto, "Helvetica Neue", sans-serif';

export function hexToRgba(hex: string, a: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}

function tint(hex: string, amount: number): string {
  const v = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((v >> 16) & 255)}, ${mix((v >> 8) & 255)}, ${mix(v & 255)})`;
}

/**
 * Converts a radius designed in screen pixels at ~1x zoom into graph units.
 * Nodes grow with zoom up to 1.8x, then hold their on-screen size so a deep
 * focus zoom stays crisp instead of ballooning.
 */
export function sizeFactor(scale: number): number {
  return Math.min(Math.max(scale, 0.7), 1.8) / scale;
}

export function nodeRadius(n: GNode): number {
  if (n.kind === 'center') return 32;
  if (n.kind === 'hub') return 30;
  return n.size * 1.45;
}

const dpr = () => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface PillOpts {
  badge?: number;
  bold?: boolean;
  size?: number;
  strong?: boolean;
}

/** Pill width and height in screen pixels. */
export function pillSize(ctx: CanvasRenderingContext2D, text: string, opts: PillOpts = {}): { w: number; h: number } {
  ctx.save();
  ctx.font = `${opts.bold ? 700 : 500} ${opts.size ?? 11}px ${FONT}`;
  const tw = ctx.measureText(text).width;
  ctx.restore();
  const badge = opts.badge ? 16 + 6 - 3 : 0;
  return { w: tw + 16 + badge, h: (opts.size ?? 11) > 11 ? 24 : 20 };
}

/**
 * A label pill: rounded black rect at 0.6 alpha with white 11px Roboto text,
 * optionally led by a numbered badge. Sizes are screen pixels.
 */
function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  y: number,
  align: 'left' | 'right' | 'center',
  scale: number,
  opts: PillOpts = {},
) {
  const px = 1 / scale;
  const fontSize = (opts.size ?? 11) * px;
  const size = pillSize(ctx, text, opts);
  const padX = 8 * px;
  const badgeD = opts.badge ? 16 * px : 0;
  const gap = opts.badge ? 6 * px : 0;
  const h = size.h * px;
  const w = size.w * px;
  const x = align === 'left' ? anchorX - w : align === 'right' ? anchorX : anchorX - w / 2;

  ctx.save();
  ctx.shadowColor = 'transparent';
  roundRect(ctx, x, y - h / 2, w, h, h / 2);
  ctx.fillStyle = opts.strong ? 'rgba(10, 12, 16, 0.86)' : opts.bold ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.6)';
  ctx.fill();
  if (opts.strong) {
    ctx.lineWidth = 1 * px;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.stroke();
  }
  let tx = x + padX;
  if (opts.badge) {
    const cx = x + 5 * px + badgeD / 2;
    ctx.beginPath();
    ctx.arc(cx, y, badgeD / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#2a83ff';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${10 * px}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(opts.badge), cx, y + 0.5 * px);
    tx = x + 5 * px + badgeD + gap;
  }
  ctx.font = `${opts.bold ? 700 : 500} ${fontSize}px ${FONT}`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, tx, y + 0.5 * px);
  ctx.restore();
}

/** Visual strength for an upcoming score: a floor so even a day-6 event reads as brighter. */
export function starStrength(upcoming: number): number {
  return upcoming > 0 ? 0.35 + 0.65 * Math.min(upcoming, 1) : 0;
}

interface StarLook {
  /** Highlight stop, body colour and glow colour for the node's gradient. */
  hi: string;
  body: string;
  glow: string;
  /** Twinkle phase so stars don't pulse in lockstep. */
  phase: number;
}

/** Per-node colours precomputed once, so the frame loop only builds the gradient. */
const starLooks = new Map<string, StarLook>();
function starLook(id: string, color: string, s: number): StarLook {
  const key = `${id}|${color}|${s}`;
  let look = starLooks.get(key);
  if (!look) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    look = {
      hi: tint(color, 0.45 + 0.45 * s),
      body: tint(color, 0.35 * s),
      glow: tint(color, 0.3 * s),
      phase: (h % 628) / 100,
    };
    starLooks.set(key, look);
  }
  return look;
}

/** Four thin diffraction spikes and a white core: the "star" on a club with an event coming up. */
function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, s: number, twinkle: number, scale: number) {
  const long = r * (1.5 + 1.3 * s) * (0.9 + 0.1 * twinkle) + 3 / scale;
  const short = long * 0.62;
  const w = Math.max(r * 0.16, 0.9 / scale);
  ctx.save();
  ctx.globalAlpha *= (0.5 + 0.45 * s) * (0.82 + 0.18 * twinkle);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
  ctx.shadowBlur = 6 * dpr();
  ctx.beginPath();
  // Vertical and horizontal spikes as one concave star outline.
  ctx.moveTo(x, y - long);
  ctx.lineTo(x + w, y - w);
  ctx.lineTo(x + short, y);
  ctx.lineTo(x + w, y + w);
  ctx.lineTo(x, y + long);
  ctx.lineTo(x - w, y + w);
  ctx.lineTo(x - short, y);
  ctx.lineTo(x - w, y - w);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRings(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, t: number, scale: number, strength: number) {
  for (let j = 0; j < 2; j++) {
    const phase = (t / 2200 + j * 0.5) % 1;
    const rr = r * (1.25 + 1.5 * phase) + 2 / scale;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(color, (1 - phase) * 0.75 * strength);
    ctx.lineWidth = 1.3 / scale;
    ctx.stroke();
  }
}

export function drawNode(node: PNode, ctx: CanvasRenderingContext2D, scale: number, state: NodeDrawState): void {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const sz = sizeFactor(scale);
  const r = nodeRadius(node) * sz;
  const ratio = dpr();

  ctx.save();
  ctx.globalAlpha = state.alpha;

  if (node.kind === 'center') {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
    ctx.shadowBlur = 34 * ratio * state.alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#000';
    ctx.font = `700 ${r * 0.52}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('APU', x, y + r * 0.03);
    ctx.restore();
    return;
  }

  const color = CATEGORY_COLOR[node.category as CategoryKey] ?? '#ffffff';

  if (node.kind === 'hub') {
    // Soft halo, then the disc with a bright rim.
    const halo = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 2.2);
    halo.addColorStop(0, hexToRgba(color, 0.35));
    halo.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = color;
    ctx.shadowBlur = 30 * ratio * state.alpha;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, tint(color, 0.35));
    g.addColorStop(1, color);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2.2 / scale;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = `700 ${r * 0.62}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(state.count ?? ''), x, y + r * 0.04);
    drawPill(ctx, node.label, x, y + r + 16 / scale, 'center', scale, { bold: true, size: 13 });
    ctx.restore();
    return;
  }

  // Community node.
  const pulsing = node.live || state.focusIndex > 0;
  if (pulsing) drawRings(ctx, x, y, r, node.live && !state.focusIndex ? color : color, state.t, scale, 1);

  // Upcoming events make the node a brighter star: stronger glow, lighter fill, sparkle.
  const s = starStrength(node.upcoming ?? 0);
  const look = s > 0 ? starLook(node.id, color, s) : null;
  const twinkle = look ? Math.sin(state.t / 650 + look.phase) : 0;
  const blurBoost = look ? 1 + 1.2 * s * (0.9 + 0.1 * twinkle) : 1;
  ctx.shadowColor = look ? look.glow : color;
  ctx.shadowBlur = (10 + r * scale * 1.1) * blurBoost * ratio * state.alpha;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
  g.addColorStop(0, look ? look.hi : tint(color, 0.45));
  g.addColorStop(0.6, look ? look.body : color);
  g.addColorStop(1, look ? look.body : color);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  // A second glow pass doubles the halo intensity for the brightest stars.
  if (look && s > 0.6) {
    ctx.shadowBlur *= 1.6;
    ctx.globalAlpha = state.alpha * (s - 0.6) * 1.5;
    ctx.fill();
    ctx.globalAlpha = state.alpha;
  }
  ctx.shadowColor = 'transparent';
  if (look) drawSparkle(ctx, x, y, r, s, twinkle, scale);

  if (state.selected || state.hovered || state.focusIndex > 0) {
    ctx.beginPath();
    ctx.arc(x, y, r + 2.5 / scale, 0, Math.PI * 2);
    ctx.lineWidth = (state.selected ? 2 : 1.4) / scale;
    ctx.strokeStyle = state.selected ? '#ffffff' : 'rgba(255, 255, 255, 0.7)';
    ctx.stroke();
  }

  ctx.restore();
}

/** Three soft nebulae (one per hub) plus a faint glow at the center. */
export function drawNebula(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  (Object.keys(HUB_POS) as CategoryKey[]).forEach((cat) => {
    const { x, y } = HUB_POS[cat];
    const R = CLOUD_RADIUS[cat] * 1.9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, hexToRgba(CATEGORY_COLOR[cat], 0.13));
    g.addColorStop(0.45, hexToRgba(CATEGORY_COLOR[cat], 0.06));
    g.addColorStop(1, hexToRgba(CATEGORY_COLOR[cat], 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - R, y - R, R * 2, R * 2);
  });
  const c = ctx.createRadialGradient(0, 0, 0, 0, 0, 220);
  c.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
  c.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = c;
  ctx.fillRect(-220, -220, 440, 440);
  ctx.restore();
}

/** Dashed curves joining every pair of focused nodes. */
export function drawFocusLinks(ctx: CanvasRenderingContext2D, nodes: PNode[], scale: number): void {
  if (nodes.length < 2) return;
  ctx.save();
  ctx.setLineDash([5 / scale, 4 / scale]);
  ctx.lineWidth = 1.3 / scale;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const ax = a.x ?? 0, ay = a.y ?? 0, bx = b.x ?? 0, by = b.y ?? 0;
      const mx = (ax + bx) / 2 - (by - ay) * 0.12;
      const my = (ay + by) / 2 + (bx - ax) * 0.12;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx, my, bx, by);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Distance in screen px from a node's center to its label pill. */
export function labelGap(screenR: number, pulsing: boolean): number {
  return screenR + (pulsing ? 10 : 6);
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelCandidate {
  id: string;
  text: string;
  /** Screen position and radius. */
  sx: number;
  sy: number;
  sr: number;
  pulsing: boolean;
  badge: boolean;
  size: number;
  preferred: 'left' | 'right';
  /** Must show even if it collides with nodes (still avoids overlays and other labels when it can). */
  force: boolean;
}

const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const hitCircle = (a: Rect, c: { x: number; y: number; r: number }) => {
  const nx = Math.max(a.x, Math.min(c.x, a.x + a.w));
  const ny = Math.max(a.y, Math.min(c.y, a.y + a.h));
  return (nx - c.x) ** 2 + (ny - c.y) ** 2 < c.r * c.r;
};

export interface LabelPlacement {
  /** Pill rect in screen pixels. */
  rect: Rect;
  text: string;
  badge: number;
  size: number;
  strong: boolean;
}

/** True when rect r lies fully inside bounds. */
export function rectInBounds(r: Rect, bounds: Rect): boolean {
  return r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h;
}

/**
 * Greedy label placement in screen space. Candidates come in priority order;
 * each tries its preferred side, the other side, then above and below, and is
 * dropped when every spot collides with an overlay, an earlier label, the
 * canvas edge, or another node. Forced candidates (focused, selected, live)
 * take the spot that covers the fewest nodes instead of being dropped.
 */
export function placeLabels(
  ctx: CanvasRenderingContext2D,
  cands: (LabelCandidate & { badgeNo?: number })[],
  overlays: Rect[],
  circles: { id: string; x: number; y: number; r: number }[],
  bounds: Rect,
): Map<string, LabelPlacement> {
  const out = new Map<string, LabelPlacement>();
  const placed: Rect[] = [];
  const pad = (r: Rect): Rect => ({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 });
  for (const c of cands) {
    const { w, h } = pillSize(ctx, c.text, { badge: c.badge ? 1 : undefined, size: c.size });
    const gap = labelGap(c.sr, c.pulsing);
    const other = c.preferred === 'left' ? 'right' : 'left';
    const spots: Rect[] = [c.preferred, other].map((side) => ({
      x: side === 'left' ? c.sx - gap - w : c.sx + gap,
      y: c.sy - h / 2,
      w,
      h,
    }));
    spots.push({ x: c.sx - w / 2, y: c.sy - gap - h + 2, w, h });
    spots.push({ x: c.sx - w / 2, y: c.sy + gap - 2, w, h });
    const inBounds = (r: Rect) => rectInBounds(r, bounds);
    const free = (r: Rect) => {
      const q = pad(r);
      return inBounds(r) && !overlays.some((o) => hit(q, o)) && !placed.some((p) => hit(q, p));
    };
    const nodeHits = (r: Rect) => circles.filter((k) => k.id !== c.id && hitCircle(pad(r), k)).length;
    let spot = spots.find((r) => free(r) && nodeHits(r) === 0);
    if (!spot && c.force) {
      const ok = spots.filter(free);
      if (ok.length) spot = ok.reduce((best, r) => (nodeHits(r) < nodeHits(best) ? r : best));
    }
    if (!spot) continue;
    placed.push(spot);
    out.set(c.id, { rect: spot, text: c.text, badge: c.badgeNo ?? 0, size: c.size, strong: c.badge });
  }
  return out;
}

/** Paints placed labels in screen space, above every node. */
export function drawLabels(ctx: CanvasRenderingContext2D, labels: Iterable<LabelPlacement>): void {
  const ratio = dpr();
  ctx.save();
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  for (const l of labels) {
    drawPill(ctx, l.text, l.rect.x, l.rect.y + l.rect.h / 2, 'right', 1, {
      badge: l.badge || undefined,
      strong: l.strong,
      size: l.size,
    });
  }
  ctx.restore();
}
