import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from '../Header';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
const mockUseNotification = vi.fn();
vi.mock('../../hooks/useNotification', () => ({ useNotification: () => mockUseNotification() }));
vi.mock('../Notification', () => ({
  default: ({ onClose }) => (
    <div data-testid="notification-panel">
      <button onClick={onClose}>close panel</button>
    </div>
  ),
}));

const renderHeader = () =>
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );

describe('Header', () => {
  beforeEach(() => mockUseNotification.mockReturnValue({ queuedCount: 0 }));
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('matches the snapshot', () => {
    const { asFragment } = renderHeader();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the restaurant name and the notification / logout buttons', () => {
    renderHeader();
    expect(screen.getByRole('heading', { name: 'XYZ Restaurant' })).toBeInTheDocument();
    expect(screen.getByAltText('notifications')).toBeInTheDocument();
    expect(screen.getByAltText('logout')).toBeInTheDocument();
  });

  it('does not render a queued-count badge when the count is zero', () => {
    renderHeader();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('renders the queued-count badge, capped at 99+', () => {
    mockUseNotification.mockReturnValue({ queuedCount: 150 });
    renderHeader();
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('opens and closes the notification panel', async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByAltText('notifications'));
    expect(screen.getByTestId('notification-panel')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'close panel' }));
    expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument();
  });

  it('clears auth storage and redirects to "/" on logout', async () => {
    const user = userEvent.setup();
    localStorage.setItem('auth', 'true');
    sessionStorage.setItem('menuAuth', 'true');
    renderHeader();

    await user.click(screen.getByAltText('logout'));

    expect(localStorage.getItem('auth')).toBeNull();
    expect(sessionStorage.getItem('menuAuth')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });
});
