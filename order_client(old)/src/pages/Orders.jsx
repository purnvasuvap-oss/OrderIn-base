import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import routes from "../routes";
import './Orders.css';
import {
  fetchTodaysOrders,
  updateOrderStatus,
  formatOrderItems,
  formatTime,
  subscribeTodaysOrders,
} from "../services/orderService";
import { collection, getDocs, addDoc, serverTimestamp, doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

function ManualOrderModal({ isOpen, onClose, menuItems, onOrderCreated }) {
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [menuSearch, setMenuSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const filteredMenu = menuItems.filter(item =>
    item.name?.toLowerCase().includes(menuSearch.toLowerCase())
  );

  const addItemToOrder = (menuItem) => {
    setSelectedItems([...selectedItems, {
      name: menuItem.name,
      quantity: 1,
      instructions: "",
      menuId: menuItem.id,
      price: menuItem.price || 0
    }]);
  };

  const updateItemQuantity = (index, quantity) => {
    const updated = [...selectedItems];
    updated[index].quantity = parseInt(quantity) || 0;
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
      if (!tableNumber.trim()) {
        setError("Table number is required");
        return;
      }
      if (selectedItems.length === 0) {
        setError("Add at least one item");
        return;
      }

      setIsSubmitting(true);

      // Store manual order in customers collection (same as regular orders)
      const customerRef = doc(db, "Restaurant", "orderin_restaurant_1", "customers", phoneNumber);
      
      // Get existing customer data or create new
      const customerSnap = await getDoc(customerRef);
      const customerData = customerSnap.exists() ? customerSnap.data() : {};
      
      // Calculate order totals
      let subtotal = 0;
      selectedItems.forEach(item => {
        const itemPrice = Number(String(item.price || 0).replace(/[^0-9.-]+/g, "")) || 0;
        const itemQty = Number(item.quantity) || 1;
        subtotal += itemPrice * itemQty;
      });
      const tax = subtotal > 0 ? Math.ceil(subtotal / 100) : 0;
      const totalCost = subtotal + tax;
      
      // Add manual order to pastOrders array
      const newOrder = {
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
        amount: totalCost
      };
      
      const pastOrders = Array.isArray(customerData.pastOrders) ? customerData.pastOrders : [];
      pastOrders.push(newOrder);
      
      await setDoc(customerRef, {
        username: customerName,
        names: [customerName],
        pastOrders: pastOrders
      }, { merge: true });

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
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="manual-order-overlay" onClick={onClose}>
      <div className="manual-order-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Manual Order</h2>
          <button className="close-btn" onClick={onClose}>×</button>
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
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
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
                    {item.price && <div className="item-price">₹{item.price}</div>}
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
                <div style={{ padding: "12px", textAlign: "center", color: "#999" }}>
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
                      onChange={(e) => updateItemQuantity(index, e.target.value)}
                      className="qty-input"
                    />
                    <span className="item-label">x {item.name}</span>
                  </div>
                  <div className="item-specs">
                    <input
                      type="text"
                      value={item.instructions}
                      onChange={(e) => updateItemInstructions(index, e.target.value)}
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
          <button className="cancel-btn" onClick={onClose} disabled={isSubmitting}>
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

function StatusPill({ status, onStatusChange, orderId, isLoading }) {
  const [isEditing, setIsEditing] = useState(false);
  const cls = `status ${status.toLowerCase().replace(/\s+/g, "-")}`;

  const handleClick = () => {
    if (!isLoading) {
      setIsEditing(true);
    }
  };

  const handleChange = async (e) => {
    const newStatus = e.target.value;
    setIsEditing(false);
    await onStatusChange(orderId, newStatus);
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <select
        value={status}
        onChange={handleChange}
        onBlur={handleBlur}
        autoFocus
        className={cls}
        disabled={isLoading}
      >
        <option value="Pending">Pending</option>
        <option value="Preparing">Preparing</option>
        <option value="Ready">Ready</option>
        <option value="Delivered">Delivered</option>
      </select>
    );
  }

  return (
    <div className={cls} onClick={handleClick} style={{ cursor: isLoading ? "not-allowed" : "pointer", opacity: isLoading ? 0.6 : 1 }}>
      {isLoading ? "Updating..." : status}
    </div>
  );
}

function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [showManualOrderModal, setShowManualOrderModal] = useState(false);
  const [menuItems, setMenuItems] = useState([]);

  // Fetch menu items on mount
  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        const menuRef = collection(db, "Restaurant", "orderin_restaurant_1", "menu");
        const menuSnapshot = await getDocs(menuRef);
        const items = menuSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMenuItems(items);
      } catch (err) {
        console.error("Error fetching menu items:", err);
      }
    };
    fetchMenuItems();
  }, []);

  // Fetch orders on component mount
  useEffect(() => {
    // Use real-time subscription so status changes update automatically in background
    console.log("=== ORDERS COMPONENT: Subscribing to orders (real-time) ===");
    setLoading(true);
    const unsubscribe = subscribeTodaysOrders((fetchedOrders) => {
      console.log(`=== ORDERS COMPONENT (realtime): Received ${fetchedOrders.length} orders ===`);
      console.log(`Orders data (realtime):`, fetchedOrders);
      // Display orders that have paymentStatus === 'paid' OR manual orders
      const displayOrders = fetchedOrders.filter(o => {
        const status = String(o.paymentStatus || '').toLowerCase();
        return status === 'paid' || status === 'manual';
      });
      console.log(`Filtered to paid and manual orders: ${displayOrders.length}`);
      setOrders(displayOrders);
      setError(null);
      setLoading(false);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      setUpdatingOrderId(orderId);

      // Find the order to get phoneNumber and orderIndex
      const order = orders.find((o) => o.id === orderId);
      if (!order) {
        setError("Order not found");
        return;
      }

      // Update in Firebase
      await updateOrderStatus(order.phoneNumber, order.orderIndex, newStatus);

      // Update local state
      setOrders((prevOrders) =>
        prevOrders.map((o) =>
          o.id === orderId ? { ...o, status: newStatus } : o
        )
      );
    } catch (err) {
      console.error("Error updating status:", err);
      setError("Failed to update order status");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const total = orders.length;
  const completed = orders.filter((o) => o.status === "Delivered").length;
  const active = total - completed;

  const filteredOrders = (() => {
    let filtered = orders;
    if (filter === "completed") {
      filtered = orders.filter((o) => o.status === "Delivered");
    } else if (filter === "active") {
      filtered = orders.filter((o) => o.status !== "Delivered").slice().reverse();
    }
    if (searchTerm) {
      filtered = filtered.filter((o) =>
        o.items.some((item) => {
          if (typeof item === 'string') {
            return item.toLowerCase().includes(searchTerm.toLowerCase());
          } else if (typeof item === 'object' && item !== null) {
            // Search in name and instructions fields if present
            const nameMatch = item.name && item.name.toLowerCase().includes(searchTerm.toLowerCase());
            const instructionsMatch = item.instructions && item.instructions.toLowerCase().includes(searchTerm.toLowerCase());
            return nameMatch || instructionsMatch;
          }
          return false;
        }) ||
        o.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.phoneNumber.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return filtered;
  })();

  return (
     <div className="app">
      <div className="topbar">
        <div className="top-left">
            {/* ... rest of topbar content ... */}
          </div>

          <div className="logo-area">
            {/* ... rest of logo content ... */}
          </div>

          <div className="top-right">
            {/* ... rest of right icons ... */}
          </div>
      </div>

      <div className="content">
        <aside className="left-stats">
          <div className="back-button-container">
            <button className="custom-btn" onClick={() => navigate(routes.dashboard)}>
              Back
            </button>
          </div>
          <div

            className={`stat red ${filter === "all" ? "selected" : ""}`}
            onClick={() => setFilter("all")}
          >
            <div className="label">Total Orders:</div>
            <div className="value">{total}</div>
          </div>
          <div
            className={`stat yellow ${filter === "active" ? "selected" : ""}`}
            onClick={() => setFilter("active")}
          >
            <div className="label">Active Orders:</div>
            <div className="value">{active}</div>
          </div>
          <div
            className={`stat green ${filter === "completed" ? "selected" : ""}`}
            onClick={() => setFilter("completed")}
          >
            <div className="label">Completed:</div>
            <div className="value">{completed}</div>
          </div>
        </aside>

        <main className="main-panel">
          <div className="heading-row">
            <h2 className={filter === "completed" || filter === "active" ? "big-left" : ""}>
              {filter === "completed" ? "COMPLETED" : filter === "active" ? "Active Orders" : "Total Orders"}
            </h2>
            <div className="heading-controls">
              <button className="manual-order-btn" onClick={() => setShowManualOrderModal(true)}>
                + Manual Order
              </button>
              <div className="search">
                <span className="search-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 21l-4.35-4.35" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="11" cy="11" r="6" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <input placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ padding: "12px", background: "#ffebee", color: "#c62828", borderRadius: "8px", marginBottom: "12px" }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
              Loading today's orders...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#999" }}>
              {orders.length === 0 ? "No orders found for today" : "No orders match your search"}
            </div>
          ) : (
            <div
              className={`orders-table ${filter === "completed" ? "completed-view" : ""} ${filter === "active" ? "active-view" : ""}`}
            >
              <div className="table-header">
                <div>Order ID</div>
                <div>Customer</div>
                <div>Phone</div>
                <div>Table</div>
                <div>Items</div>
                <div>Specs</div>
                <div>Status</div>
                <div>Time</div>
              </div>

              {filteredOrders.map((o, orderIdx) => (
                <div key={o.id + '-' + orderIdx} className="table-row">
                  <div className="col order-id">
                    {typeof o.id === 'string' || typeof o.id === 'number' ? o.id : JSON.stringify(o.id)}
                  </div>

                  <div className="col customer">
                    <div className="cust-name">{typeof o.username === 'string' ? o.username : JSON.stringify(o.username)}</div>
                  </div>

                  <div className="col phone">
                    {typeof o.phoneNumber === 'string' || typeof o.phoneNumber === 'number' ? o.phoneNumber : JSON.stringify(o.phoneNumber)}
                  </div>

                  <div className="col table">
                    Table {typeof o.tableNumber === 'string' || typeof o.tableNumber === 'number' ? o.tableNumber : JSON.stringify(o.tableNumber)}
                  </div>

                  <div className="col items">
                    <div className="items-directory">
                      {o.items && Array.isArray(o.items) && o.items.map((item, i) => (
                        typeof item === 'object' && item !== null ? (
                          <div key={i} className="item-row">
                            <span className="item-name">{item.quantity ? `${item.quantity}x ` : ''}{item.name}</span>
                            {item.instructions && <span className="item-instructions">{item.instructions}</span>}
                          </div>
                        ) : (
                          <div key={i} className="item-row">
                            <span className="item-name">{item}</span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>

                  <div className="col specs">
                    {o.items && Array.isArray(o.items)
                      ? o.items
                          .map(item => {
                            if (typeof item === 'object' && item !== null) {
                              return item.instructions || item.specs || '';
                            }
                            return '';
                          })
                          .filter(Boolean)
                          .join(', ') || '-'
                      : '-'}
                  </div>

                  <div className="col status-cell">
                    <StatusPill
                      status={typeof o.status === 'string' ? o.status : JSON.stringify(o.status)}
                      onStatusChange={handleStatusChange}
                      orderId={typeof o.id === 'string' || typeof o.id === 'number' ? o.id : JSON.stringify(o.id)}
                      isLoading={updatingOrderId === o.id}
                    />
                  </div>

                  <div className="col time">{formatTime(o.timestamp)}</div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      <ManualOrderModal
        isOpen={showManualOrderModal}
        onClose={() => setShowManualOrderModal(false)}
        menuItems={menuItems}
        onOrderCreated={() => setShowManualOrderModal(false)}
      />

      <div className="bottom-wave" />
    </div>
  );
}

export default Orders;
// ...existing code...
