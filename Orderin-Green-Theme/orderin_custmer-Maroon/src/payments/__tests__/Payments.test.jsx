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
  placeOrder: vi.fn(() => ({ id: 1 })),
  markPaymentSuccessful: vi.fn(),
  saveOrderTempState: vi.fn(),
  clearOrderTempState: vi.fn(),
};
const mockUseCart = vi.fn(() => base);
vi.mock('../../context/CartContext', () => ({ useCart: () => mockUseCart() }));
vi.mock('../../Loading', () => ({ default: () => null }));

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
    mockUseCart.mockReturnValue({ ...base });
  });

  it('matches the snapshot', () => {
    const { asFragment } = renderPayments();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the checkout header, the cart item and the payment methods', () => {
    renderPayments();
    expect(screen.getByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dosa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Online/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cash/ })).toBeInTheDocument();
  });

  it('marks a payment method as selected when clicked', async () => {
    const user = userEvent.setup();
    renderPayments();
    const cash = screen.getByRole('button', { name: /Cash/ });

    await user.click(cash);

    expect(cash).toHaveClass('selected');
  });

  it('shows the Place Order button', () => {
    renderPayments();
    expect(screen.getByRole('button', { name: /Place Order/i })).toBeInTheDocument();
  });

  it('navigates back when the close button is clicked', async () => {
    const user = userEvent.setup();
    const { container } = renderPayments();

    await user.click(container.querySelector('.close-button'));

    expect(mockNavigate).toHaveBeenCalled();
  });
});
