import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '../login';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../firebaseConfig', () => ({ db: {}, auth: { currentUser: null }, subscribeAcceptingOrders: vi.fn(() => () => {}) }));

const getDoc = vi.fn();
const setDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: (...a) => getDoc(...a),
  setDoc: (...a) => setDoc(...a),
  serverTimestamp: vi.fn(() => ({})),
}));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: vi.fn(() => () => {}) }));

const renderLogin = () =>
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );

describe('Login', () => {
  beforeEach(() => {
    localStorage.clear();
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Active' }) });
  });

  it('matches the snapshot', () => {
    const { asFragment } = renderLogin();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the name and phone inputs', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter phone number')).toBeInTheDocument();
  });

  it('enables the login button once an Active restaurant status loads', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Login' })).toBeEnabled());
  });

  it('shows a validation error when the phone number is missing', async () => {
    const user = userEvent.setup();
    renderLogin();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Login' })).toBeEnabled());

    await user.type(screen.getByPlaceholderText('Enter your name'), 'Asha');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Please enter phone number')).toBeInTheDocument();
  });

  it('saves the user and navigates to the menu on a successful login', async () => {
    const user = userEvent.setup();
    renderLogin();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Login' })).toBeEnabled());

    await user.type(screen.getByPlaceholderText('Enter your name'), 'Asha');
    await user.type(screen.getByPlaceholderText('Enter phone number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/menu')));
    expect(JSON.parse(localStorage.getItem('user'))).toMatchObject({ username: 'Asha' });
  });

  it('disables login when the restaurant status is Off', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Off' }) });
    const user = userEvent.setup();
    renderLogin();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Login' })).toBeEnabled());

    await user.type(screen.getByPlaceholderText('Enter your name'), 'Asha');
    await user.type(screen.getByPlaceholderText('Enter phone number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText(/Restaurant is Off/)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
