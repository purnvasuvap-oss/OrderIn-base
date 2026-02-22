import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, getMetadata } from 'firebase/storage';
import { app } from '../firebase';

const storage = getStorage(app);

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

async function urlToBlob(url) {
  const res = await fetch(url);
  return await res.blob();
}

export async function uploadFile(fileOrData, folder = 'images', opts = {}) {
  // Backwards-compat: if opts is a string it's the restaurantNumber from older calls
  if (typeof opts === 'string') opts = { restaurantNumber: opts };
  const preferOriginalName = opts.preferOriginalName !== false; // default true

  if (!fileOrData) throw new Error('No file provided to uploadFile');

  let fileBlob;
  let fileName = '';
  let detectedMime = '';

  if (typeof fileOrData === 'string') {
    if (fileOrData.startsWith('data:')) {
      // data:<mime>;base64,<data>
      const mimeMatch = fileOrData.match(/^data:([^;]+);base64,/);
      detectedMime = mimeMatch ? mimeMatch[1] : '';
      if (!detectedMime.startsWith('image/')) {
        throw new Error('Only image data URLs are supported');
      }
      fileBlob = await dataUrlToBlob(fileOrData);
      // infer extension
      const ext = (detectedMime.split('/')[1] || 'png');
      fileName = `image.${ext}`;
    } else if (fileOrData.startsWith('http')) {
      fileBlob = await urlToBlob(fileOrData);
      detectedMime = fileBlob && fileBlob.type ? fileBlob.type : '';
      // Fallback: infer from URL extension if server did not provide Content-Type
      if (!detectedMime.startsWith('image/')) {
        const ext = (fileOrData.split('/').pop().split('?')[0] || '').split('.').pop().toLowerCase();
        if (!['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) {
          throw new Error('Remote URL does not appear to be an image');
        }
        fileName = fileOrData.split('/').pop().split('?')[0];
      } else {
        // if blob gave us a filename, leave below to sanitize
        fileName = fileOrData.split('/').pop().split('?')[0] || `image.${detectedMime.split('/')[1] || 'png'}`;
      }
    } else {
      throw new Error('Unsupported string input for uploadFile');
    }
  } else if (typeof File !== 'undefined' && fileOrData instanceof File) {
    detectedMime = fileOrData.type || '';
    if (!detectedMime.startsWith('image/')) {
      throw new Error('Only image files are supported');
    }
    fileBlob = fileOrData;
    fileName = fileOrData.name || 'file';
  } else if (fileOrData && fileOrData.size) {
    // Blob-like
    detectedMime = fileOrData.type || '';
    if (detectedMime && !detectedMime.startsWith('image/')) {
      throw new Error('Only image blobs are supported');
    }
    fileBlob = fileOrData;
    fileName = fileOrData.name || 'blob';
  } else {
    console.error('uploadFile expected File/Blob or data URL but got:', fileOrData);
    throw new Error('Invalid file provided for upload');
  }

  // sanitize filename: remove spaces and unsafe characters
  const sanitize = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_');
  let baseName = sanitize(String(fileName || 'image'));

  // Normalize folder to avoid accidental leading/trailing slashes and double slashes
  const normalizedFolder = String(folder || '').replace(/^\/+|\/+$/g, '');

  // Build initial candidate path using original filename (no random IDs)
  let candidateStorageName = baseName;
  let path = normalizedFolder ? `${normalizedFolder}/${candidateStorageName}` : `${candidateStorageName}`;
  let storageRef = ref(storage, path);

  // Check for collision, if exists append timestamp
  try {
    // getMetadata will succeed if the object exists
    await getMetadata(storageRef);
    // If we reach here, object exists — append timestamp
    const ts = Date.now();
    const dotIdx = baseName.lastIndexOf('.');
    if (dotIdx > 0) {
      candidateStorageName = `${baseName.slice(0, dotIdx)}-${ts}${baseName.slice(dotIdx)}`;
    } else {
      candidateStorageName = `${baseName}-${ts}`;
    }
    path = normalizedFolder ? `${normalizedFolder}/${candidateStorageName}` : `${candidateStorageName}`;
    storageRef = ref(storage, path);
  } catch (err) {
    // object does not exist — proceed with candidate
  }

  // Upload the blob/file
  const snapshot = await uploadBytes(storageRef, fileBlob);
  const url = await getDownloadURL(storageRef);

  return {
    image_url: url,
    image_path: path,
    image_name: candidateStorageName,
    raw: snapshot
  };
}

export async function deleteFileByPath(path) {
  if (!path) return;
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
    return true;
  } catch (err) {
    console.warn('deleteFileByPath failed:', err.message || err);
    throw err;
  }
}

export default {
  uploadFile,
  deleteFileByPath
};