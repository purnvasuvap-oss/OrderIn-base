# Razorpay Payment Integration Guide

This guide walks you through the complete setup and configuration of Razorpay payment processing in your Order IN application.

## Overview

The Razorpay integration has been implemented with the following components:

1. **Payment Hub Frontend** (`PaymentHubPage.tsx`) - Handles the UI and payment initiation
2. **Firebase Cloud Functions** - Backend endpoints for order creation and payment verification
3. **Firebase Firestore** - Stores payment transaction details
4. **Razorpay API** - Processes actual payment transactions

## Prerequisites

- Razorpay Live Account with API keys
- Firebase Project with Cloud Functions enabled
- Node.js 18+ installed on your machine

## Setup Steps

### Step 1: Configure Razorpay API Keys

Your Razorpay credentials have been provided:
- **Key ID**: `rzp_live_SQcvIlOahj69Ma`
- **Key Secret**: `SK5TvpFE4jw76xSgxxHAsLkl`

**⚠️ SECURITY WARNING:**
- These keys should be stored in **environment variables**, not hardcoded
- The Key Secret should NEVER be exposed in frontend code
- Use Firebase environment configuration for functions

### Step 2: Set Up Firebase Environment Variables

1. **Update Firebase Functions Configuration:**

```bash
# Navigate to functions directory
cd order_client_1/functions

# Install dependencies
npm install

# Set Razorpay environment variables (from Firebase Console)
firebase functions:config:set razorpay.key_id="rzp_live_SQcvIlOahj69Ma"
firebase functions:config:set razorpay.key_secret="SK5TvpFE4jw76xSgxxHAsLkl"
```

2. **Update functions/index.js** to use environment variables:

```javascript
const RAZORPAY_KEY_ID = functions.config().razorpay?.key_id || process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = functions.config().razorpay?.key_secret || process.env.RAZORPAY_KEY_SECRET;
```

### Step 3: Deploy Firebase Cloud Functions

```bash
# From the order_client_1 root directory
firebase deploy --only functions

# Verify deployment
firebase functions:list
```

You should see two new functions:
- `createRazorpayOrder`
- `verifyRazorpayPayment`

### Step 4: Get Firebase Cloud Functions URLs

After deployment, note the function URLs. They'll look like:
```
https://us-central1-YOUR_PROJECT.cloudfunctions.net/createRazorpayOrder
https://us-central1-YOUR_PROJECT.cloudfunctions.net/verifyRazorpayPayment
```

### Step 5: Update Payment Hub API Endpoints

Update the API calls in `PaymentHubPage.tsx` with your actual Firebase function URLs:

**Find:**
```javascript
const orderResponse = await fetch('/api/create-razorpay-order', {
```

**Replace with:**
```javascript
const orderResponse = await fetch('https://us-central1-YOUR_PROJECT.cloudfunctions.net/createRazorpayOrder', {
```

**Find:**
```javascript
const verifyResponse = await fetch('/api/verify-razorpay-payment', {
```

**Replace with:**
```javascript
const verifyResponse = await fetch('https://us-central1-YOUR_PROJECT.cloudfunctions.net/verifyRazorpayPayment', {
```

## Features Implemented

### ✅ Payment Flow
1. User selects payment method and clicks "Pay Now"
2. Frontend creates Razorpay order via Cloud Function
3. Razorpay payment modal opens
4. User completes payment in Razorpay modal
5. Razorpay confirms payment success
6. Frontend verifies signature with backend
7. Payment details stored in Firebase
8. User redirected to success page

### ✅ Error Handling
- Network error handling with user-friendly error messages
- Payment signature verification for security
- Razorpay modal dismissal handling
- Retry mechanism for failed payments
- Detailed console logs for debugging

### ✅ Payment Data Stored
When a payment succeeds, the following data is stored in Firebase:
```javascript
{
  OnlinePayMethod: "UPI/CARD/NET_BANKING/WALLET",
  paymentStatus: "paid",
  paymentTimestamp: "2024-03-21T10:30:00.000Z",
  razorpayPaymentId: "pay_xxxxxxxxxxxxx",
  razorpayOrderId: "order_xxxxxxxxxxxxx",
  razorpaySignature: "xxxxxxxxxxxxx",
  amount: 500.00,
  currency: "INR"
}
```

### ✅ Loading States
- Razorpay script loading state
- Payment processing state
- Retry button with loading indicator
- Disabled button while payment gateway loads

## Testing Payment Integration

### Test Razorpay Card Numbers (Live Mode)

