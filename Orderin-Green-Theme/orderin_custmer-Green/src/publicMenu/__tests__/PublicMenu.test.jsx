import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PublicMenu from '../PublicMenu';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../config/restaurant', () => ({ resolveRestaurantId: () => 'orderin_restaurant_3' }));
vi.mock('../../context/CartContext', () => ({ useCart: () => ({ addToCart: vi.fn() }) }));
// react-pageflip does not work under jsdom — stub the book shell.
vi.mock('../BookLayout', () => ({
  __esModule: true,
  default: ({ pages }) => <div data-testid="book-layout">{pages?.length ?? 0} pages</div>,
  BookPage: ({ children }) => <div>{children}</div>,
}));

const mockData = vi.fn();
vi.mock('../usePublicMenuData', () => ({ usePublicMenuData: () => mockData() }));

const LOADED = {
  loading: false,
  error: null,
  restaurant: { name: 'Olive Kitchen' },
  categories: [{ name: 'Starters', items: [{ id: 'd1', name: 'Paneer Tikka', price: '₹220' }] }],
  popularItems: [],
  todaysSpecialItems: [],
  promotions: [],
  reload: vi.fn(),
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <PublicMenu setIsLoading={vi.fn()} />
    </MemoryRouter>,
  );

describe('PublicMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    mockData.mockReturnValue(LOADED);
  });

  it('shows the page skeleton while loading', () => {
    mockData.mockReturnValue({ ...LOADED, loading: true });
    renderPage();
    expect(screen.getByRole('status', { name: /loading menu/i })).toBeInTheDocument();
  });

  it('shows a "not found" empty state when the restaurant is missing', () => {
    mockData.mockReturnValue({ ...LOADED, error: 'not-found', restaurant: null });
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't find this restaurant/i);
  });

  it('renders the flipbook once the menu loads', () => {
    renderPage();
    expect(screen.getByTestId('book-layout')).toBeInTheDocument();
  });
});
