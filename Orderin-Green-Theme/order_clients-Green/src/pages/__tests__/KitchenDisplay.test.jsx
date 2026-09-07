import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import KitchenDisplay from '../KitchenDisplay';
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
    if (v.includes('deliver')) return 'Delivered';
    return 'Pending';
  };
  return {
    subscribeRecentOrders: vi.fn(() => () => {}),
    acceptOrderAndDeduct: vi.fn().mockResolvedValue(undefined),
    rejectOrder: vi.fn().mockResolvedValue(undefined),
    updateOrderStatus: vi.fn().mockResolvedValue(undefined),
    isOrderAccepted: (o) => norm(o?.status) !== 'Pending',
    isOrderActive: (o) => ['Preparing', 'Ready'].includes(norm(o?.status)),
    isOrderDelivered: (o) => norm(o?.status) === 'Delivered',
    normalizeOrderStatus: norm,
  };
});
vi.mock('../../utils/printKitchenTicket', () => ({ printKitchenTicket: vi.fn() }));
vi.mock('../../components/RejectReasonModal', () => ({ default: () => null }));

const renderKDS = () =>
  render(
    <MemoryRouter>
      <KitchenDisplay />
    </MemoryRouter>,
  );

const emit = (orders) =>
  subscribeRecentOrders.mockImplementation((cb) => {
    if (typeof cb === 'function') cb(orders);
    return () => {};
  });

describe('KitchenDisplay', () => {
  beforeEach(() => subscribeRecentOrders.mockImplementation(() => () => {}));

  it('matches the snapshot', () => {
    emit([]);
    const { asFragment } = renderKDS();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the header and all board lanes', () => {
    emit([]);
    renderKDS();
    expect(screen.getByRole('heading', { name: 'Kitchen Display' })).toBeInTheDocument();
    ['New', 'Preparing', 'Ready'].forEach((lane) => expect(screen.getByText(lane)).toBeInTheDocument());
  });

  it('shows an empty message in every lane when there are no orders', () => {
    emit([]);
    renderKDS();
    expect(screen.getAllByText('Nothing here').length).toBeGreaterThan(0);
  });

  it('renders a ticket for an active order in its lane', () => {
    emit([{ id: 'ORD-1', status: 'preparing', paymentStatus: 'paid', items: [{ name: 'Dosa', quantity: 1 }], timestamp: Date.now() }]);
    renderKDS();
    expect(screen.getByText('ORD-1')).toBeInTheDocument();
  });

  it('navigates back to the dashboard', async () => {
    const user = userEvent.setup();
    emit([]);
    renderKDS();

    await user.click(screen.getByRole('button', { name: /Dashboard/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
