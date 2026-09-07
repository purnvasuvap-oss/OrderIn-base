import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrderItemListModal from '../OrderItemListModal/OrderItemListModal';

const order = {
  id: 'ORD-5',
  username: 'Meera',
  tableNumber: '3',
  subtotal: 300,
  tax: 15,
  totalCost: 315,
  items: [
    { name: 'Dosa', quantity: 1, price: 100 },
    { name: 'Dosa', quantity: 1, price: 100 },
    { name: 'Coffee', quantity: 2, price: 50, instructions: 'less sugar' },
  ],
};

describe('OrderItemListModal', () => {
  it('renders nothing without an order', () => {
    const { container } = render(<OrderItemListModal order={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('matches the snapshot', () => {
    const { asFragment } = render(<OrderItemListModal order={order} onClose={vi.fn()} />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('aggregates duplicate lines and keeps instruction lines separate', () => {
    render(<OrderItemListModal order={order} onClose={vi.fn()} />);

    expect(screen.getByText('Dosa')).toBeInTheDocument();
    expect(screen.getAllByText('×2').length).toBeGreaterThan(0); // 2 Dosa merged into one line
    expect(screen.getByText('less sugar')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === 'Unique Dishes: 2')).toBeInTheDocument();
  });

  it('shows the subtotal / tax / total footer', () => {
    render(<OrderItemListModal order={order} onClose={vi.fn()} />);
    expect(screen.getByText('Subtotal: ₹300.00')).toBeInTheDocument();
    expect(screen.getByText('Tax: ₹15.00')).toBeInTheDocument();
    expect(screen.getByText('Total: ₹315.00')).toBeInTheDocument();
  });

  it('calls onClose from the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OrderItemListModal order={order} onClose={onClose} />);

    await user.click(screen.getByRole('button'));

    expect(onClose).toHaveBeenCalled();
  });
});
