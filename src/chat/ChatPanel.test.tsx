import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { GuideReply } from '../../shared/guide';
import { catalog } from '../data/catalog';
import type { CampusEvent } from '../data/types';
import ChatPanel, { happeningToday, keyboardOverlap, TRY_ASKING } from './ChatPanel';

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

  describe('as a phone bottom sheet', () => {
    const sheetSetup = () => {
      const props = { onReply: vi.fn(), onEvent: vi.fn(), onOpen: vi.fn(), onEditProfile: vi.fn() };
      const { container } = render(
        <ChatPanel catalog={catalog} events={[]} profile={null} {...props} sheet />,
      );
      return { props, aside: container.querySelector('aside')! };
    };

    it('starts collapsed with three quick prompts and the input; the handle expands and collapses it', () => {
      const { aside } = sheetSetup();
      expect(aside).toHaveClass('sheet', 'collapsed');
      const quick = screen.getByRole('group', { name: 'Quick questions' });
      expect(quick.querySelectorAll('button')).toHaveLength(3);
      expect(screen.getByRole('textbox', { name: /ask apu/i })).toBeInTheDocument();

      const handle = screen.getByRole('button', { name: 'Expand chat' });
      expect(handle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(handle, { detail: 0 }); // keyboard activation
      expect(aside).toHaveClass('expanded');
      expect(screen.queryByRole('group', { name: 'Quick questions' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Collapse chat' }), { detail: 0 });
      expect(aside).toHaveClass('collapsed');
    });

    it('any click on the handle toggles (mouse, tap, screen reader), but the click ending a drag does not', () => {
      const { aside } = sheetSetup();
      fireEvent.click(screen.getByRole('button', { name: 'Expand chat' }), { detail: 1 });
      expect(aside).toHaveClass('expanded');
      fireEvent.click(screen.getByRole('button', { name: 'Collapse chat' }), { detail: 1 });
      expect(aside).toHaveClass('collapsed');

      // Drag up 120px: snaps open once; the trailing click must not toggle it back.
      const handle = screen.getByRole('button', { name: 'Expand chat' });
      fireEvent.pointerDown(handle, { pointerId: 1, clientY: 700, button: 0, pointerType: 'touch' });
      fireEvent.pointerMove(handle, { pointerId: 1, clientY: 640, pointerType: 'touch' });
      fireEvent.pointerUp(handle, { pointerId: 1, clientY: 580, pointerType: 'touch' });
      fireEvent.click(handle, { detail: 1 });
      expect(aside).toHaveClass('expanded');
    });

    it('a quick prompt sends, the peek previews the reply, and opening a match drops the sheet', async () => {
      const { props, aside } = sheetSetup();
      fireEvent.click(within(screen.getByRole('group', { name: 'Quick questions' })).getByRole('button', { name: TRY_ASKING[0] }));
      await waitFor(() => expect(props.onReply).toHaveBeenCalledWith(reply));
      expect(aside.querySelector('.chat-peek')).toHaveTextContent('Two clubs fit.');
      expect(screen.getByRole('group', { name: 'Quick questions' })).toHaveTextContent('Compare both');

      fireEvent.click(screen.getByRole('button', { name: 'Expand chat' }), { detail: 0 });
      const photo = catalog.find((c) => c.id === 'apu-photography-club')!;
      fireEvent.click(screen.getByRole('button', { name: new RegExp(photo.shortName) }));
      expect(props.onOpen).toHaveBeenCalledWith('apu-photography-club');
      expect(aside).toHaveClass('collapsed');
    });
  });
});

describe('keyboardOverlap', () => {
  it('is the layout height the visual viewport loses at the bottom, never negative', () => {
    expect(keyboardOverlap(844, 844, 0)).toBe(0); // no keyboard
    expect(keyboardOverlap(844, 508, 0)).toBe(336); // iOS keyboard overlays the page
    expect(keyboardOverlap(844, 508, 40)).toBe(296); // page scrolled up inside the visual viewport
    expect(keyboardOverlap(508, 508, 0)).toBe(0); // Android resizes the page instead
    expect(keyboardOverlap(844, 900, 0)).toBe(0); // pinch-zoom / rounding never goes negative
    expect(keyboardOverlap(844, 507.6, 0)).toBe(336);
  });
});
