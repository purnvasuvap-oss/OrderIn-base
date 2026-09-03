import { render, screen } from '@testing-library/react';
import RotBadge from '../RotIndex/RotBadge';

describe('RotBadge', () => {
  it('shows the no-data state when there is no rotIndex', () => {
    render(<RotBadge rotIndex={null} rotBand="Unknown" />);
    expect(screen.getByText('— No data')).toBeInTheDocument();
  });

  it('shows the no-data state for an Unknown band even with an index', () => {
    render(<RotBadge rotIndex={{ score: 10, daysElapsed: 1, shelfLifeDays: 5 }} rotBand="Unknown" />);
    expect(screen.getByText('— No data')).toBeInTheDocument();
  });

  it('renders the Fresh label and score for a Green band', () => {
    render(<RotBadge rotIndex={{ score: 20, daysElapsed: 1, shelfLifeDays: 5 }} rotBand="Green" />);
    expect(screen.getByText('Fresh · 20%')).toBeInTheDocument();
  });

  it('renders the Critical label for a Red band', () => {
    render(<RotBadge rotIndex={{ score: 90, daysElapsed: 9, shelfLifeDays: 10 }} rotBand="Red" />);
    expect(screen.getByText('Critical · 90%')).toBeInTheDocument();
  });

  it('matches the snapshot', () => {
    const { asFragment } = render(
      <RotBadge rotIndex={{ score: 60, daysElapsed: 6, shelfLifeDays: 10 }} rotBand="Amber" />,
    );
    expect(asFragment()).toMatchSnapshot();
  });
});
