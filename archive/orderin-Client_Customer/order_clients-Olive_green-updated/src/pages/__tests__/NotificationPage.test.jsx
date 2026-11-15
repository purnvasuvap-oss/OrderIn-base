import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationPage from '../NotificationPage';

const mockUseNotification = vi.fn();
vi.mock('../../hooks/useNotification', () => ({
  useNotification: () => mockUseNotification(),
}));

describe('NotificationPage', () => {
  beforeEach(() => {
    mockUseNotification.mockReturnValue({ activities: [], addActivity: vi.fn() });
  });

  it('matches the snapshot with no activities', () => {
    const { asFragment } = render(<NotificationPage />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the page title and both tabs', () => {
    render(<NotificationPage />);
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recent Activities/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Feedback/ })).toBeInTheDocument();
  });

  it('shows the empty recent-activities state', () => {
    render(<NotificationPage />);
    expect(screen.getByText('No recent activities')).toBeInTheDocument();
  });

  it('renders activity messages when present', () => {
    mockUseNotification.mockReturnValue({
      activities: [{ message: 'Stock updated', timestamp: new Date('2026-02-01T10:00:00Z').toISOString() }],
      addActivity: vi.fn(),
    });
    render(<NotificationPage />);
    expect(screen.getByText('Stock updated')).toBeInTheDocument();
  });

  it('switches to the feedback tab and shows its empty state', async () => {
    const user = userEvent.setup();
    render(<NotificationPage />);

    await user.click(screen.getByRole('button', { name: /Feedback/ }));

    expect(await screen.findByText('No feedbacks available')).toBeInTheDocument();
  });
});
