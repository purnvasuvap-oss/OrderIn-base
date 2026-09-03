import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';

vi.mock('../../lib/repo', () => ({
  listOrders: () => Promise.resolve([]),
  listInventory: () => Promise.resolve([]),
  inventoryStatus: vi.fn(() => 'in_stock'),
}));
vi.mock('../../lib/printer', () => ({ listPrintJobs: () => Promise.resolve([]) }));
vi.mock('../../hooks/usePrinterStatus', () => ({ usePrinterStatus: () => ({ status: 'idle', ok: true }) }));
vi.mock('../../lib/bus', () => ({ EVENTS: {}, on: vi.fn(() => () => {}) }));
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, ResponsiveContainer: ({ children }) => <div data-testid="chart">{children}</div> };
});

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );

describe('Dashboard', () => {
  it('shows a loading state before its data resolves', () => {
    renderDashboard();
    expect(screen.getByText('Loading dashboard…')).toBeInTheDocument();
  });

  it('renders the page title and the stat cards once data loads', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText("Today's Sales")).toBeInTheDocument();
    expect(screen.getByText('Total Orders')).toBeInTheDocument();
    expect(screen.getByText('Low Stock Items')).toBeInTheDocument();
  });

  it('shows the empty states when there are no orders or alerts', async () => {
    renderDashboard();
    expect(await screen.findByText('No payments yet')).toBeInTheDocument();
    expect(screen.getByText('All clear')).toBeInTheDocument();
  });

  it('matches the snapshot once loaded', async () => {
    const { asFragment } = renderDashboard();
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(asFragment()).toMatchSnapshot();
  });
});
