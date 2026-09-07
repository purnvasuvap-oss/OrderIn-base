import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AllOrdersOverlay from '../AllOrdersOverlay/AllOrdersOverlay';

const orders = [
  { id: 'o1', items: [{ name: 'Dosa', quantity: 2 }, { name: 'Coffee', quantity: 1 }] },
  { id: 'o2', items: [{ name: 'Dosa', quantity: 1 }, { name: 'Coffee', quantity: 1, instructions: 'no sugar' }] },
];

describe('AllOrdersOverlay', () => {
  it('matches the snapshot', () => {
    const { asFragment } = render(<AllOrdersOverlay orders={orders} onClose={vi.fn()} />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('shows the empty state when there are no active orders', () => {
    render(<AllOrdersOverlay orders={[]} onClose={vi.fn()} />);
    expect(screen.getByText('No active orders right now.')).toBeInTheDocument();
  });

  it('consolidates quantities across orders and keeps instruction lines apart', () => {
    render(<AllOrdersOverlay orders={orders} onClose={vi.fn()} />);

    expect(screen.getByText('×3')).toBeInTheDocument(); // Dosa: 2 + 1
    expect(screen.getByText('Note: no sugar')).toBeInTheDocument();
    expect(screen.getByText(/Total Quantity:/)).toHaveTextContent('5');
  });

  it('reports how many orders were consolidated', () => {
    render(<AllOrdersOverlay orders={orders} onClose={vi.fn()} />);
    expect(screen.getByText(/Consolidated across 2 active orders/)).toBeInTheDocument();
  });

  it('calls onClose from the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AllOrdersOverlay orders={orders} onClose={onClose} />);

    await user.click(screen.getByRole('button'));

    expect(onClose).toHaveBeenCalled();
  });
});
