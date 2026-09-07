import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Cart from '../Cart';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const cartState = {
  cartItems: [],
  updateQuantity: vi.fn(),
  updateInstructions: vi.fn(),
  removeFromCart: vi.fn(),
  getTotalPrice: vi.fn(() => '0.00'),
  clearCart: vi.fn(),
  placeOrder: vi.fn(),
  orderHistory: [],
  currentTableNo: '4',
};
const mockUseCart = vi.fn(() => cartState);
vi.mock('../../context/CartContext', () => ({ useCart: () => mockUseCart() }));
vi.mock('../../Footer/Footer', () => ({ default: () => <div data-testid="footer" /> }));

const renderCart = () =>
  render(
    <MemoryRouter>
      <Cart />
    </MemoryRouter>,
  );

describe('Cart', () => {
  beforeEach(() => mockUseCart.mockReturnValue({ ...cartState, cartItems: [], orderHistory: [] }));

  it('shows the empty-cart state when there are no items', () => {
    renderCart();
    expect(screen.getByRole('heading', { name: 'Your cart is empty' })).toBeInTheDocument();
  });

  it('matches the snapshot when empty', () => {
    const { asFragment } = renderCart();
    expect(asFragment()).toMatchSnapshot();
  });

  it('lists the cart items with quantity controls', () => {
    mockUseCart.mockReturnValue({
      ...cartState,
      cartItems: [{ name: 'Dosa', price: '₹120', quantity: 2, instructions: '' }],
    });
    renderCart();

    expect(screen.getByRole('heading', { name: 'Dosa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Increase Dosa quantity' })).toBeInTheDocument();
  });

  it('calls updateQuantity when the plus control is clicked', async () => {
    const user = userEvent.setup();
    const updateQuantity = vi.fn();
    mockUseCart.mockReturnValue({
      ...cartState,
      updateQuantity,
      cartItems: [{ name: 'Dosa', price: '₹120', quantity: 2, instructions: '' }],
    });
    renderCart();

    await user.click(screen.getByRole('button', { name: 'Increase Dosa quantity' }));

    expect(updateQuantity).toHaveBeenCalledWith('Dosa', 3);
  });

  it('calls removeFromCart from the remove control', async () => {
    const user = userEvent.setup();
    const removeFromCart = vi.fn();
    mockUseCart.mockReturnValue({
      ...cartState,
      removeFromCart,
      cartItems: [{ name: 'Dosa', price: '₹120', quantity: 1, instructions: '' }],
    });
    renderCart();

    await user.click(screen.getByRole('button', { name: 'Remove Dosa' }));

    expect(removeFromCart).toHaveBeenCalledWith('Dosa');
  });

  it('switches to the Order Track tab and shows its empty state', async () => {
    const user = userEvent.setup();
    renderCart();

    await user.click(screen.getByText('Order Track'));

    expect(screen.getByText('No orders to track')).toBeInTheDocument();
  });
});
