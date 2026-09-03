import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '../Login';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
const mockLogin = vi.fn();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ login: mockLogin }) }));
vi.mock('../../lib/accessControl', () => ({ fetchDemoAccounts: () => Promise.resolve([]) }));

const renderLogin = () =>
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );

describe('Login', () => {
  it('matches the snapshot', () => {
    const { asFragment } = renderLogin();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the brand, username / password fields and the sign-in button', () => {
    renderLogin();
    expect(screen.getByText('Orderin POS')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. cashier')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('navigates to the returned home route on a successful login', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue({ ok: true, home: '/pos' });
    renderLogin();

    await user.type(screen.getByPlaceholderText('e.g. cashier'), 'cashier');
    await user.type(screen.getByPlaceholderText('••••••••'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pos', { replace: true }));
  });

  it('shows the error message when login fails', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue({ ok: false, error: 'Incorrect password.' });
    renderLogin();

    await user.type(screen.getByPlaceholderText('e.g. cashier'), 'cashier');
    await user.type(screen.getByPlaceholderText('••••••••'), 'bad');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Incorrect password.')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
