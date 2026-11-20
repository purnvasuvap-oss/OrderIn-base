import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Orders from '../Orders';
import { subscribeRecentOrders } from '../../services/orderService';
import { subscribeAggregatorOrders, advanceAggregatorOrder } from '../../services/aggregatorService';
import { updateOrderStatus } from '../../services/orderService';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate, useLocation: () => ({ state: null, pathname: '/orders' }) };
});

vi.mock('../../services/orderService', () => {
  const normalizeOrderStatus = (s) => {
    const v = String(s || '').toLowerCase();
    if (v.includes('prepar')) return 'Preparing';
    if (v.includes('ready')) return 'Ready';
    if (v.includes('deliver') || v.includes('served')) return 'Delivered';
    if (v.includes('accept')) return 'Preparing';
    return 'Pending';
  };
  return {
    subscribeRecentOrders: vi.fn(() => () => {}),
    updateOrderStatus: vi.fn().mockResolvedValue(undefined),
    formatTime: vi.fn(() => '12:00 PM'),
    normalizeOrderStatus,
    isOrderAccepted: (o) => normalizeOrderStatus(o?.status) !== 'Pending',
    isOrderQueued: (o) => normalizeOrderStatus(o?.status) === 'Pending',
    isOrderActive: (o) => ['Preparing', 'Ready'].includes(normalizeOrderStatus(o?.status)),
    isOrderDelivered: (o) => normalizeOrderStatus(o?.status) === 'Delivered',
    isOrderWithinLast24Hours: () => true,
  };
});

vi.mock('../../services/aggregatorService', () => ({
  subscribeAggregatorOrders: vi.fn(() => () => {}),
  advanceAggregatorOrder: vi.fn().mockResolvedValue('ready'),
}));
// The inbox has its own tests; here it is a marker for what it was given.
vi.mock('../../components/AggregatorInbox/AggregatorInbox', () => ({
  default: ({ orders }) => <div data-testid="agg-inbox">{orders.length} aggregator orders</div>,
}));

// Heavy child modals — stub to keep the page test focused.
vi.mock('../../components/OrderItemListModal/OrderItemListModal', () => ({ default: () => null }));
vi.mock('../../components/AllOrdersOverlay/AllOrdersOverlay', () => ({
  default: ({ onClose }) => <div data-testid="all-orders-overlay"><button onClick={onClose}>x</button></div>,
}));
vi.mock('../../components/ManualOrderModal', () => ({
  default: ({ onClose }) => <div data-testid="manual-order-modal"><button onClick={onClose}>x</button></div>,
}));

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

const emitOrders = (orders) => {
  subscribeRecentOrders.mockImplementation((cb) => {
    cb(orders);
    return () => {};
  });
};

