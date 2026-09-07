import { render, screen } from '@testing-library/react';
import OrderAnalyticsPanel from '../OrderAnalytics/OrderAnalyticsPanel';
import { subscribeAllCustomerOrders } from '../../services/orderService';

vi.mock('../../services/orderService', () => ({
  subscribeAllCustomerOrders: vi.fn(() => () => {}),
}));

describe('OrderAnalyticsPanel', () => {
  it('shows the loading state before orders arrive', () => {
    subscribeAllCustomerOrders.mockImplementation(() => () => {});
    render(<OrderAnalyticsPanel />);
    expect(screen.getByText('Loading order analytics...')).toBeInTheDocument();
  });

  it('renders the analytics heading once orders resolve', () => {
    subscribeAllCustomerOrders.mockImplementation((cb) => {
      cb([{ id: 'o1', totalCost: 100, timestamp: Date.now() }]);
      return () => {};
    });
    render(<OrderAnalyticsPanel />);
    expect(screen.getByRole('heading', { name: /Order Counting/ })).toBeInTheDocument();
  });
});
