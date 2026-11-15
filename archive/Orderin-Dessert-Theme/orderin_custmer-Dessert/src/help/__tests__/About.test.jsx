import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import About from '../About';
import OrderInAbout from '../OrderInAbout';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderCmp = (Cmp) =>
  render(
    <MemoryRouter>
      <Cmp />
    </MemoryRouter>,
  );

describe('About (restaurant)', () => {
  it('matches the snapshot', () => {
    const { asFragment } = renderCmp(About);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the restaurant name heading', () => {
    renderCmp(About);
    expect(screen.getByRole('heading', { name: "Foodie's Paradise" })).toBeInTheDocument();
  });

  it('navigates back to the menu from the back control', async () => {
    const user = userEvent.setup();
    renderCmp(About);
    await user.click(screen.getByRole('button', { name: /Back to Menu/i }));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/menu'));
  });
});

describe('OrderInAbout', () => {
  it('matches the snapshot', () => {
    const { asFragment } = renderCmp(OrderInAbout);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the About and Our Services sections', () => {
    renderCmp(OrderInAbout);
    expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Our Services' })).toBeInTheDocument();
  });

  it('navigates home from the back control', async () => {
    const user = userEvent.setup();
    renderCmp(OrderInAbout);
    await user.click(screen.getByRole('button', { name: /Back to Menu/i }));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/menu'));
  });
});
