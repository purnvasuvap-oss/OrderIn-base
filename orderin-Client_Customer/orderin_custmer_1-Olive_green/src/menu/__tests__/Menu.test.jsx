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
vi.mock('../menuStore', () => {
  let products = [];
  return {
    menuStore: {
      get: () => products,
      set: (v) => { products = v; },
      subscribe: () => () => {},
    },
  };
});

const renderMenu = () =>
  render(
    <MemoryRouter initialEntries={['/menu?table=4']}>
      <Menu setIsLoading={vi.fn()} />
    </MemoryRouter>,
  );

describe('Menu', () => {
  it('matches the snapshot', () => {
    // The hero shows a time-of-day greeting — freeze the clock so it is stable.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T10:00:00"));
    const { asFragment } = renderMenu();
    expect(asFragment()).toMatchSnapshot();
    vi.useRealTimers();
  });

  it('renders the hero title and the search box', () => {
    renderMenu();
    expect(screen.getByRole('heading', { name: 'Our Restaurant' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search for dishes, cuisines...')).toBeInTheDocument();
  });

  it('lets the user type in the search box', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.type(screen.getByPlaceholderText('Search for dishes, cuisines...'), 'dosa');

    expect(screen.getByPlaceholderText('Search for dishes, cuisines...')).toHaveValue('dosa');
  });

  it('renders the category filter buttons', () => {
    renderMenu();
    // "All" category tab is always present in the filter row
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
  });
});
