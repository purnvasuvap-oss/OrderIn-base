import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BillModal from '../BillModal';

const order = {
  id: 'ORD-9',
  itemDetails: [
    { name: 'Paneer Tikka', quantity: 2, price: 150 },
    { name: 'Naan', quantity: 3, price: 30 },
  ],
  subtotal: 390,
  tax: 19.5,
  totalCost: 409.5,
  paymentType: 'UPI',
  verificationCode: 'TX-777',
  timestamp: new Date('2026-02-01T12:00:00Z'),
};

describe('BillModal', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(<BillModal order={order} open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('matches the snapshot when open', () => {
    const { asFragment } = render(<BillModal order={order} open onClose={vi.fn()} />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('lists the order items with quantities', () => {
    render(<BillModal order={order} open onClose={vi.fn()} />);
    expect(screen.getByText('2x Paneer Tikka')).toBeInTheDocument();
    expect(screen.getByText('3x Naan')).toBeInTheDocument();
  });

  it('shows the totals and payment method', () => {
    render(<BillModal order={order} open onClose={vi.fn()} />);
    expect(screen.getByText('₹390.00')).toBeInTheDocument();
    expect(screen.getByText('₹409.50')).toBeInTheDocument();
    expect(screen.getByText('UPI')).toBeInTheDocument();
    expect(screen.getByText('Transaction ID: TX-777')).toBeInTheDocument();
  });

  it('falls back gracefully when no order is provided', () => {
    render(<BillModal open onClose={vi.fn()} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument(); // paid-by fallback
  });

  it('calls onClose from the Close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<BillModal order={order} open onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
