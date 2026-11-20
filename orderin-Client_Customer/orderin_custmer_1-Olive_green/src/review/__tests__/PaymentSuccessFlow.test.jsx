import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PaymentSuccess from '../../payments/PaymentSuccess';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../context/CartContext', () => ({
  useCart: () => ({ orderHistory: [], clearOrderTempState: vi.fn() }),
}));

describe('Payment successful -> review -> bill', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('orderin_orderId', 'ORD-171126-1');
  });

  it('"View Bill" opens the review step first (it forwards to the bill)', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><PaymentSuccess setIsLoading={vi.fn()} /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'View Bill' }));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/review/));
  });

  it('"Back to Home" goes to the menu with no review popup', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><PaymentSuccess setIsLoading={vi.fn()} /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Back to Home' }));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/menu/));
    expect(screen.queryByText('Rate Your Experience')).not.toBeInTheDocument();
  });
});
