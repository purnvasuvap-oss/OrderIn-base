import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ReviewPage from '../ReviewPage';
import { hasCustomerReviewed, saveCustomerReview, AlreadyReviewedError, readLoggedInUser } from '../reviewService';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../context/CartContext', () => ({ useCart: () => ({ orderHistory: [{ id: 'ORD-9' }] }) }));
vi.mock('../../hooks/useTableNumber', () => ({ useTableNumber: () => ({ getPathWithTable: (p) => `${p}?table=3` }) }));
vi.mock('../reviewService', () => {
  class AlreadyReviewedError extends Error {}
  return { AlreadyReviewedError, hasCustomerReviewed: vi.fn(), saveCustomerReview: vi.fn(), readLoggedInUser: vi.fn() };
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <ReviewPage />
    </MemoryRouter>
  );

const BILL = ['/bill?table=3', { replace: true }];

describe('ReviewPage', () => {
  beforeEach(() => {
    localStorage.clear();
    readLoggedInUser.mockReturnValue({ username: 'Ravi', phone: '+911' });
    hasCustomerReviewed.mockResolvedValue(false);
    saveCustomerReview.mockResolvedValue({});
  });

  it('asks a customer who has not reviewed yet', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'How was your meal?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit & view bill' })).toBeDisabled();
  });

  it('goes straight to the bill when the customer has already reviewed', async () => {
    hasCustomerReviewed.mockResolvedValue(true);
    renderPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(...BILL));
    expect(screen.queryByRole('heading', { name: 'How was your meal?' })).not.toBeInTheDocument();
  });

  it('goes straight to the bill when nobody is logged in', async () => {
    readLoggedInUser.mockReturnValue(null);
    renderPage();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(...BILL));
    expect(hasCustomerReviewed).not.toHaveBeenCalled();
  });

  it('saves the review, then shows the bill', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('radio', { name: '4 stars' }));
    expect(screen.getByText('Very good')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'Lovely dosa');
    await user.click(screen.getByRole('button', { name: 'Submit & view bill' }));
    expect(saveCustomerReview).toHaveBeenCalledWith('+911', { stars: 4, text: 'Lovely dosa', orderId: 'ORD-9' });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(...BILL));
  });

  it('lets the customer skip straight to the bill without saving', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Skip & view bill' }));
    expect(saveCustomerReview).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(...BILL);
  });

  it('goes to the bill if a review was saved meanwhile (e.g. on another phone)', async () => {
    const user = userEvent.setup();
    saveCustomerReview.mockRejectedValue(new AlreadyReviewedError('done'));
    renderPage();
    await user.click(await screen.findByRole('radio', { name: '5 stars' }));
    await user.click(screen.getByRole('button', { name: 'Submit & view bill' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(...BILL));
  });

  it('shows the error and keeps Skip available when saving fails', async () => {
    const user = userEvent.setup();
    saveCustomerReview.mockRejectedValue(new Error('Network error'));
    renderPage();
    await user.click(await screen.findByRole('radio', { name: '3 stars' }));
    await user.click(screen.getByRole('button', { name: 'Submit & view bill' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
    expect(screen.getByRole('button', { name: 'Skip & view bill' })).toBeEnabled();
  });
});
