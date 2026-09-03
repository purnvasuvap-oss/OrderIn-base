import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';

// --- Mock react-router navigation ----------------------------------------
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// --- Mock the zustand store --------------------------------------------------
const mockLogout = vi.fn();
const mockStoreState = { logout: mockLogout };
vi.mock('../../store', () => ({
  useAppStore: (selector?: (s: typeof mockStoreState) => unknown) =>
    selector ? selector(mockStoreState) : mockStoreState,
}));

const renderSidebar = (route = '/dashboard') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Sidebar />
    </MemoryRouter>,
  );

describe('Sidebar', () => {
  it('matches the snapshot', () => {
    const { asFragment } = renderSidebar();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders every navigation item as a link', () => {
    // Arrange & Act
    renderSidebar();

    // Assert
    ['Dashboard', 'Restaurants', 'Ledger', 'Settlements', 'Payment Hub', 'Settings'].forEach((label) => {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    });
  });

  it('points each link at the correct route', () => {
    // Arrange & Act
    renderSidebar();

    // Assert
    expect(screen.getByRole('link', { name: /Restaurants/ })).toHaveAttribute('href', '/restaurants');
    expect(screen.getByRole('link', { name: /Payment Hub/ })).toHaveAttribute('href', '/pay');
  });

  it('highlights the active route based on the current location', () => {
    // Arrange & Act
    renderSidebar('/ledger');

    // Assert - active link gets white text via inline style
    expect(screen.getByRole('link', { name: /Ledger/ })).toHaveStyle({ color: 'rgb(255, 255, 255)' });
    expect(screen.getByRole('link', { name: /Dashboard/ })).not.toHaveStyle({ color: 'rgb(255, 255, 255)' });
  });

  it('logs out and redirects to /login when Logout is clicked', async () => {
    // Arrange
    const user = userEvent.setup();
    renderSidebar();

    // Act
    await user.click(screen.getByRole('button', { name: /Logout/ }));

    // Assert
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });
});
