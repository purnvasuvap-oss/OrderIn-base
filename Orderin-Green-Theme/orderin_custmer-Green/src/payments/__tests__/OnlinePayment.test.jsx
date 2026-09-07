import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OnlinePayment from '../OnlinePayment';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate, useLocation: () => ({ state: null, search: '' }) };
});
vi.mock('../../context/CartContext', () => ({
  useCart: () => ({ orderHistory: [], markPaymentSuccessful: vi.fn() }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <OnlinePayment setIsLoading={vi.fn()} />
    </MemoryRouter>,
  );

describe('OnlinePayment', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders the error state when no order id is in storage', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Error' })).toBeInTheDocument();
    expect(screen.getByText(/No order ID found/)).toBeInTheDocument();
  });

  it('does not show the error state when an order id is present in storage', () => {
    sessionStorage.setItem('pendingOrderId', '77');
    renderPage();
    expect(screen.queryByRole('heading', { name: 'Error' })).not.toBeInTheDocument();
  });
});
