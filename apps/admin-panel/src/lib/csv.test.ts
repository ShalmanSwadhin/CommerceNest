import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

interface Row {
  name: string;
  amount: number;
  note: string;
}

describe('toCsv', () => {
  it('produces a header row plus one row per input, comma-joined', () => {
    const rows: Row[] = [
      { name: 'TechWorld BD', amount: 1959, note: 'ok' },
      { name: 'Rahim Mobile', amount: 2658, note: 'ok' },
    ];
    const csv = toCsv(rows, [
      { header: 'Store', value: (r) => r.name },
      { header: 'Amount', value: (r) => r.amount },
      { header: 'Note', value: (r) => r.note },
    ]);
    const lines = csv.split('\r\n');
    expect(lines).toEqual([
      'Store,Amount,Note',
      'TechWorld BD,1959,ok',
      'Rahim Mobile,2658,ok',
    ]);
  });

  it('respects whatever rows are passed in — i.e. a filtered view exports only the filtered rows', () => {
    const rows: Row[] = [
      { name: 'A', amount: 1, note: '' },
      { name: 'B', amount: 2, note: '' },
      { name: 'C', amount: 3, note: '' },
    ];
    const filtered = rows.filter((r) => r.amount > 1);
    const csv = toCsv(filtered, [{ header: 'Name', value: (r) => r.name }]);
    expect(csv.split('\r\n')).toEqual(['Name', 'B', 'C']);
  });

  it('quotes a field containing a comma', () => {
    const csv = toCsv([{ name: 'Dhaka, Bangladesh', amount: 0, note: '' }], [
      { header: 'Location', value: (r) => r.name },
    ]);
    expect(csv.split('\r\n')[1]).toBe('"Dhaka, Bangladesh"');
  });

  it('quotes and escapes a field containing a double quote', () => {
    const csv = toCsv([{ name: 'The "Best" Store', amount: 0, note: '' }], [
      { header: 'Name', value: (r) => r.name },
    ]);
    expect(csv.split('\r\n')[1]).toBe('"The ""Best"" Store"');
  });

  it('quotes a field containing a newline', () => {
    const csv = toCsv([{ name: 'Line one\nLine two', amount: 0, note: '' }], [
      { header: 'Note', value: (r) => r.name },
    ]);
    expect(csv.split('\r\n').slice(1).join('\r\n')).toBe('"Line one\nLine two"');
  });

  it('never emits a column that was not explicitly requested (no accidental PII leakage beyond what is asked for)', () => {
    const rows = [{ name: 'A', amount: 1, note: 'secret internal note' }];
    const csv = toCsv(rows, [{ header: 'Name', value: (r) => r.name }]);
    expect(csv).not.toContain('secret internal note');
  });

  it('produces just the header row for an empty dataset', () => {
    const csv = toCsv([], [{ header: 'Store', value: (r: Row) => r.name }]);
    expect(csv).toBe('Store');
  });
});
