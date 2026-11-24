import { useEffect, useState } from "react";
import { getSettings, updateOrderCustomerPhone } from "../lib/repo";
import { buildBillText, buildWhatsAppLink, joinPhone, phoneProblem, splitPhone } from "../lib/whatsappBill";

/**
 * "Send bill on WhatsApp" in the Order complete dialog. Opens WhatsApp
 * (Web or app) on the counter device with the bill typed in, addressed to
 * the customer's number. "Edit number" fixes a mistyped number first and
 * saves it on the order and the customer record.
 */
export default function WhatsAppReceipt({ order, user, onOrderUpdated }) {
  const saved = splitPhone(order?.customerPhone || "");
  const [editing, setEditing] = useState(false);
  const [countryCode, setCountryCode] = useState(saved.countryCode);
  const [local, setLocal] = useState(saved.local);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restaurantName, setRestaurantName] = useState("");
  const [sentTo, setSentTo] = useState("");

  useEffect(() => {
    getSettings("restaurant").then((r) => setRestaurantName(r?.name || "")).catch(() => {});
  }, []);

  if (!order) return null;

  const phone = joinPhone(countryCode, local);
  const problem = phoneProblem(countryCode, local);

  const open = (toPhone) => {
    const text = buildBillText({
      restaurantName,
      orderId: order.invoiceNo || order.orderNo,
      date: order.createdAt,
      tableNo: order.tableNo,
      items: (order.items || []).map((it) => ({ name: it.name, qty: it.qty, unitPrice: it.price })),
      subtotal: order.subtotal,
      taxes: order.tax ?? order.taxes,
      total: order.total,
      paymentMethod: (order.payments || []).map((p) => p.method).filter(Boolean).join(" + "),
    });
    const w = window.open(buildWhatsAppLink(toPhone, text), "_blank");
    if (w) w.opener = null;
    setSentTo(toPhone);
  };

  const saveAndSend = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (phone !== order.customerPhone) {
        const updated = await updateOrderCustomerPhone(order.id, phone, user);
        onOrderUpdated && onOrderUpdated(updated);
      }
      setEditing(false);
      open(phone);
    } catch (e) {
      setError(e.message || "Couldn't save the number.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wa-receipt" style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--border, #ddd)" }}>
      {!editing ? (
        <>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Send the bill to <strong>{countryCode} {saved.local || "—"}</strong> on WhatsApp?
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ background: "#25d366", borderColor: "#25d366" }}
              onClick={() => (problem ? (setEditing(true), setError(problem)) : open(phone))}
            >
              Yes, send on WhatsApp
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>
              Edit number
            </button>
          </div>
        </>
      ) : (
        <>
          <label style={{ fontSize: 12, fontWeight: 600 }} htmlFor="wa-receipt-phone">
            Customer WhatsApp number
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "76px 1fr", gap: 6, marginTop: 4 }}>
            <select className="input" aria-label="Country code" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
              <option value="+91">+91</option>
              <option value="+1">+1</option>
              <option value="+44">+44</option>
              <option value="+971">+971</option>
            </select>
            <input
              id="wa-receipt-phone"
              className="input"
              type="tel"
              inputMode="numeric"
              value={local}
              onChange={(e) => {
                setLocal(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Also updates this order and the customer record.</div>
          {error && (
            <div role="alert" style={{ fontSize: 12, color: "var(--danger)", marginTop: 4 }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={saveAndSend} disabled={busy}>
              {busy ? "Saving…" : "Confirm & send"}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </>
      )}
      {sentTo && !editing && (
        <div role="status" style={{ fontSize: 12, marginTop: 6 }}>
          WhatsApp opened for {sentTo}. Press send there.
        </div>
      )}
    </div>
  );
}
