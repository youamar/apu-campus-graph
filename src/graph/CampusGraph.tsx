import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { catalog, events } from '../data/catalog';
import type { CategoryKey } from '../data/types';
import {
  drawFocusLinks,
  drawNebula,
  drawNode,
  hexToRgba,
  nodeRadius,
  placeLabels,
  sizeFactor,
  drawLabels,
  type LabelCandidate,
  type LabelPlacement,
  type PLink,
  type PNode,
  type Rect,
} from './draw';
import Filters, { type FilterCounts } from './Filters';
import { CATEGORY_COLOR, CATEGORY_NAME, capFocusZoom, labelSide, layoutNodes, matchCountLabel, matchesFilter, type GraphFilter } from './layout';
import Legend from './Legend';
import LiveTicker from './LiveTicker';
import { toGraph } from './model';

export interface CampusGraphProps {
  focusIds: string[];
  selectedId: string | null;
  filter: CategoryKey | 'all' | 'today';
  onSelect(id: string): void;
  onFilterChange?(filter: GraphFilter): void;
  /** Called when the user leaves focus mode from the breadcrumb. */
  onReset?(): void;
  /** Width (px) on the right covered by an overlay such as the detail card; framing keeps nodes left of it. */
  rightInset?: number;
}

export interface CampusGraphHandle {
  focus(ids: string[]): void;
  reset(): void;
}

const DIM_FILTER = 0.15;
const DIM_FOCUS = 0.2;
/** Screen-space safe area the overview fits into, clear of the HTML overlays. */
const SAFE = { top: 150, bottom: 64, left: 28, right: 28 };
const LABEL_ZOOM = 2.5;
/** Screen padding around a focused set; wide sides leave room for the labels. */
const FOCUS_PAD = { top: 120, bottom: 90, left: 150, right: 170 };
const FOCUS_MAX_ZOOM = 3.2;

const endId = (e: string | PNode) => (typeof e === 'string' ? e : e.id);

