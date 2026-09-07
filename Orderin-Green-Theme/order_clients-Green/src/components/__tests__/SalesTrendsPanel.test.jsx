import { render, screen, waitFor } from '@testing-library/react';
import SalesTrendsPanel from '../SalesTrends/SalesTrendsPanel';

vi.mock('../../services/salesTrendService', () => ({
  fetchAllOrdersFlat: vi.fn().mockResolvedValue([]),
  fetchMenuTypeMap: vi.fn().mockResolvedValue({}),
  buildWeekdayTrends: vi.fn(() => []),
  buildMonthlyTrends: vi.fn(() => []),
  buildDishInsights: vi.fn(() => []),
}));

describe('SalesTrendsPanel', () => {
  it('shows the loading state first', () => {
    render(<SalesTrendsPanel />);
    expect(screen.getByText('Crunching order history...')).toBeInTheDocument();
  });

  it('renders the trends heading after the data loads', async () => {
    render(<SalesTrendsPanel />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Day-of-Week Sales Trends' })).toBeInTheDocument(),
    );
  });
});
