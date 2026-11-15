import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ItemDetails from '../ItemDetails';

const mockNavigate = vi.fn();
let mockParams = { id: 'dosa' };
let mockLocation = { state: null, pathname: '/item/dosa', search: '' };
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
    useLocation: () => mockLocation,
  };
});
vi.mock('../../Footer/Footer', () => ({ default: () => <div data-testid="footer" /> }));

const addToCart = vi.fn();
vi.mock('../../context/CartContext', () => ({
  useCart: () => ({ cartItems: [], addToCart }),
}));

const item = {
  id: 'dosa',
  name: 'Masala Dosa',
  price: '₹120',
  description: 'Crispy rice crepe',
  image: 'https://example.com/dosa.png',
  availability: 'Yes',
};

const renderDetails = () =>
  render(
    <MemoryRouter>
      <ItemDetails setIsLoading={vi.fn()} />
    </MemoryRouter>,
  );

describe('ItemDetails', () => {
  beforeEach(() => {
    mockParams = { id: 'dosa' };
    mockLocation = { state: { item }, pathname: '/item/dosa', search: '' };
  });

  it('matches the snapshot', () => {
    const { asFragment } = renderDetails();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the item title, description and total price', () => {
    renderDetails();
    expect(screen.getByRole('heading', { name: 'Masala Dosa' })).toBeInTheDocument();
    expect(screen.getByText('Crispy rice crepe')).toBeInTheDocument();
    expect(screen.getByText('₹120.00')).toBeInTheDocument();
  });

  it('increments the quantity and updates the total price', async () => {
    const user = userEvent.setup();
    const { container } = renderDetails();
    const [, plusBtn] = container.querySelectorAll('.qty-btn');

    await user.click(plusBtn);

    expect(screen.getByText('₹240.00')).toBeInTheDocument();
  });

  it('adds the item to the cart through the instructions modal', async () => {
    const user = userEvent.setup();
    renderDetails();

    await user.click(screen.getByRole('button', { name: /Add to Cart/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(addToCart).toHaveBeenCalled();
  });

  it('shows the loading state while an item without router state is fetched', () => {
    mockLocation = { state: null, pathname: '/item/dosa', search: '' };
    renderDetails();
    expect(screen.getByText('Loading item details...')).toBeInTheDocument();
  });
});
