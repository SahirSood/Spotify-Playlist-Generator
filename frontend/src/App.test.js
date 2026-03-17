import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the current flowstate landing page', () => {
  render(<App />);
  expect(screen.getByText(/flowstate/i)).toBeInTheDocument();
  expect(screen.getByText(/your taste,/i)).toBeInTheDocument();
  expect(screen.getByText(/finally mapped\./i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /connect with spotify/i })).toBeInTheDocument();
  expect(screen.getByText(/listening intelligence/i)).toBeInTheDocument();
});
