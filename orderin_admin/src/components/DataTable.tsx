interface DataTableProps {
  columns: Array<{
    header: string;
    accessor: string;
    render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
  }>;
  data: Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;
}

export const DataTable = ({ columns, data, onRowClick }: DataTableProps) => {
  return (
    <div style={{
      overflowX: 'auto',
      border: '1px solid rgba(6, 182, 212, 0.2)',
      borderRadius: '1rem',
      background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(45, 27, 105, 0.6) 100%)',
      backdropFilter: 'blur(15px)',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{
            background: 'rgba(30, 27, 75, 0.5)',
            borderBottom: '2px solid rgba(6, 182, 212, 0.2)',
          }}>
            {columns.map((col) => (
              <th
                key={col.accessor}
                style={{
                  textAlign: 'left',
                  paddingLeft: '1.5rem',
                  paddingRight: '1.5rem',
                  paddingTop: '1rem',
                  paddingBottom: '1rem',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  color: '#06b6d4',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{
                paddingLeft: '1.5rem',
                paddingRight: '1.5rem',
                paddingTop: '3rem',
                paddingBottom: '3rem',
                textAlign: 'center',
                color: '#94a3b8',
                fontWeight: '500',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ fontSize: '2rem', opacity: 0.2 }}>📭</div>
                  No data available
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: '1px solid rgba(6, 182, 212, 0.1)',
                  transition: 'all 0.15s ease',
                  cursor: onRowClick ? 'pointer' : 'default',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(6, 182, 212, 0.05)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.accessor} style={{
                    paddingLeft: '1.5rem',
                    paddingRight: '1.5rem',
                    paddingTop: '1rem',
                    paddingBottom: '1rem',
                    fontSize: '0.875rem',
                    color: '#f1f5f9',
                    fontWeight: '500',
                  }}>
                    {col.render ? col.render(row[col.accessor], row) : (row[col.accessor] as React.ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
