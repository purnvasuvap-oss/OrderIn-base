const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Trigger: when a promotion doc is deleted, attempt to delete the referenced storage object
exports.onPromotionDelete = functions.firestore
  .document('Restaurant/orderin_restaurant_1/promotions/{promotionId}')
  .onDelete(async (snap, context) => {
    const data = snap.data();
    if (!data) return null;
    const imagePath = data.image_path || null;
    if (!imagePath) {
      console.log('onPromotionDelete: no image_path to delete for', context.params.promotionId);
      return null;
    }

    try {
      const bucket = admin.storage().bucket();
      const file = bucket.file(imagePath);
      const [exists] = await file.exists();
      if (!exists) {
        console.warn('onPromotionDelete: file does not exist:', imagePath);
        return null;
      }
      await file.delete();
      console.log('onPromotionDelete: deleted storage file', imagePath);
    } catch (err) {
      console.error('onPromotionDelete: failed to delete storage file', imagePath, err.message || err);
    }
    return null;
  });

// Callable helper: return signed upload URL for clients to use (requires authenticated admin user)
exports.getSignedPromotionUploadUrl = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  // Check for admin claim (recommended). If you don't use custom claims, modify as needed.
  const isAdmin = context.auth.token && context.auth.token.admin;
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }

  const { filename, folder = 'promotions' } = data;
  if (!filename || typeof filename !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'filename is required');
  }

  const bucket = admin.storage().bucket();
  const filePath = `${folder}/${filename}`;
  const file = bucket.file(filePath);

  try {
    // Write signed URL for PUT
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: 'image/*'
    });
    return { uploadUrl: url, path: filePath };
  } catch (err) {
    console.error('getSignedPromotionUploadUrl failed:', err.message || err);
    throw new functions.https.HttpsError('internal', 'Failed to create signed upload URL');
  }
});