import { render, screen } from '@testing-library/react';
import FatalConfigError from '../FatalConfigError';

describe('FatalConfigError', () => {
  it('matches the snapshot', () => {
    const { asFragment } = render(<FatalConfigError message="MISSING_ENV: RAZORPAY_KEY" />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the headline and the passed message', () => {
    render(<FatalConfigError message="MISSING_ENV: RAZORPAY_KEY" />);

    expect(screen.getByRole('heading', { name: 'Application configuration error' })).toBeInTheDocument();
    expect(screen.getByText('MISSING_ENV: RAZORPAY_KEY')).toBeInTheDocument();
  });

  it('shows the build-mode diagnostic line', () => {
    render(<FatalConfigError message="x" />);
    expect(screen.getByText(/Build mode:/)).toBeInTheDocument();
  });
});
