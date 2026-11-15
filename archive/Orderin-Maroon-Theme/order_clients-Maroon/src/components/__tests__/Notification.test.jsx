import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Notification from '../Notification';
import { subscribeRecentOrders } from '../../services/orderService';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
const mockUseNotification = vi.fn();
vi.mock('../../hooks/useNotification', () => ({ useNotification: () => mockUseNotification() }));
vi.mock('../../services/orderService', () => ({
  subscribeRecentOrders: vi.fn(() => () => {}),
  isOrderQueued: (o) => String(o?.status).toLowerCase() === 'queued' || String(o?.status).toLowerCase() === 'pending',
  formatTime: vi.fn(() => '12:00 PM'),
}));

const renderNotification = () =>
  render(
    <MemoryRouter>
      <Notification onClose={vi.fn()} />
    </MemoryRouter>,
  );

describe('Notification', () => {
  beforeEach(() => {
    mockUseNotification.mockReturnValue({ activities: [] });
    subscribeRecentOrders.mockImplementation(() => () => {});
  });

  it('matches the snapshot with no activities', () => {
    const { asFragment } = renderNotification();
    expect(asFragment()).toMatchSnapshot();
  });

  it('shows the empty recent-activities state', () => {
    renderNotification();
    expect(screen.getByText('No recent activities')).toBeInTheDocument();
  });

  it('renders activity messages when present', () => {
    mockUseNotification.mockReturnValue({
      activities: [{ message: 'Stock updated', timestamp: new Date('2026-02-01T10:00:00Z').toISOString() }],
    });
    renderNotification();
    expect(screen.getByText('Stock updated')).toBeInTheDocument();
  });

  it('switches to the Order Alerts tab and shows its empty sections', async () => {
    const user = userEvent.setup();
    renderNotification();

    await user.click(screen.getByRole('button', { name: /Order Alerts/ }));

    expect(screen.getByText('No queued orders')).toBeInTheDocument();
    expect(screen.getByText('No billing issues')).toBeInTheDocument();
  });

  it('lists queued orders from the live subscription', async () => {
    const user = userEvent.setup();
    subscribeRecentOrders.mockImplementation((cb) => {
      cb([{ id: 'O1', username: 'Asha', tableNumber: '4', status: 'queued' }]);
      return () => {};
    });
    renderNotification();

    await user.click(screen.getByRole('button', { name: /Order Alerts/ }));

    expect(screen.queryByText('No queued orders')).not.toBeInTheDocument();
    expect(screen.getByText('O1')).toBeInTheDocument(); // rendered inside <strong>
    expect(screen.getByText('Queued')).toBeInTheDocument(); // alert badge
  });

  it('switches to the feedback tab and shows its empty state', async () => {
    const user = userEvent.setup();
    renderNotification();

    await user.click(screen.getByRole('button', { name: /Feedback/ }));

    expect(await screen.findByText('No feedbacks available')).toBeInTheDocument();
  });

  it('calls onClose from the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <Notification onClose={onClose} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '×' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
