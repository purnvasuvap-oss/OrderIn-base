import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MenuLogin from '../MenuLogin';
import { verifySectionPasscode } from '../../firebase';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../firebase', () => ({
  verifySectionPasscode: vi.fn(),
  getAuthInfo: vi.fn(() => ({ isAnonymousSignedIn: false, lastAuthError: null })),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <MenuLogin />
    </MemoryRouter>,
  );

describe('MenuLogin', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('menuAuth', 'true'); // effect should clear this on mount
  });

  it('matches the snapshot', () => {
    const { asFragment } = renderPage();
    expect(asFragment()).toMatchSnapshot();
  });

  it('clears any stale menuAuth flag on mount', () => {
    renderPage();
    expect(sessionStorage.getItem('menuAuth')).toBeNull();
  });

  it('grants access and navigates to the menu on a correct passcode', async () => {
    const user = userEvent.setup();
    verifySectionPasscode.mockResolvedValue(true);
    renderPage();

    await user.type(screen.getByPlaceholderText('Enter PIN'), '1234');
    await user.click(screen.getByRole('button', { name: 'Enter' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/menu', { replace: true }));
    expect(sessionStorage.getItem('menuAuth')).toBe('true');
  });

  it('alerts on a wrong passcode and stays put', async () => {
    const user = userEvent.setup();
    verifySectionPasscode.mockResolvedValue(false);
    renderPage();

    await user.type(screen.getByPlaceholderText('Enter PIN'), '0000');
    await user.click(screen.getByRole('button', { name: 'Enter' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Wrong Passcode'));
    expect(mockNavigate).not.toHaveBeenCalledWith('/menu', { replace: true });
  });

  it('navigates back to the dashboard from the back button', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Back to Dashboard' }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
