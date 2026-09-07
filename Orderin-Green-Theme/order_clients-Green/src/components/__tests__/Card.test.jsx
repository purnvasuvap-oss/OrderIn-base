import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Card from '../Card';

describe('Card', () => {
  it('matches the snapshot', () => {
    const { asFragment } = render(<Card title="Orders" />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the title', () => {
    render(<Card title="Inventory" />);
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument();
  });

  it('calls onClick when the card is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Card title="Menu" onClick={onClick} />);

    await user.click(screen.getByText('Menu'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not throw when clicked without an onClick handler', async () => {
    const user = userEvent.setup();
    render(<Card title="Finance" />);

    await expect(user.click(screen.getByText('Finance'))).resolves.not.toThrow();
  });
});
