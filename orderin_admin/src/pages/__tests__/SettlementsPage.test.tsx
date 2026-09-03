import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettlementsPage } from '../SettlementsPage';
import { useAppStore } from '../../store';
import type { Settlement } from '../../types';
import { applyStoreMock, buildStoreState, makeRestaurant } from '../../test/mockStore';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../store', () => ({ useAppStore: vi.fn() }));
vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

const currentMonthKey = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });

const makeSettlement = (overrides: Partial<Settlement> = {}): Settlement => ({
  settlementId: 'settlement_r1',
  restaurantId: 'r1',
  restaurantName: 'Test Diner',
  defaultSettlementAmount: 5000,
  defaultSettlementStartDate: Date.now(),
  currentOverpayment: 0,
  settlements: {
    [currentMonthKey]: {
      period: currentMonthKey,
      totalAmountDue: 5000,
      totalPaid: 5000,
      status: 'Paid',
      installments: 1,
      cycleStartDate: Date.now(),
      paymentHistory: [{ id: 'p1', amount: 5000, date: Date.now(), timestamp: Date.now() }],
    },
  },
  ...overrides,
});

describe('SettlementsPage', () => {
  beforeEach(() => {
    applyStoreMock(useAppStore, buildStoreState());
  });

  it('matches the snapshot with no settlements', () => {
    const { asFragment } = render(<SettlementsPage />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the page heading', () => {
    render(<SettlementsPage />);
    expect(screen.getByRole('heading', { name: 'Settlements' })).toBeInTheDocument();
  });

  it('shows a fully-paid settlement row as "Paid"', () => {
    applyStoreMock(
      useAppStore,
      buildStoreState({
        restaurants: [makeRestaurant({ id: 'r1', status: 'Active' })],
        settlements: [makeSettlement()],
      }),
    );

    render(<SettlementsPage />);

    expect(screen.getByText('Test Diner')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('shows a partially-paid active settlement as "Unpaid"', () => {
    applyStoreMock(
      useAppStore,
      buildStoreState({
        restaurants: [makeRestaurant({ id: 'r1', status: 'Active' })],
        settlements: [
          makeSettlement({
            settlements: {
              [currentMonthKey]: {
                period: currentMonthKey,
                totalAmountDue: 5000,
                totalPaid: 1000,
                status: 'Pending',
                installments: 1,
                cycleStartDate: Date.now(),
                paymentHistory: [{ id: 'p1', amount: 1000, date: Date.now(), timestamp: Date.now() }],
              },
            },
          }),
        ],
      }),
    );

    render(<SettlementsPage />);

    expect(screen.getByText('Unpaid')).toBeInTheDocument();
  });

  it('navigates to the restaurant page when a settlement row is clicked', async () => {
    const user = userEvent.setup();
    applyStoreMock(
      useAppStore,
      buildStoreState({
        restaurants: [makeRestaurant({ id: 'r1', status: 'Active' })],
        settlements: [makeSettlement()],
      }),
    );
    render(<SettlementsPage />);

    await user.click(screen.getByText('Test Diner'));

    expect(mockNavigate).toHaveBeenCalledWith('/restaurants/r1');
  });
});
