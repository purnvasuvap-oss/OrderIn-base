import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import InventoryLogin from '../InventoryLogin';
import { verifySectionPasscode } from '../../firebase';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../firebase', () => ({ verifySectionPasscode: vi.fn() }));

const renderPage = () =>
  render(
    <MemoryRouter>
      <InventoryLogin />
    </MemoryRouter>,
  );

describe('InventoryLogin', () => {
  beforeEach(() => sessionStorage.clear());

  it('matches the snapshot', () => {
    const { asFragment } = renderPage();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the inventory section heading and PIN field', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Inventory Section Login' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter PIN')).toBeInTheDocument();
  });

  it('grants inventory access on a correct passcode', async () => {
    const user = userEvent.setup();
    verifySectionPasscode.mockResolvedValue(true);
    renderPage();

    await user.type(screen.getByPlaceholderText('Enter PIN'), '9999');
    await user.click(screen.getByRole('button', { name: 'Enter' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/inventory', { replace: true }));
    expect(sessionStorage.getItem('inventoryAuth')).toBe('true');
  });

  it('alerts on a wrong passcode', async () => {
    const user = userEvent.setup();
    verifySectionPasscode.mockResolvedValue(false);
    renderPage();

    await user.type(screen.getByPlaceholderText('Enter PIN'), '0000');
    await user.click(screen.getByRole('button', { name: 'Enter' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Wrong Passcode'));
  });

  it('goes back to the dashboard from the back button', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Back to Dashboard' }));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
