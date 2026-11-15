import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

export const resolveTableFromSearch = (search = '', stored = '', legacy = '') => {
  const fromQuery = new URLSearchParams(String(search || '')).get('table');
  const table = String(fromQuery || stored || legacy || '').trim();
  return table || '1';
};


/**
 * Custom hook to manage table number parameter across the app.
 * Returns the table number and a function to create navigation URLs with the table param.
 */
export const useTableNumber = () => {
  const [searchParams] = useSearchParams();
  const [tableNumber, setTableNumber] = useState(null);

  useEffect(() => {
    const table = resolveTableFromSearch(
      searchParams.toString(),
      localStorage.getItem('tableNumber'),
      ''
    );
    if (searchParams.get('table')) {
      localStorage.setItem('tableNumber', table);
    }
    setTableNumber(table);
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
