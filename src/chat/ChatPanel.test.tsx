import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GuideReply } from '../../shared/guide';
import { catalog } from '../data/catalog';
import type { CampusEvent } from '../data/types';
import ChatPanel, { happeningToday } from './ChatPanel';

const at = (h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
const ev = (id: string, start: Date, communityId = 'apu-photography-club'): CampusEvent => ({
  id, communityId, title: id, place: 'Atrium', start: start.toISOString(), going: 5, sample: true,
});

describe('happeningToday', () => {
  it('keeps today’s events not yet ended, soonest first, max 3', () => {
    const now = at(18);
    const tomorrow = new Date(at(19).getTime() + 24 * 3600_000);
    const list = [ev('late', at(21)), ev('ended', at(15, 30)), ev('running', at(17)), ev('soon', at(19)), ev('night', at(22)), ev('tmrw', tomorrow)];
    expect(happeningToday(list, now).map((e) => e.id)).toEqual(['running', 'soon', 'late']);
  });
});

describe('ChatPanel', () => {
  const reply: GuideReply = {
    reply: 'Two clubs fit.',
    focusIds: ['apu-photography-club', 'badminton-club'],
    openId: null,
    suggestions: ['Go together', 'Compare both', 'Add to my week'],
    source: 'gemini',
  };
  const setup = () => {
    const props = { onReply: vi.fn(), onEvent: vi.fn(), onOpen: vi.fn(), onEditProfile: vi.fn() };
    render(<ChatPanel catalog={catalog} events={[ev('photo-walk', new Date())]} profile={null} {...props} />);
    return props;
  };

  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(reply), { status: 200 }))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the greeting, today’s events and the footer; an event click focuses its community', () => {
    const p = setup();
    expect(screen.getByText(/I'm your campus guide/)).toBeInTheDocument();
    expect(screen.getByText(`Answers use APU Student Affairs data`, { exact: false })).toHaveTextContent(`${catalog.length} communities`);
    fireEvent.click(screen.getByRole('button', { name: /photo-walk/ }));
    expect(p.onEvent).toHaveBeenCalledWith(expect.objectContaining({ communityId: 'apu-photography-club' }));
  });

  it('a try-asking chip sends; the reply lists numbered matches, suggestions and the profile prompt', async () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Clubs with no membership fee' }));
    expect(screen.getByRole('log')).toHaveTextContent('Clubs with no membership fee');
    await waitFor(() => expect(p.onReply).toHaveBeenCalledWith(reply));
    const photo = catalog.find((c) => c.id === 'apu-photography-club')!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(photo.shortName) }));
    expect(p.onOpen).toHaveBeenCalledWith('apu-photography-club');
    expect(screen.getByRole('button', { name: 'Compare both' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set up profile' }));
    expect(p.onEditProfile).toHaveBeenCalled();
  });

  it('Enter sends, Shift+Enter does not', async () => {
    setup();
    const box = screen.getByRole('textbox', { name: /ask apu/i });
    fireEvent.change(box, { target: { value: 'football' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(fetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Two clubs fit.')).toBeInTheDocument());
  });
});
