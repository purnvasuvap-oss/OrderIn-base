import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';

const renderAt = (initial) =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/" element={<div>login screen</div>} />
        <Route
          path="/secret"
          element={
            <ProtectedRoute>
              <div>secret content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('ProtectedRoute', () => {
  afterEach(() => localStorage.clear());

  it('redirects to "/" when there is no auth flag', () => {
    renderAt('/secret');
    expect(screen.getByText('login screen')).toBeInTheDocument();
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
  });

  it('renders the children when the auth flag is set', () => {
    localStorage.setItem('auth', 'true');
    renderAt('/secret');
    expect(screen.getByText('secret content')).toBeInTheDocument();
  });
});
