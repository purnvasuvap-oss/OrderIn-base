import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Render a component inside a MemoryRouter so react-router hooks/components
 * (useNavigate, Navigate, Link) resolve without a real browser history.
 */
export const renderWithRouter = (ui, { route = '/', ...options } = {}) =>
  render(ui, {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>,
    ...options,
  });

export * from '@testing-library/react';
