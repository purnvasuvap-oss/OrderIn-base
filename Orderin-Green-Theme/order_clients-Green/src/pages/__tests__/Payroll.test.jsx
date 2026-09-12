import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Payroll from '../Payroll';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

const sampleRow = {
  staffId: 's1', employeeId: 'E1', staffName: 'Ann', role: 'Floor',
  hours: 8, regularHours: 8, overtimeHours: 0, breakHours: 0, rate: 10, overtimeRate: 15,
  tips: 5, bonuses: 0, deductions: 0, basePay: 80, gross: 85, netPay: 85,
  approvalStatus: 'draft', paymentStatus: 'unpaid', paymentReference: null,
};

vi.mock('../../services/staffService', () => {
  const emptySub = (cb) => { if (typeof cb === 'function') cb([]); return () => {}; };
  return {
    subscribeStaff: emptySub,
    getAttendanceForDateRange: vi.fn().mockResolvedValue([]),
    calculatePayroll: vi.fn(() => [sampleRow]),
    payrollCsv: vi.fn(() => 'csv'),
    savePayrollRun: vi.fn().mockResolvedValue({ id: '2026-01-01_2026-01-07', periodKey: '2026-01-01_2026-01-07', status: 'draft' }),
    subscribePayrollRuns: emptySub,
    submitPayrollForReview: vi.fn(),
    approvePayrollRun: vi.fn(),
    reopenPayrollRun: vi.fn(),
    sendBulkPayments: vi.fn(),
    retryFailedPayment: vi.fn(),
    summarizePayrollRows: vi.fn(() => ({
      totalStaff: 1, regularHours: 8, overtimeHours: 0, breakHours: 0, tips: 5, bonuses: 0,
      deductions: 0, gross: 85, net: 85, paidAmount: 0, failedAmount: 0,
    })),
  };
});

const renderPage = () => render(
  <MemoryRouter>
    <Payroll />
  </MemoryRouter>,
);

describe('Payroll', () => {
  it('renders the page heading and pay-period controls', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Payroll' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weekly' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calculate Payroll' })).toBeInTheDocument();
  });

  it('calculates payroll and shows the summary tiles and staff table', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Calculate Payroll' }));
    expect(await screen.findByText('Ann')).toBeInTheDocument();
    expect(screen.getByText('Net Payroll')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeInTheDocument();
  });

  it('navigates back to Staff Management', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Back to Staff Management/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/staff-management');
  });
});
