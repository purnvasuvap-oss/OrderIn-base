import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';

const mockAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth() }));

const renderAt = (initial, navKey) =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/login" element={<div>login screen</div>} />
        <Route path="/pos" element={<div>pos screen</div>} />
        <Route path="/dashboard" element={<div>dashboard screen</div>} />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute navKey={navKey}>
              <div>inventory screen</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('ProtectedRoute', () => {
  it('renders nothing until auth is ready', () => {
    mockAuth.mockReturnValue({ ready: false, user: null });
    const { container } = renderAt('/inventory');
    expect(container).toBeEmptyDOMElement();
  });

  it('redirects to /login when there is no user', () => {
    mockAuth.mockReturnValue({ ready: true, user: null });
    renderAt('/inventory');
    expect(screen.getByText('login screen')).toBeInTheDocument();
  });

  it('renders children when the user has access to the nav key', () => {
    mockAuth.mockReturnValue({ ready: true, user: { role: 'admin' } });
    renderAt('/inventory', 'inventory');
    expect(screen.getByText('inventory screen')).toBeInTheDocument();
  });

  it("redirects to the role home when the user lacks access", () => {
    mockAuth.mockReturnValue({ ready: true, user: { role: 'cashier' } });
    renderAt('/inventory', 'inventory');
    expect(screen.getByText('pos screen')).toBeInTheDocument();
  });
});
