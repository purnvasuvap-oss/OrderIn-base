import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../services/orderService', () => ({
  subscribeAllCustomerOrders: vi.fn((cb) => {
    cb([{ id: 'o1' }, { id: 'o2' }]);
    return () => {};
  }),
  subscribeRecentOrders: vi.fn(() => () => {}),
}));
vi.mock('../../utils/financeUtils', () => ({
  calculateTodaysRevenue: vi.fn(() => 1234.5),
  formatCurrency: vi.fn((v) => Number(v).toFixed(2)),
}));
vi.mock('../../utils/dashboardStats', () => ({
  subscribeDashboardOrders: vi.fn((setter) => {
    setter(7);
    return () => {};
  }),
  getTodayCustomers: vi.fn(() => 5),
}));
vi.mock('../../utils/CustomerCount', () => ({ getTodaysCustomersCount: vi.fn(() => 5) }));
vi.mock('../../services/tableService', () => ({
  subscribeTables: vi.fn((cb) => {
    cb([{ id: 't1', status: 'occupied' }, { id: 't2', status: 'free' }]);
    return () => {};
  }),
  reconcileOccupiedTables: vi.fn(),
  reconcileReservations: vi.fn(),
}));
vi.mock('../../firebase', () => ({
  subscribeAcceptingOrders: vi.fn(() => () => {}),
  setAcceptingOrders: vi.fn(),
  db: {},
}));

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );

describe('Dashboard', () => {
  it('matches the snapshot', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T09:30:00Z'));
    const { asFragment } = renderDashboard();
    expect(asFragment()).toMatchSnapshot();
    vi.useRealTimers();
  });

  it('renders the welcome heading', () => {
    renderDashboard();
    expect(screen.getByRole('heading', { name: /Welcome To the Dashboard/ })).toBeInTheDocument();
  });

  it('shows the live revenue and order stats', () => {
    renderDashboard();
    expect(screen.getByText('₹1234.50')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders the navigation module cards', () => {
    renderDashboard();
    expect(screen.getByText('Open Orders →')).toBeInTheDocument();
    expect(screen.getByText('Open Menu →')).toBeInTheDocument();
    expect(screen.getByText('Open Financial →')).toBeInTheDocument();
    expect(screen.getByText('Open Inventory →')).toBeInTheDocument();
    expect(screen.getByText('Open Staff Management →')).toBeInTheDocument();
  });

  it('navigates when a module card is clicked', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByText('Open Orders →'));

    expect(mockNavigate).toHaveBeenCalledWith('/orders');
  });
});
