import { render, screen } from '@testing-library/react';
import { DashboardPage } from '../DashboardPage';
import { useAppStore } from '../../store';
import { applyStoreMock, buildStoreState, makeRestaurant, makeTransaction } from '../../test/mockStore';

vi.mock('../../store', () => ({ useAppStore: vi.fn() }));
vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));
// recharts renders an async ResponsiveContainer that needs layout; stub it to a plain box.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="chart">{children}</div>
    ),
  };
});

describe('DashboardPage', () => {
  beforeEach(() => {
    applyStoreMock(useAppStore, buildStoreState());
  });

  it('matches the snapshot with empty data', () => {
    const { asFragment } = render(<DashboardPage />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the dashboard heading and stat labels', () => {
    render(<DashboardPage />);

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Total Restaurants')).toBeInTheDocument();
    expect(screen.getByText('Total Transactions')).toBeInTheDocument();
    expect(screen.getByText('GST Payable')).toBeInTheDocument();
  });

  it('shows zeroed totals when there is no data', () => {
    render(<DashboardPage />);

    // Total Restaurants + Total Transactions both render "0"
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2);
  });

  it('aggregates only online transactions into the stat cards', () => {
    applyStoreMock(
      useAppStore,
      buildStoreState({
        restaurants: [makeRestaurant({ id: 'r1' }), makeRestaurant({ id: 'r2', code: 'REST02' })],
        transactions: [
          makeTransaction({ id: 't1', paymentMethod: 'Online', grossAmount: 500, gst: 10, netPlatformEarnings: 40 }),
          makeTransaction({ id: 't2', paymentMethod: 'Cash', grossAmount: 999, gst: 99 }),
        ],
      }),
    );

    render(<DashboardPage />);

    // 2 restaurants
    expect(screen.getByText('2')).toBeInTheDocument();
    // 1 online transaction counted (the Cash one is excluded)
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
