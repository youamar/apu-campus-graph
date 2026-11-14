import { act, renderHook, waitFor } from '@testing-library/react';
import type { GuideReply } from '../../shared/guide';
import { catalog, events } from '../data/catalog';
import type { Community } from '../data/types';
import { toWire, useGuide } from './useGuide';

const geminiReply: GuideReply = {
  reply: 'Here are 2 photo clubs.',
  focusIds: ['apu-photography-club'],
  openId: null,
  suggestions: ['a', 'b', 'c'],
  source: 'gemini',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useGuide', () => {
  it('appends the user message at once, then the reply when it resolves', async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    vi.stubGlobal('fetch', fetchMock);
    const onReply = vi.fn();
    const { result } = renderHook(() => useGuide({ profile: null, catalog, events, onReply }));

    let done!: Promise<void>;
    act(() => {
      done = result.current.send('I love photography');
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ role: 'user', text: 'I love photography' });
    expect(result.current.pending).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/chat');
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [{ role: 'user', text: 'I love photography' }],
      profile: null,
    });

    await act(async () => {
      resolve(new Response(JSON.stringify(geminiReply), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      await done;
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({ role: 'model', text: geminiReply.reply, reply: geminiReply });
    expect(result.current.last).toEqual(geminiReply);
    expect(onReply).toHaveBeenCalledWith(geminiReply);
  });

  it('falls back to the local matcher with source offline when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const { result } = renderHook(() => useGuide({ profile: null, catalog, events }));
    await act(async () => {
      await result.current.send('Any photography clubs?');
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.last?.source).toBe('offline');
    expect(result.current.last?.focusIds.length).toBeGreaterThan(0);
    expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'model']);
  });

  it('falls back offline on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{"error":"x"}', { status: 500 }))));
    const { result } = renderHook(() => useGuide({ profile: null, catalog, events }));
    await act(async () => {
      await result.current.send('football');
    });
    expect(result.current.last?.source).toBe('offline');
  });

  it('ignores blank input and sends nothing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useGuide({ profile: null, catalog, events }));
    await act(async () => {
      await result.current.send('   ');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(0);
  });
});

describe('useGuide resilience', () => {
  it('recovers when the offline matcher itself throws: safe reply, and the next send still works', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    // A community with no description makes the offline matcher throw: tested through the hook's interface.
    let cat: Community[] = [...catalog, { ...catalog[0], id: 'broken', description: undefined as unknown as string }];
    const { result, rerender } = renderHook(() => useGuide({ profile: null, catalog: cat, events }));
    await act(async () => {
      await result.current.send('photography');
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.last).toMatchObject({ source: 'offline', focusIds: [], openId: null });
    expect(result.current.last?.reply).toMatch(/\S/);
    expect(result.current.last?.suggestions).toHaveLength(3);

    cat = catalog;
    rerender();
    await act(async () => {
      await result.current.send('football');
    });
    expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'model', 'user', 'model']);
    expect(result.current.last?.focusIds.length).toBeGreaterThan(0);
  });

  it('drops focusIds and openId that are not in the catalog before onReply', async () => {
    const reply = { ...geminiReply, focusIds: ['ghost-club', 'apu-photography-club'], openId: 'ghost-club' };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(reply), { status: 200 }))));
    const onReply = vi.fn();
    const { result } = renderHook(() => useGuide({ profile: null, catalog, events, onReply }));
    await act(async () => {
      await result.current.send('photo');
    });
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ focusIds: ['apu-photography-club'], openId: null }));
    expect(result.current.last).toMatchObject({ focusIds: ['apu-photography-club'], openId: null });
  });
});

describe('toWire', () => {
  it('keeps the newest 20 turns starting on a user turn, each clipped to 1000 chars', () => {
    const msgs = Array.from({ length: 26 }, (_, i) => ({
      id: String(i),
      role: (i % 2 ? 'model' : 'user') as 'user' | 'model',
      text: i === 25 ? 'x'.repeat(1500) : `m${i}`,
    }));
    const wire = toWire(msgs);
    expect(wire).toHaveLength(20);
    expect(wire[0].role).toBe('user');
    expect(wire[wire.length - 1].text).toHaveLength(1000);
  });
});
