import React, { useState, useEffect } from "react";
import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import "../pages/Orders.css";
import { sanitizePhoneInput, isValidPhoneNumber } from "../utils/phoneValidation";

// Extracted verbatim (no behavior changes) from Orders.jsx, where it used to
// be defined inline as a non-exported function component. Moved here so it
// can be reused from other pages (e.g. Table Management's "Seat guests"
// action) without duplicating the Firestore-writing logic.
//
// New optional prop: `initialTableNumber` (defaults to "") seeds the modal's
// internal `tableNumber` state whenever the modal is opened with a specific
// table already known (Table Management passes the table's number through
// this prop). Orders.jsx's own "+ Manual Order" toolbar button doesn't pass
// it, so tableNumber still starts blank there exactly as before.
function ManualOrderModal({ isOpen, onClose, menuItems, onOrderCreated, initialTableNumber = "" }) {
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [tableNumber, setTableNumber] = useState(initialTableNumber);
  const [menuSearch, setMenuSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // setIsSubmitting(true) doesn't take effect until the next render, so two
  // fast clicks on "Create Order" before that render both call handleSubmit,
  // each writing its own MANUAL-${Date.now()} order. Checked/set synchronously.
  const isSubmittingRef = React.useRef(false);
  const [error, setError] = useState("");

  // Re-seed the table number whenever the modal is (re)opened with a
  // different initialTableNumber — e.g. staff clicks "Seat guests" on table
  // 7, closes the modal, then clicks it again on table 12.
  useEffect(() => {
    if (isOpen) {
      setTableNumber(initialTableNumber || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTableNumber]);

  const filteredMenu = menuItems.filter((item) =>
    item.name?.toLowerCase().includes(menuSearch.toLowerCase()),
  );

  const addItemToOrder = (menuItem) => {
    setSelectedItems([
      ...selectedItems,
      {
        name: menuItem.name,
        quantity: 1,
        instructions: "",
        menuId: menuItem.id,
        price: menuItem.price || 0,
      },
    ]);
  };

  const updateItemQuantity = (index, quantity) => {
    const updated = [...selectedItems];
    // The <input type="number" min="1"> is a UI hint only — clamp here so a
    // typed/pasted negative or zero value can't reach submission.
    updated[index].quantity = Math.max(1, parseInt(quantity) || 0);
    setSelectedItems(updated);
  };

  const updateItemInstructions = (index, instructions) => {
    const updated = [...selectedItems];
    updated[index].instructions = instructions;
    setSelectedItems(updated);
  };

  const removeItem = (index) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;
    try {
      setError("");
      if (!customerName.trim()) {
        setError("Customer name is required");
        return;
      }
      if (!phoneNumber.trim()) {
        setError("Phone number is required");
        return;
      }
      // Phone number previously accepted any string (letters, wrong
      // length, etc.), creating customer docs that couldn't be found
      // later by phone-based login. Require a plausible international
      // number (7-15 digits once formatting characters are stripped).
      if (!isValidPhoneNumber(phoneNumber)) {
        setError("Enter a valid phone number");
        return;
      }
      if (!tableNumber.trim()) {
        setError("Table number is required");
        return;
      }
      if (selectedItems.length === 0) {
        setError("Add at least one item");
        return;
      }

      isSubmittingRef.current = true;
      setIsSubmitting(true);

      // Store manual order in customers collection (same as regular orders)
      const customerRef = doc(
        db,
        "Restaurant",
        "orderin_restaurant_4",
        "customers",
        phoneNumber,
      );

      // Get existing customer data or create new
      const customerSnap = await getDoc(customerRef);
      const customerData = customerSnap.exists() ? customerSnap.data() : {};

      // Calculate order totals
      let subtotal = 0;
      selectedItems.forEach((item) => {
        const itemPrice =
          Number(String(item.price || 0).replace(/[^0-9.-]+/g, "")) || 0;
        const itemQty = Number(item.quantity) || 1;
        subtotal += itemPrice * itemQty;
      });
      const tax = subtotal > 0 ? Math.ceil(subtotal / 100) : 0;
      const totalCost = subtotal + tax;

      // Add manual order to pastOrders array
      // Manual orders previously had no `id` field, so the admin table fell
      // back to `ORD-{phone}-{index}`, which shifts if orders are ever
      // reordered/removed. Generate a stable id up front.
      const newOrder = {
        id: `MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        username: customerName,
        phoneNumber: phoneNumber,
        tableNo: parseInt(tableNumber),
        items: selectedItems,
        status: "Pending",
        timestamp: new Date().toISOString(),
        isManualOrder: true,
        paymentStatus: "manual",
        paymentType: "Manual",
        subtotal: subtotal,
        tax: tax,
        totalCost: totalCost,
        amount: totalCost,
      };

      const pastOrders = Array.isArray(customerData.pastOrders)
        ? customerData.pastOrders
        : [];
      pastOrders.push(newOrder);

      await setDoc(
        customerRef,
        {
          username: customerName,
          names: [customerName],
          pastOrders: pastOrders,
        },
        { merge: true },
      );

      onOrderCreated();
      onClose();
      setCustomerName("");
      setPhoneNumber("");
      setTableNumber("");
      setMenuSearch("");
      setSelectedItems([]);
    } catch (err) {
      console.error("Error creating manual order:", err);
      setError("Failed to create order: " + err.message);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="manual-order-overlay" onClick={onClose}>
      <div className="manual-order-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Manual Order</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="modal-content">
          <div className="customer-info-section">
            <h3>Customer Information</h3>
            <div className="form-group">
              <label>Customer Name</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
              />
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <input
                type="tel"
                maxLength={20}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(sanitizePhoneInput(e.target.value))}
                placeholder="Enter phone number"
              />
            </div>
            <div className="form-group">
              <label>Table Number</label>
              <input
                type="number"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="Enter table number"
              />
            </div>
          </div>

          <div className="menu-selection-section">
            <h3>Add Items from Menu</h3>
            <div className="menu-search">
              <input
                type="text"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="Search menu items..."
              />
            </div>

            <div className="menu-list">
              {filteredMenu.map((item) => (
                <div key={item.id} className="menu-item">
                  <div className="item-info">
                    <div className="item-name">{item.name}</div>
                    {item.price && (
                      <div className="item-price">₹{item.price}</div>
                    )}
                  </div>
                  <button
                    className="add-item-btn"
                    onClick={() => addItemToOrder(item)}
                  >
                    + Add
                  </button>
                </div>
              ))}
              {filteredMenu.length === 0 && (
                <div
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    color: "#999",
                  }}
                >
                  No items found
                </div>
              )}
            </div>
          </div>

          <div className="selected-items-section">
            <h3>Selected Items ({selectedItems.length})</h3>
            <div className="selected-items-list">
              {selectedItems.map((item, index) => (
                <div key={index} className="selected-item">
                  <div className="item-details">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItemQuantity(index, e.target.value)
                      }
                      className="qty-input"
                    />
                    <span className="item-label">x {item.name}</span>
                  </div>
                  <div className="item-specs">
                    <input
                      type="text"
                      value={item.instructions}
                      onChange={(e) =>
                        updateItemInstructions(index, e.target.value)
                      }
                      placeholder="Special instructions..."
                      className="specs-input"
                    />
                  </div>
                  <button
                    className="remove-item-btn"
                    onClick={() => removeItem(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="cancel-btn"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="submit-btn"
            onClick={handleSubmit}
            disabled={isSubmitting || selectedItems.length === 0}
          >
            {isSubmitting ? "Creating..." : "Create Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ManualOrderModal;
