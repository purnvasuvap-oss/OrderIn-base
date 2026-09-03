import { render, screen } from '@testing-library/react';
import { Badge } from '../Badge';

describe('Badge', () => {
  it('matches the snapshot for the default variant', () => {
    // Arrange & Act
    const { asFragment } = render(<Badge>Default</Badge>);

    // Assert
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the provided children', () => {
    // Arrange & Act
    render(<Badge>Active</Badge>);

    // Assert
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders non-text children such as an icon node', () => {
    // Arrange & Act
    render(
      <Badge variant="info">
        <svg data-testid="badge-icon" /> Info
      </Badge>,
    );

    // Assert
    expect(screen.getByTestId('badge-icon')).toBeInTheDocument();
    expect(screen.getByText(/Info/)).toBeInTheDocument();
  });

  it.each([
    ['success', 'rgb(16, 185, 129)'],
    ['warning', 'rgb(249, 115, 22)'],
    ['error', 'rgb(239, 68, 68)'],
    ['info', 'rgb(168, 85, 247)'],
  ] as const)('applies the %s variant colour', (variant, expectedColor) => {
    // Arrange & Act
    render(<Badge variant={variant}>{variant}</Badge>);

    // Assert
    expect(screen.getByText(variant)).toHaveStyle({ color: expectedColor });
  });

  it('falls back to the default variant colour when no variant is given', () => {
    // Arrange & Act
    render(<Badge>plain</Badge>);

    // Assert
    expect(screen.getByText('plain')).toHaveStyle({ color: 'rgb(6, 182, 212)' });
  });
});
