// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { catalog, events } from '../src/data/catalog';
import { answerOffline, groundReply } from '../shared/conversation';
import { createGuideAgent } from './guideAgent';
import type { Step, StepResult } from './step';

const photo = catalog.find((c) => c.id === 'apu-photography-club')!;
const answer = (o: object): StepResult => ({ text: JSON.stringify({ openId: null, suggestions: ['a', 'b', 'c'], ...o }) });
const scripted = (script: StepResult[]): Step => {
  let i = 0;
  return async () => script[Math.min(i++, script.length - 1)];
};
const user = (text: string) => [{ role: 'user' as const, text }];

describe('GuideAgent (through its interface, no HTTP)', () => {
  it('plans with tools, answers, and reports a trace', async () => {
    const agent = createGuideAgent({
      catalog,
      events,
      step: scripted([{ calls: [{ id: '1', name: 'search_clubs', args: { query: 'photo' } }] }, answer({ reply: 'Try the Photography Club.', focusIds: [photo.id] })]),
    });
    const r = await agent.ask(user('photo'), null);
    expect(r).toMatchObject({ source: 'gemini', focusIds: [photo.id] });
    expect(r.trace?.[0]).toMatch(/Searched clubs/);
  });

  it('answers offline when the budget is already spent (fake clock)', async () => {
    let t = 0;
    const agent = createGuideAgent({ catalog, events, budgetMs: 500, now: () => (t += 1000), step: scripted([answer({ reply: 'never', focusIds: [] })]), log: () => {} });
    const r = await agent.ask(user('I love photography'), null);
    expect(r.source).toBe('offline');
    expect(r.focusIds[0]).toBe(photo.id);
  });

  it('answers offline with no step (no API key)', async () => {
    const r = await createGuideAgent({ catalog, events, step: null }).ask(user('football'), null);
    expect(r.source).toBe('offline');
  });
});

describe('shared conversation contract', () => {
  it('grounds ids the same way on both sides', () => {
    const r = groundReply({ reply: 'x', focusIds: ['ghost', photo.id], openId: 'ghost', suggestions: [] }, new Set([photo.id]), 'gemini');
    expect(r).toMatchObject({ focusIds: [photo.id], openId: null });
    expect(r!.suggestions).toHaveLength(3);
  });
  it('answers a follow-up offline with the previous topic', () => {
    const r = answerOffline(
      [
        { role: 'user', text: 'I love photography' },
        { role: 'model', text: 'ok' },
        { role: 'user', text: 'how do I join?' },
      ],
      { catalog, events, profile: null },
    );
    expect(r.focusIds[0]).toBe(photo.id);
  });
});

describe('review fixes', () => {
  it('a short events follow-up keeps the events answer offline', () => {
    const r = answerOffline(
      [
        { role: 'user', text: 'I love photography' },
        { role: 'model', text: 'ok' },
        { role: 'user', text: "what's on this week?" },
      ],
      { catalog, events, profile: null, },
    );
    expect(r.reply).toMatch(/sample events/);
  });

  it('keeps the flagged Gemini answer when the repair call and its retry both fail', async () => {
    let n = 0;
    const step: Step = async () => {
      n++;
      if (n === 1) return answer({ reply: 'Join the Quidditch Club!', focusIds: [photo.id] });
      throw new Error('503');
    };
    const r = await createGuideAgent({ catalog, events, step, log: () => {} }).ask(user('photo'), null);
    expect(r.source).toBe('gemini');
    expect(r.focusIds).toEqual([photo.id]);
  });

  it('a non-sample value without a trusted source is not official', async () => {
    const { provenance } = await import('../src/data/provenance');
    const plain = catalog.find((c) => !c.sample && !c.official)!;
    const p = provenance({ ...plain, hoursPerWeek: '3h', finePrint: { fee: 'RM 9' }, schedule: [{ day: 'Mon', start: '18:00', end: '19:00' }] });
    expect(p).toMatchObject({ hours: 'none', finePrint: 'none', schedule: 'none' });
  });
});

describe('fewer calls', () => {
  it('search_clubs returns full details for the top 3 matches', async () => {
    const { runTool } = await import('./tools');
    const r = runTool({ name: 'search_clubs', args: { query: 'photography' } }, { catalog, events, profile: null }) as { details: { id: string; officialChannel: string }[] };
    expect(r.details).toHaveLength(3);
    expect(r.details[0].id).toBe(photo.id);
    expect(r.details[0].officialChannel).toMatch(/^https:/);
  });
});

