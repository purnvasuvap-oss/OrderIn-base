import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AggregatorInbox from '../AggregatorInbox/AggregatorInbox';
import {
  acceptAggregatorOrder,
  rejectAggregatorOrder,
  retryAggregatorSync,
} from '../../services/aggregatorService';

vi.mock('../../services/aggregatorService', () => ({
  PREP_TIME_CHOICES: [10, 15, 20],
  REJECT_REASONS: [
    { value: 'item_out_of_stock', label: 'An item is out of stock' },
    { value: 'kitchen_busy', label: 'Kitchen too busy' },
  ],
  acceptAggregatorOrder: vi.fn(),
  rejectAggregatorOrder: vi.fn(),
  retryAggregatorSync: vi.fn(),
}));

const NOW = 1_000_000;
const order = (extra = {}) => ({
  id: 'swiggy_SW-1',
  platform: 'swiggy',
  platformLabel: 'Swiggy',
  externalOrderId: 'SW-1',
  aggregatorStatus: 'placed',
  acceptBy: NOW + 150_000,
  items: [{ name: 'Masala Dosa', quantity: 2, instructions: 'crispy' }],
  instructions: 'Ring the bell',
  username: 'Ravi',
  paymentType: 'Paid on Swiggy',
  totalCost: 256.75,
  unmappedItems: 0,
  sync: null,
  ...extra,
});

describe('AggregatorInbox', () => {
  it('renders nothing when there is nothing to act on', () => {
    const { container } = render(<AggregatorInbox orders={[order({ aggregatorStatus: 'accepted' })]} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a new order with its countdown, items and total', () => {
    render(<AggregatorInbox orders={[order()]} now={NOW} />);
    expect(screen.getByRole('heading', { name: /Online orders/ })).toHaveTextContent('1 new');
    expect(screen.getByText('Swiggy')).toBeInTheDocument();
    expect(screen.getByText('#SW-1')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('Accept within 2:30');
    expect(screen.getByText(/Masala Dosa/)).toBeInTheDocument();
    expect(screen.getByText('₹256.75')).toBeInTheDocument();
  });

  it('marks the last minute as urgent and a passed deadline as time up', () => {
    const { rerender } = render(<AggregatorInbox orders={[order()]} now={NOW + 100_000} />);
    expect(screen.getByRole('timer')).toHaveClass('urgent');
    rerender(<AggregatorInbox orders={[order()]} now={NOW + 200_000} />);
    expect(screen.getByRole('timer')).toHaveTextContent('Time up');
    expect(screen.getByText(/may already have cancelled it/)).toBeInTheDocument();
  });

  it('needs a prep time before accepting, then accepts with it', async () => {
    acceptAggregatorOrder.mockResolvedValue('accepted');
    render(<AggregatorInbox orders={[order()]} now={NOW} />);
    const accept = screen.getByRole('button', { name: 'Accept' });
    expect(accept).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '15 min' }));
    await userEvent.click(screen.getByRole('button', { name: 'Accept · 15 min' }));
    expect(acceptAggregatorOrder).toHaveBeenCalledWith('swiggy_SW-1', 15);
  });

  it('needs a reason before rejecting', async () => {
    rejectAggregatorOrder.mockResolvedValue('rejected');
    render(<AggregatorInbox orders={[order()]} now={NOW} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const confirm = screen.getByRole('button', { name: 'Reject order' });
    expect(confirm).toBeDisabled();
    await userEvent.selectOptions(screen.getByRole('combobox'), 'kitchen_busy');
    await userEvent.click(confirm);
    expect(rejectAggregatorOrder).toHaveBeenCalledWith('swiggy_SW-1', 'kitchen_busy');
  });

  it('shows the error when accepting fails (e.g. platform cancelled)', async () => {
    acceptAggregatorOrder.mockRejectedValue(new Error('Swiggy cancelled this order.'));
    render(<AggregatorInbox orders={[order()]} now={NOW} />);
    await userEvent.click(screen.getByRole('button', { name: '10 min' }));
    await userEvent.click(screen.getByRole('button', { name: 'Accept · 10 min' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Swiggy cancelled this order.');
  });

  it('offers Retry when a status could not be sent to the platform', async () => {
    retryAggregatorSync.mockResolvedValue();
    render(
      <AggregatorInbox
        orders={[order({ aggregatorStatus: 'ready', sync: { state: 'failed', lastError: 'swiggy replied HTTP 503' } })]}
        now={NOW}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't tell Swiggy that #SW-1 is ready.");
    expect(screen.getByRole('alert')).toHaveTextContent('swiggy replied HTTP 503');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retryAggregatorSync).toHaveBeenCalledWith('swiggy_SW-1');
  });

  it('warns the kitchen when the platform cancels an accepted order, until dismissed', async () => {
    sessionStorage.clear();
    render(
      <AggregatorInbox
        orders={[order({ aggregatorStatus: 'cancelled', prepMinutes: 20, cancelReason: 'customer_request' })]}
        now={NOW}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Swiggy cancelled #SW-1 — stop preparing it. Reason: customer request.');
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
