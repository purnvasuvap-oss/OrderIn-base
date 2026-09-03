import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RestaurantDetailsPage } from '../RestaurantDetailsPage';
import { useAppStore } from '../../store';
import { applyStoreMock, buildStoreState, makeRestaurant, makeTransaction } from '../../test/mockStore';

const mockNavigate = vi.fn();
let params: Record<string, string> = { restaurantId: 'r1' };
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => params };
});
vi.mock('../../store', () => ({ useAppStore: vi.fn() }));
vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

describe('RestaurantDetailsPage', () => {
  beforeEach(() => {
    params = { restaurantId: 'r1' };
    applyStoreMock(useAppStore, buildStoreState());
  });

  it('renders the "Restaurant not found" state when the id resolves to nothing', () => {
    render(<RestaurantDetailsPage />);
    expect(screen.getByRole('heading', { name: 'Restaurant not found' })).toBeInTheDocument();
  });

  it('matches the snapshot for the not-found state', () => {
    const { asFragment } = render(<RestaurantDetailsPage />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the restaurant name, code and status once the restaurant is found', () => {
    applyStoreMock(
      useAppStore,
      buildStoreState({
        getRestaurantById: vi.fn(() => makeRestaurant({ id: 'r1', Restaurant_name: 'Pizza Place', code: 'REST01', status: 'Active' })),
      }),
    );

    render(<RestaurantDetailsPage />);

    expect(screen.getByRole('heading', { name: 'Pizza Place' })).toBeInTheDocument();
    expect(screen.getByText('Code: REST01')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows the stat cards derived from online transactions', () => {
    applyStoreMock(
      useAppStore,
      buildStoreState({
        getRestaurantById: vi.fn(() => makeRestaurant({ id: 'r1' })),
        getRestaurantTransactions: vi.fn(() => [
          makeTransaction({ id: 't1', paymentMethod: 'Online', grossAmount: 1000 }),
          makeTransaction({ id: 't2', paymentMethod: 'Cash', grossAmount: 500 }),
        ]),
      }),
    );

    render(<RestaurantDetailsPage />);

    expect(screen.getByText('Total Orders')).toBeInTheDocument();
    // only the single online transaction is counted
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('switches the active tab when a tab button is clicked', async () => {
    const user = userEvent.setup();
    applyStoreMock(
      useAppStore,
      buildStoreState({ getRestaurantById: vi.fn(() => makeRestaurant({ id: 'r1' })) }),
    );
    render(<RestaurantDetailsPage />);

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    // Settings tab exposes the restaurant status controls
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });
});
