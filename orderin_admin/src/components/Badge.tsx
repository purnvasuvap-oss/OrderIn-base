interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  children: React.ReactNode;
}

export const Badge = ({ variant = 'default', children }: BadgeProps) => {
  const variants = {
    default: {
      background: 'rgba(6, 182, 212, 0.1)',
      color: '#06b6d4',
      border: '1px solid rgba(6, 182, 212, 0.3)',
    },
    success: {
      background: 'rgba(16, 185, 129, 0.1)',
      color: '#10b981',
      border: '1px solid rgba(16, 185, 129, 0.3)',
    },
    warning: {
      background: 'rgba(249, 115, 22, 0.1)',
      color: '#f97316',
      border: '1px solid rgba(249, 115, 22, 0.3)',
    },
    error: {
      background: 'rgba(239, 68, 68, 0.1)',
      color: '#ef4444',
      border: '1px solid rgba(239, 68, 68, 0.3)',
    },
    info: {
      background: 'rgba(168, 85, 247, 0.1)',
      color: '#a855f7',
      border: '1px solid rgba(168, 85, 247, 0.3)',
    },
  };

  const style = variants[variant];

  return (
    <span style={{
      paddingLeft: '0.75rem',
      paddingRight: '0.75rem',
      paddingTop: '0.375rem',
      paddingBottom: '0.375rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: '500',
      transition: 'all 0.2s ease',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      background: style.background,
      color: style.color,
      border: style.border,
    }}>
      {children}
    </span>
  );
};
