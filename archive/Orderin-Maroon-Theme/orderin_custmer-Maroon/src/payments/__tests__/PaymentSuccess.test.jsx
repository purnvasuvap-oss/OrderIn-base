import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PaymentSuccess from '../PaymentSuccess';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../context/CartContext', () => ({
  useCart: () => ({ orderHistory: [], markPaymentSuccessful: vi.fn(), clearCart: vi.fn(), clearOrderTempState: vi.fn() }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <PaymentSuccess setIsLoading={vi.fn()} />
    </MemoryRouter>,
  );

describe('PaymentSuccess', () => {
  it('matches the snapshot', () => {
    const { asFragment } = renderPage();
    expect(asFragment()).toMatchSnapshot();
  });

  it('shows the success heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Payment Successful!' })).toBeInTheDocument();
  });

  it('disables the "View Bill" button until an order id resolves', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /View Bill/i })).toBeDisabled();
  });
});
