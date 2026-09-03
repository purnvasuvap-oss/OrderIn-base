import { render, screen } from '@testing-library/react';
import { StatCard } from '../StatCard';

const renderCard = (props: Partial<Parameters<typeof StatCard>[0]> = {}) =>
  render(
    <StatCard
      label="Total Revenue"
      value="₹1,20,000"
      icon={<svg data-testid="stat-icon" />}
      {...props}
    />,
  );

describe('StatCard', () => {
  it('matches the snapshot without a trend', () => {
    const { asFragment } = renderCard();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the label, value and icon', () => {
    // Arrange & Act
    renderCard({ value: 42 });

    // Assert
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByTestId('stat-icon')).toBeInTheDocument();
  });

  it('does not render a trend block when no trend prop is supplied', () => {
    // Arrange & Act
    renderCard();

    // Assert
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('renders a positive trend with a plus sign', () => {
    // Arrange & Act
    renderCard({ trend: { value: 12.5, isPositive: true } });

    // Assert
    expect(screen.getByText('+12.5%')).toBeInTheDocument();
  });

  it('renders a negative trend with a minus sign and absolute value', () => {
    // Arrange & Act
    renderCard({ trend: { value: -8, isPositive: false } });

    // Assert
    expect(screen.getByText('-8%')).toBeInTheDocument();
  });
});
