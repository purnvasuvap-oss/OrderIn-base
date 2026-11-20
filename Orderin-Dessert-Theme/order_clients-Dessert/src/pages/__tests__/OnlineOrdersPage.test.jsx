import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import OnlineOrdersPage, { groupOrders } from '../OnlineOrdersPage';
import { subscribeAggregatorOrders, advanceAggregatorOrder } from '../../services/aggregatorService';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../services/aggregatorService', () => ({
  PLATFORM_LABEL: { swiggy: 'Swiggy', zomato: 'Zomato' },
  PREP_TIME_CHOICES: [10, 15, 20],
  REJECT_REASONS: [{ value: 'kitchen_busy', label: 'Kitchen too busy' }],
  subscribeAggregatorOrders: vi.fn(() => () => {}),
  advanceAggregatorOrder: vi.fn(),
  acceptAggregatorOrder: vi.fn(),
  rejectAggregatorOrder: vi.fn(),
  retryAggregatorSync: vi.fn(),
}));

const NOW = Date.parse('2026-11-17T13:00:00');
const o = (id, platform, aggregatorStatus, extra = {}) => ({
  id: `${platform}_${id}`,
  externalOrderId: id,
  platform,
  platformLabel: platform === 'swiggy' ? 'Swiggy' : 'Zomato',
  aggregatorStatus,
  items: [{ name: 'Masala Dosa', quantity: 2 }],
  username: 'Ravi',
  paymentType: 'Paid online',
  totalCost: 100,
  receivedAt: NOW - 20 * 60000,
  acceptBy: NOW + 120000,
  sync: null,
  ...extra,
});

const ORDERS = [
  o('SW-1', 'swiggy', 'placed'),
  o('SW-2', 'swiggy', 'accepted', { acceptedAt: NOW - 30 * 60000, prepMinutes: 20 }), // 10 min late
  o('SW-3', 'swiggy', 'picked_up'),
  o('ZO-1', 'zomato', 'ready', { totalCost: 250, rider: { name: 'Suresh', status: 'arrived', etaMinutes: null } }),
  o('ZO-2', 'zomato', 'cancelled', { totalCost: 999, cancelReason: 'customer_request', prepMinutes: 15 }),
];

const emit = (orders) =>
  subscribeAggregatorOrders.mockImplementation((cb) => {
    cb(orders);
    return () => {};
  });

const renderPage = () =>
  render(
    <MemoryRouter>
      <OnlineOrdersPage now={NOW} />
    </MemoryRouter>
  );

const column = (name) => screen.getByRole('region', { name: `${name} orders` });

describe('OnlineOrdersPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    subscribeAggregatorOrders.mockImplementation(() => () => {});
    advanceAggregatorOrder.mockResolvedValue('ready');
  });

  it('shows a loading state until orders arrive', () => {
    renderPage();
    expect(screen.getByText('Loading online orders…')).toBeInTheDocument();
  });

  it('shows Swiggy and Zomato side by side, each with an empty message when quiet', () => {
    emit([]);
    renderPage();
    expect(within(column('Swiggy')).getByText('No Swiggy orders in the last 24 hours.')).toBeInTheDocument();
    expect(within(column('Zomato')).getByText('No Zomato orders in the last 24 hours.')).toBeInTheDocument();
  });

  it('puts each order in its platform column and lane', () => {
    emit(ORDERS);
    renderPage();
    const swiggy = within(column('Swiggy'));
    expect(swiggy.getByText('New — accept or reject')).toBeInTheDocument();
    expect(swiggy.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(swiggy.getByText('In the kitchen')).toBeInTheDocument();
    expect(swiggy.getByText('10 min late')).toBeInTheDocument();
    expect(swiggy.getByText('Completed')).toBeInTheDocument();
    expect(swiggy.getByText('#SW-3')).toBeInTheDocument();
    expect(swiggy.queryByText('#ZO-1')).not.toBeInTheDocument();

    const zomato = within(column('Zomato'));
    expect(zomato.getByText('Ready for pickup')).toBeInTheDocument();
    expect(zomato.getByText('Rider: Suresh · arrived')).toBeInTheDocument();
    expect(zomato.getByText(/Cancelled by Zomato · customer request/)).toBeInTheDocument();
  });

  it('summarises counts and sales per platform, leaving out cancelled orders', () => {
    emit(ORDERS);
    renderPage();
    const sums = document.querySelectorAll('.oo-sum');
    const swiggy = within(sums[0]);
    expect(swiggy.getByText('New').nextSibling).toHaveTextContent('1');
    expect(swiggy.getByText('In kitchen').nextSibling).toHaveTextContent('1');
    expect(swiggy.getByText('Completed').nextSibling).toHaveTextContent('1');
    expect(swiggy.getByText('Sales').nextSibling).toHaveTextContent('₹300.00');
    expect(within(sums[1]).getByText('Sales').nextSibling).toHaveTextContent('₹250.00'); // not the ₹999 cancelled one
  });

  it('marks a kitchen order ready, and a ready order handed to the rider', async () => {
    const user = userEvent.setup();
    emit(ORDERS);
    renderPage();
    await user.click(within(column('Swiggy')).getByRole('button', { name: 'Mark ready' }));
    expect(advanceAggregatorOrder).toHaveBeenCalledWith('swiggy_SW-2', 'Ready');
    await user.click(within(column('Zomato')).getByRole('button', { name: 'Handed to rider' }));
    expect(advanceAggregatorOrder).toHaveBeenCalledWith('zomato_ZO-1', 'Delivered');
  });

  it('shows why an update failed', async () => {
    const user = userEvent.setup();
    advanceAggregatorOrder.mockRejectedValue(new Error('Swiggy cancelled this order.'));
    emit(ORDERS);
    renderPage();
    await user.click(within(column('Swiggy')).getByRole('button', { name: 'Mark ready' }));
    expect(await screen.findByText('Swiggy cancelled this order.')).toBeInTheDocument();
  });

  it('warns the kitchen when the platform cancels an accepted order', () => {
    emit(ORDERS);
    renderPage();
    expect(screen.getByText(/Zomato cancelled #ZO-2/)).toBeInTheDocument();
  });

  it('opens settings and goes back to Orders', async () => {
    const user = userEvent.setup();
    emit([]);
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(mockNavigate).toHaveBeenCalledWith('/online-orders/settings');
    await user.click(screen.getByRole('button', { name: '← Back to Orders' }));
    expect(mockNavigate).toHaveBeenCalledWith('/orders');
  });
});

describe('groupOrders', () => {
  it('splits orders into lanes', () => {
    const g = groupOrders(ORDERS);
    expect(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((x) => x.externalOrderId)]))).toEqual({
      placed: ['SW-1'],
      accepted: ['SW-2'],
      ready: ['ZO-1'],
      done: ['SW-3'],
      closed: ['ZO-2'],
    });
  });
});
