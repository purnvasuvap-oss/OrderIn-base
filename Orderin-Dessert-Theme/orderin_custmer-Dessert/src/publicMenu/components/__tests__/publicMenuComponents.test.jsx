import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookEmptyState from '../BookEmptyState';
import PageSkeleton from '../PageSkeleton';
import FinalCTA from '../FinalCTA';
import ChefMessage from '../ChefMessage';
import RestaurantInfo from '../RestaurantInfo';
import OfferPage from '../OfferPage';
import LoginRequiredModal from '../LoginRequiredModal';
import MenuCard from '../MenuCard';
import CategoryPage from '../CategoryPage';
import RestaurantCover from '../RestaurantCover';
import MenuItemQuickView from '../MenuItemQuickView';

const dish = { id: 'd1', name: 'Paneer Tikka', price: '₹220', description: 'Charred cottage cheese', availability: 'Yes' };

describe('BookEmptyState', () => {
  it('shows the default message and no retry button when onRetry is absent', () => {
    render(<BookEmptyState />);
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load/i);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a custom message and calls onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<BookEmptyState message="Menu not found" onRetry={onRetry} />);
    expect(screen.getByText('Menu not found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Try Again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('matches the snapshot', () => {
    const { asFragment } = render(<BookEmptyState message="x" onRetry={vi.fn()} />);
    expect(asFragment()).toMatchSnapshot();
  });
});

describe('PageSkeleton', () => {
  it('renders a loading status region', () => {
    render(<PageSkeleton />);
    expect(screen.getByRole('status', { name: /loading menu/i })).toBeInTheDocument();
  });
});

describe('FinalCTA', () => {
  it('renders the restaurant name and fires onOrderNow', async () => {
    const user = userEvent.setup();
    const onOrderNow = vi.fn();
    render(<FinalCTA restaurantName="Cafe Olive" onOrderNow={onOrderNow} />);
    expect(screen.getByText(/best of Cafe Olive/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Order Now/i }));
    expect(onOrderNow).toHaveBeenCalled();
  });
});

describe('ChefMessage', () => {
  it('renders nothing without chef content', () => {
    const { container } = render(<ChefMessage restaurant={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the chef name and message when present', () => {
    render(<ChefMessage restaurant={{ chefName: 'Chef Ana', chefMessage: 'Cooked with love' }} />);
    expect(screen.getByRole('heading', { name: 'Chef Ana' })).toBeInTheDocument();
    expect(screen.getByText(/Cooked with love/)).toBeInTheDocument();
  });
});

describe('RestaurantInfo', () => {
  it('renders nothing when the restaurant has no info fields', () => {
    const { container } = render(<RestaurantInfo restaurant={{ name: 'X' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the about section with contact rows', () => {
    render(<RestaurantInfo restaurant={{ name: 'Olive', description: 'Fine dining', phone: '9990001234' }} />);
    expect(screen.getByRole('heading', { name: 'About Olive' })).toBeInTheDocument();
    expect(screen.getByText('Fine dining')).toBeInTheDocument();
    expect(screen.getByText('9990001234')).toBeInTheDocument();
  });
});

describe('OfferPage', () => {
  it('renders nothing with no promotions', () => {
    const { container } = render(<OfferPage promotions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each promotion', () => {
    render(
      <OfferPage
        promotions={[
          { id: 'p1', caption: 'Happy Hour', description: '2-for-1 mocktails' },
          { id: 'p2', caption: 'Weekend Feast' },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Special Offers' })).toBeInTheDocument();
    expect(screen.getByText('Happy Hour')).toBeInTheDocument();
    expect(screen.getByText('Weekend Feast')).toBeInTheDocument();
  });
});

describe('LoginRequiredModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<LoginRequiredModal isOpen={false} onLogin={vi.fn()} onContinueBrowsing={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fires onLogin and onContinueBrowsing from its buttons', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    const onContinueBrowsing = vi.fn();
    render(<LoginRequiredModal isOpen onLogin={onLogin} onContinueBrowsing={onContinueBrowsing} />);

    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(onLogin).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Continue Browsing' }));
    expect(onContinueBrowsing).toHaveBeenCalled();
  });

  it('matches the snapshot when open', () => {
    const { asFragment } = render(<LoginRequiredModal isOpen onLogin={vi.fn()} onContinueBrowsing={vi.fn()} />);
    expect(asFragment()).toMatchSnapshot();
  });
});

describe('MenuCard', () => {
  it('renders the dish name and price and fires onSelect / onAdd', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    render(<MenuCard item={dish} onSelect={onSelect} onAdd={onAdd} />);

    expect(screen.getByRole('heading', { name: 'Paneer Tikka' })).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.className === 'pm-price-current' && el.textContent === '₹220.00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Add Paneer Tikka to cart/i }));
    expect(onAdd).toHaveBeenCalledWith(dish);

    await user.click(screen.getByRole('heading', { name: 'Paneer Tikka' }));
    expect(onSelect).toHaveBeenCalledWith(dish);
  });

  it('marks an unavailable dish and disables its Add button', () => {
    render(<MenuCard item={{ ...dish, availability: 'No' }} onSelect={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Paneer Tikka to cart/i })).toBeDisabled();
  });
});

describe('CategoryPage', () => {
  it('renders the title and a card per item', () => {
    render(
      <CategoryPage
        title="Starters"
        items={[dish, { id: 'd2', name: 'Spring Roll', price: '₹120' }]}
        onSelectItem={vi.fn()}
        onAddItem={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Starters' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Paneer Tikka' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Spring Roll' })).toBeInTheDocument();
  });
});

describe('RestaurantCover', () => {
  it('falls back to a plain title when no name/logo is set', () => {
    render(<RestaurantCover restaurant={{}} />);
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
  });

  it('shows the restaurant name and table number', () => {
    render(<RestaurantCover restaurant={{ name: 'Olive Kitchen' }} tableNumber="9" />);
    expect(screen.getByRole('heading', { name: 'Olive Kitchen' })).toBeInTheDocument();
    expect(screen.getByText('Table 9')).toBeInTheDocument();
  });
});

describe('MenuItemQuickView', () => {
  it('renders nothing without an item', () => {
    const { container } = render(<MenuItemQuickView item={null} onClose={vi.fn()} onAdd={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the dish detail and fires onAdd / onClose', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onClose = vi.fn();
    render(<MenuItemQuickView item={dish} onClose={onClose} onAdd={onAdd} />);

    expect(screen.getByRole('heading', { name: 'Paneer Tikka' })).toBeInTheDocument();
    expect(screen.getByText('Charred cottage cheese')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));
    expect(onAdd).toHaveBeenCalledWith(dish);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows "Currently unavailable" instead of an Add button for an unavailable dish', () => {
    render(<MenuItemQuickView item={{ ...dish, availability: 'No' }} onClose={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText('Currently unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to Cart' })).not.toBeInTheDocument();
  });
});
