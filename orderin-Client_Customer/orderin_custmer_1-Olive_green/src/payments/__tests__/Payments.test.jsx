import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Payments from '../Payments';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../context/CartContext', () => ({
  useCart: () => ({
    cartItems: [],
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    getTotalPrice: vi.fn(() => '0.00'),
    markPaymentSuccessful: vi.fn(),
    saveOrderTempState: vi.fn(),
    clearOrderTempState: vi.fn(),
  }),
}));
vi.mock('../../Loading', () => ({ default: ({ isLoading }) => (isLoading ? <div data-testid="loading" /> : null) }));

const renderPayments = () =>
  render(
    <MemoryRouter>
      <Payments setIsLoading={vi.fn()} />
    </MemoryRouter>,
  );

describe('Payments', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('shows the loading gate while it checks for a confirmed order', () => {
    renderPayments();
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('redirects to the menu when there is no confirmed order in storage', () => {
    renderPayments();
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/menu'), { replace: true });
  });

});
