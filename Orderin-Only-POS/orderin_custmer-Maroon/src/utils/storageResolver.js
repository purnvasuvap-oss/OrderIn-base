import { getStorage, ref as storageRef, getDownloadURL } from 'firebase/storage';
import { app } from '../firebaseConfig';

// v1 cache key in localStorage
const LS_KEY = 'storage_resolver_cache_v1';
const memoryCache = new Map();

const loadPersisted = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw);
    return new Map(Object.entries(obj));
  } catch (e) {
    return new Map();
  }
};

const persist = (map) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(map.entries())));
  } catch (e) { /* ignore */ }
};

let persistedCache = loadPersisted();
for (const [k, v] of persistedCache.entries()) memoryCache.set(k, v);

export const clearStorageResolverCache = () => {
  persistedCache = new Map();
  memoryCache.clear();
  try { localStorage.removeItem(LS_KEY); } catch (e) {}
};

const getBucketName = () => {
  try {
    return (app && app.options && app.options.storageBucket) ? app.options.storageBucket : null;
  } catch (e) { return null; }
};

const tryPublicUrl = async (bucket, path) => {
  if (!bucket || !path) return null;
  try {
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
    // Quick HEAD check to ensure resource is accessible
    const resp = await fetch(url, { method: 'HEAD' });
    if (resp.ok) return url;
    return null;
  } catch (e) {
    return null;
  }
};

export const resolveImageUrl = async (uri) => {
  if (!uri) return null;

  // Already an HTTP/HTTPS URL -> return as-is
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;

  // Return cached result if we have one
  if (memoryCache.has(uri)) return memoryCache.get(uri);

  const storage = getStorage();
  const bucket = getBucketName();

  // If uri is gs:// - extract path and call getDownloadURL
  if (uri.startsWith('gs://')) {
    try {
      const m = uri.match(/^gs:\/\/[^\/]+\/(.+)$/);
      if (!m) return null;
      const path = m[1];
      const r = storageRef(storage, path);
      const url = await getDownloadURL(r);
      memoryCache.set(uri, url);
      persistedCache.set(uri, url);
      persist(persistedCache);
      return url;
    } catch (e) {
      console.warn('resolveImageUrl(gs://) failed, will try public URL fallback', uri, e);
      // fallthrough to try public style URL below
    }
  }

  // If uri looks like a relative storage path (e.g., 'menu/images/foo.png' or starting with '/'), attempt to resolve
  const maybePath = uri.startsWith('/') ? uri.slice(1) : uri;
  if (maybePath.indexOf('/') !== -1) {
    try {
      const r = storageRef(storage, maybePath);
      const url = await getDownloadURL(r);
      memoryCache.set(uri, url);
      persistedCache.set(uri, url);
      persist(persistedCache);
      return url;
    } catch (e) {
      console.warn('resolveImageUrl(relative path) getDownloadURL failed, trying public URL', uri, e);
      // try public URL fallback
      const pub = await tryPublicUrl(bucket, maybePath);
      if (pub) {
        memoryCache.set(uri, pub);
        persistedCache.set(uri, pub);
        persist(persistedCache);
        return pub;
      }
      return null;
    }
  }

  // Nothing matched - return null
  return null;
};

export default resolveImageUrl;