describe('plan my week (agent action)', () => {
  const fri = { year: 1 as const, level: 'degree' as const, interests: [], free: [{ day: 'Fri' as const, start: '18:00', end: '23:00' }], going: [], week: [] };
  const squash = catalog.find((c) => c.shortName === 'Squash Club')!; // Fri 19:00-21:00 (published)
  const football = catalog.find((c) => c.id === 'apu-football-club-afc')!; // Thu + Sun: clashes

  it('adds only communities that fit, returns a verified action and a trace', async () => {
    const agent = createGuideAgent({
      catalog,
      events,
      step: scripted([
        { calls: [{ id: '1', name: 'add_to_week', args: { ids: [squash.id, football.id] } }] },
        answer({ reply: `I added ${squash.shortName} to your week. Football clashes with your Friday evenings.`, focusIds: [squash.id, football.id] }),
      ]),
    });
    const r = await agent.ask(user('plan my week with sports that fit'), fri);
    expect(r.actions).toEqual([{ type: 'add_to_week', ids: [squash.id] }]);
    expect(r.trace).toContain(`Added ${squash.shortName} to your week`);
  });

  it('asks for free times instead of adding when none are set', async () => {
    const { runTool } = await import('./tools');
    expect(runTool({ name: 'add_to_week', args: { ids: [squash.id] } }, { catalog, events, profile: null })).toHaveProperty('error');
  });

  it('a reply that claims an add the tool never made goes back for repair', async () => {
    const seen: string[] = [];
    let n = 0;
    const step: Step = async (p) => {
      seen.push(JSON.stringify(p.contents));
      n++;
      return n === 1
        ? answer({ reply: 'I added Squash Club to your week!', focusIds: [squash.id] })
        : answer({ reply: 'Squash Club fits your Friday evenings. Want me to add it to your plan?', focusIds: [squash.id] });
    };
    const r = await createGuideAgent({ catalog, events, step }).ask(user('squash?'), fri);
    expect(seen[1]).toContain('add_to_week added nothing');
    expect(r.actions).toBeUndefined();
  });

  it('the model cannot smuggle an action in its JSON text', async () => {
    const r = await createGuideAgent({
      catalog,
      events,
      step: scripted([answer({ reply: 'Here you go.', focusIds: [squash.id], actions: [{ type: 'add_to_week', ids: [squash.id] }] })]),
    }).ask(user('hi'), fri);
    expect(r.actions).toBeUndefined();
  });
});

describe('code-review fixes (round 2)', () => {
  it('"free times" is not a sample value; only concrete values count', async () => {
    const { checkReply } = await import('./validator');
    expect(checkReply('Nothing was added to your week yet: set your free times first.', catalog, {})).toHaveLength(0);
  });

  it('a sentence about a club with published times is not flagged for another club sample schedule', async () => {
    const { checkReply } = await import('./validator');
    const muay = catalog.find((c) => c.shortName === 'Muay Thai Club')!;
    expect(checkReply('Muay Thai Club has published meeting times on Monday at 6:30pm.', catalog, { focusIds: [muay.id, 'badminton-club'] })).toHaveLength(0);
  });

  it('answers every function call even when more than 4 come in one turn', async () => {
    const seen: string[] = [];
    let n = 0;
    const step: Step = async (p) => {
      seen.push(JSON.stringify(p.contents));
      n++;
      if (n === 1) return { calls: Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: 'get_club', args: { id: photo.id } })) };
      return answer({ reply: 'Try the Photography Club.', focusIds: [photo.id] });
    };
    await createGuideAgent({ catalog, events, step }).ask(user('photo'), null);
    expect((seen[1].match(/functionResponse/g) ?? []).length).toBe(6);
    expect(seen[1]).toContain('Skipped: at most 4');
  });

  it('a correct "nothing was added" is not treated as a false add claim', async () => {
    const seen: string[] = [];
    const step: Step = async (p) => {
      seen.push(JSON.stringify(p.contents));
      return answer({ reply: 'Nothing has been added to your week until you set your free times.', focusIds: [] });
    };
    const r = await createGuideAgent({ catalog, events, step }).ask(user('plan my week'), null);
    expect(seen).toHaveLength(1);
    expect(r.trace?.at(-1)).toBe('Checked the answer against the catalog');
  });

  it('offline: a short new topic is not polluted by the previous turn', () => {
    const r = answerOffline(
      [
        { role: 'user', text: 'I love photography' },
        { role: 'model', text: 'ok' },
        { role: 'user', text: 'Show me sports clubs' },
      ],
      { catalog, events, profile: null },
    );
    expect(r.focusIds).not.toContain(photo.id);
  });

  it('client keeps every id of a multi-round add_to_week action', () => {
    const ids = catalog.slice(0, 5).map((c) => c.id);
    const r = groundReply({ reply: 'x', focusIds: [], suggestions: [], actions: [{ type: 'add_to_week', ids }] }, new Set(ids), 'gemini');
    expect(r!.actions![0].ids).toHaveLength(5);
  });

  it('offline poster reader: "feel free" is not a fee, "last day of our bazaar" is not a deadline', async () => {
    const { readPosterOffline } = await import('./extract');
    const f = readPosterOffline('Feel free to DM us! It is the last day of our bazaar.\nRegister: forms.gle/abc');
    expect(f.fee).toBeUndefined();
    expect(f.deadline).toBeUndefined();
    expect(readPosterOffline('Membership is FREE for first-years').fee).toBe('Free');
    expect(readPosterOffline('Registration closes on 30 Nov').deadline).toBe('30 Nov');
  });

  it('meeting-time parser: no false days, am/pm on the end only', async () => {
    const { parseMeetingTimes } = await import('../src/data/meetingTimes');
    expect(parseMeetingTimes('Every month at Sunway, 6pm')).toEqual([]);
    expect(parseMeetingTimes('Tuesdays, 6:30-8:30pm')).toEqual([{ day: 'Tue', start: '18:30', end: '20:30' }]);
  });

  it('published text with no parseable time does not make sample slots official', async () => {
    const { provenance } = await import('../src/data/provenance');
    const c = { ...photo, official: { meetingTimes: 'Weekly (day and time not stated)' } };
    expect(provenance(c).schedule).toBe('sample');
  });
});
