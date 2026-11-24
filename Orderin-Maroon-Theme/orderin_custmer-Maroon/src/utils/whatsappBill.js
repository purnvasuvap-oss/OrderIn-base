// src/utils/whatsappBill.js
// Phone checks and bill text for "Send my bill on WhatsApp". No Firestore here.

export const DEFAULT_COUNTRY_CODE = "+91";

export const digitsOnly = (v) => String(v || "").replace(/\D/g, "");

/** Split a stored phone ("+919876543210") into { countryCode, local }. */
export const splitPhone = (phone, countryCode = DEFAULT_COUNTRY_CODE) => {
  const raw = String(phone || "").trim();
  const cc = digitsOnly(countryCode);
  const d = digitsOnly(raw);
  if (raw.startsWith("+") && d.startsWith(cc) && d.length > cc.length) {
    return { countryCode: `+${cc}`, local: d.slice(cc.length) };
  }
  if (d.length > 10 && d.startsWith(cc)) return { countryCode: `+${cc}`, local: d.slice(cc.length) };
  return { countryCode: `+${cc}`, local: d.replace(/^0+/, "") };
};

/** Build the stored form, "+91" + 10 digits, the same way login does. */
export const joinPhone = (countryCode, local) => `${countryCode}${digitsOnly(local).replace(/^0+/, "")}`;

/**
 * Does this look like a real mobile number? Catches the made-up numbers
 * people type at login (1234567890, 9999999999, 0000000000).
 * Returns "" when fine, otherwise a reason to show the customer.
 */
export const phoneProblem = (countryCode, local) => {
  const d = digitsOnly(local);
  if (!d) return "Enter your WhatsApp number.";
  if (countryCode === "+91") {
    if (d.length !== 10) return "Indian mobile numbers have 10 digits.";
    if (!/^[6-9]/.test(d)) return "Indian mobile numbers start with 6, 7, 8 or 9.";
  } else if (d.length < 6 || d.length > 14) {
    return "Enter a valid mobile number.";
  }
  if (/^(\d)\1+$/.test(d)) return "This number looks made up. Please enter your real WhatsApp number.";
  if ("01234567890".includes(d) || "98765432109".includes(d)) {
    return "This number looks made up. Please enter your real WhatsApp number.";
  }
  return "";
};

export const maskPhone = (phone) => {
  const { countryCode, local } = splitPhone(phone);
  if (local.length < 4) return `${countryCode} ${local}`;
  return `${countryCode} ${"•".repeat(Math.max(0, local.length - 4))}${local.slice(-4)}`;
};

const money = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Plain-text bill for WhatsApp (*bold* is WhatsApp markup).
 * bill = { restaurantName, orderId, date, tableNo, items:[{name, qty, unitPrice}],
 *          subtotal, taxes, total, paymentMethod }
 */
export const buildBillText = (bill) => {
  const lines = [];
  lines.push(`*${bill.restaurantName || "Your bill"}*`);
  lines.push(`Order: ${bill.orderId}`);
  if (bill.date) {
    const d = bill.date instanceof Date ? bill.date : new Date(bill.date);
    if (!Number.isNaN(d.getTime())) {
      lines.push(`Date: ${d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}`);
    }
  }
  if (bill.tableNo) lines.push(`Table: ${bill.tableNo}`);
  lines.push("");
  (bill.items || []).forEach((it) => {
    const qty = Number(it.qty) || 1;
    lines.push(`${qty} x ${it.name}  ₹${(money(it.unitPrice) * qty).toFixed(2)}`);
  });
  lines.push("");
  lines.push(`Sub total: ₹${money(bill.subtotal).toFixed(2)}`);
  if (money(bill.taxes)) lines.push(`Charges: ₹${money(bill.taxes).toFixed(2)}`);
  lines.push(`*Total: ₹${money(bill.total).toFixed(2)}*`);
  if (bill.paymentMethod) lines.push(`Paid by: ${bill.paymentMethod}`);
  lines.push("");
  lines.push("Thank you for dining with us!");
  return lines.join("\n");
};

/** wa.me link that opens WhatsApp on that number with the bill typed in. */
export const buildWhatsAppLink = (phone, text) => `https://wa.me/${digitsOnly(phone)}?text=${encodeURIComponent(text)}`;
