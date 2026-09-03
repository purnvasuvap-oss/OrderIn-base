import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LedgerPage } from '../LedgerPage';
import { useAppStore } from '../../store';
import { applyStoreMock, buildStoreState, makeTransaction } from '../../test/mockStore';

vi.mock('../../store', () => ({ useAppStore: vi.fn() }));
vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

describe('LedgerPage', () => {
  beforeEach(() => {
    applyStoreMock(useAppStore, buildStoreState());
  });

  it('matches the snapshot with no transactions', () => {
    const { asFragment } = render(<LedgerPage />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the heading and the group-by controls', () => {
    render(<LedgerPage />);

    expect(screen.getByRole('heading', { name: 'Finance Ledger' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restaurant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Date' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Payment Method' })).toBeInTheDocument();
  });

  it('shows the empty state when there are no transactions', () => {
    render(<LedgerPage />);
    expect(screen.getByText('No transactions found')).toBeInTheDocument();
  });

  it('shows the loading skeleton while transactions are loading', () => {
    applyStoreMock(useAppStore, buildStoreState({ isLoadingTransactions: true }));

    render(<LedgerPage />);

    expect(screen.queryByText('No transactions found')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[class="card"]').length).toBeGreaterThan(0);
  });

  it('renders grouped transaction data when the store has transactions', () => {
    applyStoreMock(
      useAppStore,
      buildStoreState({
        getFilteredTransactions: vi.fn(() => [
          makeTransaction({ id: 't1', orderId: 'ORD-1', status: 'Paid' }),
        ]),
      }),
    );

    render(<LedgerPage />);

    expect(screen.queryByText('No transactions found')).not.toBeInTheDocument();
    expect(screen.getAllByText('Received by Admin').length).toBeGreaterThan(0);
  });

  it('changes the active grouping when a group-by button is clicked', async () => {
    const user = userEvent.setup();
    render(<LedgerPage />);

    await user.click(screen.getByRole('button', { name: 'Restaurant' }));

    // still rendered, no crash; empty state persists with no data
    expect(screen.getByText('No transactions found')).toBeInTheDocument();
  });
});
