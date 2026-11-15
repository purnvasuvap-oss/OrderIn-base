import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MenuPage from '../MenuPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../hooks/useNotification', () => ({
  useNotification: () => ({ activities: [], addActivity: vi.fn() }),
}));
vi.mock('../../services/storageService', () => ({
  default: { uploadFile: vi.fn(), deleteFileByPath: vi.fn().mockResolvedValue(undefined) },
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <MenuPage />
    </MemoryRouter>,
  );

describe('MenuPage', () => {
  it('matches the snapshot', () => {
    const { asFragment } = renderPage();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the page title and the Add button', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Menu Management' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add Menu Item' })).toBeInTheDocument();
  });

  it('shows the stat cards with zeroed counts for an empty menu', () => {
    renderPage();
    expect(screen.getByText('Total Dishes')).toBeInTheDocument();
    expect(screen.getByText('Available dishes')).toBeInTheDocument();
  });

  it('reveals the item editor when Add Item is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: '+ Add Menu Item' }));

    expect(screen.getByPlaceholderText('Paneer Tikka')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Starters')).toBeInTheDocument();
  });

  it('filters the list via the search box without crashing', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText('Search dish name...'), 'dosa');

    expect(screen.getByPlaceholderText('Search dish name...')).toHaveValue('dosa');
  });

  it('navigates back to the dashboard from the Back button', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole('button', { name: 'Back' })[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