describe('Orders', () => {
  beforeEach(() => {
    subscribeRecentOrders.mockImplementation(() => () => {});
  });

  it('shows the loading state before any orders arrive', () => {
    renderOrders();
    expect(screen.getByText('Loading recent orders…')).toBeInTheDocument();
  });

  it('shows the empty state when the subscription returns no orders', () => {
    emitOrders([]);
    renderOrders();
    expect(screen.getByText('No orders in the last 24 hours')).toBeInTheDocument();
  });

  it('matches the snapshot with orders loaded', () => {
    emitOrders(ORDERS);
    const { asFragment } = renderOrders();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders a row for each order', () => {
    emitOrders(ORDERS);
    renderOrders();
    expect(screen.getByText('ORD-1')).toBeInTheDocument();
    expect(screen.getByText('Asha')).toBeInTheDocument();
    expect(screen.getByText('ORD-2')).toBeInTheDocument();
  });

  it('filters to served orders when the Served stat card is clicked', async () => {
    const user = userEvent.setup();
    emitOrders(ORDERS);
    renderOrders();

    await user.click(screen.getByRole('button', { name: /Served/i, pressed: false }));

    expect(screen.getByRole('heading', { name: 'Served Orders' })).toBeInTheDocument();
    expect(screen.getByText('ORD-2')).toBeInTheDocument();
    expect(screen.queryByText('ORD-1')).not.toBeInTheDocument();
  });

  it('opens the manual order modal', async () => {
    const user = userEvent.setup();
    emitOrders(ORDERS);
    renderOrders();

    await user.click(screen.getByRole('button', { name: '+ Manual Order' }));

    expect(screen.getByTestId('manual-order-modal')).toBeInTheDocument();
  });

  it('opens the all-orders overlay', async () => {
    const user = userEvent.setup();
    emitOrders(ORDERS);
    renderOrders();

    await user.click(screen.getByRole('button', { name: 'All Orders' }));

    expect(screen.getByTestId('all-orders-overlay')).toBeInTheDocument();
  });

  it('navigates back to the dashboard', async () => {
    const user = userEvent.setup();
    emitOrders(ORDERS);
    renderOrders();

    await user.click(screen.getByRole('button', { name: '← Back to Dashboard' }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  describe('Swiggy / Zomato orders', () => {
    const swiggy = (aggregatorStatus, status) => ({
      id: 'swiggy_SW-1', isAggregator: true, platform: 'swiggy', platformLabel: 'Swiggy', aggregatorStatus, status,
      username: 'Ravi', tableNumber: 'Swiggy', phoneNumber: '•••••2345', paymentStatus: 'paid', totalCost: 210,
      items: [{ name: 'Masala Dosa', quantity: 2 }], timestamp: Date.now(),
    });
    const emitAggregator = (orders) =>
      subscribeAggregatorOrders.mockImplementation((cb) => {
        cb(orders);
        return () => {};
      });

    beforeEach(() => {
      subscribeAggregatorOrders.mockImplementation(() => () => {});
      advanceAggregatorOrder.mockResolvedValue('ready');
    });

    it('lists accepted online orders with their platform, and passes all of them to the inbox', () => {
      emitOrders(ORDERS);
      emitAggregator([swiggy('accepted', 'Preparing'), { ...swiggy('placed', 'Pending'), id: 'swiggy_SW-2' }]);
      renderOrders();
      expect(screen.getByTestId('agg-inbox')).toHaveTextContent('2 aggregator orders');
      expect(screen.getByText('swiggy_SW-1')).toBeInTheDocument();
      expect(screen.queryByText('swiggy_SW-2')).not.toBeInTheDocument(); // still waiting in the inbox
      expect(screen.getAllByText('Swiggy').length).toBeGreaterThan(0);
      expect(screen.getByText(/Delivery ·/)).toBeInTheDocument();
    });

    it('sends status changes for online orders to the aggregator service', async () => {
      const user = userEvent.setup();
      emitOrders([]);
      emitAggregator([swiggy('accepted', 'Preparing')]);
      renderOrders();
      await user.click(screen.getByRole('button', { name: 'Board' }));
      await user.click(screen.getByRole('button', { name: 'Mark ready' }));
      expect(advanceAggregatorOrder).toHaveBeenCalledWith('swiggy_SW-1', 'Ready');
      expect(updateOrderStatus).not.toHaveBeenCalled();
    });

    it('shows the reason when an online order cannot be advanced', async () => {
      const user = userEvent.setup();
      advanceAggregatorOrder.mockRejectedValue(new Error('Swiggy cancelled this order.'));
      emitOrders([]);
      emitAggregator([swiggy('accepted', 'Preparing')]);
      renderOrders();
      await user.click(screen.getByRole('button', { name: 'Board' }));
      await user.click(screen.getByRole('button', { name: 'Mark ready' }));
      expect(await screen.findByText('Swiggy cancelled this order.')).toBeInTheDocument();
    });

    it('links to the Swiggy / Zomato settings', async () => {
      const user = userEvent.setup();
      emitOrders(ORDERS);
      renderOrders();
      await user.click(screen.getByRole('button', { name: 'Swiggy / Zomato' }));
      expect(mockNavigate).toHaveBeenCalledWith('/online-orders');
    });
  });
});
