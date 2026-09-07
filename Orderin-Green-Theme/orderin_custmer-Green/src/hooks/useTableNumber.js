import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

/**
 * Custom hook to manage table number parameter across the app.
 * Returns the table number and a function to create navigation URLs with the table param.
 */
export const useTableNumber = () => {
  const [searchParams] = useSearchParams();
  const [tableNumber, setTableNumber] = useState(null);

  useEffect(() => {
    // Get table from URL params
    const table = searchParams.get('table');
    if (table) {
      setTableNumber(table);
      localStorage.setItem('tableNumber', table);
    } else {
      // Fallback to localStorage if not in URL
      const stored = localStorage.getItem('tableNumber') || '1';
      setTableNumber(stored);
    }
  }, [searchParams]);

  /**
   * Create a path with table query parameter
   * @param {string} path - The base path (e.g., '/menu', '/cart')
   * @returns {string} The path with table parameter appended
   */
  const getPathWithTable = (path) => {
    const table = tableNumber || localStorage.getItem('tableNumber') || '1';
    return `${path}?table=${table}`;
  };

  return { tableNumber, getPathWithTable };
};
