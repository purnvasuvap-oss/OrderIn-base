import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Promotions from '../Promotions';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../services/storageService', () => ({
  default: { deleteFileByPath: vi.fn().mockResolvedValue(undefined), uploadFile: vi.fn() },
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <Promotions />
    </MemoryRouter>,
  );

describe('Promotions', () => {
  it('matches the snapshot', async () => {
    const { asFragment } = renderPage();
    await waitFor(() => expect(screen.getByText('No promotions available')).toBeInTheDocument());
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the campaign-builder heading and the form fields', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Create Pop Ad' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter Caption (if any)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter Description (if any)')).toBeInTheDocument();
  });

  it('shows the empty state once the fetch resolves with no promotions', async () => {
    renderPage();
    expect(await screen.findByText('No promotions available')).toBeInTheDocument();
  });

  it('lets the user type a caption and description', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText('Enter Caption (if any)'), 'Weekend Combo');
    await user.type(screen.getByPlaceholderText('Enter Description (if any)'), '20% off');

    expect(screen.getByPlaceholderText('Enter Caption (if any)')).toHaveValue('Weekend Combo');
    expect(screen.getByPlaceholderText('Enter Description (if any)')).toHaveValue('20% off');
  });

  it('navigates back to the menu from the back button', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Back to Menu/ }));

    expect(mockNavigate).toHaveBeenCalledWith('/menu');
  });
});
