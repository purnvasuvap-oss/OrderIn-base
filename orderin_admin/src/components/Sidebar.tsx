import { LayoutDashboard, Building2, FileText, DollarSign, CreditCard, Settings, LogOut, ChevronRight } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';

export const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAppStore((s) => s.logout);

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: Building2, label: 'Restaurants', href: '/restaurants' },
    { icon: FileText, label: 'Ledger', href: '/ledger' },
    { icon: DollarSign, label: 'Settlements', href: '/settlements' },
    { icon: CreditCard, label: 'Payment Hub', href: '/pay' },
    { icon: Settings, label: 'Settings', href: '/settings' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(6, 182, 212, 0.1)', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '2rem', height: '2rem', background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white' }}>Ⓞ</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)', backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>OrderIN</h1>
        </div>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem', fontWeight: '500' }}>Payment & Finance Hub</p>
      </div>

      <nav style={{ flex: 1, padding: '1rem', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                borderRadius: '0.75rem',
                transition: 'all 0.2s ease',
                textDecoration: 'none',
                background: isActive ? 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)' : 'transparent',
                color: isActive ? 'white' : '#94a3b8',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'rgba(6, 182, 212, 0.1)';
                  e.currentTarget.style.color = '#cbd5e1';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#94a3b8';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Icon size={20} style={{ transition: 'transform 0.2s ease' }} />
                <span style={{ fontWeight: '600', fontSize: '0.875rem' }}>{item.label}</span>
              </div>
              {isActive && <ChevronRight size={16} />}
            </Link>
          );
        })}
      </nav>

      <div style={{ borderTop: '1px solid rgba(6, 182, 212, 0.1)', padding: '1rem', background: 'linear-gradient(180deg, transparent 0%, rgba(6, 182, 212, 0.05) 100%)' }}>
        <button 
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
          style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          color: '#94a3b8',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          width: '100%',
          padding: '0.75rem 1rem',
          borderRadius: '0.75rem',
          fontSize: '0.875rem',
          fontWeight: '600',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(6, 182, 212, 0.1)';
          e.currentTarget.style.color = 'white';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'none';
          e.currentTarget.style.color = '#94a3b8';
        }}>
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
};
