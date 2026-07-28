import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: 'cyan' | 'purple' | 'pink' | 'orange' | 'emerald';
  trend?: { value: number; isPositive: boolean };
}

const colorMap: Record<string, { bg: string; border: string; icon: string; text: string }> = {
  cyan: { bg: 'rgba(6, 182, 212, 0.1)', border: 'rgba(6, 182, 212, 0.2)', icon: '#06b6d4', text: '#06b6d4' },
  purple: { bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.2)', icon: '#a855f7', text: '#a855f7' },
  pink: { bg: 'rgba(236, 72, 153, 0.1)', border: 'rgba(236, 72, 153, 0.2)', icon: '#ec4899', text: '#ec4899' },
  orange: { bg: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.2)', icon: '#f97316', text: '#f97316' },
  emerald: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.2)', icon: '#10b981', text: '#10b981' },
};

export const StatCard = ({ label, value, icon, color = 'cyan', trend }: StatCardProps) => {
  const colors = colorMap[color];

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(45, 27, 105, 0.6) 100%)',
      backdropFilter: 'blur(15px)',
      borderRadius: '1rem',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      border: `1px solid ${colors.border}`,
      padding: '1.5rem',
      transition: 'all 0.3s ease',
      cursor: 'pointer',
      animation: 'scaleIn 0.5s ease',
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLElement).style.borderColor = colors.icon;
      (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 48px ${colors.icon}30, 0 4px 6px rgba(0, 0, 0, 0.1)`;
      (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLElement).style.borderColor = colors.border;
      (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
      (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.75rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
          <h3 style={{ fontSize: '2rem', fontWeight: '900', color: '#f1f5f9', marginTop: '0.5rem' }}>{value}</h3>
          {trend && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.75rem',
              fontWeight: '600',
              marginTop: '0.75rem',
              paddingLeft: '0.5rem',
              paddingRight: '0.5rem',
              paddingTop: '0.25rem',
              paddingBottom: '0.25rem',
              borderRadius: '0.5rem',
              width: 'fit-content',
              background: trend.isPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              color: trend.isPositive ? '#10b981' : '#ef4444',
            }}>
              {trend.isPositive ? (
                <TrendingUp size={14} />
              ) : (
                <TrendingDown size={14} />
              )}
              <span>{trend.isPositive ? '+' : '-'}{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        <div style={{
          padding: '0.75rem',
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '0.75rem',
          color: colors.icon,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 20px ' + colors.icon + '20',
          transition: 'all 0.3s ease',
        }}>
          {icon}
        </div>
      </div>
    </div>
  );
};
