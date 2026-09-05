import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Payments from '../Payments';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const base = {
  cartItems: [{ name: 'Dosa', price: '₹120', quantity: 2, instructions: '' }],
  updateQuantity: vi.fn(),
  removeFromCart: vi.fn(),
  getTotalPrice: vi.fn(() => '240.00'),
  markPaymentSuccessful: vi.fn(),
  saveOrderTempState: vi.fn(),
  clearOrderTempState: vi.fn(),
};
const mockUseCart = vi.fn(() => base);
vi.mock('../../context/CartContext', () => ({ useCart: () => mockUseCart() }));
vi.mock('../../Loading', () => ({ default: ({ isLoading }) => (isLoading ? <div data-testid="loading" /> : null) }));

const CONFIRMED = {
  id: 1,
  items: [{ name: 'Dosa', price: '₹120', quantity: 2 }],
  subtotal: '240.00',
  taxes: '12.00',
  total: '252.00',
};

const renderPayments = () =>
  render(
    <MemoryRouter>
      <Payments setIsLoading={vi.fn()} />
    </MemoryRouter>,
  );

const seedConfirmedOrder = () => {
  sessionStorage.setItem('confirmedOrderId', '1');
  sessionStorage.setItem('confirmedOrderData', JSON.stringify(CONFIRMED));
};

describe('Payments', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    mockUseCart.mockReturnValue({ ...base });
  });

  it('shows the loading gate and redirects to the menu when there is no confirmed order', () => {
    renderPayments();
    expect(screen.getByTestId('loading')).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/menu'), { replace: true });
  });

  it('renders the checkout screen once a confirmed order is present (no Rules-of-Hooks crash)', () => {
    seedConfirmedOrder();
    renderPayments();
    expect(screen.getByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
  });

  it('matches the snapshot for the confirmed-order checkout screen', () => {
    seedConfirmedOrder();
    const { asFragment } = renderPayments();
    expect(asFragment()).toMatchSnapshot();
  });

  it('navigates back from the close button', async () => {
    const user = userEvent.setup();
    seedConfirmedOrder();
    const { container } = renderPayments();

    await user.click(container.querySelector('.close-button'));

    expect(mockNavigate).toHaveBeenCalled();
  });
});
