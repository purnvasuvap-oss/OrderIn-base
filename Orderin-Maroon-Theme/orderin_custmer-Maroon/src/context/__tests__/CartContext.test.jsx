import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider, useCart } from '../CartContext';

const item = { name: 'Dosa', price: '₹120' };

function Harness() {
  const { cartItems, addToCart, updateQuantity, removeFromCart, getTotalPrice, clearCart } = useCart();
  return (
    <div>
      <span data-testid="count">{cartItems.reduce((s, i) => s + i.quantity, 0)}</span>
      <span data-testid="total">{getTotalPrice()}</span>
      <ul>
        {cartItems.map((i) => (
          <li key={i.name}>
            {i.name} x{i.quantity}
          </li>
        ))}
      </ul>
      <button onClick={() => addToCart(item, 1, '')}>add</button>
      <button onClick={() => updateQuantity('Dosa', 3)}>set-3</button>
      <button onClick={() => removeFromCart('Dosa')}>remove</button>
      <button onClick={clearCart}>clear</button>
    </div>
  );
}

const renderHarness = () =>
  render(
    <MemoryRouter>
      <CartProvider>
        <Harness />
      </CartProvider>
    </MemoryRouter>,
  );

describe('CartContext', () => {
  beforeEach(() => localStorage.clear());

  it('starts with an empty cart', () => {
    renderHarness();
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByTestId('total')).toHaveTextContent('0.00');
  });

  it('adds an item and accumulates its quantity', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('button', { name: 'add' }));
    await user.click(screen.getByRole('button', { name: 'add' }));

    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.getByText('Dosa x2')).toBeInTheDocument();
    expect(screen.getByTestId('total')).toHaveTextContent('240.00');
  });

  it('updates the quantity of an item', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'add' }));

    await user.click(screen.getByRole('button', { name: 'set-3' }));

    expect(screen.getByTestId('count')).toHaveTextContent('3');
  });

  it('removes an item from the cart', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'add' }));

    await user.click(screen.getByRole('button', { name: 'remove' }));

    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('persists the cart to localStorage', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('button', { name: 'add' }));

    expect(JSON.parse(localStorage.getItem('cart_items'))).toHaveLength(1);
  });

  it('restores the cart from localStorage on mount', () => {
    localStorage.setItem('cart_items', JSON.stringify([{ name: 'Idli', price: '₹50', quantity: 2 }]));
    renderHarness();
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.getByText('Idli x2')).toBeInTheDocument();
  });
});
