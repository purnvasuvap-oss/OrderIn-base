import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../ToastContext';

function Harness() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success('Saved!')}>ok</button>
      <button onClick={() => toast.error('Boom')}>err</button>
    </div>
  );
}

const renderHarness = () =>
  render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );

describe('ToastContext', () => {
  it('throws when useToast is used outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Harness />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });

  it('shows a success toast on demand', () => {
    renderHarness();
    fireEvent.click(screen.getByRole('button', { name: 'ok' }));
    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });

  it('renders an error toast with the danger variant', () => {
    renderHarness();
    fireEvent.click(screen.getByRole('button', { name: 'err' }));
    expect(screen.getByText('Boom')).toHaveClass('toast-danger');
  });

  it('auto-dismisses a toast after its timeout', () => {
    vi.useFakeTimers();
    renderHarness();

    fireEvent.click(screen.getByRole('button', { name: 'ok' }));
    expect(screen.getByText('Saved!')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3300));
    expect(screen.queryByText('Saved!')).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});
