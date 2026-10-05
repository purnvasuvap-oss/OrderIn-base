import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PayrollLogin from '../PayrollLogin';
import { verifySectionPasscode } from '../../firebase';
import { signOutPayrollUser } from '../../services/payrollAuthService';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../firebase', () => ({ verifySectionPasscode: vi.fn() }));
vi.mock('../../services/payrollAuthService', () => ({
  signOutPayrollUser: vi.fn(() => Promise.resolve()),
}));

const login = async (pin) => {
  const user = userEvent.setup();
  render(<MemoryRouter><PayrollLogin /></MemoryRouter>);
  const pinField = screen.getByLabelText(/Payroll passcode/);
  await waitFor(() => {
    expect(pinField).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Open Payroll' })).toBeEnabled();
  });
  const submit = screen.getByRole('button', { name: 'Open Payroll' });
  await user.type(pinField, pin);
  await user.click(submit);
  return user;
};

describe('PayrollLogin', () => {
  beforeEach(() => {
    sessionStorage.clear();
    verifySectionPasscode.mockReset();
    signOutPayrollUser.mockReset();
  });

  it('opens payroll when the PayrollAccess passcode matches', async () => {
    verifySectionPasscode.mockResolvedValue(true);
    await login('1234');
    expect(verifySectionPasscode).toHaveBeenCalledWith('PayrollAccess', '1234');
    expect(sessionStorage.getItem('payrollAuth')).toBe('true');
    expect(sessionStorage.getItem('payrollAdminId')).toBe('payroll-owner');
    expect(mockNavigate).toHaveBeenCalledWith('/staff-management/payroll', { replace: true });
  });

  it('rejects a wrong passcode and locks after 5 attempts', async () => {
    verifySectionPasscode.mockResolvedValue(false);
    const user = await login('0000');
    expect(screen.getByRole('alert')).toHaveTextContent(/Wrong payroll passcode/);
    for (let i = 0; i < 4; i += 1) {
      await user.type(screen.getByLabelText(/Payroll passcode/), '0000');
      await user.click(screen.getByRole('button', { name: 'Open Payroll' }));
    }
    expect(screen.getByRole('button', { name: /Locked/ })).toBeDisabled();
    expect(sessionStorage.getItem('payrollAuth')).toBeNull();
  });

  it('ends any previous payroll session when the login page opens', async () => {
    sessionStorage.setItem('payrollAuth', 'true');
    render(<MemoryRouter><PayrollLogin /></MemoryRouter>);
    expect(sessionStorage.getItem('payrollAuth')).toBeNull();
    expect(signOutPayrollUser).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Payroll' })).toBeEnabled());
  });
});
