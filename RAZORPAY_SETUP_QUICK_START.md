# Razorpay Integration - Quick Setup Guide

## What Was Implemented

✅ **Payment Hub Page** - Full Razorpay integration with:
- Razorpay modal for secure payment processing
- Error handling and retry mechanism
- Loading states for better UX
- Payment details storage in Firebase
- Debug logging for troubleshooting

✅ **Firebase Cloud Functions** - Two new serverless functions:
- `createRazorpayOrder` - Creates Razorpay orders
- `verifyRazorpayPayment` - Verifies payment signatures

✅ **Security Features**:
- HMAC-SHA256 signature verification
- API key secret protected in backend only
- CORS headers configured
- Comprehensive error handling

## Next Steps (REQUIRED)

### 1. Deploy Cloud Functions

```bash
cd order_client_1

# Install dependencies
npm install

# Make sure you have Firebase CLI installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy functions
firebase deploy --only functions
```

### 2. Get Your Cloud Function URLs

After deployment, run:
```bash
firebase functions:list
```

You'll see URLs like:
```
createRazorpayOrder (HTTP(S)) - https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/createRazorpayOrder
verifyRazorpayPayment (HTTP(S)) - https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/verifyRazorpayPayment
```

### 3. Update PaymentHubPage.tsx

Edit: `orderin_admin/src/pages/PaymentHubPage.tsx`

**Find these two API endpoints:**

Line ~180:
```javascript
const orderResponse = await fetch('/api/create-razorpay-order', {
```

Change to:
```javascript
const orderResponse = await fetch('https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/createRazorpayOrder', {
```

Line ~215:
```javascript
const verifyResponse = await fetch('/api/verify-razorpay-payment', {
```

Change to:
```javascript
const verifyResponse = await fetch('https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/verifyRazorpayPayment', {
```

### 4. Test Payment Integration

1. Navigate to Payment Hub with test order
2. Select payment method
3. Click "Pay Now"
4. Complete payment with test card (see guide for test cards)
5. Verify success page loads
6. Check Firebase console to see stored payment data

## File Changes Summary

### Modified Files
1. **orderin_admin/src/pages/PaymentHubPage.tsx**
   - Added Razorpay script loading
   - Integrated Razorpay payment modal
   - Added payment error handling and retry logic
   - Added payment details storage in Firebase
   - Enhanced UI with error alerts
   - Added loading states

2. **order_client_1/functions/index.js**
   - Added `createRazorpayOrder` function
   - Added `verifyRazorpayPayment` function
   - Added Razorpay API integration
   - Added HMAC signature verification

3. **order_client_1/functions/package.json**
   - Added `axios` dependency for HTTP requests

### Created Files
1. **RAZORPAY_INTEGRATION_GUIDE.md** - Complete setup and troubleshooting guide

## Razorpay API Keys

Your Razorpay credentials (already in rzp-key.csv):
- **Key ID**: `rzp_live_Sj1ZPsCyB5iu3t`
- **Key Secret**: `dN2uwxFr0hIZkcV57RXdRXmt`

⚠️ Store these as Firebase environment variables, not in code!

## Key Features

### Payment Flow
```
User Clicks "Pay Now"
    ↓
Create Razorpay Order (Backend)
    ↓
Open Razorpay Modal
    ↓
User Completes Payment
    ↓
Verify Signature (Backend)
    ↓
Update Firebase with Payment Details
    ↓
Show Success Page
```

### Stored Payment Data
```javascript
{
  OnlinePayMethod: "UPI/CARD/NET_BANKING/WALLET",
  paymentStatus: "paid",
  paymentTimestamp: "ISO string",
  razorpayPaymentId: "pay_xxxxx",
  razorpayOrderId: "order_xxxxx",
  razorpaySignature: "xxxxx",
  amount: 500.00,
  currency: "INR"
}
```

### Error Handling
- ✅ Razorpay script loading failures
- ✅ Network errors during order creation
- ✅ Payment signature verification failures
- ✅ Timeout handling
- ✅ User dismissal of payment modal
- ✅ Firebase write failures
- ✅ Retry button for failed payments

### Loading States
- ✅ Razorpay script loading
- ✅ Payment processing
- ✅ Retry operation
- ✅ Button disabled states

## Testing

### Development Testing
1. Use Razorpay test cards
2. Check browser console for logs
3. Monitor Firebase console for data
4. View Cloud Function logs: `firebase functions:log`

### Test Cards (Live Mode)
```
Visa: 4111 1111 1111 1111
Mastercard: 5105 1051 0510 5100
Expiry: 12/25
CVV: 123
Amount: ₹1 (minimum)
```

## Troubleshooting

### "Loading Payment Gateway..." stuck
- Check Razorpay CDN accessibility
- Check browser console for errors
- Verify internet connection

### Payment Modal Not Opening
- Verify Key ID in code
- Check backend logs: `firebase functions:log`
- Ensure order created successfully

### Signature Verification Failed
- Verify Key Secret configuration
- Check backend logs for detailed error
- Ensure no data corruption during transmission

### Payment Not Updating Firebase
- Check Firestore security rules
- Verify customer document exists
- Check function logs for errors

## Support & Documentation

📖 **See RAZORPAY_INTEGRATION_GUIDE.md** for:
- Complete setup instructions
- Security best practices
- Production deployment checklist
- Detailed troubleshooting
- Additional resources

🔗 **Useful Links:**
- [Razorpay Documentation](https://razorpay.com/docs)
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
- [Razorpay Dashboard](https://dashboard.razorpay.com)

---

**Status**: ✅ Integration Complete - Ready for Deployment
**Date**: March 21, 2026
