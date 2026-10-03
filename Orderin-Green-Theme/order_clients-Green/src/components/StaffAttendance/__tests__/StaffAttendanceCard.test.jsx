import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StaffAttendanceCard from '../StaffAttendanceCard';
import { submitManualRequest } from '../../../services/attendanceService';

const state = vi.hoisted(() => ({ devices: [], requests: [] }));

vi.mock('../../../services/faceRecognition', () => ({ faceSimilarity: vi.fn(), captureFace: vi.fn() }));
vi.mock('../../../services/attendanceService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDeviceIdentity: vi.fn(() => Promise.resolve({ deviceId: 'this-phone', publicKeyJwk: {}, sign: vi.fn() })),
    subscribeStaffDevices: (_id, cb) => { cb(state.devices); return () => {}; },
    subscribeMyAttendanceRequests: (_id, cb) => { cb(state.requests); return () => {}; },
    submitManualRequest: vi.fn(() => Promise.resolve('r1')),
    requestDeviceRegistration: vi.fn(),
    insecureContextMessage: () => null,
  };
});

const staff = { id: 's1', name: 'Anirudh', role: 'Floor' };

describe('StaffAttendanceCard', () => {
  afterEach(() => {
    state.devices = [];
    state.requests = [];
  });

  it('offers the scanner only on the registered phone', async () => {
    state.devices = [{ id: 'this-phone', staffId: 's1', status: 'active', label: 'Vivo Y35' }];
    render(<StaffAttendanceCard staff={staff} />);
    expect(await screen.findByRole('button', { name: 'Scan to clock in' })).toBeInTheDocument();
    expect(screen.getByText(/Vivo Y35 is your registered phone/)).toBeInTheDocument();
  });

  it('locks the scanner on a different phone and offers a device change', async () => {
    state.devices = [{ id: 'other-phone', staffId: 's1', status: 'active', label: 'Vivo Y35' }];
    render(<StaffAttendanceCard staff={staff} />);
    expect(await screen.findByRole('button', { name: 'Request device change' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Scan to clock/ })).not.toBeInTheDocument();
    expect(screen.getByText(/only be marked from your registered phone \(Vivo Y35\)/)).toBeInTheDocument();
  });

  it('shows a pending phone as waiting for approval', async () => {
    state.devices = [{ id: 'this-phone', staffId: 's1', status: 'pending', label: 'Oppo T5' }];
    render(<StaffAttendanceCard staff={staff} />);
    expect(await screen.findByText(/waiting for your manager's approval/)).toBeInTheDocument();
  });

  it('requires a phone name and consent before face enrolment', async () => {
    const user = userEvent.setup();
    render(<StaffAttendanceCard staff={staff} />);
    await user.click(await screen.findByRole('button', { name: 'Register this phone' }));
    const next = screen.getByRole('button', { name: 'Continue to face capture' });
    expect(next).toBeDisabled();
    await user.type(screen.getByLabelText('Phone name'), 'Vivo Y35');
    await user.click(screen.getByRole('checkbox'));
    expect(next).toBeEnabled();
  });

  it('sends a manual attendance request with a reason', async () => {
    const user = userEvent.setup();
    render(<StaffAttendanceCard staff={staff} />);
    await user.click(await screen.findByRole('button', { name: 'New request' }));
    await user.type(screen.getByLabelText('Clock in'), '09:00');
    await user.type(screen.getByLabelText('Reason'), 'Phone screen broken');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(submitManualRequest).toHaveBeenCalledWith(expect.objectContaining({ staff, inTime: '09:00', reason: 'Phone screen broken' }));
    expect(await screen.findByText('Request sent for approval.')).toBeInTheDocument();
  });
});
