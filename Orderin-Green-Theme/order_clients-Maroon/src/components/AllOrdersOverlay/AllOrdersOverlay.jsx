import React, { useMemo } from "react";
import { X, ClipboardList } from "lucide-react";
import "./AllOrdersOverlay.css";

// Consolidates item quantities across every active order so the kitchen can
// see totals at a glance. Items with a special instruction are kept as their
// own line (never merged into the plain count for that dish) so nothing
// gets missed during prep.
function AllOrdersOverlay({ orders, onClose }) {
  const aggregatedItems = useMemo(() => {
    const groups = {};

    (orders || []).forEach((order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item) => {
        const name = (item && (item.name || item.title)) || "Unknown Item";
        const instructions = String(
          (item && (item.instructions || item.instruction)) || ""
        ).trim();
        const key = instructions ? `${name}::${instructions}` : name;

        if (!groups[key]) {
          groups[key] = { name, instructions, quantity: 0 };
        }
        groups[key].quantity += Number(item && item.quantity ? item.quantity : 1) || 1;
      });
    });

    return Object.values(groups).sort((a, b) => {
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      // Plain (no-instruction) line for a dish comes before its variants
      if (!a.instructions && b.instructions) return -1;
      if (a.instructions && !b.instructions) return 1;
      return b.quantity - a.quantity;
    });
  }, [orders]);

  const totalQuantity = aggregatedItems.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="AllOrdersOverlay-backdrop" onClick={onClose}>
      <div
        className="AllOrdersOverlay-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="AllOrdersOverlay-header">
          <div className="AllOrdersOverlay-header-left">
            <ClipboardList size={20} />
            <div>
              <h3>All Orders — Item Summary</h3>
              <p className="AllOrdersOverlay-subtitle">
                Consolidated across {orders?.length || 0} active order
                {orders?.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button className="AllOrdersOverlay-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="AllOrdersOverlay-summary">
          <span>
            Unique Lines: <strong>{aggregatedItems.length}</strong>
          </span>
          <span>
            Total Quantity: <strong>{totalQuantity}</strong>
          </span>
        </div>

        <div className="AllOrdersOverlay-body">
          {aggregatedItems.length === 0 ? (
            <div className="AllOrdersOverlay-empty">
              No active orders right now.
            </div>
          ) : (
            aggregatedItems.map((item, idx) => (
              <div
                key={idx}
                className={`AllOrdersOverlay-row ${item.instructions ? "has-instructions" : ""}`}
              >
                <div className="AllOrdersOverlay-row-main">
                  <span className="AllOrdersOverlay-item-name">{item.name}</span>
                  <span className="AllOrdersOverlay-item-qty">×{item.quantity}</span>
                </div>
                {item.instructions && (
                  <div className="AllOrdersOverlay-item-instr">
                    Note: {item.instructions}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AllOrdersOverlay;
