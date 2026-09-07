import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IllusionPricingModal from '../RotIndex/IllusionPricingModal';
import { fetchMenuItems, createIllusionPricingPromo } from '../../services/illusionPricingService';

vi.mock('../../services/illusionPricingService', () => ({
  fetchMenuItems: vi.fn(),
  createIllusionPricingPromo: vi.fn(),
}));

const inventoryItem = { name: 'Tomato' };

describe('IllusionPricingModal', () => {
  beforeEach(() => {
    fetchMenuItems.mockResolvedValue([
      { id: 'm1', name: 'Tomato Soup', price: 120 },
      { id: 'm2', name: 'Pasta', price: 200 },
    ]);
  });

  it('matches the snapshot once the menu loads', async () => {
    const { asFragment } = render(<IllusionPricingModal inventoryItem={inventoryItem} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Tomato Soup')).toBeInTheDocument());
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the heading and pre-fills the search from the inventory item', async () => {
    render(<IllusionPricingModal inventoryItem={inventoryItem} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Activate Illusion Pricing/ })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tomato')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Tomato Soup')).toBeInTheDocument());
  });

  it('keeps the activate button disabled until a dish is picked', async () => {
    const user = userEvent.setup();
    render(<IllusionPricingModal inventoryItem={inventoryItem} onClose={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Tomato Soup')).toBeInTheDocument());

    const activate = screen.getByRole('button', { name: 'Activate Promo Banner' });
    expect(activate).toBeDisabled();

    await user.click(screen.getByText('Tomato Soup'));
    expect(activate).toBeEnabled();

    await user.click(activate);
    expect(createIllusionPricingPromo).toHaveBeenCalled();
  });

  it('calls onClose from the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<IllusionPricingModal inventoryItem={inventoryItem} onClose={onClose} />);

    await user.click(screen.getAllByRole('button')[0]);

    expect(onClose).toHaveBeenCalled();
  });
});
