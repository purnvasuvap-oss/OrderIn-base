import { AppLayout } from '../layouts/AppLayout';
import { Bell, Lock, Eye } from 'lucide-react';

export const SettingsPage = () => {
  return (
    <AppLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '900px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f97316 100%)',
          borderRadius: '1.5rem',
          padding: '2rem',
          color: 'white',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          animation: 'slideInUp 0.6s ease',
        }}>
          <h1 style={{ fontSize: '2.25rem', fontWeight: '900' }}>Settings</h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.9)', marginTop: '0.5rem', fontSize: '1.125rem' }}>Manage admin settings and preferences</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Account Settings */}
          <div className="card" style={{ animation: 'slideInUp 0.7s ease' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '1rem' }}>Account Settings</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#cbd5e1', marginBottom: '0.5rem' }}>Email Address</label>
                <input
                  type="email"
                  defaultValue="admin@orderin.com"
                  style={{
                    width: '100%',
                    paddingLeft: '1rem',
                    paddingRight: '1rem',
                    paddingTop: '0.75rem',
                    paddingBottom: '0.75rem',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    borderRadius: '0.75rem',
                    background: 'rgba(30, 27, 75, 0.5)',
                    color: '#f1f5f9',
                    fontSize: '1rem',
                    transition: 'all 0.3s ease',
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#06b6d4';
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(6, 182, 212, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.3)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#cbd5e1', marginBottom: '0.5rem' }}>Full Name</label>
                <input
                  type="text"
                  defaultValue="Admin User"
                  style={{
                    width: '100%',
                    paddingLeft: '1rem',
                    paddingRight: '1rem',
                    paddingTop: '0.75rem',
                    paddingBottom: '0.75rem',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    borderRadius: '0.75rem',
                    background: 'rgba(30, 27, 75, 0.5)',
                    color: '#f1f5f9',
                    fontSize: '1rem',
                    transition: 'all 0.3s ease',
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#06b6d4';
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(6, 182, 212, 0.2)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.3)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
              <button style={{
                paddingLeft: '1.5rem',
                paddingRight: '1.5rem',
                paddingTop: '0.75rem',
                paddingBottom: '0.75rem',
                background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)',
                color: 'white',
                borderRadius: '0.75rem',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 15px rgba(6, 182, 212, 0.3)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
              }}>
                Save Changes
              </button>
            </div>
          </div>

          {/* Security */}
          <div className="card" style={{ animation: 'slideInUp 0.8s ease' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Lock size={20} />
              Security
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {['Change Password', 'Two-Factor Authentication'].map((item, idx) => (
                <button key={idx} style={{
                  textAlign: 'left',
                  paddingLeft: '1rem',
                  paddingRight: '1rem',
                  paddingTop: '0.75rem',
                  paddingBottom: '0.75rem',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                  borderRadius: '0.75rem',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease',
                  color: '#cbd5e1',
                  fontWeight: '500',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(6, 182, 212, 0.1)';
                  (e.currentTarget as HTMLElement).style.borderColor = '#06b6d4';
                  (e.currentTarget as HTMLElement).style.color = '#06b6d4';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(6, 182, 212, 0.2)';
                  (e.currentTarget as HTMLElement).style.color = '#cbd5e1';
                }}>
                  <span>{item}</span>
                  <span>{'>'}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <div className="card" style={{ animation: 'slideInUp 0.9s ease' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bell size={20} />
              Notifications
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                'Email notifications for new settlements',
                'Alert for failed transactions',
                'Weekly summary reports',
                'Payment gateway alerts',
              ].map((item, idx) => (
                <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked style={{ cursor: 'pointer', accentColor: '#06b6d4' }} />
                  <span style={{ color: '#cbd5e1' }}>{item}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Data & Privacy */}
          <div className="card" style={{ animation: 'slideInUp 1s ease' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Eye size={20} />
              Data & Privacy
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { label: 'Export My Data', color: '#06b6d4' },
                { label: 'Delete Account', color: '#ef4444' },
              ].map((item, idx) => (
                <button key={idx} style={{
                  textAlign: 'left',
                  paddingLeft: '1rem',
                  paddingRight: '1rem',
                  paddingTop: '0.75rem',
                  paddingBottom: '0.75rem',
                  border: `1px solid ${item.color}33`,
                  borderRadius: '0.75rem',
                  background: `${item.color}11`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease',
                  color: item.color,
                  fontWeight: '500',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = `${item.color}22`;
                  (e.currentTarget as HTMLElement).style.borderColor = item.color;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = `${item.color}11`;
                  (e.currentTarget as HTMLElement).style.borderColor = `${item.color}33`;
                }}>
                  <span>{item.label}</span>
                  <span>{'>'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};
