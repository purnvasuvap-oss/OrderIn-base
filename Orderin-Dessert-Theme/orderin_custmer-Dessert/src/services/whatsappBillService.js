// src/services/whatsappBillService.js
// "Send my bill on WhatsApp" after payment, and fixing the customer's number.
//
// Customer records are stored by phone number (customers/{phone}). People
// sometimes type a made-up number at login, so the bill screen lets them
// correct it. Changing it MOVES the record to the new number in one
// transaction: orders, review and loyalty go with it, and the old record is
// left with `movedTo` so staff can see what happened.
//
// Sending: if VITE_WHATSAPP_BILL_URL is set (the sendWhatsAppBill function in
// /whatsapp-functions, once it passes billing review and is deployed), the
// bill is sent from the restaurant's WhatsApp Business number. Until then,
// WhatsApp opens on the phone with the bill already typed, ready to send.

import { doc, runTransaction, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { DEFAULT_RESTAURANT_ID } from "../config/restaurant";
import { buildBillText, buildWhatsAppLink } from "../utils/whatsappBill";

const customerRef = (phone, restaurantId) => doc(db, "Restaurant", restaurantId, "customers", String(phone));

const readUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

/**
 * Move the signed-in customer from oldPhone to newPhone.
 * If a record already exists under newPhone (they ordered with it before),
 * the orders are merged into it.
 */
export const changeCustomerPhone = async (oldPhone, newPhone, restaurantId = DEFAULT_RESTAURANT_ID) => {
  if (!newPhone || String(oldPhone) === String(newPhone)) return { moved: false };
  const fromRef = customerRef(oldPhone, restaurantId);
  const toRef = customerRef(newPhone, restaurantId);

  await runTransaction(db, async (tx) => {
    const [fromSnap, toSnap] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
    const from = fromSnap.exists() ? fromSnap.data() : {};
    const to = toSnap.exists() ? toSnap.data() : {};

    const fixOrder = (o) => {
      const out = { ...o };
      if ("phone" in out) out.phone = newPhone;
      if ("phoneNumber" in out) out.phoneNumber = newPhone;
      return out;
    };
    const seen = new Set();
    const pastOrders = [...(to.pastOrders || []), ...(from.pastOrders || []).map(fixOrder)].filter((o) => {
      const key = o?.id != null ? String(o.id) : JSON.stringify(o);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const { pastOrders: _drop1, movedTo: _drop2, ...fromRest } = from;
    tx.set(toRef, {
      ...fromRest,
      ...to,
      phone: newPhone,
      username: to.username || from.username || "",
      pastOrders,
      previousPhones: arrayUnion(String(oldPhone)),
      phoneUpdatedAt: serverTimestamp(),
    });
    if (fromSnap.exists()) {
      tx.set(fromRef, { phone: oldPhone, movedTo: newPhone, movedAt: serverTimestamp(), pastOrders: [] });
    }
  });

  const user = readUser();
  if (user) {
    try {
      localStorage.setItem("user", JSON.stringify({ ...user, phone: newPhone }));
    } catch {
      /* storage full or blocked: the record still moved */
    }
  }
  return { moved: true };
};

/**
 * Send the bill. Returns { via: "api" } when the restaurant's WhatsApp sent
 * it, or { via: "link", url } when the customer's WhatsApp should open.
 */
export const sendBillOnWhatsApp = async ({ phone, bill, restaurantId = DEFAULT_RESTAURANT_ID }) => {
  const endpoint = import.meta.env.VITE_WHATSAPP_BILL_URL;
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, phone, orderId: bill.orderId }),
      });
      if (res.ok) return { via: "api" };
      console.warn("WhatsApp bill API refused:", res.status, await res.text().catch(() => ""));
    } catch (e) {
      console.warn("WhatsApp bill API unreachable, opening WhatsApp instead:", e);
    }
  }
  return { via: "link", url: buildWhatsAppLink(phone, buildBillText(bill)) };
};
