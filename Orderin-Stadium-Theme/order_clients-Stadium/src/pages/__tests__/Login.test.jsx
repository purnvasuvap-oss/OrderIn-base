import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '../Login';
import { verifyMainLogin, getRestaurantStatus } from '../../firebase';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../firebase', () => ({
  verifyMainLogin: vi.fn(),
  getRestaurantStatus: vi.fn(),
}));

const renderLogin = () =>
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );

const fillAndSubmit = async (user, id = 'manager', pw = 'secret') => {
  await user.type(screen.getByPlaceholderText('Enter user ID'), id);
  await user.type(screen.getByPlaceholderText('Enter password'), pw);
  await user.click(screen.getByRole('button', { name: 'Login' }));
};

describe('Login', () => {
  beforeEach(() => {
    localStorage.clear();
    getRestaurantStatus.mockResolvedValue({ status: 'Active', allowed: true, daysLeft: null });
  });

  it('matches the snapshot', () => {
    const { asFragment } = renderLogin();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the user id and password fields and the login button', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('Enter user ID')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('redirects an already-authenticated user to the dashboard', async () => {
    localStorage.setItem('auth', 'true');
    renderLogin();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });

  it('stores the auth flag and navigates on valid credentials', async () => {
    const user = userEvent.setup();
    verifyMainLogin.mockResolvedValue(true);
    renderLogin();

    await fillAndSubmit(user);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
    expect(localStorage.getItem('auth')).toBe('true');
  });

  it('alerts and does not navigate on invalid credentials', async () => {
    const user = userEvent.setup();
    verifyMainLogin.mockResolvedValue(false);
    renderLogin();

    await fillAndSubmit(user, 'manager', 'wrong');

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Invalid Credentials'));
    expect(mockNavigate).not.toHaveBeenCalledWith('/dashboard');
  });

  it('disables the login button when the restaurant is not allowed to log in', async () => {
    getRestaurantStatus.mockResolvedValue({ status: 'Off', allowed: false, daysLeft: 0 });
    renderLogin();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Login' })).toBeDisabled());
  });

  it('shows the limited-access note for an Inactive restaurant', async () => {
    getRestaurantStatus.mockResolvedValue({ status: 'Inactive', allowed: true, daysLeft: 3 });
    renderLogin();

    expect(await screen.findByText(/Limited access: 3 day\(s\) left/)).toBeInTheDocument();
  });
});
