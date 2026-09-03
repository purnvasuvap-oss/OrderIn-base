import { render, screen } from '@testing-library/react';
import { PaymentHubPage } from '../PaymentHubPage';
import { useAppStore } from '../../store';
import { applyStoreMock, buildStoreState, makeRestaurant } from '../../test/mockStore';

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
vi.mock('../../store', () => ({ useAppStore: vi.fn() }));
vi.mock('../../config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
}));

describe('PaymentHubPage', () => {
  beforeEach(() => {
    searchString = '';
    localStorage.clear();
    applyStoreMock(useAppStore, buildStoreState());
  });

  it('matches the snapshot with no order params', () => {
    const { asFragment } = render(<PaymentHubPage />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the Payment Hub heading and the order confirmation card', () => {
    render(<PaymentHubPage />);

    expect(screen.getByRole('heading', { name: 'Payment Hub' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Order Confirmation' })).toBeInTheDocument();
  });

  it('shows "No restaurant selected" when no restaurant data is available', () => {
    render(<PaymentHubPage />);
    expect(screen.getByText('No restaurant selected')).toBeInTheDocument();
  });

  it('reads restaurant details from localStorage payment data', () => {
    localStorage.setItem(
      'paymentData',
      JSON.stringify({ restaurantName: 'Cafe Mocha', restaurantId: 'REST09', ifscCode: 'HDFC0000999', accountNumber: '123456' }),
    );

    render(<PaymentHubPage />);

    expect(screen.getByText('Cafe Mocha')).toBeInTheDocument();
  });

  it('falls back to the store restaurant when the rid param is set', () => {
    searchString = 'rid=r1';
    // Return a stable reference — the page has an effect keyed on the restaurant object.
    const storeRestaurant = makeRestaurant({ id: 'r1', Restaurant_name: 'Store Diner' });
    applyStoreMock(
      useAppStore,
      buildStoreState({
        getRestaurantById: vi.fn(() => storeRestaurant),
      }),
    );

    render(<PaymentHubPage />);

    expect(screen.getByText('Store Diner')).toBeInTheDocument();
  });
});
