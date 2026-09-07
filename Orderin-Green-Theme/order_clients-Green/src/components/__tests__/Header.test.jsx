import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from '../Header';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
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

  it('renders the restaurant name and two icon buttons', () => {
    renderHeader();
    expect(screen.getByRole('heading', { name: 'XYZ Restaurant' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('does not show the notification panel initially', () => {
    renderHeader();
    expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument();
  });

  it('opens and closes the notification panel', async () => {
    const user = userEvent.setup();
    renderHeader();
    const [bellBtn] = screen.getAllByRole('button');

    await user.click(bellBtn);
    expect(screen.getByTestId('notification-panel')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'close panel' }));
    expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument();
  });

  it('clears auth storage and redirects to "/" on logout', async () => {
    const user = userEvent.setup();
    localStorage.setItem('auth', 'true');
    sessionStorage.setItem('menuAuth', 'true');
    renderHeader();
    const logoutBtn = screen.getAllByRole('button')[1];

    await user.click(logoutBtn);

    expect(localStorage.getItem('auth')).toBeNull();
    expect(sessionStorage.getItem('menuAuth')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });
});
