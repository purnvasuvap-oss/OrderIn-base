import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider } from '../context/CartContext';

/** Render inside a MemoryRouter. */
export const renderWithRouter = (ui, { route = '/', ...options } = {}) =>
  render(ui, {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>,
    ...options,
  });

/** Render inside a MemoryRouter + real CartProvider (localStorage-backed). */
export const renderWithCart = (ui, { route = '/', ...options } = {}) =>
  render(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[route]}>
        <CartProvider>{children}</CartProvider>
      </MemoryRouter>
    ),
    ...options,
  });

export * from '@testing-library/react';
