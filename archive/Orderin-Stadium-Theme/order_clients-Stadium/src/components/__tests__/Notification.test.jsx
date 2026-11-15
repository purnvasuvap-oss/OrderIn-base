import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Notification from '../Notification';

const mockUseNotification = vi.fn();
vi.mock('../../hooks/useNotification', () => ({
  useNotification: () => mockUseNotification(),
}));

describe('Notification', () => {
  beforeEach(() => {
    mockUseNotification.mockReturnValue({ activities: [], addActivity: vi.fn() });
  });

  it('matches the snapshot with no activities', () => {
    const { asFragment } = render(<Notification onClose={vi.fn()} />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('shows the empty state when there are no activities', () => {
    render(<Notification onClose={vi.fn()} />);
    expect(screen.getByText('No recent activities')).toBeInTheDocument();
  });

  it('renders each activity message', () => {
    mockUseNotification.mockReturnValue({
      activities: [
        { message: 'Tomatoes added 5 kg', timestamp: new Date('2026-02-01T10:00:00Z').toISOString() },
        { message: 'Onions removed 2 kg', timestamp: new Date('2026-02-01T11:00:00Z').toISOString() },
      ],
      addActivity: vi.fn(),
    });

    render(<Notification onClose={vi.fn()} />);

    expect(screen.getByText('Tomatoes added 5 kg')).toBeInTheDocument();
    expect(screen.getByText('Onions removed 2 kg')).toBeInTheDocument();
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
