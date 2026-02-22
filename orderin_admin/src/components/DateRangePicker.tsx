import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from 'date-fns';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAppStore } from '../store';

export const DateRangePicker = () => {
  const { setDateRange, selectedDateRange } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const presets: Array<{ label: string; fn: () => [Date, Date] }> = [
    { label: 'Today', fn: () => [startOfDay(new Date()), endOfDay(new Date())] },
    { label: 'Last 7 days', fn: () => [startOfDay(subDays(new Date(), 7)), endOfDay(new Date())] },
    { label: 'Last 30 days', fn: () => [startOfDay(subDays(new Date(), 30)), endOfDay(new Date())] },
    { label: 'This Month', fn: () => [startOfMonth(new Date()), endOfMonth(new Date())] },
    { label: 'This Year', fn: () => [startOfYear(new Date()), endOfYear(new Date())] },
  ];

  const handlePreset = (fn: () => [Date, Date]) => {
    const [from, to] = fn();
    setDateRange(from, to);
    setIsOpen(false);
  };

  const handleCustomRange = () => {
    if (customFrom && customTo) {
      setDateRange(new Date(customFrom), new Date(customTo));
      setIsOpen(false);
      setCustomFrom('');
      setCustomTo('');
    }
  };

  const displayText = selectedDateRange
    ? `${format(selectedDateRange.from, 'MMM dd')} - ${format(selectedDateRange.to, 'MMM dd')}`
    : 'Select Date Range';

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          background: 'rgba(30, 27, 75, 0.5)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          fontWeight: '500',
          color: '#cbd5e1',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = '#06b6d4';
          (e.currentTarget as HTMLElement).style.background = 'rgba(6, 182, 212, 0.1)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(6, 182, 212, 0.3)';
          (e.currentTarget as HTMLElement).style.background = 'rgba(30, 27, 75, 0.5)';
        }}
      >
        {displayText}
        <ChevronDown size={16} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          marginTop: '0.5rem',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(45, 27, 105, 0.8) 100%)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          borderRadius: '0.5rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          padding: '1rem',
          zIndex: 10,
          minWidth: '280px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset.fn)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  paddingLeft: '0.75rem',
                  paddingRight: '0.75rem',
                  paddingTop: '0.5rem',
                  paddingBottom: '0.5rem',
                  fontSize: '0.875rem',
                  color: '#cbd5e1',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '0.375rem',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(6, 182, 212, 0.2)';
                  (e.currentTarget as HTMLElement).style.color = '#06b6d4';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = '#cbd5e1';
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div style={{ borderTop: '1px solid rgba(6, 182, 212, 0.2)', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: '600', color: '#94a3b8', marginBottom: '0.5rem' }}>Custom Range</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '0.5rem',
                  paddingRight: '0.5rem',
                  paddingTop: '0.25rem',
                  paddingBottom: '0.25rem',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  background: 'rgba(30, 27, 75, 0.5)',
                  color: '#f1f5f9',
                }}
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '0.5rem',
                  paddingRight: '0.5rem',
                  paddingTop: '0.25rem',
                  paddingBottom: '0.25rem',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  background: 'rgba(30, 27, 75, 0.5)',
                  color: '#f1f5f9',
                }}
              />
              <button
                onClick={handleCustomRange}
                style={{
                  width: '100%',
                  paddingLeft: '0.75rem',
                  paddingRight: '0.75rem',
                  paddingTop: '0.5rem',
                  paddingBottom: '0.5rem',
                  background: 'linear-gradient(135deg, #06b6d4 0%, #a855f7 100%)',
                  color: 'white',
                  fontSize: '0.875rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
