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
}));
vi.mock('../../utils/CustomerCount', () => ({ getTodaysCustomersCount: vi.fn(() => 5) }));
vi.mock('../../utils/tableCount', () => ({ getOccupiedTablesCount: vi.fn(() => 10) }));

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );

describe('Dashboard', () => {
  it('matches the snapshot', () => {
    // The header shows a live clock — freeze it so the snapshot is stable.
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

  it('shows the live stats derived from the subscriptions', () => {
    renderDashboard();
    expect(screen.getByText('₹1234.50')).toBeInTheDocument(); // revenue
    expect(screen.getByText('7')).toBeInTheDocument(); // orders today
    expect(screen.getByText('5')).toBeInTheDocument(); // customers today
    expect(screen.getByText('10/25')).toBeInTheDocument(); // tables occupied
  });

  it('renders the four action cards', () => {
    renderDashboard();
    ['Menu', 'Financial', 'Orders', 'Inventory'].forEach((title) => {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    });
  });

  it('navigates when an action card Open button is clicked', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getAllByRole('button', { name: 'Open' })[2]); // Orders card

    expect(mockNavigate).toHaveBeenCalledWith('/orders');
  });
});
