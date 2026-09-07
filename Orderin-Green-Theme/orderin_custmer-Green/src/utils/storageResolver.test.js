import { resolveImageUrl, clearStorageResolverCache } from './storageResolver';
import * as storageMod from 'firebase/storage';

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(),
  ref: vi.fn(),
  getDownloadURL: vi.fn(),
}));

describe('storageResolver', () => {
  beforeEach(() => {
    clearStorageResolverCache();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('returns null for an empty uri', async () => {
    expect(await resolveImageUrl(null)).toBeNull();
  });

  it('returns an http URL unchanged', async () => {
    const url = 'https://example.com/img.png';
    expect(await resolveImageUrl(url)).toBe(url);
  });

  it('resolves gs:// via getDownloadURL and caches the result', async () => {
    const gs = 'gs://orderin-7f8bc.firebasestorage.app/menu/images/test.png';
    storageMod.getDownloadURL.mockResolvedValue('https://firebasestorage.example/test.png');

    const r1 = await resolveImageUrl(gs);
    expect(storageMod.getDownloadURL).toHaveBeenCalled();
    expect(r1).toBe('https://firebasestorage.example/test.png');

    storageMod.getDownloadURL.mockClear();
    const r2 = await resolveImageUrl(gs);
    expect(storageMod.getDownloadURL).not.toHaveBeenCalled();
    expect(r2).toBe(r1);

    expect(localStorage.getItem('storage_resolver_cache_v1')).toBeTruthy();
  });
});
