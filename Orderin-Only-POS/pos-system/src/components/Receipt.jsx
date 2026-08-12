import { useEffect, useState } from "react";
import { getSettings } from "../lib/repo";
import "./Receipt.css";

export default function Receipt({ order }) {
  const [restaurant, setRestaurant] = useState(null);
  const [billing, setBilling] = useState(null);

  useEffect(() => {
    getSettings("restaurant").then(setRestaurant);
    getSettings("billing").then(setBilling);
  }, []);

  if (!order) return null;

  return (
    <div className="receipt" id="print-receipt">
      <div className="receipt-center">
        <div className="receipt-title">{restaurant?.name || "Restaurant"}</div>
        <div className="receipt-sub">{restaurant?.address}</div>
        {restaurant?.phone && <div className="receipt-sub">{restaurant.phone}</div>}
        {restaurant?.gstin && <div className="receipt-sub">GSTIN: {restaurant.gstin}</div>}
      </div>
      <div className="receipt-divider" />
      <div className="receipt-row"><span>Invoice</span><span>{order.invoiceNo}</span></div>
      <div className="receipt-row"><span>Order</span><span>{order.orderNo}</span></div>
      <div className="receipt-row"><span>Date</span><span>{new Date(order.createdAt).toLocaleString()}</span></div>
      <div className="receipt-row"><span>Type</span><span>{order.orderType}{order.tableNo ? ` · T${order.tableNo}` : ""}</span></div>
      <div className="receipt-row"><span>Cashier</span><span>{order.cashierName}</span></div>
      <div className="receipt-divider" />
      {order.items.map((it, i) => (
        <div className="receipt-item" key={i}>
          <div className="receipt-row">
            <span>{it.name} × {it.qty}</span>
            <span>₹{(it.price * it.qty).toFixed(2)}</span>
          </div>
          {it.notes && <div className="receipt-note">Note: {it.notes}</div>}
        </div>
      ))}
      <div className="receipt-divider" />
      <div className="receipt-row"><span>Subtotal</span><span>₹{order.subtotal.toFixed(2)}</span></div>
      <div className="receipt-row"><span>Discount</span><span>-₹{order.discount.toFixed(2)}</span></div>
      <div className="receipt-row"><span>Tax</span><span>₹{order.tax.toFixed(2)}</span></div>
      <div className="receipt-divider" />
      <div className="receipt-row receipt-total"><span>TOTAL</span><span>₹{order.total.toFixed(2)}</span></div>
      <div className="receipt-row"><span>Payment</span><span>{order.payments?.map((p) => p.method).join(" + ") || "—"}</span></div>
      <div className="receipt-divider" />
      <div className="receipt-center receipt-footer">{billing?.footerMessage || "Thank you!"}</div>
    </div>
  );
}
