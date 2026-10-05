import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Payroll from '../Payroll';
import {
  savePayrollDraft,
  finalizePayrollMonth,
  markPayslipPaid,
  updateStaffPay,
  createJobRole,
} from '../../services/payrollService';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({}) };
});

const state = vi.hoisted(() => ({
  staff: [],
  run: null,
  rows: [],
  months: [],
}));

vi.mock('../../services/staffService', () => ({
  STAFF_RESTAURANT_ID: 'r1',
  writeStaffAudit: vi.fn(),
  ROLES: ['Admin', 'General Manager', 'Kitchen', 'Floor'],
  normalizeRole: (role) => ['Admin', 'General Manager', 'Kitchen', 'Floor'].find((r) => r.toLowerCase() === String(role || '').toLowerCase()) || null,
  isActiveStaff: (s) => Boolean(s) && !['inactive', 'archived', 'paused', 'on-leave', 'terminated'].includes(s.status),
  subscribeStaff: (cb) => { cb(state.staff); return () => {}; },
}));

vi.mock('../../services/payrollAuthService', () => ({
  signOutPayrollUser: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../services/payrollService', async (importOriginal) => {
  const actual = await importOriginal();
  const sub = (get) => (...args) => { args[args.length - 1](get()); return () => {}; };
  return {
    ...actual,
    subscribePayrollSettings: sub(() => actual.PAYROLL_SETTINGS_DEFAULTS),
    migratePayrollData: vi.fn(() => Promise.resolve({ migratedProfiles: 0, migratedSalaryHistory: 0 })),
    subscribeStaffPayrollProfiles: (cb) => {
      cb(state.staff.map((staff) => ({
        id: staff.id,
        frequency: 'monthly',
        periodAmount: staff.compensation?.monthlySalary || 0,
        pfEnabled: false,
        insurance: 0,
        upiId: null,
      })), null);
      return () => {};
    },
    subscribePayrollMonths: sub(() => state.months),
    subscribePayrollMonth: sub(() => state.run),
    subscribePayrollMonthRows: sub(() => state.rows),
    subscribeJobRoles: sub(() => [{ id: 'j1', name: 'Waiter' }]),
    savePayrollDraft: vi.fn(() => Promise.resolve()),
    finalizePayrollMonth: vi.fn(() => Promise.resolve({ increments: [] })),
    reopenPayrollMonth: vi.fn(() => Promise.resolve()),
    markPayslipPaid: vi.fn(() => Promise.resolve()),
    markAllPayslipsPaid: vi.fn(() => Promise.resolve()),
    updateStaffPay: vi.fn(() => Promise.resolve()),
    setStaffAccessRole: vi.fn(() => Promise.resolve()),
    setStaffJobRole: vi.fn(() => Promise.resolve()),
    createJobRole: vi.fn(() => Promise.resolve('j2')),
    deleteJobRole: vi.fn(() => Promise.resolve()),
  };
});

const anirudh = { id: 's1', name: 'Anirudh', role: 'Floor', status: 'active', compensation: { type: 'salary', monthlySalary: 20000 } };
const renderPage = async () => {
  render(<MemoryRouter><Payroll /></MemoryRouter>);
  await screen.findByText('Anirudh');
};
const rowFor = (name) => screen.getByText(name).closest('tr');

describe('Payroll', () => {
  beforeEach(() => {
    state.staff = [anirudh, { id: 's2', name: 'Meena', role: 'Kitchen', status: 'active' }];
    state.run = null;
    state.rows = [];
    state.months = [];
  });

  it('builds the monthly period from agreed pay and flags staff without an amount', async () => {
    await renderPage();
    expect(screen.getByRole('button', { name: 'Pay periods' })).toHaveClass('on');
    // Salary and additions columns
    expect(within(rowFor('Anirudh')).getAllByText('₹20,000.00')).toHaveLength(2);
    // ₹20,000 − ₹200 employment tax
    expect(within(rowFor('Anirudh')).getAllByText('₹19,800.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/No agreed pay set for 1 active employee/)).toBeInTheDocument();
    expect(screen.queryByText(/Tips/)).not.toBeInTheDocument();
  });

  it('adds an increment and bonus to the net pay and saves the draft', async () => {
    const user = userEvent.setup();
    await renderPage();
    const increment = screen.getByLabelText('Anirudh increment');
    await user.clear(increment);
    await user.type(increment, '10000');
    await user.clear(screen.getByLabelText('Anirudh bonus'));
    await user.type(screen.getByLabelText('Anirudh bonus'), '2000');
    expect(within(rowFor('Anirudh')).getByText('₹32,000.00')).toBeInTheDocument();
    expect(within(rowFor('Anirudh')).getByText('₹31,800.00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(savePayrollDraft).toHaveBeenCalledWith(expect.any(String), [expect.objectContaining({ increment: 10000, bonus: 2000, netPay: 31800 })], expect.any(Object));
  });

  it('needs a reason for additional subtractions', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(within(rowFor('Anirudh')).getByRole('button', { name: /₹0.00 · 0/ }));
    await user.click(screen.getByRole('button', { name: /Add subtraction/ }));
    await user.type(screen.getByLabelText('Anirudh subtraction 1 amount'), '500');
    expect(screen.getByText(/Subtraction 1: give a reason/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Anirudh subtraction 1 reason'), 'Salary advance');
    expect(screen.queryByText(/give a reason/)).not.toBeInTheDocument();
    expect(within(rowFor('Anirudh')).getByText('₹19,300.00')).toBeInTheDocument();
  });

  it('finalizes after confirmation', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: 'Finalize period' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(finalizePayrollMonth).toHaveBeenCalled();
  });

  it('shows a finalized month read-only with payments and payslips', async () => {
    state.run = { id: '2026-10', status: 'finalized', staffIds: ['s1'] };
    state.rows = [{ staffId: 's1', staffName: 'Anirudh', salary: 20000, increment: 0, bonus: 0, tax: 200, pf: 0, insurance: 0, extraDeductions: [], paymentStatus: 'unpaid' }];
    const user = userEvent.setup();
    await renderPage();
    expect(screen.queryByLabelText('Anirudh increment')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Payslip for Anirudh' })).toBeInTheDocument();
    await user.click(within(rowFor('Anirudh')).getByRole('button', { name: 'Record paid' }));
    await user.type(within(rowFor('Anirudh')).getByLabelText('Payment reference'), 'UTR123');
    await user.click(within(rowFor('Anirudh')).getByRole('button', { name: 'Save' }));
    expect(markPayslipPaid).toHaveBeenCalledWith(expect.any(String), 's1', expect.objectContaining({ reference: 'UTR123' }));
  });

  it('lets the Admin set salary and create job roles', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: /Employees & roles/ }));
    const salary = screen.getByLabelText('Meena agreed pay amount');
    await user.clear(salary);
    await user.type(salary, '18000');
    await user.click(screen.getByLabelText('Meena PF'));
    await user.click(within(screen.getByText('Meena').closest('tr')).getByRole('button', { name: 'Save' }));
    expect(updateStaffPay).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }), {
      monthlySalary: 18000,
      periodAmount: 18000,
      frequency: 'monthly',
      pfEnabled: true,
      insurance: 0,
      upiId: '',
    }, expect.any(Object));

    await user.type(screen.getByLabelText('New role name'), 'Head Chef');
    await user.click(screen.getByRole('button', { name: /Create role/ }));
    expect(createJobRole).toHaveBeenCalledWith('Head Chef', [{ id: 'j1', name: 'Waiter' }], expect.any(Object));
  });

  it('locks payroll by ending the Admin session', async () => {
    sessionStorage.setItem('payrollAuth', 'true');
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: /Lock payroll/ }));
    expect(sessionStorage.getItem('payrollAuth')).toBeNull();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/payroll-login', { replace: true }));
  });

  it('goes back to Staff Management or the dashboard', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: /Back to Dashboard/ }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: false }));
  });
});
