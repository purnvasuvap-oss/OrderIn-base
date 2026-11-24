# WhatsApp bill sender (`sendWhatsAppBill`)

**Not deployed.** Pending billing review (see `BILLING_GUARD.md`). No `firebase.json` points at this folder, so it can't be deployed by accident.

## What works today without this function

After payment, the bill page in every customer app asks:
"Send the bill to +91 ••••••1234?" → **Yes, send** / **Edit number** / **No thanks**.

- **Edit number** checks the number and rejects made-up ones like 1234567890 or 9999999999. It then moves the customer's record (orders, review, loyalty) to the new number and updates the login on the phone.
- With no function deployed, **Yes** opens WhatsApp on the customer's phone with the bill already typed. The customer taps send to keep a copy. This costs nothing and needs no Meta account.

## What this function adds

The bill arrives as a message from the restaurant's WhatsApp Business number, with no tap needed in WhatsApp.

The client sends only `{ restaurantId, phone, orderId }`. The function reads the order from Firestore and sends it only if:

- the order exists under that customer's number,
- the order is paid,
- the bill has been sent fewer than 3 times.

So the endpoint can't be used to message arbitrary numbers.

## Setup once billing is approved

1. In Meta Business Manager, set up WhatsApp Cloud API for the restaurant's number. Note the **Phone number ID** and create a **permanent access token**.
2. Create and get approval for a **Utility** message template named `order_bill`, language `en`, with this body:
   `Hi {{1}}, thanks for dining at {{2}}. Order {{3}}: {{4}}. Total ₹{{5}}, paid by {{6}}.`
3. Store the secrets. They live in Secret Manager, never in the repo:
   ```sh
   firebase functions:secrets:set WHATSAPP_TOKEN
   firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
   ```
4. Deploy only this function:
   ```sh
   cd whatsapp-functions && npm install
   firebase deploy --only functions:sendWhatsAppBill --project <project-id>
   ```
5. In each customer app, set `VITE_WHATSAPP_BILL_URL` in `.env.local` to the function URL, then rebuild and redeploy hosting:
   `https://asia-south1-<project-id>.cloudfunctions.net/sendWhatsAppBill`

If the function fails or refuses a request, the app falls back to opening WhatsApp on the phone, so the customer still gets the bill.

## Cost

The function runs only when a customer taps **Yes, send**. It has no schedules, is capped at 3 instances and 3 sends per order. Meta charges for each business-started template message, so check current WhatsApp pricing for India before you enable it.

## Tests

```sh
node --test test/*.test.js
```
