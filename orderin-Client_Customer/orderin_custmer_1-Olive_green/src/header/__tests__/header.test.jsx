import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from '../header';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../context/CartContext', () => ({ useCart: () => ({ currentTableNo: '7' }) }));

const renderHeader = () =>
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );

describe('Header', () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('matches the snapshot', () => {
    const { asFragment } = renderHeader();
    expect(asFragment()).toMatchSnapshot();
  });

  it('shows the current table number', () => {
    renderHeader();
    expect(screen.getByText('Table 7')).toBeInTheDocument();
  });

  it('keeps the side menu closed until the menu icon is clicked', async () => {
    const user = userEvent.setup();
    const { container } = renderHeader();
    expect(container.querySelector('.side-menu')).not.toHaveClass('open');

    await user.click(container.querySelector('.menu-icon'));

    expect(container.querySelector('.side-menu')).toHaveClass('open');
    expect(screen.getByText('About OrderIn')).toBeVisible();
  });

  it('navigates to /about-orderin from the side menu', async () => {
    const user = userEvent.setup();
    const { container } = renderHeader();
    await user.click(container.querySelector('.menu-icon'));

    await user.click(screen.getByText('About OrderIn'));

    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/about-orderin'));
  });

  it('clears user storage and navigates to /login on logout', async () => {
    const user = userEvent.setup();
    localStorage.setItem('user', JSON.stringify({ phone: '1' }));
    const { container } = renderHeader();
    await user.click(container.querySelector('.menu-icon'));

    await user.click(screen.getByText('Logout'));

    expect(localStorage.getItem('user')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
