import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the APSpace toolbar with Campus Life', () => {
    render(<App />);
    expect(screen.getAllByText('Campus Life').length).toBeGreaterThan(0);
  });

  it('has the APSpace tab bar with Campus Life as the current page', () => {
    render(<App />);
    const bar = screen.getByRole('navigation', { name: 'APSpace' });
    const current = bar.querySelector('[aria-current="page"]');
    expect(current).toHaveTextContent('Campus Life');
    expect(bar.querySelectorAll('button')).toHaveLength(5);
  });

  it('the theme toggle sets data-theme and persists it', () => {
    localStorage.removeItem('apu-campus-graph/theme');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem('apu-campus-graph/theme')).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expect(document.documentElement).not.toHaveAttribute('data-theme');
    expect(localStorage.getItem('apu-campus-graph/theme')).toBe('dark');
  });
});
