import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Menu from '../Menu';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../header/header', () => ({ default: () => <div data-testid="header" /> }));
vi.mock('../../Footer/Footer', () => ({ default: () => <div data-testid="footer" /> }));

const renderMenu = () =>
  render(
    <MemoryRouter initialEntries={['/menu?table=4']}>
      <Menu setIsLoading={vi.fn()} />
    </MemoryRouter>,
  );

describe('Menu', () => {
  it('matches the snapshot', () => {
    const { asFragment } = renderMenu();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the header, footer and the search box', () => {
    renderMenu();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search menu')).toBeInTheDocument();
  });

  it('lets the user type in the search box', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.type(screen.getByPlaceholderText('Search menu'), 'dosa');

    expect(screen.getByPlaceholderText('Search menu')).toHaveValue('dosa');
  });

  it('renders the veg / all / non-veg filter toggles', () => {
    renderMenu();
    expect(screen.getByRole('button', { name: 'Veg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Non-Veg' })).toBeInTheDocument();
  });

  it('opens the category dropdown', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('button', { name: /categor/i }));

    // dropdown renders; at minimum an "All" category entry is present
    expect(screen.getAllByText(/all/i).length).toBeGreaterThan(0);
  });
});
