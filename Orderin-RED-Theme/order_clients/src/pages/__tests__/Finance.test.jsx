import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Finance from '../Finance';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../services/orderService', () => ({
  formatTime: vi.fn(() => '12:00 PM'),
  subscribeTodaysOrders: vi.fn(() => () => {}),
  subscribeAllCustomerOrders: vi.fn(() => () => {}),
  subscribeOnlineCustomerOrders: vi.fn(() => () => {}),
  acceptOrder: vi.fn().mockResolvedValue(undefined),
  rejectOrder: vi.fn().mockResolvedValue(undefined),
  isOrderAccepted: vi.fn(() => false),
  isOrderPaymentCollected: vi.fn(() => false),
}));
vi.mock('../../components/BillModal', () => ({ default: () => null }));
vi.mock('../../components/RejectReasonModal', () => ({ default: () => null }));
vi.mock('../../components/ManualOrderModal', () => ({
  default: ({ onClose }) => <div data-testid="manual-order-modal"><button onClick={onClose}>x</button></div>,
}));
vi.mock('../../components/SalesTrends/SalesTrendsPanel', () => ({ default: () => <div data-testid="sales-trends" /> }));
vi.mock('../../components/OrderAnalytics/OrderAnalyticsPanel', () => ({ default: () => <div data-testid="order-analytics" /> }));
vi.mock('../../components/CustomerLoyalty/CustomerLoyaltyPanel', () => ({ default: () => <div data-testid="customer-loyalty" /> }));

const renderPage = () =>
  render(
    <MemoryRouter>
      <Finance />
    </MemoryRouter>,
  );

describe('Finance', () => {
  it('matches the snapshot', () => {
    const { asFragment } = renderPage();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the page title and every finance tab', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Financial Management' })).toBeInTheDocument();
    ['DAILY TRANSIT', 'ACCOUNTS', 'EARNINGS CALCULATION', 'LEDGER', 'SALES TRENDS', 'ORDER ANALYTICS', 'CUSTOMER LOYALTY'].forEach(
      (tab) => expect(screen.getByRole('button', { name: tab })).toBeInTheDocument(),
    );
  });

  it('opens on the Daily Transit tab with its manual-order button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Manual Order/i })).toBeInTheDocument();
  });

  it('lazily renders a panel only after its tab is selected', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByTestId('sales-trends')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'SALES TRENDS' }));

    expect(screen.getByTestId('sales-trends')).toBeInTheDocument();
  });

  it('navigates back to the dashboard from the Back button', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
