import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RestaurantsPage } from '../RestaurantsPage';
import { useAppStore } from '../../store';
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

describe('RestaurantsPage', () => {
  beforeEach(() => {
    applyStoreMock(useAppStore, buildStoreState());
  });

  it('matches the snapshot when there are no restaurants', () => {
    const { asFragment } = render(<RestaurantsPage />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the heading and the search box', () => {
    render(<RestaurantsPage />);

    expect(screen.getByRole('heading', { name: 'Restaurants' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by name, code, or city...')).toBeInTheDocument();
  });

  it('renders a row for every restaurant in the store', () => {
    applyStoreMock(
      useAppStore,
      buildStoreState({
        restaurants: [
          makeRestaurant({ id: 'r1', Restaurant_name: 'Pizza Place', city: 'Chennai' }),
          makeRestaurant({ id: 'r2', code: 'REST02', Restaurant_name: 'Burger Barn', city: 'Delhi' }),
        ],
      }),
    );

    render(<RestaurantsPage />);

    expect(screen.getByText('Pizza Place')).toBeInTheDocument();
    expect(screen.getByText('Burger Barn')).toBeInTheDocument();
  });

  it('filters the table as the user types in the search box', async () => {
    const user = userEvent.setup();
    applyStoreMock(
      useAppStore,
      buildStoreState({
        restaurants: [
          makeRestaurant({ id: 'r1', Restaurant_name: 'Pizza Place' }),
          makeRestaurant({ id: 'r2', code: 'REST02', Restaurant_name: 'Burger Barn' }),
        ],
      }),
    );
    render(<RestaurantsPage />);

    await user.type(screen.getByPlaceholderText('Search by name, code, or city...'), 'burger');

    expect(screen.queryByText('Pizza Place')).not.toBeInTheDocument();
    expect(screen.getByText('Burger Barn')).toBeInTheDocument();
  });

  it('navigates to the restaurant detail route when a row is clicked', async () => {
    const user = userEvent.setup();
    applyStoreMock(
      useAppStore,
      buildStoreState({
        restaurants: [makeRestaurant({ id: 'r1', code: 'REST01', Restaurant_name: 'Pizza Place' })],
      }),
    );
    render(<RestaurantsPage />);

    await user.click(within(screen.getByText('Pizza Place').closest('tr')!).getByText('Pizza Place'));

    expect(mockNavigate).toHaveBeenCalledWith('/restaurants/REST01');
  });
});
