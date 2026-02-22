import { Search } from 'lucide-react';
import { useAppStore } from '../store';
import { DateRangePicker } from './DateRangePicker';

export const Topbar = () => {
  const { searchQuery, setSearchQuery } = useAppStore();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '2rem',
      padding: '0 2rem',
      background: 'linear-gradient(90deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.8) 100%)',
      borderBottom: '1px solid rgba(6, 182, 212, 0.1)',
      backdropFilter: 'blur(10px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '500px' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search restaurants, orders, transactions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: '2.5rem',
              paddingRight: '1rem',
              paddingTop: '0.625rem',
              paddingBottom: '0.625rem',
              borderRadius: '0.75rem',
              fontSize: '0.875rem',
              background: 'rgba(30, 27, 75, 0.5)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              color: '#f1f5f9',
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
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <DateRangePicker />

        <button style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.375rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          borderRadius: '0.5rem',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(6, 182, 212, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'none';
        }}>
          <div style={{
            width: '2rem',
            height: '2rem',
            background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '0.875rem',
            color: 'white',
          }}>A</div>
          <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#cbd5e1' }}>Admin</span>
        </button>
      </div>
    </div>
  );
};
