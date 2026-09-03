import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Topbar } from '../Topbar';

// --- Mock the zustand store --------------------------------------------------
const mockSetSearchQuery = vi.fn();
const mockSetDateRange = vi.fn();
const mockStoreState = {
  searchQuery: '',
  setSearchQuery: mockSetSearchQuery,
  setDateRange: mockSetDateRange,
  selectedDateRange: null as { from: Date; to: Date } | null,
};

vi.mock('../../store', () => ({
  useAppStore: (selector?: (s: typeof mockStoreState) => unknown) =>
    selector ? selector(mockStoreState) : mockStoreState,
}));

beforeEach(() => {
  mockStoreState.searchQuery = '';
});

describe('Topbar', () => {
  it('matches the snapshot', () => {
    const { asFragment } = render(<Topbar />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the search input and the admin control', () => {
    // Arrange & Act
    render(<Topbar />);

    // Assert
    expect(screen.getByPlaceholderText(/Search restaurants, orders, transactions/)).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('reflects the current searchQuery from the store', () => {
    // Arrange
    mockStoreState.searchQuery = 'pizza';

    // Act
    render(<Topbar />);

    // Assert
    expect(screen.getByPlaceholderText(/Search restaurants/)).toHaveValue('pizza');
  });

  it('calls setSearchQuery on every keystroke', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Topbar />);

    // Act
    await user.type(screen.getByPlaceholderText(/Search restaurants/), 'abc');

    // Assert
    expect(mockSetSearchQuery).toHaveBeenCalledTimes(3);
    expect(mockSetSearchQuery).toHaveBeenLastCalledWith('c');
  });

  it('embeds the DateRangePicker', () => {
    // Arrange & Act
    render(<Topbar />);

    // Assert
    expect(screen.getByRole('button', { name: /Select Date Range/ })).toBeInTheDocument();
  });
});
