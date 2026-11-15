import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';

const renderAt = (initial) =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/" element={<div>login page</div>} />
        <Route
          path="/menu"
          element={
            <ProtectedRoute>
              <div>menu page</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('ProtectedRoute', () => {
  afterEach(() => localStorage.clear());

  it('redirects to "/" when there is no stored user', () => {
    renderAt('/menu');
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('menu page')).not.toBeInTheDocument();
  });

  it('renders children when a user is stored', () => {
    localStorage.setItem('user', JSON.stringify({ phone: '9999999999' }));
    renderAt('/menu');
    expect(screen.getByText('menu page')).toBeInTheDocument();
  });
});
