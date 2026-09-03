import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateRangePicker } from '../DateRangePicker';

// --- Mock the zustand store -------------------------------------------------
const mockSetDateRange = vi.fn();
const mockStoreState: { setDateRange: typeof mockSetDateRange; selectedDateRange: { from: Date; to: Date } | null } = {
  setDateRange: mockSetDateRange,
  selectedDateRange: null,
};

vi.mock('../../store', () => ({
  useAppStore: (selector?: (s: typeof mockStoreState) => unknown) =>
    selector ? selector(mockStoreState) : mockStoreState,
}));

beforeEach(() => {
  mockStoreState.selectedDateRange = null;
});

describe('DateRangePicker', () => {
  it('matches the snapshot in its collapsed state', () => {
    const { asFragment } = render(<DateRangePicker />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('shows the placeholder label when no range is selected', () => {
    // Arrange & Act
    render(<DateRangePicker />);

    // Assert
    expect(screen.getByRole('button', { name: /Select Date Range/ })).toBeInTheDocument();
  });

  it('shows the formatted range when a range is selected', () => {
    // Arrange
    mockStoreState.selectedDateRange = {
      from: new Date(2026, 0, 5),
      to: new Date(2026, 0, 20),
    };

    // Act
    render(<DateRangePicker />);

    // Assert
    expect(screen.getByRole('button', { name: /Jan 05 - Jan 20/ })).toBeInTheDocument();
  });

  it('is collapsed by default and expands on click', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<DateRangePicker />);
    expect(screen.queryByText('Custom Range')).not.toBeInTheDocument();

    // Act
    await user.click(screen.getByRole('button', { name: /Select Date Range/ }));

    // Assert
    expect(screen.getByText('Custom Range')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
  });

  it('calls setDateRange and collapses when a preset is chosen', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<DateRangePicker />);
    await user.click(screen.getByRole('button', { name: /Select Date Range/ }));

    // Act
    await user.click(screen.getByRole('button', { name: 'Today' }));

    // Assert
    expect(mockSetDateRange).toHaveBeenCalledTimes(1);
    const [from, to] = mockSetDateRange.mock.calls[0];
    expect(from).toBeInstanceOf(Date);
    expect(to).toBeInstanceOf(Date);
    expect(screen.queryByText('Custom Range')).not.toBeInTheDocument();
  });

  it('does not apply a custom range until both dates are provided', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<DateRangePicker />);
    await user.click(screen.getByRole('button', { name: /Select Date Range/ }));
    const [fromInput] = document.querySelectorAll('input[type="date"]');

    // Act - fill only the "from" date
    await user.type(fromInput as HTMLInputElement, '2026-01-01');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    // Assert
    expect(mockSetDateRange).not.toHaveBeenCalled();
  });

  it('applies a custom range once both dates are filled', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<DateRangePicker />);
    await user.click(screen.getByRole('button', { name: /Select Date Range/ }));
    const [fromInput, toInput] = document.querySelectorAll('input[type="date"]');

    // Act
    await user.type(fromInput as HTMLInputElement, '2026-01-01');
    await user.type(toInput as HTMLInputElement, '2026-01-31');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    // Assert
    expect(mockSetDateRange).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Custom Range')).not.toBeInTheDocument();
  });
});
