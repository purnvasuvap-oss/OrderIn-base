import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Notification from '../Notification';

const mockUseNotification = vi.fn();
vi.mock('../../hooks/useNotification', () => ({ useNotification: () => mockUseNotification() }));
vi.mock('../../services/orderService', () => ({
  formatTime: vi.fn(() => '12:00 PM'),
  isOrderAccepted: vi.fn(() => false),
}));

const baseState = { activities: [], queuedCount: 0, queuedOrders: [] };

describe('Notification', () => {
  beforeEach(() => mockUseNotification.mockReturnValue({ ...baseState }));

  it('matches the snapshot with no activities', () => {
    const { asFragment } = render(<Notification onClose={vi.fn()} />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('shows the empty recent-activities state', () => {
    render(<Notification onClose={vi.fn()} />);
    expect(screen.getByText('No recent activities')).toBeInTheDocument();
  });

  it('renders each activity message', () => {
    mockUseNotification.mockReturnValue({
      ...baseState,
      activities: [{ message: 'Tomatoes added 5 kg', timestamp: new Date('2026-02-01T10:00:00Z').toISOString() }],
    });
    render(<Notification onClose={vi.fn()} />);
    expect(screen.getByText('Tomatoes added 5 kg')).toBeInTheDocument();
  });

  it('switches to the Queued Orders tab and shows its empty state', async () => {
    const user = userEvent.setup();
    render(<Notification onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Queued Orders/ }));

    expect(screen.getByText('No orders waiting in queue')).toBeInTheDocument();
  });

  it('lists queued orders and reflects the count in the tab label', async () => {
    const user = userEvent.setup();
    mockUseNotification.mockReturnValue({
      ...baseState,
      queuedCount: 2,
      queuedOrders: [
        { id: 'O1', username: 'Asha', tableNumber: '4' },
        { id: 'O2', username: 'Ravi', tableNumber: '7' },
      ],
    });
    render(<Notification onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Queued Orders \(2\)/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Queued Orders/ }));
    expect(screen.getByText(/#O1 — Asha \(Table 4\)/)).toBeInTheDocument();
  });

  it('switches to the feedback tab and shows its empty state', async () => {
    const user = userEvent.setup();
    render(<Notification onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Feedback/ }));

    expect(await screen.findByText('No feedbacks available')).toBeInTheDocument();
  });

  it('calls onClose from the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Notification onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '×' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
