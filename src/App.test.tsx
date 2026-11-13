import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the APSpace toolbar with Campus Life', () => {
    render(<App />);
    expect(screen.getAllByText('Campus Life').length).toBeGreaterThan(0);
  });
});
