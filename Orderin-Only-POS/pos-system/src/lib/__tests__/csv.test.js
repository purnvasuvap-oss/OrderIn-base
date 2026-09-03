import { exportCSV } from '../csv';

describe('exportCSV', () => {
  let created;
  let clickSpy;

  beforeEach(() => {
    created = [];
    clickSpy = vi.fn();
    global.URL.createObjectURL = vi.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        el.click = clickSpy;
        created.push(el);
      }
      return el;
    });
  });

  it('does nothing when given no rows', () => {
    exportCSV('empty.csv', []);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('builds a downloadable CSV blob from the row objects', () => {
    exportCSV('orders.csv', [
      { id: 1, name: 'Dosa', total: 120 },
      { id: 2, name: 'Idli', total: 40 },
    ]);

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = global.URL.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(created[0].download).toBe('orders.csv');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('quotes values and escapes embedded quotes', () => {
    const blobSpy = vi.spyOn(global, 'Blob').mockImplementation((parts) => ({ __parts: parts }));

    exportCSV('x.csv', [{ note: 'say "hi"' }]);

    const csvText = blobSpy.mock.calls[0][0][0];
    expect(csvText).toContain('note');
    expect(csvText).toContain('"say ""hi"""');
    blobSpy.mockRestore();
  });
});
