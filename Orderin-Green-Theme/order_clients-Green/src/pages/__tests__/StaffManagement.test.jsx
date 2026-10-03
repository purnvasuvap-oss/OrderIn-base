import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StaffManagement from '../StaffManagement';

const mockNavigate = vi.fn();
const { ATT_DEFAULTS, mockAttendance } = vi.hoisted(() => {
  const defaults = { lat: 12.97, lng: 77.59, radiusMeters: 100, maxAccuracyMeters: 100, faceMatchThreshold: 0.6 };
  return { ATT_DEFAULTS: defaults, mockAttendance: { devices: [], requests: [] } };
});
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
  addStaff: vi.fn().mockResolvedValue(undefined),
  updateStaff: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../../services/attendanceService', async (importOriginal) => {
  const actual = await importOriginal();
  const sub = (value) => (cb) => {
    cb(typeof value === 'function' ? value() : value);
    return () => {};
  };
  return {
    ...actual,
    ATTENDANCE_SETTINGS_DEFAULTS: ATT_DEFAULTS,
    subscribeAttendanceSettings: sub(ATT_DEFAULTS),
    subscribeActiveKioskSession: sub(null),
    subscribeAllDevices: sub(() => mockAttendance.devices),
    subscribeAttendanceRequests: sub(() => mockAttendance.requests),
    saveAttendanceSettings: vi.fn(),
    decideDevice: vi.fn(),
    revokeDevice: vi.fn(),
    decideManualRequest: vi.fn(),
    getCurrentGeo: vi.fn(),
    insecureContextMessage: () => null,
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

  it('opens the staff profile form with profile and availability fields', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Add Staff/ }));

    expect(screen.getByRole('heading', { name: 'Add Staff' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Hire date/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Emergency contact/)).toBeInTheDocument();
    expect(screen.getByText('Regular availability')).toBeInTheDocument();
  });

  it('hides staff mutations when an authenticated staff role is not managerial', () => {
    sessionStorage.setItem('staffRole', 'Kitchen');
    try {
      renderPage();
      expect(screen.queryByRole('button', { name: /Add Staff/ })).not.toBeInTheDocument();
    } finally {
      sessionStorage.removeItem('staffRole');
    }
  });

  it('switches to the Roster tab', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Schedule & Roster' }));

    expect(screen.getByRole('button', { name: 'Schedule & Roster' })).toHaveClass('on');
  });

  it('shows the attendance display entry point and no PIN keypad', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Attendance/ }));

    expect(screen.getByRole('button', { name: 'Open Attendance Display' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Attendance approvals/ })).toBeInTheDocument();
    expect(screen.queryByText(/PIN Punch Clock/)).not.toBeInTheDocument();
  });

  it('follows the approval chain for pending phones and manual requests', async () => {
    mockAttendance.devices = [
      { id: 'dev1', staffId: 's1', staffName: 'Priya', staffRole: 'Floor', label: 'Vivo Y35', platform: 'Android · Chrome', status: 'pending', faceThumbnail: 'data:image/jpeg;base64,x' },
    ];
    mockAttendance.requests = [
      { id: 'r1', staffId: 'm1', staffName: 'Ravi', staffRole: 'General Manager', dateKey: '2026-10-01', reason: 'Phone broken', status: 'pending' },
    ];
    sessionStorage.setItem('staffRole', 'General Manager');
    sessionStorage.setItem('staffId', 'gm-2');
    try {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: /Attendance/ }));

      const approveButtons = screen.getAllByRole('button', { name: 'Approve' });
      // A GM can approve floor staff's phone…
      expect(approveButtons[0]).toBeEnabled();
      // …but another manager's request needs the Admin.
      expect(approveButtons[1]).toBeDisabled();
      expect(approveButtons[1].closest('span')).toHaveAttribute('title', expect.stringMatching(/Admin/));
    } finally {
      sessionStorage.removeItem('staffRole');
      sessionStorage.removeItem('staffId');
      mockAttendance.devices = [];
      mockAttendance.requests = [];
    }
  });

  it('navigates back to the dashboard', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /back/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
