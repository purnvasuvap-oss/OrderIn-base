import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QrAttendancePanel, { parseLatLng } from '../QrAttendancePanel';
import { getCurrentGeo, saveAttendanceSettings } from '../../../services/staffService';

const DEFAULTS = { lat: null, lng: null, radiusMeters: 100, maxAccuracyMeters: 100, requireManagerProximity: false, allowPinFallback: false, sessionMinutes: 10 };

vi.mock('../../../services/staffService', () => ({
  subscribeActiveQrSession: (cb) => {
    cb(null);
    return () => {};
  },
  startQrSession: vi.fn(),
  endQrSession: vi.fn(),
  redeemAttendanceToken: vi.fn(),
  saveAttendanceSettings: vi.fn(),
  getCurrentGeo: vi.fn(),
  insecureContextMessage: () => (window.isSecureContext === false ? 'Camera and location only work over a secure connection.' : null),
}));

describe('parseLatLng', () => {
  it('parses Google Maps style coordinates and rejects junk', () => {
    expect(parseLatLng('12.97160, 77.59460')).toEqual({ lat: 12.9716, lng: 77.5946 });
    expect(parseLatLng('-33.8 151.2')).toEqual({ lat: -33.8, lng: 151.2 });
    expect(parseLatLng('100, 20')).toBeNull();
    expect(parseLatLng('somewhere')).toBeNull();
  });
});

describe('QrAttendancePanel', () => {
  afterEach(() => {
    delete window.isSecureContext;
  });

  it('prompts managers to save the restaurant location when none is set', () => {
    render(<QrAttendancePanel settings={DEFAULTS} canConfigure />);
    expect(screen.getByText('Restaurant location not set.')).toBeInTheDocument();
  });

  it('hides the location prompt once a location is saved', () => {
    render(<QrAttendancePanel settings={{ ...DEFAULTS, lat: 12.97, lng: 77.59 }} canConfigure />);
    expect(screen.queryByText('Restaurant location not set.')).not.toBeInTheDocument();
  });

  it('saves an accurate fix as the restaurant location', async () => {
    getCurrentGeo.mockResolvedValue({ lat: 12.97, lng: 77.59, accuracy: 15 });
    const user = userEvent.setup();
    render(<QrAttendancePanel settings={DEFAULTS} canConfigure />);

    await user.click(screen.getByRole('button', { name: /Save this spot/ }));

    expect(saveAttendanceSettings).toHaveBeenCalledWith({ lat: 12.97, lng: 77.59 });
  });

  it('refuses to save an imprecise fix', async () => {
    getCurrentGeo.mockResolvedValue({ lat: 12.97, lng: 77.59, accuracy: 400 });
    const user = userEvent.setup();
    render(<QrAttendancePanel settings={DEFAULTS} canConfigure />);

    await user.click(screen.getByRole('button', { name: /Save this spot/ }));

    expect(saveAttendanceSettings).not.toHaveBeenCalled();
    expect(screen.getByText(/only accurate to ±400 m/)).toBeInTheDocument();
  });

  it('warns and disables starting over an insecure connection', () => {
    window.isSecureContext = false;
    render(<QrAttendancePanel settings={{ ...DEFAULTS, lat: 12.97, lng: 77.59 }} canConfigure />);
    expect(screen.getByRole('alert')).toHaveTextContent(/secure connection/);
    expect(screen.getByRole('button', { name: 'Start QR Attendance' })).toBeDisabled();
  });
});
