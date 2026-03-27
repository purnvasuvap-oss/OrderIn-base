const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const axios = require('axios');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: true }));

admin.initializeApp();

const RAZORPAY_KEY_ID = functions.config().razorpay?.key_id || process.env.RAZORPAY_KEY_ID || 'rzp_live_SQcvIlOahj69Ma';
const RAZORPAY_KEY_SECRET = functions.config().razorpay?.key_secret || process.env.RAZORPAY_KEY_SECRET || 'SK5TvpFE4jw76xSgxxHAsLkl';

console.log('[Razorpay] Using key_id:', RAZORPAY_KEY_ID ? 'SET' : 'MISSING');

// API Routes for /api/* proxy (required by frontend)
app.post('/api/createRazorpayOrder', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

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


exports.createRazorpayOrder = functions.https.onRequest(async (req, res) => {
  // Built-in CORS handling for Cloud Functions
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      amount,
      currency = 'INR',
      receipt,
      customerPhone,
      restaurantId,
      orderId,
      paymentMethod,
    } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!receipt) {
      return res.status(400).json({ error: 'Receipt is required' });
    }

    console.log('[createRazorpayOrder] Request body:', req.body);
    console.log('[createRazorpayOrder] Using Razorpay Key:', RAZORPAY_KEY_ID ? `${RAZORPAY_KEY_ID.slice(0,10)}...` : 'MISSING');

    const razorpayResponse = await axios.post(
      'https://api.razorpay.com/v1/orders',
      {
        amount: Math.round(amount * 100), // Razorpay expects paise
        currency,
        receipt,
        notes: {
          customerPhone,
          restaurantId,
          orderId,
          paymentMethod,
        },
      },
      {
        auth: {
          username: RAZORPAY_KEY_ID,
          password: RAZORPAY_KEY_SECRET,
        },
        timeout: 10000,
      }
    );

    const orderData = razorpayResponse.data;

    console.log('[createRazorpayOrder] SUCCESS - Order created:', {
      order_id: orderData.id,
      amount: orderData.amount,
      currency: orderData.currency,
      status: orderData.status,
    });

    res.status(201).json({
      order_id: orderData.id,
      amount: orderData.amount,
      currency: orderData.currency,
      status: orderData.status,
    });
  } catch (error) {
    console.error('[createRazorpayOrder] FULL ERROR:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      code: error.code,
      stack: error.stack?.slice(0, 500),
    });
    
    let errorMessage = 'Failed to create Razorpay order';
    if (error.response?.status === 401) {
      errorMessage = 'Razorpay authentication failed - check API keys';
    } else if (error.response?.status === 400) {
      errorMessage = `Razorpay validation error: ${error.response.data?.description || error.message}`;
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout - Razorpay API slow';
    }
    
    res.status(500).json({
      error: 'Failed to create order',
      message: errorMessage,
      debug: process.env.FUNCTIONS_EMULATOR ? 'true' : 'false',
    });
  }
});

exports.verifyRazorpayPayment = functions.https.onRequest(async (req, res) => {
  // Built-in CORS handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({
        error: 'Missing required payment details',
        message: 'razorpay_payment_id, razorpay_order_id, and razorpay_signature are required',
      });
    }

    console.log('[verifyRazorpayPayment] Verifying:', {
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
    });

    const signatureString = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(signatureString)
      .digest('hex');

    console.log('[verifyRazorpayPayment] Signatures:', {
      expected: expectedSignature.slice(0,20) + '...',
      received: razorpay_signature.slice(0,20) + '...',
      match: expectedSignature === razorpay_signature,
    });

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        error: 'Signature verification failed',
        message: 'Payment signature mismatch',
      });
    }

    res.status(200).json({
      status: 'verified',
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
    });
  } catch (error) {
    console.error('[verifyRazorpayPayment] Error:', error.message || error);
    res.status(500).json({
      error: 'Verification failed',
      message: error.message || 'Internal error',
    });
  }
});
