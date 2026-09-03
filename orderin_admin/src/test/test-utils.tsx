import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

interface RouterOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
}

/**
 * Render a component inside a MemoryRouter so react-router hooks
 * (useLocation, Link, etc.) resolve without a real browser history.
 */
export const renderWithRouter = (ui: ReactElement, { route = '/', ...options }: RouterOptions = {}) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  );
  return render(ui, { wrapper: Wrapper, ...options });
};

export * from '@testing-library/react';
