import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Orders from '../Orders';
import { subscribeRecentOrders } from '../../services/orderService';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../services/orderService', () => {
  const norm = (s) => {
    const v = String(s || '').toLowerCase();
    if (v.includes('prepar')) return 'Preparing';
    if (v.includes('ready')) return 'Ready';
    if (v.includes('deliver') || v.includes('served')) return 'Delivered';
    return 'Pending';
  };
  return {
    updateOrderStatus: vi.fn().mockResolvedValue(undefined),
    acceptOrder: vi.fn().mockResolvedValue(undefined),
    rejectOrder: vi.fn().mockResolvedValue(undefined),
    formatTime: vi.fn(() => '12:00 PM'),
    subscribeRecentOrders: vi.fn(() => () => {}),
    isOrderAccepted: (o) => norm(o?.status) !== 'Pending',
    isOrderQueued: (o) => norm(o?.status) === 'Pending',
    isOrderActive: (o) => ['Preparing', 'Ready'].includes(norm(o?.status)),
    isOrderDelivered: (o) => norm(o?.status) === 'Delivered',
    isOrderPaymentCollected: (o) => String(o?.paymentStatus).toLowerCase() === 'paid',
    isOrderWithinLast24Hours: () => true,
  };
});
vi.mock('../../components/AllOrdersOverlay/AllOrdersOverlay', () => ({
  default: ({ onClose }) => <div data-testid="all-orders-overlay"><button onClick={onClose}>x</button></div>,
}));
vi.mock('../../components/OrderItemListModal/OrderItemListModal', () => ({ default: () => null }));

const ORDERS = [
  { id: 'ORD-1', username: 'Asha', tableNumber: '4', phoneNumber: '999', status: 'preparing', paymentStatus: 'paid', items: [{ name: 'Dosa', quantity: 2 }], timestamp: Date.now() },
  { id: 'ORD-2', username: 'Ravi', tableNumber: '7', phoneNumber: '888', status: 'delivered', paymentStatus: 'paid', items: [{ name: 'Idli', quantity: 1 }], timestamp: Date.now() },
];

const renderOrders = () =>
  render(
    <MemoryRouter>
      <Orders />
    </MemoryRouter>,
  );

const emit = (orders) =>
  subscribeRecentOrders.mockImplementation((cb) => {
    if (typeof cb === 'function') cb(orders);
    return () => {};
  });

describe('Orders', () => {
  beforeEach(() => subscribeRecentOrders.mockImplementation(() => () => {}));

  it('shows the loading state before any orders arrive', () => {
    renderOrders();
    expect(screen.getByText('Loading recent orders…')).toBeInTheDocument();
  });

  it('shows the empty state when the subscription returns no orders', () => {
    emit([]);
    renderOrders();
    expect(screen.getByText('No orders in the last 24 hours')).toBeInTheDocument();
  });

  it('matches the snapshot with orders loaded', () => {
    emit(ORDERS);
    const { asFragment } = renderOrders();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders a row for each order', () => {
    emit(ORDERS);
    renderOrders();
    expect(screen.getByText('ORD-1')).toBeInTheDocument();
    expect(screen.getByText('Asha')).toBeInTheDocument();
    expect(screen.getByText('ORD-2')).toBeInTheDocument();
  });

  it('filters to served orders when the Served stat card is clicked', async () => {
    const user = userEvent.setup();
    emit(ORDERS);
    renderOrders();

    await user.click(screen.getByRole('button', { name: /Served/i, pressed: false }));

    expect(screen.getByRole('heading', { name: 'Served Orders' })).toBeInTheDocument();
    expect(screen.getByText('ORD-2')).toBeInTheDocument();
    expect(screen.queryByText('ORD-1')).not.toBeInTheDocument();
  });

  it('opens the inline manual-order modal', async () => {
    const user = userEvent.setup();
    emit(ORDERS);
    renderOrders();

    await user.click(screen.getByRole('button', { name: '+ Manual Order' }));

    expect(screen.getByRole('heading', { name: 'Create Manual Order' })).toBeInTheDocument();
  });

  it('opens the all-orders overlay', async () => {
    const user = userEvent.setup();
    emit(ORDERS);
    renderOrders();

    await user.click(screen.getByRole('button', { name: 'All Orders' }));

    expect(screen.getByTestId('all-orders-overlay')).toBeInTheDocument();
  });

  it('navigates back to the dashboard', async () => {
    const user = userEvent.setup();
    emit(ORDERS);
    renderOrders();

    await user.click(screen.getByRole('button', { name: '← Back to Dashboard' }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
