import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaffApp } from './App';
import type { FloorData, StaffGateway, StaffUser } from './types';

const floor: FloorData = {
  profile: { name: 'Spice Room' },
  menu: [],
  orders: [{
    id: 'o1',
    tableId: '1',
    status: 'open',
    total: 105,
    cgst: 2.5,
    sgst: 2.5,
    createdAt: new Date().toISOString(),
    lines: [
      { key: 'dosa', name: 'Dosa', qty: 1, status: 'placed', station: 'tandoor' },
      { key: 'drink', name: 'Lime soda', qty: 1, status: 'placed', station: 'bar' },
    ],
  }],
  tables: [{ id: '1', label: '1', status: 'ordered' }],
  requests: [{ id: 'r1', tableId: '1', type: 'call_waiter', status: 'open' }],
  customers: [{ id: 'c1', phone: '9876543210', name: 'Asha', optIn: true, visitCount: 3, spend: 900, favouriteDish: 'Dosa', points: 40, stamps: 3 }],
  reservations: [],
};

function gateway(user: StaffUser, overrides: Partial<StaffGateway> = {}): StaffGateway {
  return {
    login: async () => user,
    logout: async () => {},
    load: async () => floor,
    saveProfile: async () => {},
    importMenu: async () => 1,
    saveTables: async () => ['https://menu.example/?r=spice&table=1'],
    createStaff: async () => {},
    updateItem: async () => {},
    ack: async () => {},
    move: async () => {},
    discount: async () => {},
    voidOrder: async () => {},
    closeDay: async () => ({ variance: 0 }),
    issueCode: async () => '1234',
    split: async () => {},
    reserve: async () => {},
    payroll: async () => ({}),
    clock: async () => {},
    addOutlet: async () => ['spice', 'spice-2'],
    printOrder: async () => 'Sent to the print bridge',
    ...overrides,
  };
}

const owner: StaffUser = { uid: 'u1', email: 'owner@spice.example', name: 'Owner', role: 'owner', restaurantId: 'spice', restaurantIds: ['spice'] };
const kitchen: StaffUser = { uid: 'u2', email: 'kitchen@spice.example', name: 'Kitchen', role: 'kitchen', restaurantId: 'spice', restaurantIds: ['spice'] };

async function signIn(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), 'a real password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

it('does not store an auth flag in the browser', async () => {
  localStorage.clear();
  const user = userEvent.setup();
  render(<StaffApp gateway={gateway(owner)} />);
  await signIn(user, owner.email);
  expect(await screen.findByRole('heading', { name: 'Tables' })).toBeInTheDocument();
  expect(localStorage.getItem('auth')).toBeNull();
  expect(localStorage.length).toBe(0);
  expect(screen.queryByText('admin123')).not.toBeInTheDocument();
});

it('shows the kitchen only the stations, not payroll', async () => {
  const user = userEvent.setup();
  render(<StaffApp gateway={gateway(kitchen)} />);
  await signIn(user, kitchen.email);
  expect(await screen.findByRole('heading', { name: 'Kitchen' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'tandoor' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'bar' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Payroll' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Mark served' })).not.toBeInTheDocument();
});

it('previews a negative salary instead of saving it', async () => {
  const user = userEvent.setup();
  render(<StaffApp gateway={gateway(owner)} />);
  await signIn(user, owner.email);
  await user.click(await screen.findByRole('button', { name: 'Payroll' }));
  await user.clear(screen.getByLabelText('Agreed pay'));
  await user.type(screen.getByLabelText('Agreed pay'), '50');
  await user.clear(screen.getByLabelText('Tax'));
  await user.type(screen.getByLabelText('Tax'), '200');
  await user.click(screen.getByRole('button', { name: 'Preview net' }));
  expect(await screen.findByText(/below zero/)).toBeInTheDocument();
});

it('imports a menu sheet and prints table QR links', async () => {
  const user = userEvent.setup();
  const importMenu = vi.fn(async () => 1);
  render(<StaffApp gateway={gateway(owner, { importMenu })} />);
  await signIn(user, owner.email);
  await user.click(await screen.findByRole('button', { name: 'Setup' }));
  await user.type(screen.getByLabelText('Menu CSV'), 'Dosa,80,Tiffin,veg,tandoor,dairy,medium,120');
  await user.click(screen.getByRole('button', { name: 'Import menu' }));
  expect(importMenu).toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Make table QR codes' }));
  expect(await screen.findByRole('link')).toHaveAttribute('href', expect.stringContaining('table='));
});
