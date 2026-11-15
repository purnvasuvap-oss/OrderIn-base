import React, { useMemo } from "react";
import { X, Package } from "lucide-react";
import "./OrderItemListModal.css";

function OrderItemListModal({ order, onClose }) {
  const aggregatedItems = useMemo(() => {
    if (!order || !order.items || !Array.isArray(order.items)) return [];

    const groups = {};
    order.items.forEach((item) => {
      const name = item.name || item.title || "Unknown";
      const instructions = (item.instructions || item.instruction || "").trim();
      const key = instructions ? `${name}::${instructions}` : name;

      if (!groups[key]) {
        groups[key] = {
          name,
          instructions,
          quantity: 0,
          price: item.price || 0,
          total: 0,
        };
      }
      const qty = Number(item.quantity || 1);
      groups[key].quantity += qty;
      groups[key].total += (Number(item.price || 0) * qty);
    });

    return Object.values(groups).sort((a, b) => b.quantity - a.quantity);
  }, [order]);

  if (!order) return null;

  return (
    <div className="OrderItemList-overlay" onClick={onClose}>
      <div className="OrderItemList-modal" onClick={(e) => e.stopPropagation()}>
        <div className="OrderItemList-header">
          <div className="OrderItemList-header-left">
            <Package size={20} />
            <div>
              <h3>Order Items</h3>
              <p className="OrderItemList-subtitle">
                #{order.id} — {order.username} (Table {order.tableNumber})
              </p>
            </div>
          </div>
          <button className="OrderItemList-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="OrderItemList-body">
          <div className="OrderItemList-summary">
            <span>Total Items: <strong>{order.items?.length || 0}</strong></span>
            <span>Unique Dishes: <strong>{aggregatedItems.length}</strong></span>
            <span>Total Qty: <strong>{aggregatedItems.reduce((s, i) => s + i.quantity, 0)}</strong></span>
          </div>

          <div className="OrderItemList-table-header">
            <span className="OrderItemList-th-item">Item</span>
            <span className="OrderItemList-th-qty">Qty</span>
            <span className="OrderItemList-th-price">Price</span>
            <span className="OrderItemList-th-total">Total</span>
            <span className="OrderItemList-th-instr">Instructions</span>
          </div>

          <div className="OrderItemList-items">
            {aggregatedItems.map((item, idx) => (
              <div key={idx} className={`OrderItemList-row ${item.instructions ? "has-instructions" : ""}`}>
                <span className="OrderItemList-item-name">{item.name}</span>
                <span className="OrderItemList-item-qty">×{item.quantity}</span>
                <span className="OrderItemList-item-price">₹{Number(item.price).toFixed(2)}</span>
                <span className="OrderItemList-item-total">₹{item.total.toFixed(2)}</span>
                <span className="OrderItemList-item-instr">
                  {item.instructions || (
                    <span className="OrderItemList-no-instr">—</span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {aggregatedItems.some((i) => i.instructions) && (
            <div className="OrderItemList-note">
              <strong>Note:</strong> Items with custom instructions are listed separately for accurate kitchen preparation.
            </div>
          )}
        </div>

        <div className="OrderItemList-footer">
          <span>Subtotal: ₹{Number(order.subtotal || 0).toFixed(2)}</span>
          <span>Tax: ₹{Number(order.tax || 0).toFixed(2)}</span>
          <span className="OrderItemList-total">Total: ₹{Number(order.totalCost || 0).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

export default OrderItemListModal;

