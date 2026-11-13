import { fireEvent, render, screen, within } from '@testing-library/react';
import { catalog } from '../data/catalog';
import type { Profile } from '../profile/profile';
import DetailCard from './DetailCard';

const photo = catalog.find((c) => c.id === 'apu-photography-club')!;
const kazakh = catalog.find((c) => c.id === 'kazakh-community')!;
const noop = () => undefined;

const profile: Profile = {
  year: 1,
  level: 'degree',
  interests: [],
  free: [{ day: 'Fri', start: '18:00', end: '22:00' }],
  going: [],
  week: [],
};

describe('DetailCard', () => {
  it('renders an unenriched community with the empty fine print and open-to-all join check', () => {
    render(<DetailCard community={kazakh} profile={null} onClose={noop} onToggleGoing={noop} onToggleWeek={noop} />);
    expect(screen.getByRole('heading', { name: 'Kazakh Community' })).toBeInTheDocument();
    expect(screen.getByText(/Not published yet\. Ask the guide to check their latest post/)).toBeInTheDocument();
    expect(screen.getByText(/open to all APU students/i)).toBeInTheDocument();
    expect(screen.queryByText(/Gauhar/)).not.toBeInTheDocument();
  });

  it('never renders the president or advisors', () => {
    const { container } = render(
      <DetailCard community={photo} profile={profile} onClose={noop} onToggleGoing={noop} onToggleWeek={noop} />,
    );
    expect(container.textContent).not.toMatch(/Nguyen|Morakinyo/);
  });

  it('shows sample fine print with the Sample data chip and the fit result', () => {
    render(<DetailCard community={photo} profile={profile} onClose={noop} onToggleGoing={noop} onToggleWeek={noop} />);
    expect(screen.getByText('RM 20 / semester')).toBeInTheDocument();
    expect(screen.getAllByText('Sample data').length).toBeGreaterThan(0);
    expect(screen.getByText('Fits your timetable — no clashes')).toBeInTheDocument();
  });

  it('shows the Gemini footer for non-sample extracted fine print', () => {
    const extracted = { ...photo, finePrint: { fee: 'RM 5', source: 'an @apu.pc Instagram post', sample: false } };
    render(<DetailCard community={extracted} profile={null} onClose={noop} onToggleGoing={noop} onToggleWeek={noop} />);
    expect(screen.getByText(/Extracted by Gemini from an @apu\.pc Instagram post/)).toBeInTheDocument();
  });

  it('counts the student in "Go together" and fires the toggles', () => {
    const onGoing = vi.fn();
    const onWeek = vi.fn();
    const { rerender } = render(
      <DetailCard community={photo} profile={profile} onClose={noop} onToggleGoing={onGoing} onToggleWeek={onWeek} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Go together · 38 interested/ }));
    expect(onGoing).toHaveBeenCalledWith('apu-photography-club');
    fireEvent.click(screen.getByRole('button', { name: /Add to my week/ }));
    expect(onWeek).toHaveBeenCalledWith('apu-photography-club');
    rerender(
      <DetailCard
        community={photo}
        profile={{ ...profile, going: ['apu-photography-club'] }}
        onClose={noop}
        onToggleGoing={onGoing}
        onToggleWeek={onWeek}
      />,
    );
    expect(screen.getByRole('button', { name: /39 interested/ })).toBeInTheDocument();
  });

  it('tags every sample section of an enriched community', () => {
    render(<DetailCard community={photo} profile={profile} onClose={noop} onToggleGoing={noop} onToggleWeek={noop} />);
    const timeBox = screen.getByRole('heading', { name: 'Time commitment' }).closest('section')!;
    expect(within(timeBox).getByText('Sample data')).toBeInTheDocument();
    const quote = screen.getByText(/Golden hour at Bukit Jalil/).closest('blockquote')!;
    expect(within(quote).getByText('Sample data')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Highlights (sample data)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /38 interested \(sample data\)/ })).toBeInTheDocument();
  });

  it('shows no Sample data tag for an unenriched community', () => {
    render(<DetailCard community={kazakh} profile={null} onClose={noop} onToggleGoing={noop} onToggleWeek={noop} />);
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument();
  });

  it('opens external join links with noopener noreferrer', () => {
    render(<DetailCard community={photo} profile={null} onClose={noop} onToggleGoing={noop} onToggleWeek={noop} />);
    const a = screen.getByRole('link', { name: /Join via Linktree/ });
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('closes from the × button', () => {
    const onClose = vi.fn();
    render(<DetailCard community={photo} profile={null} onClose={onClose} onToggleGoing={noop} onToggleWeek={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
