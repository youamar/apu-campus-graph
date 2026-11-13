// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import rawClubs from '../data/clubs.json';
import { catalog, events } from '../src/data/catalog';
import type { Profile } from '../src/profile/profile';
import { buildSystemPrompt, createChatHandler, parseGuideResponse, type ChatPrompt } from './chat';

const validIds = new Set(catalog.map((c) => c.id));

function appWith(generate: ((p: ChatPrompt, signal: AbortSignal) => Promise<string>) | null, timeoutMs?: number) {
  const app = express();
  app.use(express.json({ limit: '6mb' }));
  app.post('/api/chat', createChatHandler({ generate, timeoutMs }));
  return app;
}

const ask = (text: string, profile: Profile | null = null) => ({ messages: [{ role: 'user', text }], profile });

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt(catalog, events);

  it('lists catalog ids', () => {
    expect(prompt).toContain('apu-photography-club');
  });

  it('never leaks a president name', () => {
    const presidents = (rawClubs as { president?: string | null }[])
      .map((c) => c.president?.trim())
      .filter((p): p is string => !!p && p.length > 2);
    expect(presidents.length).toBeGreaterThan(0);
    for (const p of presidents) expect(prompt).not.toContain(p);
  });

  it('describes what each club does and how to join', () => {
    const photo = catalog.find((c) => c.id === 'apu-photography-club')!;
    expect(photo.description.length).toBeGreaterThan(10);
    expect(prompt).toContain(photo.description.slice(0, 60));
    const line = prompt.split('\n').find((l) => l.startsWith('apu-photography-club |'))!;
    expect(line).toMatch(/join: /);
    expect(line).toMatch(/beginner-friendly/);
    expect(line).toMatch(/recruiting/);
  });

  it('caps long descriptions', () => {
    const long = { ...catalog[0], id: 'long-one', description: 'word '.repeat(200), finePrint: undefined, joinUrl: 'https://x.test/join' };
    const line = buildSystemPrompt([long], []).split('\n').find((l) => l.startsWith('long-one |'))!;
    expect(line.length).toBeLessThan(600);
    expect(line).toContain('join: via https://x.test/join');
  });

  it('carries the grounding rules', () => {
    expect(prompt).toMatch(/only from the CATALOG/i);
    expect(prompt).toMatch(/Never invent communities, fees or dates/i);
    expect(prompt).toMatch(/under 90 words/i);
  });
});

describe('parseGuideResponse', () => {
  it('strips unknown ids, caps focus at 6 and pads suggestions to 3', () => {
    const ids = catalog.slice(0, 8).map((c) => c.id);
    const r = parseGuideResponse(
      JSON.stringify({ reply: '  hi  ', focusIds: ['nope', ...ids], openId: 'ghost', suggestions: ['one'] }),
      validIds,
    );
    expect(r).not.toBeNull();
    expect(r!.reply).toBe('hi');
    expect(r!.focusIds).toEqual(ids.slice(0, 6));
    expect(r!.openId).toBeNull();
    expect(r!.suggestions).toHaveLength(3);
    expect(r!.suggestions[0]).toBe('one');
    expect(r!.source).toBe('gemini');
  });

  it('keeps a reply even when no ids survive', () => {
    const r = parseGuideResponse(JSON.stringify({ reply: 'Sorry, I only know APU clubs.', focusIds: ['x'], openId: null, suggestions: [] }), validIds);
    expect(r).toMatchObject({ reply: 'Sorry, I only know APU clubs.', focusIds: [], openId: null, source: 'gemini' });
    expect(r!.suggestions).toHaveLength(3);
  });

  it('returns null for non-JSON or a missing reply', () => {
    expect(parseGuideResponse('hello there', validIds)).toBeNull();
    expect(parseGuideResponse(JSON.stringify({ focusIds: [] }), validIds)).toBeNull();
    expect(parseGuideResponse(JSON.stringify({ reply: '   ' }), validIds)).toBeNull();
  });
});

describe('POST /api/chat', () => {
  it('drops an unknown id and reports gemini as the source', async () => {
    const generate = vi.fn(async () =>
      JSON.stringify({
        reply: 'Try the Photography Club on Friday nights.',
        focusIds: ['apu-photography-club', 'made-up-club'],
        openId: null,
        suggestions: ['a', 'b', 'c'],
      }),
    );
    const res = await request(appWith(generate)).post('/api/chat').send(ask('I like photography'));
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('gemini');
    expect(res.body.focusIds).toEqual(['apu-photography-club']);
    expect(res.body.reply).toContain('Photography');
  });

  it('falls back offline on non-JSON text', async () => {
    const res = await request(appWith(async () => 'not json at all')).post('/api/chat').send(ask('I like photography'));
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('offline');
    expect(res.body.focusIds).toContain('apu-photography-club');
  });

  it('falls back offline with status 200 when generate throws', async () => {
    const res = await request(
      appWith(async () => {
        throw Object.assign(new Error('429 quota'), { status: 429 });
      }),
    )
      .post('/api/chat')
      .send(ask('I like photography'));
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('offline');
  });

  it('falls back offline when there is no key', async () => {
    const res = await request(appWith(null)).post('/api/chat').send(ask('I like photography'));
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('offline');
    expect(res.body.focusIds).toContain('apu-photography-club');
  });

  it('falls back offline on timeout and aborts the call', async () => {
    let aborted = false;
    const generate = (_p: ChatPrompt, signal: AbortSignal) =>
      new Promise<string>(() => {
        signal.addEventListener('abort', () => (aborted = true));
      });
    const res = await request(appWith(generate, 50)).post('/api/chat').send(ask('I like photography'));
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('offline');
    expect(aborted).toBe(true);
  });

  it('sends at most the last 8 messages, starting on a user turn, with the profile in the final user turn', async () => {
    let seen: ChatPrompt | undefined;
    const generate = async (p: ChatPrompt) => {
      seen = p;
      return JSON.stringify({ reply: 'ok', focusIds: [], openId: null, suggestions: [] });
    };
    const messages = Array.from({ length: 11 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: `m${i}` }));
    const profile: Profile = {
      year: 2,
      level: 'degree',
      interests: ['photo'],
      free: [{ day: 'Fri', start: '19:00', end: '23:00' }],
      going: [],
      week: [],
    };
    await request(appWith(generate)).post('/api/chat').send({ messages, profile });
    // last 8 are m3..m10; m3 is a model turn, so the window starts at m4
    expect(seen!.contents).toHaveLength(7);
    expect(seen!.contents[0]).toEqual({ role: 'user', parts: [{ text: 'm4' }] });
    expect(seen!.contents[1].role).toBe('model');
    const last = seen!.contents[6];
    expect(last.role).toBe('user');
    expect(last.parts[0].text).toContain('m10');
    expect(last.parts[0].text).toContain('Year 2');
    expect(last.parts[0].text).toContain('Fri 19:00-23:00');
    expect(seen!.systemInstruction).not.toContain('Year 2');
  });

  it('rejects a bad body with 400', async () => {
    const app = appWith(null);
    expect((await request(app).post('/api/chat').send({})).status).toBe(400);
    expect((await request(app).post('/api/chat').send({ messages: [] })).status).toBe(400);
    const tooMany = Array.from({ length: 21 }, () => ({ role: 'user', text: 'hi' }));
    expect((await request(app).post('/api/chat').send({ messages: tooMany })).status).toBe(400);
    const tooLong = await request(app).post('/api/chat').send(ask('x'.repeat(1001)));
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toBeTruthy();
    expect((await request(app).post('/api/chat').send({ messages: [{ role: 'admin', text: 'hi' }] })).status).toBe(400);
  });
});
