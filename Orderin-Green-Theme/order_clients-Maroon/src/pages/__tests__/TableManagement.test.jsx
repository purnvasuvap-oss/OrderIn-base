import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TableManagement from '../TableManagement';
import { subscribeTables } from '../../services/tableService';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../components/ManualOrderModal', () => ({
  default: ({ isOpen }) => (isOpen ? <div data-testid="manual-order-modal" /> : null),
}));
vi.mock('../../services/orderService', () => ({
  subscribeRecentOrders: vi.fn(() => () => {}),
  formatTime: vi.fn(() => '12:00 PM'),
}));
vi.mock('../../services/tableService', () => ({
  seedTablesIfEmpty: vi.fn().mockResolvedValue(undefined),
  subscribeTables: vi.fn(() => () => {}),
  addTable: vi.fn().mockResolvedValue(undefined),
  updateTableCapacity: vi.fn(),
  reserveTable: vi.fn(),
  cancelReservation: vi.fn(),
  markTableCleaning: vi.fn(),
  markTableReady: vi.fn(),
  deleteTable: vi.fn(),
  reconcileOccupiedTables: vi.fn(),
  reconcileReservations: vi.fn(),
  isReservationPending: vi.fn(() => false),
  formatReservedAt: vi.fn(() => ''),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <TableManagement />
    </MemoryRouter>,
  );

const emitTables = (tables) =>
  subscribeTables.mockImplementation((cb) => {
    if (typeof cb === 'function') cb(tables);
    return () => {};
  });

describe('TableManagement', () => {
  beforeEach(() => subscribeTables.mockImplementation(() => () => {}));

  it('matches the snapshot', () => {
    emitTables([]);
    const { asFragment } = renderPage();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the page heading and the Add Table control', () => {
    emitTables([]);
    renderPage();
    expect(screen.getByRole('heading', { name: 'Table Management' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Table/ })).toBeInTheDocument();
  });

  it('shows the empty state when the subscription returns no tables', async () => {
    emitTables([]);
    renderPage();
    expect(await screen.findByText('No tables match this view.')).toBeInTheDocument();
  });

  it('renders a tile for each table from the subscription', async () => {
    emitTables([
      { id: 't1', num: 1, status: 'available', capacity: 4 },
      { id: 't2', num: 2, status: 'occupied', capacity: 2 },
    ]);
    renderPage();
    expect(await screen.findByText('Table 1')).toBeInTheDocument();
    expect(screen.getByText('Table 2')).toBeInTheDocument();
  });

  it('opens the Add Table form', async () => {
    const user = userEvent.setup();
    emitTables([]);
    renderPage();

    await user.click(screen.getByRole('button', { name: /Add Table/ }));

    expect(screen.getByRole('heading', { name: 'Add Table' })).toBeInTheDocument();
  });

  it('navigates back to the dashboard', async () => {
    const user = userEvent.setup();
    emitTables([]);
    renderPage();

    await user.click(screen.getByRole('button', { name: /back/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
