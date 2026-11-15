import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Bill from '../Bill';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('html2pdf.js', () => ({ default: () => ({ set: () => ({ from: () => ({ save: () => Promise.resolve() }) }) }) }));

const mockUseCart = vi.fn();
vi.mock('../context/CartContext', () => ({ useCart: () => mockUseCart() }));

const order = {
  id: 555,
  items: [{ name: 'Dosa', price: '₹120', quantity: 2 }],
  subtotal: '240.00',
  taxes: '12.00',
  total: '252.00',
  paymentMethod: 'UPI',
  timestamp: new Date('2026-02-01T10:00:00Z').toISOString(),
};

const renderBill = () =>
  render(
    <MemoryRouter>
      <Bill />
    </MemoryRouter>,
  );

describe('Bill', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockUseCart.mockReturnValue({ orderHistory: [order] });
  });

  it('renders the "Receipt Not Available" state when there is no order', () => {
    mockUseCart.mockReturnValue({ orderHistory: [] });
    renderBill();
    expect(screen.getByRole('heading', { name: 'Receipt Not Available' })).toBeInTheDocument();
  });

  it('renders the receipt with items, totals and payment method', () => {
    renderBill();
    expect(screen.getByText('Dosa')).toBeInTheDocument();
    expect(screen.getByText('₹252.00')).toBeInTheDocument();
    expect(screen.getByText('UPI')).toBeInTheDocument();
    expect(screen.getByText('Order ID: 555')).toBeInTheDocument();
  });

  it('navigates back to the menu from the Done button', async () => {
    const user = userEvent.setup();
    renderBill();

    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/menu'));
  });
});
