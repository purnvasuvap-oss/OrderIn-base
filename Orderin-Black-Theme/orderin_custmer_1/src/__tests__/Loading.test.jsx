import { render } from '@testing-library/react';
import Loading from '../Loading';

describe('Loading', () => {
  it('renders nothing when isLoading is false', () => {
    const { container } = render(<Loading isLoading={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the spinner overlay when isLoading is true', () => {
    const { container } = render(<Loading isLoading />);
    expect(container.querySelector('.loading-overlay')).toBeInTheDocument();
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
  });

  it('matches the snapshot when loading', () => {
    const { asFragment } = render(<Loading isLoading />);
    expect(asFragment()).toMatchSnapshot();
  });
});
