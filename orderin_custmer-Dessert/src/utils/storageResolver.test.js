import { resolveImageUrl, clearStorageResolverCache } from './storageResolver';
import * as storageMod from 'firebase/storage';

jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(),
  ref: jest.fn(),
  getDownloadURL: jest.fn(),
}));

describe('storageResolver', () => {
  beforeEach(() => {
    clearStorageResolverCache();
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('returns null for empty uri', async () => {
    const r = await resolveImageUrl(null);
    expect(r).toBeNull();
  });

  test('returns http URL unchanged', async () => {
    const url = 'https://example.com/img.png';
    const r = await resolveImageUrl(url);
    expect(r).toBe(url);
  });

  test('resolves gs:// via getDownloadURL and caches', async () => {
    const gs = 'gs://orderin-7f8bc.firebasestorage.app/menu/images/test.png';
    storageMod.getDownloadURL.mockResolvedValue('https://firebasestorage.example/test.png');
    const r1 = await resolveImageUrl(gs);
    expect(storageMod.getDownloadURL).toHaveBeenCalled();
    expect(r1).toBe('https://firebasestorage.example/test.png');

    // second call should use cache and not call getDownloadURL again
    storageMod.getDownloadURL.mockClear();
    const r2 = await resolveImageUrl(gs);
    expect(storageMod.getDownloadURL).not.toHaveBeenCalled();
    expect(r2).toBe(r1);

    // persisted in localStorage
    const raw = localStorage.getItem('storage_resolver_cache_v1');
    expect(raw).toBeTruthy();
  });
});
