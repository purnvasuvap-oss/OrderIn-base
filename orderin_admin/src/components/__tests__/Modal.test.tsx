import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../Modal';

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    // Arrange & Act
    const { container } = render(
      <Modal isOpen={false} onClose={vi.fn()} title="Hidden">
        <p>Body</p>
      </Modal>,
    );

    // Assert
    expect(container).toBeEmptyDOMElement();
  });

  it('matches the snapshot when open', () => {
    const { asFragment } = render(
      <Modal isOpen onClose={vi.fn()} title="Edit Restaurant">
        <p>Body content</p>
      </Modal>,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the title and children when open', () => {
    // Arrange & Act
    render(
      <Modal isOpen onClose={vi.fn()} title="Edit Restaurant">
        <p>Body content</p>
      </Modal>,
    );

    // Assert
    expect(screen.getByRole('heading', { name: 'Edit Restaurant' })).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    // Arrange
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Closable">
        <p>Body</p>
      </Modal>,
    );

    // Act
    await user.click(screen.getByRole('button'));

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
