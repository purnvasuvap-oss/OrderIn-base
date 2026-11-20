import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from '../Header';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
// Restaurant profile read by the header (name shown in the top bar).
const mockGetDoc = vi.fn();
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: (...args) => mockGetDoc(...args),
}));
vi.mock('../Notification', () => ({
  default: ({ onClose }) => (
    <div data-testid="notification-panel">
      <button onClick={onClose}>close panel</button>
    </div>
  ),
}));

const renderHeader = (path = '/dashboard') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>,
  );

describe('Header', () => {
  beforeEach(() => {
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('matches the snapshot', () => {
    const { asFragment } = renderHeader();
    expect(asFragment()).toMatchSnapshot();
  });

  it('shows the restaurant name from its profile, and two icon buttons', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Spice Garden' }) });
    renderHeader();
    expect(await screen.findByRole('heading', { name: 'Spice Garden' })).toBeInTheDocument();
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

  it('falls back to "Restaurant" when the profile has no name', async () => {
    renderHeader();
    expect(await screen.findByRole('heading', { name: 'Restaurant' })).toBeInTheDocument();
  });

  it.each(['/dashboard', '/orders', '/table-management', '/finance'])(
    'shows no sidebar on %s: pages use the full width',
    (path) => {
      renderHeader(path);
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(document.body).not.toHaveClass('mx-shell');
      expect(screen.getAllByRole('button')).toHaveLength(2);
    }
  );
});
