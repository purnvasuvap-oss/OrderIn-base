import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AwaitingConfirmation from '../AwaitingConfirmation';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../context/CartContext', () => ({
  useCart: () => ({ clearCart: vi.fn(), clearOrderTempState: vi.fn() }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <AwaitingConfirmation />
    </MemoryRouter>,
  );

describe('AwaitingConfirmation', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('matches the snapshot', () => {
    const { asFragment } = renderPage();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the confirmation header and the waiting state', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Order Confirmation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Awaiting Confirmation' })).toBeInTheDocument();
  });

  it('navigates back to the menu from the back button', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(container.querySelector('.awaiting-back-btn'));

    expect(mockNavigate).toHaveBeenCalled();
  });
});
