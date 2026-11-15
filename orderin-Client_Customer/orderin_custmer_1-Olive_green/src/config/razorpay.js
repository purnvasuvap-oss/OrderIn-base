// The only place this app reads the Razorpay key.
// Put the public key id in .env as VITE_RAZORPAY_KEY_ID.
// Never put the key secret in this file or anywhere in the browser app.
export const RAZORPAY_KEY_ID = String(import.meta.env.VITE_RAZORPAY_KEY_ID || '').trim();

export function requireRazorpayKeyId() {
  if (!RAZORPAY_KEY_ID) {
    throw new Error('Razorpay is not configured. Set VITE_RAZORPAY_KEY_ID in this app\'s .env file.');
  }
  return RAZORPAY_KEY_ID;
}
