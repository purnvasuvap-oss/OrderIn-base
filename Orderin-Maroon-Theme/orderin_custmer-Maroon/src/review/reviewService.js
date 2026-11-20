// One review per customer, ever (product decision, 19 Nov 2026).
//
// A customer is identified by their phone number (their login). The review is
// stored once on Restaurant/{id}/customers/{phone} as `review`, and also added
// to the existing `feedback` list so the staff app's Notifications keep
// showing it. Anyone who already has a review — or older feedback from before
// this rule — is treated as having reviewed, and is not asked again.

import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";

export const RESTAURANT_ID = "orderin_restaurant_4";

/** The logged-in customer ({ username, phone }) saved at login, or null. */
export function readLoggedInUser() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return user && typeof user === "object" ? user : null;
  } catch (e) {
    return null;
  }
}

const customerRef = (phone) => doc(db, "Restaurant", RESTAURANT_ID, "customers", String(phone));

export const hasReviewData = (data) =>
  Boolean(data && (data.review || (Array.isArray(data.feedback) && data.feedback.length > 0)));

/** True if this customer has already left their one review. */
export async function hasCustomerReviewed(phone) {
  if (!phone) return false;
  const snap = await getDoc(customerRef(phone));
  return snap.exists() && hasReviewData(snap.data());
}

export class AlreadyReviewedError extends Error {
  constructor() {
    super("You've already shared your review. Thank you!");
    this.name = "AlreadyReviewedError";
  }
}

/**
 * Saves the customer's one review. Inside a transaction, so two taps or two
 * devices can't both save one.
 */
export async function saveCustomerReview(phone, { stars, text = "", orderId = null }) {
  if (!phone) throw new Error("Please log in to leave a review.");
  const rating = Math.round(Number(stars));
  if (!(rating >= 1 && rating <= 5)) throw new Error("Please choose 1 to 5 stars.");
  const entry = {
    stars: rating,
    text: String(text || "").trim().slice(0, 1000),
    orderId: orderId || null,
    createdAt: new Date().toISOString(),
  };
  const ref = customerRef(phone);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    if (hasReviewData(data)) throw new AlreadyReviewedError();
    const feedback = Array.isArray(data.feedback) ? data.feedback : [];
    tx.set(ref, { review: entry, feedback: [...feedback, entry], updatedAt: serverTimestamp() }, { merge: true });
  });
  return entry;
}
