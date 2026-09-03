import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from '../SettingsPage';

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

describe('SettingsPage', () => {
  it('matches the snapshot', () => {
    const { asFragment } = render(<SettingsPage />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders every settings section heading', () => {
    render(<SettingsPage />);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Account Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Security' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Data & Privacy' })).toBeInTheDocument();
  });

  it('prefills the account fields with default admin values', () => {
    render(<SettingsPage />);

    expect(screen.getByDisplayValue('admin@orderin.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Admin User')).toBeInTheDocument();
  });

  it('has all four notification toggles checked by default', () => {
    render(<SettingsPage />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(4);
    checkboxes.forEach((box) => expect(box).toBeChecked());
  });

  it('lets the user edit the email field', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const email = screen.getByDisplayValue('admin@orderin.com');

    await user.clear(email);
    await user.type(email, 'new@orderin.com');

    expect(email).toHaveValue('new@orderin.com');
  });

  it('lets the user toggle a notification checkbox off', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const firstToggle = screen.getAllByRole('checkbox')[0];

    await user.click(firstToggle);

    expect(firstToggle).not.toBeChecked();
  });
});
