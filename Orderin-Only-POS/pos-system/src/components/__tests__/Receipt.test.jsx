import { render, screen } from '@testing-library/react';
import Receipt from '../Receipt';

vi.mock('../../lib/repo', () => ({
  getSettings: (key) =>
    Promise.resolve(
      key === 'restaurant'
        ? { name: 'Spice Villa', address: '1 MG Road', phone: '99999', gstin: 'GST123' }
        : { taxPercent: 5 },
    ),
}));

const order = {
  invoiceNo: 'INV-1001',
  orderNo: 'ORD-1001',
  createdAt: Date.now(),
  orderType: 'dine-in',
  tableNo: 4,
  cashierName: 'Asha',
  items: [
    { name: 'Dosa', qty: 2, price: 60 },
    { name: 'Coffee', qty: 1, price: 40, notes: 'less sugar' },
  ],
  subtotal: 160, discount: 0, tax: 8, total: 168, payments: [{ method: 'cash' }],
};

describe('Receipt', () => {
  it('renders nothing without an order', () => {
    const { container } = render(<Receipt order={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the invoice, order number, cashier and line items', async () => {
    render(<Receipt order={order} />);

    expect(screen.getByText('INV-1001')).toBeInTheDocument();
    expect(screen.getByText('ORD-1001')).toBeInTheDocument();
    expect(screen.getByText('Asha')).toBeInTheDocument();
    expect(screen.getByText('Dosa × 2')).toBeInTheDocument();
    expect(screen.getByText('Note: less sugar')).toBeInTheDocument();
    // restaurant name loads from settings
    expect(await screen.findByText('Spice Villa')).toBeInTheDocument();
  });

  it('matches the snapshot', () => {
    const fixedOrder = { ...order, createdAt: new Date('2026-02-01T10:00:00Z').getTime() };
    const { asFragment } = render(<Receipt order={fixedOrder} />);
    expect(asFragment()).toMatchSnapshot();
  });
});
