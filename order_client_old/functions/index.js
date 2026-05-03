const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const axios = require('axios');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ 
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Explicit OPTIONS handler for preflight requests
app.options('*', cors({ 
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

admin.initializeApp();

// Razorpay configuration - ignore the removed key if it remains in deployed env.
const FALLBACK_RAZORPAY_KEY_ID = 'rzp_live_Sj1ZPsCyB5iu3t';
const FALLBACK_RAZORPAY_KEY_SECRET = 'dN2uwxFr0hIZkcV57RXdRXmt';
const REMOVED_RAZORPAY_VALUE_HASHES = new Set([
  '0931028ec556aa2d2e65c4c604da9200517b5718df04eedc1cb5b735422b7b44',
  '44f9000b54b1b661e4c2f7fa84aba1cd840827fe6731a99c17fb9a06ce00487b',
]);
const isRemovedRazorpayValue = (value) =>
  REMOVED_RAZORPAY_VALUE_HASHES.has(crypto.createHash('sha256').update(value).digest('hex'));
const resolveRazorpayCredential = (...values) =>
  values.find((value) => value && !isRemovedRazorpayValue(value));

const RAZORPAY_KEY_ID = resolveRazorpayCredential(process.env.RAZORPAY_KEY_ID, FALLBACK_RAZORPAY_KEY_ID);
const RAZORPAY_KEY_SECRET = resolveRazorpayCredential(process.env.RAZORPAY_KEY_SECRET, FALLBACK_RAZORPAY_KEY_SECRET);

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

// HTTP Function: Create Razorpay Order
// Called by Payment Hub to initiate a Razorpay payment
app.post('/createRazorpayOrder', async (req, res) => {
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

      // Validate required fields
      if (!amount || amount <= 0) {
        res.status(400).json({ error: 'Invalid amount' });
        return;
      }
      if (!receipt) {
        res.status(400).json({ error: 'Receipt is required' });
        return;
      }

      console.log('[createRazorpayOrder] Creating order:', {
        amount,
        currency,
        receipt,
        customerPhone,
        restaurantId,
        orderId,
      });

      // Create Razorpay order using API
      const razorpayResponse = await axios.post(
        'https://api.razorpay.com/v1/orders',
        {
          amount: Math.round(amount), // Amount in paise
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
        }
      );

      const orderData = razorpayResponse.data;

      console.log('[createRazorpayOrder] Order created successfully:', {
        order_id: orderData.id,
        amount: orderData.amount,
        currency: orderData.currency,
      });

      res.status(201).json({
        order_id: orderData.id,
        amount: orderData.amount,
        currency: orderData.currency,
        status: orderData.status,
      });
    } catch (error) {
      console.error('[createRazorpayOrder] Error:', error.message || error);
      const errorMessage = error.response?.data?.description || error.message || 'Failed to create Razorpay order';
      res.status(500).json({
        error: 'Failed to create order',
        message: errorMessage,
      });
    }
});

// HTTP Function: Verify Razorpay Payment
// Called by Payment Hub after successful Razorpay modal completion
app.post('/verifyRazorpayPayment', async (req, res) => {
  try {
    const {
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
      } = req.body;

      // Validate required fields
      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        res.status(400).json({
          error: 'Missing required payment details',
          message: 'razorpay_payment_id, razorpay_order_id, and razorpay_signature are required',
        });
        return;
      }

      console.log('[verifyRazorpayPayment] Verifying payment:', {
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
      });

      // Verify signature
      const body = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

      const isSignatureValid = expectedSignature === razorpay_signature;

      if (!isSignatureValid) {
        console.warn('[verifyRazorpayPayment] Signature verification failed:', {
          expected: expectedSignature,
          received: razorpay_signature,
        });
        res.status(400).json({
          error: 'Signature verification failed',
          message: 'Payment signature does not match',
        });
        return;
      }

      console.log('[verifyRazorpayPayment] Signature verified successfully');

      // Optional: Fetch payment details from Razorpay API for additional verification
      try {
        const paymentResponse = await axios.get(
          `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
          {
            auth: {
              username: RAZORPAY_KEY_ID,
              password: RAZORPAY_KEY_SECRET,
            },
          }
        );

        const paymentData = paymentResponse.data;

        console.log('[verifyRazorpayPayment] Payment details from Razorpay:', {
          payment_id: paymentData.id,
          status: paymentData.status,
          amount: paymentData.amount,
          method: paymentData.method,
        });

        // Verify payment status
        if (paymentData.status !== 'captured' && paymentData.status !== 'authorized') {
          res.status(400).json({
            error: 'Payment not captured',
            message: `Payment status is ${paymentData.status}. Expected 'captured' or 'authorized'.`,
          });
          return;
        }

        res.status(200).json({
          success: true,
          message: 'Payment verified successfully',
          payment_id: paymentData.id,
          order_id: razorpay_order_id,
          amount: paymentData.amount,
          currency: paymentData.currency,
          method: paymentData.method,
          status: paymentData.status,
        });
      } catch (apiError) {
        console.warn('[verifyRazorpayPayment] Could not fetch payment details from API:', apiError.message);
        // If API fetch fails, still consider signature valid as a fallback
        res.status(200).json({
          success: true,
          message: 'Payment signature verified successfully',
          payment_id: razorpay_payment_id,
          order_id: razorpay_order_id,
        });
      }
    } catch (error) {
      console.error('[verifyRazorpayPayment] Error:', error.message || error);
      res.status(500).json({
        error: 'Payment verification failed',
        message: error.message || 'An error occurred while verifying payment',
      });
    }
});

// Export Express app as Firebase Function
exports.api = functions.https.onRequest(app);

// Also export individual functions for backward compatibility
exports.createRazorpayOrder = functions.https.onRequest((req, res) => app(req, res));
exports.verifyRazorpayPayment = functions.https.onRequest((req, res) => app(req, res));
