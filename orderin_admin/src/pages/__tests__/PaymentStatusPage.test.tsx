import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentStatusPage } from '../PaymentStatusPage';

const mockNavigate = vi.fn();
let searchString = '';
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(searchString), vi.fn()],
  };
});
vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

describe('PaymentStatusPage', () => {
  beforeEach(() => {
    searchString = '';
  });

  it('matches the snapshot for the pending state', () => {
    // Freeze the clock and RNG so the generated txn id + timestamp are stable.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T00:00:00Z'));
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

    const { asFragment } = render(<PaymentStatusPage />);
    expect(asFragment()).toMatchSnapshot();

    randomSpy.mockRestore();
    vi.useRealTimers();
  });

  it('defaults to the pending state when no status param is present', () => {
    render(<PaymentStatusPage />);
    expect(screen.getByRole('heading', { name: 'Payment Pending' })).toBeInTheDocument();
  });

  it('renders the success state when status=success', () => {
    searchString = 'status=success';
    render(<PaymentStatusPage />);
    expect(screen.getByRole('heading', { name: 'Payment Successful!' })).toBeInTheDocument();
  });

  it('renders the failed state when status=failed', () => {
    searchString = 'status=failed';
    render(<PaymentStatusPage />);
    expect(screen.getByRole('heading', { name: 'Payment Failed' })).toBeInTheDocument();
  });

  it('falls back to pending for an unknown status value', () => {
    searchString = 'status=weird';
    render(<PaymentStatusPage />);
    expect(screen.getByRole('heading', { name: 'Payment Pending' })).toBeInTheDocument();
  });

  it('navigates to the returnUrl param when "Return to Dashboard" is clicked', async () => {
    const user = userEvent.setup();
    searchString = 'returnUrl=/settlements';
    render(<PaymentStatusPage />);

    await user.click(screen.getByRole('button', { name: /Return to Dashboard/ }));

    expect(mockNavigate).toHaveBeenCalledWith('/settlements');
  });

  it('shows a generated transaction id', () => {
    render(<PaymentStatusPage />);
    expect(screen.getByText(/^TXN-/)).toBeInTheDocument();
  });
});
