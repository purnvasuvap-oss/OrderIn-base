import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerApp } from './App';
import type { Gateway } from './types';

const menu = [
  { id: 'dosa', name: 'Masala Dosa', price: 80, priceLarge: 120, diet: 'veg', spice: 'medium', allergens: ['dairy'], station: 'tandoor' },
  { id: 'chicken', name: 'Chicken Chilli', price: 150, diet: 'nonveg', spice: 'hot', allergens: [], station: 'chinese' },
];

function gateway(overrides: Partial<Gateway> = {}): Gateway {
  return {
    resolve: () => ({ restaurantId: 'spice', subdomain: '', tableId: '4' }),
    load: async () => ({
      profile: { name: 'Spice Room', cgstRate: 2.5, sgstRate: 2.5, theme: { preset: 'olive' }, features: {} },
      menu,
    }),
    ensureSession: async () => {},
    place: async () => ({ order: { id: 'o1', total: 126, lines: [{ key: 'dosa', name: 'Masala Dosa', status: 'placed' }] } }),
    request: async () => {},
    payOnline: async () => {},
    feedback: async () => ({ show: false }),
    ...overrides,
  };
}

it('opens the menu without asking for a login', async () => {
  render(<CustomerApp gateway={gateway()} />);
  expect(await screen.findByRole('heading', { name: 'Spice Room' })).toBeInTheDocument();
  expect(screen.getByText('Veg')).toBeInTheDocument();
  expect(screen.getByText('Non-veg')).toBeInTheDocument();
  expect(screen.getByText(/Spice: medium/)).toBeInTheDocument();
  expect(screen.getByText(/Allergens: dairy/)).toBeInTheDocument();
  expect(screen.queryByText(/Packing/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Savings/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Delivery status/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Foodie/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
});

it('asks for a table QR when the link has no restaurant', async () => {
  render(<CustomerApp gateway={gateway({ resolve: () => ({ restaurantId: '', subdomain: '', tableId: '' }) })} />);
  expect(await screen.findByRole('heading', { name: /Scan the QR/ })).toBeInTheDocument();
  expect(screen.queryByText(/Foodie/)).not.toBeInTheDocument();
});

it('prices large separately and can call the waiter', async () => {
  const request = vi.fn(async () => {});
  const user = userEvent.setup();
  render(<CustomerApp gateway={gateway({ request })} />);
  await screen.findByRole('heading', { name: 'Spice Room' });
  await user.click(screen.getByRole('button', { name: 'Call waiter' }));
  expect(request).toHaveBeenCalledWith('call_waiter');
  expect(await screen.findByText('Waiter called.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add large' }));
  await user.click(screen.getByRole('button', { name: /Cart/ }));
  expect(await screen.findByText(/\(large\)/)).toBeInTheDocument();
  expect(screen.getAllByText(/₹120/).length).toBeGreaterThan(0);
  expect(screen.getByText(/CGST/)).toBeInTheDocument();
  expect(screen.getByText(/SGST/)).toBeInTheDocument();
});
