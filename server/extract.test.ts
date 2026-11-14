// @vitest-environment node
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { catalog, events } from '../src/data/catalog';
import { applyExtracted, sanitizeExtracted } from '../src/data/extracted';
import { provenance } from '../src/data/provenance';
import { createExtractHandler, readPosterOffline, type ReadPoster } from './extract';
import { runTool } from './tools';

const photo = catalog.find((c) => c.id === 'apu-photography-club')!;
const caption = `📸 APU Photography Club recruitment is OPEN!
Fee: RM 25 per semester
Register: https://forms.gle/abc123
Only 40 slots!
Deadline: 30 Nov 2026`;

function app(read: ReadPoster | null) {
  const a = express();
  a.use(express.json({ limit: '6mb' }));
  a.post('/api/extract', createExtractHandler({ read, catalog, log: () => {} }));
  return a;
}

describe('poster reader', () => {
  it('offline reader copies fee, register link, slots and deadline from a caption', () => {
    expect(readPosterOffline(caption)).toMatchObject({
      fee: 'RM 25 per semester',
      register: 'https://forms.gle/abc123',
      slots: '40 slots',
      deadline: '30 Nov 2026',
    });
  });

  it('Gemini adapter result is validated and tied to the card club', async () => {
    const read: ReadPoster = async () => JSON.stringify({ clubName: 'Photography Club', fee: 'RM 25', deadline: '30 Nov', slots: null, register: 'null', booking: '' });
    const res = await request(app(read)).post('/api/extract').send({ text: caption, communityId: photo.id });
    expect(res.status).toBe(200);
    expect(res.body.extraction).toMatchObject({ communityId: photo.id, by: 'gemini', found: ['fee', 'deadline'] });
    expect(res.body.extraction.finePrint).toMatchObject({ fee: 'RM 25', deadline: '30 Nov', source: 'a pasted caption', sample: false });
  });

  it('names the club from the post when the request has no club', async () => {
    const read: ReadPoster = async () => JSON.stringify({ clubName: 'APU Photography Club', fee: 'RM 25' });
    const res = await request(app(read)).post('/api/extract').send({ text: caption });
    expect(res.body.extraction.communityId).toBe(photo.id);
  });

  it('falls back to the offline reader when Gemini fails; images need Gemini', async () => {
    const read: ReadPoster = async () => {
      throw Object.assign(new Error('503'), { status: 503 });
    };
    const text = await request(app(read)).post('/api/extract').send({ text: caption, communityId: photo.id });
    expect(text.body.extraction).toMatchObject({ by: 'offline' });
    const image = await request(app(null)).post('/api/extract').send({ image: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } });
    expect(image.body.extraction).toBeNull();
    expect(image.body.reason).toMatch(/needs Gemini/);
  });

  it('rejects bad input precisely', async () => {
    const a = app(null);
    expect((await request(a).post('/api/extract').send({})).status).toBe(400);
    expect((await request(a).post('/api/extract').send({ image: { mimeType: 'image/gif', data: 'AAAA' } })).body.error).toMatch(/PNG/);
    expect((await request(a).post('/api/extract').send({ text: 'x'.repeat(4001) })).status).toBe(400);
  });

  it('a caption with no fine print reports why instead of inventing', async () => {
    const res = await request(app(null)).post('/api/extract').send({ text: 'Great photo walk yesterday, thanks everyone!' });
    expect(res.body.extraction).toBeNull();
    expect(res.body.reason).toBeTruthy();
  });
});

describe('extracted fine print reaches the guide', () => {
  it('is real (official) for Provenance and get_club serves it as officialFinePrint', () => {
    const ext = sanitizeExtracted({ [photo.id]: { fee: 'RM 25', source: 'a pasted caption', extractedAt: '2026-11-14', by: 'gemini', evil: '<script>' } }, new Set([photo.id]));
    expect(ext[photo.id]).not.toHaveProperty('evil');
    const cat = applyExtracted(catalog, ext);
    const c = cat.find((x) => x.id === photo.id)!;
    expect(provenance(c).finePrint).toBe('official');
    const club = runTool({ name: 'get_club', args: { id: photo.id } }, { catalog: cat, events, profile: null }) as Record<string, unknown>;
    expect(club.officialFinePrint).toMatchObject({ fee: 'RM 25' });
    expect(JSON.stringify(club.sampleExamples ?? {})).not.toContain('RM 20');
  });

  it('drops entries without a source or for unknown clubs', () => {
    expect(sanitizeExtracted({ [photo.id]: { fee: 'RM 1' }, ghost: { fee: 'RM 1', source: 'x' } }, new Set([photo.id]))).toEqual({});
  });
});

describe('validator vs real fine print', () => {
  it('a fee read from the club post may be stated plainly; another club sample value does not count', async () => {
    const { checkReply } = await import('./validator');
    const ext = sanitizeExtracted({ [photo.id]: { fee: 'RM 25 per semester', deadline: '30 Nov 2026', source: 'a pasted caption' } }, new Set([photo.id]));
    const cat = applyExtracted(catalog, ext);
    expect(checkReply("According to their post, the fee is RM 25 per semester and the deadline is 30 Nov 2026.", cat, { focusIds: [photo.id] })).toHaveLength(0);
    expect(checkReply('The fee is RM 99.', cat, { focusIds: [photo.id] })).toHaveLength(1);
  });
});
