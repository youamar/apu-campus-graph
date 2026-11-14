import { describe, expect, it } from 'vitest';
import { catalog, events } from '../data/catalog';
import { nodeRadius, type PNode } from './draw';
import { layoutNodes } from './layout';
import { toGraph } from './model';
import { DIM_FOCUS, focusCamera, focusHint, focusOf, focusTitle, labelRank, nodeAlpha, overviewCamera } from './view';

const nodes = layoutNodes(toGraph(catalog, events).nodes, nodeRadius) as PNode[];
const byId = new Map(nodes.map((n) => [n.id, n]));
const vp = { w: 1100, h: 800 };
const photo = byId.get('apu-photography-club')!;
const football = byId.get('apu-football-club-afc')!;

describe('GraphView', () => {
  it('focus copy', () => {
    expect(focusHint(5, 137, 'ai')).toBe('Gemini zoomed in to 5 of 137 communities');
    expect(focusHint(5, 137, 'user')).toBe('Showing 5 of 137 communities');
    expect(focusTitle([photo.id], byId)).toBe('Societies & SIGs');
    expect(focusTitle([photo.id, football.id], byId)).toBe('Across worlds');
  });

  it('dims everything outside the focus, keeps the anchoring hub legible', () => {
    const f = focusOf([photo.id], byId);
    expect(nodeAlpha(photo, f, 'all')).toBe(1);
    expect(nodeAlpha(football, f, 'all')).toBe(DIM_FOCUS);
    expect(nodeAlpha(byId.get('hub-soc')!, f, 'all')).toBe(0.9);
  });

  it('ranks labels: focus badges first, featured only while exploring', () => {
    const none = focusOf([], byId);
    const f = focusOf([football.id, photo.id], byId);
    const ctx = { selectedId: null, hoverId: null, alpha: 1, scale: 1 };
    expect(labelRank(football, { ...ctx, focus: f })).toBe(99);
    expect(labelRank(photo, { ...ctx, focus: f })).toBe(98);
    expect(labelRank(photo, { ...ctx, focus: none })).toBeGreaterThanOrEqual(40);
    expect(labelRank(photo, { ...ctx, focus: none, alpha: 0.1 })).toBe(-1);
  });

  it('frames a focused node left of the card inset and never zooms past the cap', () => {
    const overview = overviewCamera(nodes, vp);
    const free = focusCamera(nodes, [photo.id], vp, 0)!;
    const inset = focusCamera(nodes, [photo.id], vp, 420)!;
    expect(free.k).toBeLessThanOrEqual(overview.k * 1.8 + 1e-9);
    // With a card on the right, the camera centre moves right so the node sits further left on screen.
    expect(inset.cx).toBeGreaterThan(free.cx);
    expect(focusCamera(nodes, ['ghost'], vp, 0)).toBeNull();
  });
});