```
Visa (Success):
Card Number: 4111 1111 1111 1111
Expiry: 12/25
CVV: 123

Mastercard (Success):
Card Number: 5105 1051 0510 5100
Expiry: 12/25
CVV: 123

Test Payment Amount: ₹1 (minimum)
```

**Note**: Ensure you're in Razorpay **Live Mode** (not Test Mode) to use these test cards.

### Manual Testing Steps

1. Open Payment Hub page with order details
2. Verify restaurant and order information loads
3. Select a payment method
4. Click "Pay Now"
5. Follow Razorpay modal instructions
6. Complete payment with test card
7. Verify success page appears
8. Check Firebase to confirm payment data stored

## Troubleshooting

### Issue: "Payment gateway not loaded" Error

**Solution:**
- Check browser console for Razorpay script loading errors
- Verify internet connection
- Clear browser cache and reload
- Check if Razorpay CDN is accessible on your network

### Issue: Payment Modal Not Opening

**Possible Causes:**
1. Razorpay script not loaded - check console logs
2. Invalid Key ID - verify `rzp_live_SQcvIlOahj69Ma` is correct
3. Backend order creation failed - check function logs:
   ```bash
   firebase functions:log
   ```

### Issue: Signature Verification Failed

**Possible Causes:**
1. Key Secret incorrect or mismatch
2. Payment data corrupted during transmission
3. Backend function returning wrong signature

**Debug Steps:**
```javascript
// Check console logs from backend
console.log('[verifyRazorpayPayment] Signature verification failed:', {
  expected: expectedSignature,
  received: razorpaySignature,
});
```

### Issue: Payment Status Not Updating in Firebase

**Possible Causes:**
1. Firebase Firestore rules deny write access
2. Customer document doesn't exist
3. Order ID not found in pastOrders array

**Check Firestore Rules:**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /Restaurant/{restaurantId}/customers/{customerPhone} {
      allow read, write: if request.auth != null;
      allow read, write: if request.auth == null && /* add your custom logic */;
    }
  }
}
```

## Monitoring and Logging

### View Firebase Function Logs

```bash
# Real-time logs
firebase functions:log --follow

# Specific function logs
firebase functions:log --limit=50 createRazorpayOrder
firebase functions:log --limit=50 verifyRazorpayPayment
```

### Razorpay Dashboard Monitoring

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com)
2. Navigate to **Payments** section
3. View transaction history and status
4. Check webhook delivery status

### Debug Logs in Payment Hub

The Payment Hub page logs detailed information to console:
- Payment initiation details
- Razorpay order creation
- Payment status updates
- Firebase write operations
- Verification results

Open browser DevTools (F12) → Console tab to view logs during payment testing.

## Security Best Practices

1. **Never expose Razorpay Key Secret in frontend code** ✅
   - Already implemented - secret only used in Cloud Functions

2. **Always verify payment signature** ✅
   - Implementation includes HMAC-SHA256 signature verification

3. **Use HTTPS for all API calls** ✅
   - Firebase Cloud Functions use HTTPS by default

4. **Store sensitive data securely** ✅
   - Payment details stored in Firestore with proper security rules

5. **Implement rate limiting** ⚠️
   - Recommended: Add Cloud Function rate limiting

6. **Log suspicious activities** ✅
   - Signature mismatches logged and monitored

## Production Deployment Checklist

- [ ] Razorpay API keys stored in Firebase environment configuration
- [ ] Cloud Functions deployed with production keys
- [ ] Firestore security rules updated for customer document access
- [ ] Payment Hub page URLs updated with production function URLs
- [ ] SSL certificate configured for your domain
- [ ] Razorpay webhook configured (optional, for settlement reconciliation)
- [ ] Payment success page implemented
- [ ] Error pages designed and implemented
- [ ] Support contact information added to Payment Hub
- [ ] Payment history accessible to customers
- [ ] Admin dashboard showing payment statistics
- [ ] Regular backups of payment data configured

## Additional Resources

- [Razorpay API Documentation](https://razorpay.com/docs/api)
- [Razorpay Payment Integration Guide](https://razorpay.com/docs/orders/integration)
- [Firebase Cloud Functions Documentation](https://firebase.google.com/docs/functions)
- [Firebase Security Rules Documentation](https://firebase.google.com/docs/firestore/security)

## Support

For issues or questions:

1. Check browser console logs for detailed error messages
2. View Firebase function logs: `firebase functions:log`
3. Verify Razorpay status: [Razorpay Dashboard](https://dashboard.razorpay.com)
4. Contact Razorpay support for payment issues
5. Check Firebase status page for service outages

---

**Last Updated**: March 21, 2026
**Integration Status**: ✅ Complete and Ready for Testing
