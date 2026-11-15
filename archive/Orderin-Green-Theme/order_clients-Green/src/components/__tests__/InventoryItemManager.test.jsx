import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventoryItemManager from '../InventoryManager/InventoryItemManager';

vi.mock('../../services/inventoryStatusService', () => ({
  pauseItems: vi.fn().mockResolvedValue(undefined),
  continueItems: vi.fn().mockResolvedValue(undefined),
  softDeleteItems: vi.fn().mockResolvedValue(undefined),
}));

const items = [
  { id: 'i1', name: 'Tomato', itemCategory: 'Vegetables', itemStatus: 'active' },
  { id: 'i2', name: 'Paneer', itemCategory: 'Dairy', itemStatus: 'paused' },
];

describe('InventoryItemManager', () => {
  it('matches the snapshot', () => {
    const { asFragment } = render(<InventoryItemManager items={items} onChanged={vi.fn()} />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the heading and groups items by category (default category view)', () => {
    render(<InventoryItemManager items={items} onChanged={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Inventory Item Manager' })).toBeInTheDocument();
    expect(screen.getByText('Vegetables')).toBeInTheDocument();
    expect(screen.getByText('Dairy')).toBeInTheDocument();
  });

  it('shows individual items after switching to Item View', async () => {
    const user = userEvent.setup();
    render(<InventoryItemManager items={items} onChanged={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Item View/ }));

    expect(screen.getByText('Tomato')).toBeInTheDocument();
    expect(screen.getByText('Paneer')).toBeInTheDocument();
  });

  it('filters by category via the search box', async () => {
    const user = userEvent.setup();
    render(<InventoryItemManager items={items} onChanged={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Search item or category...'), 'dairy');

    expect(screen.getByText('Dairy')).toBeInTheDocument();
    expect(screen.queryByText('Vegetables')).not.toBeInTheDocument();
  });

  it('handles an empty item list without crashing', () => {
    render(<InventoryItemManager items={[]} onChanged={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Inventory Item Manager' })).toBeInTheDocument();
  });
});
