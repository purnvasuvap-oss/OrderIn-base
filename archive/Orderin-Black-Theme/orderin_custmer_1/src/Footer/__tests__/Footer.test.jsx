import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Footer from '../Footer';

const mockUseCart = vi.fn();
vi.mock('../../context/CartContext', () => ({ useCart: () => mockUseCart() }));

const renderFooter = (props = {}, route = '/menu') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Footer {...props} />
    </MemoryRouter>,
  );

describe('Footer', () => {
  beforeEach(() => mockUseCart.mockReturnValue({ cartItems: [] }));

  it('matches the snapshot', () => {
    const { asFragment } = renderFooter();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the Home, Cart and Profile tabs', () => {
    renderFooter();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Cart')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('does not show the cart badge when the cart is empty', () => {
    renderFooter();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('shows the summed quantity badge and caps it at 99+', () => {
    mockUseCart.mockReturnValue({ cartItems: [{ quantity: 60 }, { quantity: 45 }] });
    renderFooter();
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('fires the tab callbacks when clicked', async () => {
    const user = userEvent.setup();
    const onHomeClick = vi.fn();
    const onCartClick = vi.fn();
    const onProfileClick = vi.fn();
    renderFooter({ onHomeClick, onCartClick, onProfileClick });

    await user.click(screen.getByText('Home'));
    await user.click(screen.getByText('Cart'));
    await user.click(screen.getByText('Profile'));

    expect(onHomeClick).toHaveBeenCalled();
    expect(onCartClick).toHaveBeenCalled();
    expect(onProfileClick).toHaveBeenCalled();
  });
});
