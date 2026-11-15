// ImgBB integration removed. This file kept as a tiny compatibility stub.
// Use `src/services/storageService.js` for uploads and deletions instead.

export async function uploadImage() {
  throw new Error('ImgBB integration removed. Use storageService.uploadFile instead.');
}

export async function deleteByDeleteHash() {
  // no-op for legacy compatibility
  return false;
}

export async function deleteById() {
  // no-op for legacy compatibility
  return false;
}

export default {
  uploadImage,
  deleteByDeleteHash,
  deleteById
};
