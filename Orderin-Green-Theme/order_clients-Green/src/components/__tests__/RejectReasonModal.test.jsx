import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RejectReasonModal from '../RejectReasonModal';

const setup = (props = {}) => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  const utils = render(<RejectReasonModal isOpen onClose={onClose} onConfirm={onConfirm} {...props} />);
  return { onClose, onConfirm, ...utils };
};

describe('RejectReasonModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<RejectReasonModal isOpen={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('matches the snapshot when open', () => {
    const { asFragment } = setup();
    expect(asFragment()).toMatchSnapshot();
  });

  it('lists every preset reason', () => {
    setup();
    ['Item Sold Out', 'Temporarily Unavailable', 'Long Prep Time', 'Customization Not Possible'].forEach((reason) => {
      expect(screen.getByLabelText(reason)).toBeInTheDocument();
    });
  });

  it('keeps the confirm button disabled until a reason is picked', async () => {
    const user = userEvent.setup();
    setup();
    const confirm = screen.getByRole('button', { name: 'Send Update to Customer' });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByLabelText('Long Prep Time'));

    expect(confirm).toBeEnabled();
  });

  it('calls onConfirm with the selected reason', async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();

    await user.click(screen.getByLabelText('Item Sold Out'));
    await user.click(screen.getByRole('button', { name: 'Send Update to Customer' }));

    expect(onConfirm).toHaveBeenCalledWith('Item Sold Out');
  });

  it('calls onClose from the Cancel button', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
