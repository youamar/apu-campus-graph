import { catalog, events } from '../data/catalog';
import { nodeRadius } from './draw';
import { HUB_POS, labelSide, layoutNodes, matchesFilter } from './layout';
import { nextEventToday, startsIn } from './LiveTicker';
import { toGraph } from './model';

const g = toGraph(catalog, events);
const laid = layoutNodes(g.nodes, nodeRadius);

describe('layoutNodes', () => {
  it('pins the center and hubs where the Figma puts them', () => {
    const apu = laid.find((n) => n.id === 'apu')!;
    expect([apu.fx, apu.fy]).toEqual([0, 0]);
    const soc = laid.find((n) => n.id === 'hub-soc')!;
    expect([soc.fx, soc.fy]).toEqual([HUB_POS.soc.x, HUB_POS.soc.y]);
  });

  it('is deterministic and keeps communities from overlapping', () => {
    const again = layoutNodes(g.nodes, nodeRadius);
    expect(again.map((n) => [n.x, n.y])).toEqual(laid.map((n) => [n.x, n.y]));
    const coms = laid.filter((n) => n.kind === 'community');
    let overlaps = 0;
    for (let i = 0; i < coms.length; i++)
      for (let j = i + 1; j < coms.length; j++) {
        const d = Math.hypot(coms[i].x - coms[j].x, coms[i].y - coms[j].y);
        if (d < nodeRadius(coms[i]) + nodeRadius(coms[j])) overlaps++;
      }
    expect(overlaps).toBe(0);
  });

  it('keeps each community nearer its own hub than the others', () => {
    for (const n of laid.filter((x) => x.kind === 'community')) {
      const own = HUB_POS[n.category!];
      const dOwn = Math.hypot(n.x - own.x, n.y - own.y);
      for (const p of Object.values(HUB_POS)) expect(dOwn).toBeLessThanOrEqual(Math.hypot(n.x - p.x, n.y - p.y));
    }
  });
});

describe('matchesFilter / labelSide', () => {
  const com = laid.find((n) => n.kind === 'community' && n.category === 'spo')!;
  it('dims by category and by today', () => {
    expect(matchesFilter(com, 'all')).toBe(true);
    expect(matchesFilter(com, 'spo')).toBe(true);
    expect(matchesFilter(com, 'soc')).toBe(false);
    expect(matchesFilter({ ...com, live: true }, 'today')).toBe(true);
    expect(matchesFilter({ ...com, live: false }, 'today')).toBe(false);
  });
  it('puts the label on the side away from the hub', () => {
    expect(labelSide({ category: 'soc', x: HUB_POS.soc.x - 10 })).toBe('left');
    expect(labelSide({ category: 'soc', x: HUB_POS.soc.x + 10 })).toBe('right');
  });
});

describe('live ticker helpers', () => {
  const now = new Date(2026, 10, 13, 17, 0);
  const at = (h: number, m: number, dayOffset = 0) => new Date(2026, 10, 13 + dayOffset, h, m).toISOString();
  const evs = [
    { id: 'a', communityId: 'x', title: 'Past', place: '', start: at(16, 0), going: 1, sample: true as const },
    { id: 'b', communityId: 'y', title: 'Later', place: '', start: at(20, 0), going: 2, sample: true as const },
    { id: 'c', communityId: 'z', title: 'Next', place: '', start: at(17, 40), going: 18, sample: true as const },
    { id: 'd', communityId: 'w', title: 'Tomorrow', place: '', start: at(17, 10, 1), going: 3, sample: true as const },
  ];
  it('picks the next event that has not started today', () => {
    expect(nextEventToday(evs, now)?.title).toBe('Next');
    expect(nextEventToday(evs, new Date(2026, 10, 13, 21, 0))).toBeNull();
  });
  it('formats the countdown', () => {
    expect(startsIn(40 * 60000)).toBe('40 min');
    expect(startsIn(125 * 60000)).toBe('2 h 5 min');
  });
});