const CampusGraph = forwardRef<CampusGraphHandle, CampusGraphProps>(function CampusGraph(
  { focusIds, selectedId, filter, onSelect, onFilterChange, onReset, rightInset = 0 },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<PNode, PLink> | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [activeFocus, setActiveFocus] = useState<string[]>(focusIds);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const data = useMemo(() => {
    const g = toGraph(catalog, events);
    const order = { community: 0, hub: 1, center: 2 } as const;
    // Communities first so hubs, their pills and the APU disc paint on top.
    const nodes = (layoutNodes(g.nodes, nodeRadius) as PNode[]).sort((a, b) => order[a.kind] - order[b.kind]);
    return { nodes, links: g.links as PLink[] };
  }, []);

  const counts: FilterCounts = useMemo(() => {
    const coms = data.nodes.filter((n) => n.kind === 'community');
    return {
      all: coms.length,
      soc: coms.filter((n) => n.category === 'soc').length,
      spo: coms.filter((n) => n.category === 'spo').length,
      intl: coms.filter((n) => n.category === 'intl').length,
      today: coms.filter((n) => n.live).length,
    };
  }, [data]);

  const hubCount = useMemo(
    () => ({ 'hub-soc': counts.soc, 'hub-spo': counts.spo, 'hub-intl': counts.intl }) as Record<string, number>,
    [counts],
  );

  const nodeById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data]);

  // Size the canvas from its container.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Zoom and centre that fit the whole graph into the area left free by the overlays. */
  const overview = useCallback(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const n of data.nodes) {
      const r = nodeRadius(n) + (n.kind === 'hub' ? 6 : 2);
      x0 = Math.min(x0, (n.x ?? 0) - r);
      x1 = Math.max(x1, (n.x ?? 0) + r);
      y0 = Math.min(y0, (n.y ?? 0) - r);
      y1 = Math.max(y1, (n.y ?? 0) + r + (n.kind === 'hub' ? 40 : 0));
    }
    const aw = size.w - SAFE.left - SAFE.right;
    const ah = size.h - SAFE.top - SAFE.bottom;
    const k = Math.min(aw / (x1 - x0), ah / (y1 - y0));
    // Graph point that must land at the canvas center so the bbox centers in the safe area.
    const sx = SAFE.left + aw / 2 - size.w / 2;
    const sy = SAFE.top + ah / 2 - size.h / 2;
    return { k, cx: (x0 + x1) / 2 - sx / k, cy: (y0 + y1) / 2 - sy / k };
  }, [data, size]);

  /** Fit the whole graph into the area left free by the overlays. */
  const fitAll = useCallback(
    (ms = 600) => {
      const fg = fgRef.current;
      if (!fg || !size.w) return;
      const { k, cx, cy } = overview();
      fg.zoom(k, ms);
      fg.centerAt(cx, cy, ms);
    },
    [overview, size],
  );

  /** Frame the focused nodes inside the area left of `rightInset`. */
  const zoomToFocus = useCallback(
    (ids: string[], ms = 600) => {
      const fg = fgRef.current;
      if (!fg || !size.w) return;
      const set = new Set(ids);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const n of data.nodes) {
        if (!set.has(n.id)) continue;
        x0 = Math.min(x0, n.x ?? 0);
        x1 = Math.max(x1, n.x ?? 0);
        y0 = Math.min(y0, n.y ?? 0);
        y1 = Math.max(y1, n.y ?? 0);
      }
      if (x0 === Infinity) return;
      const left = FOCUS_PAD.left;
      // Beside an overlay, right-hand labels only need room up to its edge.
      const right = rightInset > 0 ? rightInset + 110 : FOCUS_PAD.right;
      const aw = Math.max(80, size.w - left - right);
      const ah = Math.max(80, size.h - FOCUS_PAD.top - FOCUS_PAD.bottom);
      // A single match (or a tight cluster) would otherwise zoom right in; keep its neighbourhood in view.
      const k = capFocusZoom(Math.min(aw / Math.max(x1 - x0, 1), ah / Math.max(y1 - y0, 1), FOCUS_MAX_ZOOM), overview().k);
      const sx = left + aw / 2 - size.w / 2;
      const sy = FOCUS_PAD.top + ah / 2 - size.h / 2;
      fg.zoom(k, ms);
      fg.centerAt((x0 + x1) / 2 - sx / k, (y0 + y1) / 2 - sy / k, ms);
    },
    [data, size, rightInset, overview],
  );

  // Initial framing once the canvas has a size; refit on resize unless focused.
  const focusRef = useRef(activeFocus);
  focusRef.current = activeFocus;
  // Latest framers in refs so a new rightInset doesn't count as a resize.
  const framers = useRef({ fitAll, zoomToFocus });
  framers.current = { fitAll, zoomToFocus };
  useEffect(() => {
    if (!size.w) return;
    const t = setTimeout(() => {
      if (focusRef.current.length) framers.current.zoomToFocus(focusRef.current);
      else framers.current.fitAll(0);
    }, 0);
    return () => clearTimeout(t);
  }, [size]);

  // Reframe when an overlay opens or closes on the right.
  const insetRef = useRef(rightInset);
  useEffect(() => {
    if (insetRef.current === rightInset) return;
    insetRef.current = rightInset;
    const fg = fgRef.current;
    if (!fg || !size.w) return;
    if (focusRef.current.length) {
      zoomToFocus(focusRef.current);
      return;
    }
    // Explore mode: slide the selected node out from under the overlay.
    const n = render.current.selectedId ? nodeById.get(render.current.selectedId) : undefined;
    if (!n || !rightInset) return;
    const p = fg.graph2ScreenCoords(n.x ?? 0, n.y ?? 0);
    const limit = size.w - rightInset - 60;
    if (p.x <= limit) return;
    const k = fg.zoom();
    const c = fg.screen2GraphCoords(size.w / 2, size.h / 2);
    fg.centerAt(c.x + (p.x - (size.w - rightInset) / 2) / k, c.y, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightInset]);

  // Follow the focusIds prop.
  useEffect(() => {
    setActiveFocus(focusIds);
    if (focusIds.length) zoomToFocus(focusIds);
    else fitAll(600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIds]);

  useImperativeHandle(
    ref,
    () => ({
      focus(ids: string[]) {
        setActiveFocus(ids);
        if (ids.length) zoomToFocus(ids);
      },
      reset() {
        setActiveFocus([]);
        fitAll(600);
      },
    }),
    [fitAll, zoomToFocus],
  );

  // Per-frame render state, read from a ref so the canvas callbacks stay stable.
  const focusIndex = useMemo(() => new Map(activeFocus.map((id, i) => [id, i + 1])), [activeFocus]);
  const focusCats = useMemo(
    () => new Set(activeFocus.map((id) => nodeById.get(id)?.category)),
    [activeFocus, nodeById],
  );
  const render = useRef({
    focusIndex,
    focusCats,
    filter,
    selectedId,
    hoverId,
    labels: new Map<string, LabelPlacement>(),
  });
  render.current = { ...render.current, focusIndex, focusCats, filter, selectedId, hoverId };

  const nodeAlpha = useCallback((n: PNode) => {
    const { focusIndex: fi, filter: f } = render.current;
    if (fi.size) {
      if (fi.has(n.id)) return 1;
      // The hub that anchors the focused set stays legible; everything else recedes.
      if (n.kind === 'hub' && render.current.focusCats.has(n.category)) return 0.9;
      return DIM_FOCUS;
    }
    return matchesFilter(n, f) ? 1 : DIM_FILTER;
  }, []);

  const paintNode = useCallback(
    (node: PNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const { focusIndex: fi, selectedId: sel, hoverId: hov } = render.current;
      const idx = fi.get(node.id) ?? 0;
      const alpha = nodeAlpha(node);
      drawNode(node, ctx, scale, {
        t: performance.now(),
        alpha,
        focusIndex: idx,
        selected: sel === node.id,
        hovered: hov === node.id,
        count: hubCount[node.id],
      });
    },
    [hubCount, nodeAlpha],
  );

  const paintPointer = useCallback((node: PNode, color: string, ctx: CanvasRenderingContext2D, scale: number) => {
    const r = Math.max(nodeRadius(node) * sizeFactor(scale), 7 / scale);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const linkColor = useCallback(
    (l: PLink) => {
      const s = typeof l.source === 'string' ? nodeById.get(l.source) : l.source;
      const t = typeof l.target === 'string' ? nodeById.get(l.target) : l.target;
      const { focusIndex: fi } = render.current;
      let a = 1;
      if (fi.size) {
        const inFocus = fi.has(endId(l.source)) || fi.has(endId(l.target));
        if (l.kind === 'member' && inFocus) {
          return hexToRgba(CATEGORY_COLOR[(s?.category ?? 'soc') as CategoryKey], 0.95);
        }
        a = DIM_FOCUS;
      } else if (s && t) {
        a = Math.min(nodeAlpha(s), nodeAlpha(t));
      }
      if (l.kind === 'hub') return `rgba(255, 255, 255, ${0.5 * Math.max(a, 0.4)})`;
      if (l.kind === 'shared') return `rgba(255, 255, 255, ${0.07 * a})`;
      return hexToRgba(CATEGORY_COLOR[(s?.category ?? 'soc') as CategoryKey], 0.26 * a);
    },
    [nodeById, nodeAlpha],
  );

  const linkWidth = useCallback((l: PLink) => {
    const { focusIndex: fi } = render.current;
    if (fi.size && l.kind === 'member' && (fi.has(endId(l.source)) || fi.has(endId(l.target)))) return 2.2;
    return l.kind === 'hub' ? 1.8 : l.kind === 'shared' ? 0.6 : 0.75;
  }, []);

  /** Decide which labels show this frame, and on which side, without collisions. */
  const layoutLabels = useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      const fg = fgRef.current;
      const wrap = wrapRef.current;
      if (!fg || !wrap) return;
      const { focusIndex: fi, selectedId: sel, hoverId: hov } = render.current;
      const box = wrap.getBoundingClientRect();
      const overlays: Rect[] = [];
      wrap.querySelectorAll('.cg-heading > *, .cg-ticker, .cg-crumbs > *, .cg-legend, .cg-hint, .cg-zoom').forEach((el) => {
        const r = el.getBoundingClientRect();
        overlays.push({ x: r.left - box.left - 6, y: r.top - box.top - 6, w: r.width + 12, h: r.height + 12 });
      });
      // Panels laid over the graph from outside (the detail card) mark themselves with data-graph-overlay.
      const covers: Rect[] = [];
      wrap.parentElement?.querySelectorAll('[data-graph-overlay]').forEach((el) => {
        const r = el.getBoundingClientRect();
        covers.push({ x: r.left - box.left - 8, y: r.top - box.top - 8, w: r.width + 16, h: r.height + 16 });
      });
      overlays.push(...covers);
      const covered = (x: number, y: number) => covers.some((o) => x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);
      const sz = sizeFactor(scale);
      const circles: { id: string; x: number; y: number; r: number }[] = [];
      const cands: (LabelCandidate & { rank: number; badgeNo: number })[] = [];
      for (const n of data.nodes) {
        const p = fg.graph2ScreenCoords(n.x ?? 0, n.y ?? 0);
        const sr = nodeRadius(n) * sz * scale;
        if (n.kind !== 'community') {
          circles.push({ id: n.id, x: p.x, y: p.y, r: sr + 4 });
          if (n.kind === 'hub') {
            // Hub name pill sits below the disc.
            overlays.push({ x: p.x - 75, y: p.y + sr + 2, w: 150, h: 28 });
          }
          continue;
        }
        // Nodes hidden under a right-hand overlay get no label.
        if (covered(p.x, p.y)) continue;
        const alpha = nodeAlpha(n);
        if (alpha > 0.5) circles.push({ id: n.id, x: p.x, y: p.y, r: sr + 1 });
        const idx = fi.get(n.id) ?? 0;
        const featured = n.community?.sample === true && !fi.size;
        const rank =
          idx > 0 ? 100 - idx : n.id === sel ? 90 : n.id === hov ? 85 :
          alpha > 0.5 && n.live ? 70 : alpha > 0.5 && featured ? 50 : alpha > 0.5 && scale > LABEL_ZOOM ? 10 + n.size : -1;
        if (rank < 0) continue;
        cands.push({
          id: n.id,
          text: n.label,
          sx: p.x,
          sy: p.y,
          sr,
          pulsing: n.live || idx > 0,
          badge: idx > 0,
          size: idx > 0 ? 12 : 11,
          preferred: labelSide(n),
          force: rank >= 70,
          rank,
          badgeNo: idx,
        });
      }
      cands.sort((a, b) => b.rank - a.rank);
      render.current.labels = placeLabels(ctx, cands, overlays, circles, {
        x: 4,
        y: 4,
        w: box.width - 8,
        h: box.height - 8,
      });
    },
    [data, nodeAlpha],
  );

  const framePre = useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      layoutLabels(ctx, scale);
      drawNebula(ctx);
      const { focusIndex: fi } = render.current;
      if (fi.size) {
        const focused = [...fi.keys()].map((id) => nodeById.get(id)).filter(Boolean) as PNode[];
        drawFocusLinks(ctx, focused, scale);
      }
    },
    [nodeById, layoutLabels],
  );

  // Canvas text needs the Roboto weights loaded before the first paint uses them.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    ['500 11px Roboto', '500 12px Roboto', '700 13px Roboto', '700 18px Roboto'].forEach((f) => {
      document.fonts.load(f).catch(() => undefined);
    });
  }, []);

  const initialFit = useRef(false);

  const framePost = useCallback((ctx: CanvasRenderingContext2D) => {
    drawLabels(ctx, render.current.labels.values());
  }, []);

  const zoomBy = (f: number) => {
    const fg = fgRef.current;
    if (fg) fg.zoom(fg.zoom() * f, 300);
  };

  const leaveFocus = () => {
    setActiveFocus([]);
    fitAll(600);
    onReset?.();
  };

  const focusLabel = useMemo(() => {
    const cats = new Set(activeFocus.map((id) => nodeById.get(id)?.category).filter(Boolean));
    return cats.size === 1 ? CATEGORY_NAME[[...cats][0] as CategoryKey] : 'Across worlds';
  }, [activeFocus, nodeById]);

  const inFocus = activeFocus.length > 0;

  return (
    <div
      className={rightInset > 0 ? 'cg has-inset' : 'cg'}
      ref={wrapRef}
      style={{ cursor: hoverId ? 'pointer' : undefined, '--cg-inset': `${rightInset}px` } as React.CSSProperties}
    >
      {size.w > 0 && (
        <ForceGraph2D<PNode, PLink>
          ref={fgRef as React.MutableRefObject<ForceGraphMethods<PNode, PLink> | undefined>}
          width={size.w}
          height={size.h}
          graphData={data}
          // Transparent so the themed .cg background (--graph-bg) shows through.
          backgroundColor="rgba(0, 0, 0, 0)"
          nodeId="id"
          nodeCanvasObject={paintNode}
          nodeCanvasObjectMode={() => 'replace'}
          nodePointerAreaPaint={paintPointer}
          nodeLabel={() => ''}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkCurvature={(l) => (l.kind === 'hub' ? 0.18 : 0.12)}
          onRenderFramePre={framePre}
          onRenderFramePost={framePost}
          autoPauseRedraw={false}
          warmupTicks={0}
          cooldownTicks={0}
          enableNodeDrag={false}
          onEngineStop={() => {
            if (initialFit.current) return;
            initialFit.current = true;
            if (focusRef.current.length) zoomToFocus(focusRef.current);
            else fitAll(0);
          }}
          // Low floor so a phone-width portrait canvas can still fit the whole graph.
          minZoom={0.15}
          maxZoom={8}
          showPointerCursor={(o) => !!o && (o as PNode).kind === 'community'}
          onNodeHover={(n) => setHoverId(n && n.kind === 'community' ? n.id : null)}
          onNodeClick={(n) => {
            if (n.kind === 'community') onSelect(n.id);
          }}
        />
      )}

      <div className="cg-top">
        {inFocus ? (
          <div className="cg-crumbs">
            <button type="button" className="cg-pill cg-back" onClick={leaveFocus}>
              <span aria-hidden="true">←</span> All communities
            </button>
            <span className="cg-crumb-text">
              {focusLabel} <span className="cg-muted">›</span> {matchCountLabel(activeFocus.length)}
            </span>
          </div>
        ) : (
          <div className="cg-heading">
            <h1>Discover campus life</h1>
            <p>{counts.all} communities across 3 worlds. Ask the guide, or just explore.</p>
            <Filters filter={filter} counts={counts} onChange={(f) => onFilterChange?.(f)} />
          </div>
        )}
        {!inFocus && <LiveTicker events={events} onSelect={onSelect} />}
      </div>

      <div className="cg-bottom">
        {inFocus ? (
          <div className="cg-pill cg-hint">
            <span className="cg-spark" aria-hidden="true">✦</span>
            Gemini zoomed in to {activeFocus.length} of {counts.all} communities
            <span className="cg-muted">· Tap any node for details</span>
          </div>
        ) : (
          <Legend />
        )}
        <div className="cg-zoom" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.4)}>+</button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>−</button>
          <button type="button" aria-label="Fit all" className="cg-fit" onClick={() => fitAll(600)}>1:1</button>
        </div>
      </div>
    </div>
  );
});

export default CampusGraph;
