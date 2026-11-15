import { describe, expect, it } from 'vitest';
import { resolveTableFromSearch } from '../useTableNumber';

describe('table QR parameter', () => {
  it('keeps the table from the URL when a diner scans a table QR', () => {
    expect(resolveTableFromSearch('?table=12', '1', '1')).toBe('12');
    expect(resolveTableFromSearch('table=7', '', '')).toBe('7');
  });

  it('uses a stored table when the URL has none, otherwise table 1', () => {
    expect(resolveTableFromSearch('', '4', '')).toBe('4');
    expect(resolveTableFromSearch('', '', '')).toBe('1');
  });
});
