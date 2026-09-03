import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '../LoginPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const fillForm = async (user: ReturnType<typeof userEvent.setup>, password: string) => {
  await user.type(screen.getByPlaceholderText('Enter your user mail id'), 'admin@orderin.com');
  await user.type(screen.getByPlaceholderText('Enter your password'), password);
};

describe('LoginPage', () => {
  it('matches the snapshot', () => {
    const { asFragment } = render(<LoginPage />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the email and password fields and the submit button', () => {
    // Arrange & Act
    render(<LoginPage />);

    // Assert
    expect(screen.getByPlaceholderText('Enter your user mail id')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/ })).toBeInTheDocument();
  });

  it('does not show an error message initially', () => {
    // Arrange & Act
    render(<LoginPage />);

    // Assert
    expect(screen.queryByText(/Invalid password/)).not.toBeInTheDocument();
  });

  it('toggles password visibility when the eye button is clicked', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<LoginPage />);
    const passwordInput = screen.getByPlaceholderText('Enter your password');
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Act
    await user.click(screen.getByRole('button', { name: '' }));

    // Assert
    expect(passwordInput).toHaveAttribute('type', 'text');
  });

  it('shows a validation error and does not navigate with a wrong password', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<LoginPage />);

    // Act
    await fillForm(user, 'wrong-pass');
    await user.click(screen.getByRole('button', { name: /Sign In/ }));

    // Assert
    expect(await screen.findByText(/Invalid password/)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('clears the error message as soon as the user edits the password', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<LoginPage />);
    await fillForm(user, 'wrong-pass');
    await user.click(screen.getByRole('button', { name: /Sign In/ }));
    expect(await screen.findByText(/Invalid password/)).toBeInTheDocument();

    // Act
    await user.type(screen.getByPlaceholderText('Enter your password'), '1');

    // Assert
    expect(screen.queryByText(/Invalid password/)).not.toBeInTheDocument();
  });

  it('shows the loading spinner and navigates to the dashboard on success', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<LoginPage />);
    const submitButton = screen.getByRole('button', { name: /Sign In/ });

    // Act
    await fillForm(user, '123456789');
    await user.click(submitButton);

    // Assert - button enters the disabled/loading state
    expect(submitButton).toBeDisabled();

    // Assert - wait for redirect
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    }, { timeout: 2000 });
  });
});
