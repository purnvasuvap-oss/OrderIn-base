import { render, screen } from '@testing-library/react';
import CustomerLoyaltyPanel from '../CustomerLoyalty/CustomerLoyaltyPanel';
import { subscribeAllCustomerOrders } from '../../services/orderService';

vi.mock('../../services/orderService', () => ({
  subscribeAllCustomerOrders: vi.fn(() => () => {}),
}));

describe('CustomerLoyaltyPanel', () => {
  it('shows the loading state before orders arrive', () => {
    subscribeAllCustomerOrders.mockImplementation(() => () => {});
    render(<CustomerLoyaltyPanel />);
    expect(screen.getByText('Loading customer loyalty data...')).toBeInTheDocument();
  });

  it('shows the empty state when there are no customer orders', () => {
    subscribeAllCustomerOrders.mockImplementation((cb) => {
      cb([]);
      return () => {};
    });
    render(<CustomerLoyaltyPanel />);
    expect(screen.getByText('No customer orders found')).toBeInTheDocument();
  });

  it('ranks customers by their order count', () => {
    subscribeAllCustomerOrders.mockImplementation((cb) => {
      cb([
        { username: 'Asha', phoneNumber: '111', totalCost: 200 },
        { username: 'Asha', phoneNumber: '111', totalCost: 300 },
        { username: 'Ravi', phoneNumber: '222', totalCost: 150 },
      ]);
      return () => {};
    });
    render(<CustomerLoyaltyPanel />);

    expect(screen.getByRole('heading', { name: 'Customer Loyalty — Top 10' })).toBeInTheDocument();
    expect(screen.getByText('Asha')).toBeInTheDocument();
    expect(screen.getByText('Ravi')).toBeInTheDocument();
  });
});
