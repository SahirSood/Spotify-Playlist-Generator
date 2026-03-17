import { render, screen } from '@testing-library/react';
import App from './App';

test('renders spotify landing page', () => {
  render(<App />);
  const heading = screen.getByText(/spotify playlist generator/i);
  expect(heading).toBeInTheDocument();
});
