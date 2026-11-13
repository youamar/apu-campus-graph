import { fireEvent, render, screen } from '@testing-library/react';
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

  it('closes from the × button', () => {
    const onClose = vi.fn();
    render(<DetailCard community={photo} profile={null} onClose={onClose} onToggleGoing={noop} onToggleWeek={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
