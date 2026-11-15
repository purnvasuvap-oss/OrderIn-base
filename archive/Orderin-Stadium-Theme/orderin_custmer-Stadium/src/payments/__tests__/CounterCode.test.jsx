import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CounterCode from '../CounterCode';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../context/CartContext', () => ({
  useCart: () => ({ orderHistory: [{ id: 42 }], markPaymentSuccessful: vi.fn() }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <CounterCode setIsLoading={vi.fn()} />
    </MemoryRouter>,
  );

describe('CounterCode', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('matches the snapshot', () => {
    const { asFragment } = renderPage();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the verification heading and four digit inputs', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Payment Verification' })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Counter code digit/)).toHaveLength(4);
  });

  it('shows the current order id in the summary', () => {
    renderPage();
    expect(screen.getByText('#42')).toBeInTheDocument();
  });

  it('accepts a digit into the first input', async () => {
    const user = userEvent.setup();
    renderPage();
    const first = screen.getByLabelText('Counter code digit 1');

    await user.type(first, '5');

    expect(first).toHaveValue('5');
  });

  it('navigates back to the cart from the Back button', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Back to Cart' }));

    expect(mockNavigate).toHaveBeenCalled();
  });
});
