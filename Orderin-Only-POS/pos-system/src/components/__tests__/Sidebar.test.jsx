import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';

const mockAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth() }));

const renderSidebar = (props = {}) =>
  render(
    <MemoryRouter>
      <Sidebar open onClose={vi.fn()} {...props} />
    </MemoryRouter>,
  );

describe('Sidebar', () => {
  it('renders the full nav for an admin', () => {
    mockAuth.mockReturnValue({ user: { role: 'admin' } });
    renderSidebar();

    expect(screen.getByText('Orderin POS')).toBeInTheDocument();
    ['Dashboard', 'POS', 'Kitchen', 'Inventory', 'Settings', 'Audit Log'].forEach((label) =>
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument(),
    );
  });

  it('shows only the cashier-allowed links for a cashier', () => {
    mockAuth.mockReturnValue({ user: { role: 'cashier' } });
    renderSidebar();

    expect(screen.getByRole('link', { name: /POS/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Inventory/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Audit Log/ })).not.toBeInTheDocument();
  });

  it('points each link at its route', () => {
    mockAuth.mockReturnValue({ user: { role: 'admin' } });
    renderSidebar();
    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /Kitchen/ })).toHaveAttribute('href', '/kitchen');
  });
});
