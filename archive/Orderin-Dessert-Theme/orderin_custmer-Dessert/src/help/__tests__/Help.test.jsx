import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Help from '../Help';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderHelp = (route = '/help') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Help setIsLoading={vi.fn()} />
    </MemoryRouter>,
  );

describe('Help', () => {
  it('matches the snapshot', () => {
    const { asFragment } = renderHelp();
    expect(asFragment()).toMatchSnapshot();
  });

  it('opens the Ordering Help section by default', () => {
    renderHelp();
    expect(screen.getByRole('button', { name: 'Ordering Help' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the section named in the ?section= query param', () => {
    renderHelp('/help?section=faq');
    expect(screen.getByRole('button', { name: 'Quick FAQs' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles a section open and closed on click', async () => {
    const user = userEvent.setup();
    renderHelp();
    const faq = screen.getByRole('button', { name: 'Quick FAQs' });

    await user.click(faq);
    expect(faq).toHaveAttribute('aria-expanded', 'true');

    await user.click(faq);
    expect(faq).toHaveAttribute('aria-expanded', 'false');
  });

  it('reveals the contact form with its Send button', async () => {
    const user = userEvent.setup();
    renderHelp();

    await user.click(screen.getByRole('button', { name: 'Contact Help' }));

    expect(screen.getByPlaceholderText('you@domain.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('navigates back to the menu from the Back button', async () => {
    const user = userEvent.setup();
    renderHelp();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/menu'));
  });
});
