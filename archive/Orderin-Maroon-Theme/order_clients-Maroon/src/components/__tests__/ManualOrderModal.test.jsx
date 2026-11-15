import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ManualOrderModal from '../ManualOrderModal';

vi.mock('../../utils/phoneValidation', () => ({
  sanitizePhoneInput: (v) => String(v).replace(/\D/g, ''),
  isValidPhoneNumber: (v) => String(v).length === 10,
}));

const MENU = [
  { id: 'm1', name: 'Masala Dosa', price: 120 },
  { id: 'm2', name: 'Filter Coffee', price: 40 },
];

const setup = (props = {}) => {
  const onClose = vi.fn();
  const onOrderCreated = vi.fn();
  const utils = render(
    <ManualOrderModal isOpen onClose={onClose} menuItems={MENU} onOrderCreated={onOrderCreated} {...props} />,
  );
  return { onClose, onOrderCreated, ...utils };
};

describe('ManualOrderModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ManualOrderModal isOpen={false} onClose={vi.fn()} menuItems={MENU} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('matches the snapshot when open', () => {
    const { asFragment } = setup();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the customer fields and the menu items', () => {
    setup();
    expect(screen.getByPlaceholderText('Enter customer name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter phone number')).toBeInTheDocument();
    expect(screen.getByText('Masala Dosa')).toBeInTheDocument();
    expect(screen.getByText('Filter Coffee')).toBeInTheDocument();
  });

  it('filters the menu list as the user searches', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByPlaceholderText('Search menu items...'), 'coffee');

    expect(screen.getByText('Filter Coffee')).toBeInTheDocument();
    expect(screen.queryByText('Masala Dosa')).not.toBeInTheDocument();
  });

  it('keeps Create Order disabled until an item is added', async () => {
    const user = userEvent.setup();
    setup();
    const createBtn = screen.getByRole('button', { name: 'Create Order' });
    expect(createBtn).toBeDisabled();

    await user.click(screen.getAllByRole('button', { name: '+ Add' })[0]);

    expect(screen.getByRole('heading', { name: /Selected Items \(1\)/ })).toBeInTheDocument();
    expect(createBtn).toBeEnabled();
  });

  it('calls onClose from the Cancel button', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
  });
});
