import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SectionProtectedRoute from '../SectionProtectedRoute';

const renderAt = (initial) =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/menu-login" element={<div>menu login</div>} />
        <Route
          path="/menu"
          element={
            <SectionProtectedRoute storageKey="menuAuth" redirectTo="/menu-login">
              <div>menu content</div>
            </SectionProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('SectionProtectedRoute', () => {
  afterEach(() => sessionStorage.clear());

  it('redirects to redirectTo when the section flag is missing', () => {
    renderAt('/menu');
    expect(screen.getByText('menu login')).toBeInTheDocument();
  });

  it('redirects when the section flag is not exactly "true"', () => {
    sessionStorage.setItem('menuAuth', '1');
    renderAt('/menu');
    expect(screen.getByText('menu login')).toBeInTheDocument();
  });

  it('renders children when the section flag is "true"', () => {
    sessionStorage.setItem('menuAuth', 'true');
    renderAt('/menu');
    expect(screen.getByText('menu content')).toBeInTheDocument();
  });
});
