import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AcceptingOrdersModal from '../AcceptingOrdersModal';

describe('AcceptingOrdersModal', () => {
  it('matches the snapshot', () => {
    const { asFragment } = render(<AcceptingOrdersModal onClose={vi.fn()} />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the "not serving" heading and description', () => {
    render(<AcceptingOrdersModal onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Restaurant Is Not Serving Right Now' })).toBeInTheDocument();
    expect(screen.getByText(/isn't accepting new orders/)).toBeInTheDocument();
  });

  it('calls onClose from the "Got it" button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AcceptingOrdersModal onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Got it' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
