import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StaffManagement from '../StaffManagement';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../utils/phoneValidation', () => ({ sanitizePhoneInput: (v) => String(v).replace(/\D/g, '') }));

vi.mock('../../services/staffService', () => {
  const noopSub = () => () => {};
  const emptySub = (cb) => {
    if (typeof cb === 'function') cb([]);
    return () => {};
  };
  return {
  ROLES: ['Admin', 'Kitchen', 'Floor'],
  ZONES: ['Zone A'],
  TEAMS: ['Team 1'],
  DAY_LABELS: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  subscribeStaff: emptySub,
  subscribeStaffConfig: (cb) => {
    if (typeof cb === 'function') cb({ zones: ['Zone A'], teams: ['Team 1'] });
    return () => {};
  },
  addZone: vi.fn().mockResolvedValue(undefined),
  removeZone: vi.fn().mockResolvedValue(undefined),
  addTeam: vi.fn().mockResolvedValue(undefined),
  removeTeam: vi.fn().mockResolvedValue(undefined),
  addStaff: vi.fn().mockResolvedValue(undefined),
  pauseStaff: vi.fn(),
  restoreStaff: vi.fn(),
  resetStaffPin: vi.fn(),
  weekKeyFor: vi.fn(() => '2026-W05'),
  shiftWeekKey: vi.fn(() => '2026-W05'),
  datesForWeek: vi.fn(() => Array.from({ length: 7 }, (_, i) => new Date(2026, 1, 2 + i))),
  subscribeRoster: emptySub,
  setShift: vi.fn(),
  publishRoster: vi.fn(),
  subscribeTimeOffRequests: emptySub,
  addTimeOffRequest: vi.fn(),
  decideTimeOffRequest: vi.fn(),
  subscribeSwapRequests: emptySub,
  addSwapRequest: vi.fn(),
  decideSwapRequest: vi.fn(),
  subscribeTodayAttendance: emptySub,
  punchPin: vi.fn(),
  toggleBreak: vi.fn(),
  clockOutRecord: vi.fn(),
  hoursOf: vi.fn(() => 0),
  attendanceStatus: vi.fn(() => 'off'),
  getAttendanceForDateRange: vi.fn().mockResolvedValue([]),
  };
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <StaffManagement />
    </MemoryRouter>,
  );

describe('StaffManagement', () => {
  it('matches the snapshot', () => {
    const { asFragment } = renderPage();
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders the page heading and the section tabs', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Staff Management' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Staff & Roles' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule & Roster' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Attendance/ })).toBeInTheDocument();
  });

  it('shows the Add Staff trigger in the staff directory', () => {
    renderPage();
    expect(screen.getAllByText('Add Staff').length).toBeGreaterThan(0);
  });

  it('switches to the Roster tab', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Schedule & Roster' }));

    expect(screen.getByRole('button', { name: 'Schedule & Roster' })).toHaveClass('on');
  });

  it('navigates back to the dashboard', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /back/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
