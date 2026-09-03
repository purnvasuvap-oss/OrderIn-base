import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NotificationPage from '../NotificationPage';
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
  isOrderQueued: (o) => ['queued', 'pending'].includes(String(o?.status).toLowerCase()),
  formatTime: vi.fn(() => '12:00 PM'),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <NotificationPage />
    </MemoryRouter>,
  );

describe('NotificationPage', () => {
  beforeEach(() => {
    mockUseNotification.mockReturnValue({ activities: [] });
    subscribeRecentOrders.mockImplementation(() => () => {});
  });

  it('matches the snapshot with no activities', () => {
    const { asFragment } = renderPage();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the page title and all three tabs', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recent Activities/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Feedback/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Order Alerts/ })).toBeInTheDocument();
  });

  it('shows the empty recent-activities state', () => {
    renderPage();
    expect(screen.getByText('No recent activities')).toBeInTheDocument();
  });

  it('renders activity messages when present', () => {
    mockUseNotification.mockReturnValue({
      activities: [{ message: 'Stock updated', timestamp: new Date('2026-02-01T10:00:00Z').toISOString() }],
    });
    renderPage();
    expect(screen.getByText('Stock updated')).toBeInTheDocument();
  });

  it('switches to Order Alerts and shows its empty sections', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Order Alerts/ }));

    expect(screen.getByText('No queued orders')).toBeInTheDocument();
    expect(screen.getByText('No billing issues')).toBeInTheDocument();
  });

  it('switches to the feedback tab and shows its empty state', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Feedback/ }));

    expect(await screen.findByText('No feedbacks available')).toBeInTheDocument();
  });
});
