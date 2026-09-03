import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Profile from '../Profile';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../Footer/Footer', () => ({ default: () => <div data-testid="footer" /> }));
vi.mock('../../context/CartContext', () => ({
  useCart: () => ({ cartItems: [], addToCart: vi.fn(), orderHistory: [] }),
}));
vi.mock('../../menu/menuStore', () => ({
  menuStore: { get: () => [], set: vi.fn(), subscribe: () => () => {} },
}));

const renderProfile = () =>
  render(
    <MemoryRouter>
      <Profile setIsLoading={vi.fn()} />
    </MemoryRouter>,
  );

describe('Profile', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('user', JSON.stringify({ username: 'Asha', phone: '+919876543210' }));
  });

  it('matches the snapshot', () => {
    const { asFragment } = renderProfile();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the profile title and the stored user name', () => {
    renderProfile();
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Asha' })).toBeInTheDocument();
  });

  it('renders the Orders and Favorites account sections', () => {
    renderProfile();
    expect(screen.getAllByText('Favorites').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Orders').length).toBeGreaterThan(0);
  });

  it('expands the Orders section and shows its empty state', async () => {
    const user = userEvent.setup();
    renderProfile();

    await user.click(screen.getByRole('button', { name: /Orders/ }));

    expect(await screen.findByText('No orders yet')).toBeInTheDocument();
  });
});
