import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from '../Header';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
// Notification pulls from the notification context / Firestore; stub it out.
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
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('matches the snapshot', () => {
    const { asFragment } = renderHeader();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the notification and logout buttons', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: /open notifications/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('does not show the notification panel initially', () => {
    renderHeader();
    expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument();
  });

  it('opens and closes the notification panel', async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('button', { name: /open notifications/i }));
    expect(screen.getByTestId('notification-panel')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'close panel' }));
    expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument();
  });

  it('clears auth storage and redirects to "/" on logout', async () => {
    const user = userEvent.setup();
    localStorage.setItem('auth', 'true');
    sessionStorage.setItem('menuAuth', 'true');
    renderHeader();

    await user.click(screen.getByRole('button', { name: /log out/i }));

    expect(localStorage.getItem('auth')).toBeNull();
    expect(sessionStorage.getItem('menuAuth')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });
});
