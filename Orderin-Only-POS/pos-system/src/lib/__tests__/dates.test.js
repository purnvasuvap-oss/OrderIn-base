import { toLocalDateInputValue, fromLocalDateInputValue } from '../dates';

describe('dates lib', () => {
  it('formats a date as a local YYYY-MM-DD input value', () => {
    // noon local time — offset shifting cannot cross a day boundary here
    const d = new Date(2026, 8, 1, 12, 0, 0); // 1 Sep 2026
    expect(toLocalDateInputValue(d)).toBe('2026-09-01');
  });

  it('keeps the local calendar date for a time just after local midnight', () => {
    const justAfterMidnight = new Date(2026, 8, 1, 0, 32, 0);
    expect(toLocalDateInputValue(justAfterMidnight)).toBe('2026-09-01');
  });

  it('round-trips a date input value back to a local-midnight timestamp', () => {
    const ms = fromLocalDateInputValue('2026-09-01');
    const back = new Date(ms);
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(8);
    expect(back.getDate()).toBe(1);
    expect(back.getHours()).toBe(0);
  });

  it('is stable across the round trip', () => {
    const value = '2026-02-14';
    expect(toLocalDateInputValue(new Date(fromLocalDateInputValue(value)))).toBe(value);
  });
});
