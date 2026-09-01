import { doc, runTransaction } from "firebase/firestore";
import { db, RESTAURANT_ID, firebaseEnabled } from "./firebase";
import { isOnline } from "./sync";

// Order/invoice numbers used to come from a purely device-local counter
// (settings/billing.nextInvoiceSeq), so two devices — or the same device
// after local storage was cleared — could hand out the exact same number
// (e.g. two different orders both "ORD-1001"). A Firestore transaction
// gives every online device the same shared counter, read-and-incremented
// atomically, so numbers stay unique across the whole restaurant.
//
// Returns the reserved sequence number, or null if offline/unavailable —
// callers fall back to the local counter in that case, which can only
// guarantee uniqueness on a single device.
export async function reserveNextInvoiceSeq() {
  if (!firebaseEnabled || !isOnline()) return null;
  try {
    const ref = doc(db, "Restaurant", RESTAURANT_ID, "counters", "orders");
    const seq = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists() ? (snap.data().nextSeq || 1001) : 1001;
      tx.set(ref, { nextSeq: current + 1 }, { merge: true });
      return current;
    });
    return seq;
  } catch (err) {
    console.warn("reserveNextInvoiceSeq failed, falling back to local counter:", err?.message || err);
    return null;
  }
}
