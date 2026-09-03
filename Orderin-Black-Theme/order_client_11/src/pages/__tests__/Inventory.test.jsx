import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Inventory from '../Inventory';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../hooks/useNotification', () => ({
  useNotification: () => ({ activities: [], addActivity: vi.fn() }),
}));
vi.mock('../../utils/rotIndex', () => ({
  withRotIndex: (items) => items,
  ROT_BANDS: {},
}));
vi.mock('../../services/inventoryBatchService', () => ({
  addInventoryBatch: vi.fn().mockResolvedValue(undefined),
  getItemBatches: vi.fn().mockResolvedValue([]),
  consumeFromSpecificBatches: vi.fn().mockResolvedValue(undefined),
  getItemActionHistory: vi.fn().mockResolvedValue([]),
  recordInventoryAction: vi.fn().mockResolvedValue(undefined),
  getAllBatchesWithExpiry: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../components/RotIndex/RotBadge', () => ({ default: () => null }));
vi.mock('../../components/RotIndex/IllusionPricingModal', () => ({ default: () => null }));
vi.mock('../../components/InventoryManager/InventoryItemManager', () => ({
  default: () => <div data-testid="inventory-item-manager" />,
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <Inventory />
    </MemoryRouter>,
  );

describe('Inventory', () => {
  it('matches the snapshot', () => {
    const { asFragment } = renderPage();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the page title and toolbar actions', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Inventory Management' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stock Update' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set Alerts' })).toBeInTheDocument();
  });

  it('opens the Stock Update modal', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Stock Update' }));

    expect(screen.getByRole('heading', { name: 'Update stock' })).toBeInTheDocument();
  });

  it('switches to the manager tab', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByTestId('inventory-item-manager')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /manager/i }));

    expect(screen.getByTestId('inventory-item-manager')).toBeInTheDocument();
  });

  it('navigates back to the dashboard', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
