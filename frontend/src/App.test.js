import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the simplified landing page', () => {
  render(<App />);
  expect(screen.getByText(/flowstate/i)).toBeInTheDocument();
  expect(screen.getByText(/turn a vibe into a spotify playlist\./i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /continue with spotify/i })).toBeInTheDocument();
  expect(screen.getByText(/describe what you want to hear/i)).toBeInTheDocument();
});
