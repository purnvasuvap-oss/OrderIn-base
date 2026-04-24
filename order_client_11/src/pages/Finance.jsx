import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Filter } from "lucide-react";
import routes from "../routes";
import "./Finance.css";
import { formatTime, subscribeTodaysOrders, subscribeAllCustomerOrders } from "../services/orderService";
import BillModal from "../components/BillModal";

function App() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("DAILY TRANSIT");
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState({
    searchTerm: "",
    filterBy: {
      customerName: true,
      phone: false,
      orderId: false,
      table: false,
    },
  });
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [dailyTransitOrders, setDailyTransitOrders] = useState([]);
  const [loadingTransit, setLoadingTransit] = useState(false);
  const [allCustomerOrders, setAllCustomerOrders] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [billOrder, setBillOrder] = useState(null);
  const [showBillModal, setShowBillModal] = useState(false);

  // EARNINGS CALCULATION state
  const [earningsFilterType, setEarningsFilterType] = useState('today');
  const [earningsStartDate, setEarningsStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [earningsEndDate, setEarningsEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [earningsOrders, setEarningsOrders] = useState([]);
  const [loadingEarnings, setLoadingEarnings] = useState(false);

  // Precompute sorted daily orders (newest first) for rendering
  const sortedDaily = (dailyTransitOrders || []).slice().sort((a, b) => {
    const getTime = (o) => {
      try {
        if (!o || !o.timestamp) return 0;
        if (o.timestamp.toDate && typeof o.timestamp.toDate === 'function') return o.timestamp.toDate().getTime();
        const d = new Date(o.timestamp);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      } catch (e) {
        return 0;
      }
    };
    return getTime(b) - getTime(a);
  });

  const formatCurrency = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
  };

  // ACCOUNTS DATA - Fetched from backend
  // const orders = [...];

  // Filter orders based on search input and selected filters
  useEffect(() => {
    const filtered = allCustomerOrders.filter(order => {
      const term = filters.searchTerm.toLowerCase();
      if (!term) return true;

      const matches = [];
      if (filters.filterBy.customerName) {
        matches.push(order.username.toLowerCase().includes(term));
      }
      if (filters.filterBy.phone) {
        matches.push(order.phoneNumber.includes(term));
      }
      if (filters.filterBy.orderId) {
        matches.push(order.id.toLowerCase().includes(term));
      }
      if (filters.filterBy.table) {
        matches.push((`Table ${order.tableNumber}`).toLowerCase().includes(term));
      }

      return matches.some(match => match);
    });
    setFilteredOrders(filtered);
  }, [filters.searchTerm, filters.filterBy, allCustomerOrders]);

  // Fetch daily transit orders when the tab is active
  useEffect(() => {
    let unsubscribe = null;
    if (activeTab === "DAILY TRANSIT") {
      setLoadingTransit(true);
      console.log("=== FINANCE PAGE: Subscribing to daily transit orders (real-time) ===");
      unsubscribe = subscribeTodaysOrders((orders) => {
        console.log(`Finance (daily transit) - received ${orders.length} orders`);
        setDailyTransitOrders(orders);
        setLoadingTransit(false);
      });
    }

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [activeTab]);

  // Fetch all customer orders when the ACCOUNTS tab is active
  useEffect(() => {
    let unsubscribe = null;
    if (activeTab === "ACCOUNTS") {
      setLoadingAccounts(true);
      console.log("=== FINANCE PAGE: Subscribing to all customer orders (real-time) ===");
      unsubscribe = subscribeAllCustomerOrders((orders) => {
        console.log(`Finance (accounts) - received ${orders.length} orders`);
        setAllCustomerOrders(orders);
        setFilteredOrders(orders);
        setLoadingAccounts(false);
      });
    }

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [activeTab]);

  // Fetch all orders for earnings calculation
  useEffect(() => {
    let unsubscribe = null;
    if (activeTab === "EARNINGS CALCULATION") {
      setLoadingEarnings(true);
      console.log("=== FINANCE PAGE: Fetching all orders for earnings calculation ===");
      unsubscribe = subscribeAllCustomerOrders((orders) => {
        console.log(`Finance (earnings) - received ${orders.length} orders`);
        setEarningsOrders(orders);
        setLoadingEarnings(false);
      });
    }

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [activeTab]);

  // Calculate date range based on filter type
  const getDateRange = () => {
    const today = new Date();
    let start, end;
    if (earningsFilterType === 'today') {
      start = new Date(today);
      start.setHours(0, 0, 0, 0);
      end = new Date(today);
      end.setHours(23, 59, 59, 999);
    } else if (earningsFilterType === 'week') {
      const curr = new Date(today);
      const first = curr.getDate() - curr.getDay();
      start = new Date(curr.setDate(first));
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (earningsFilterType === 'month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    } else if (earningsFilterType === 'year') {
      start = new Date(today.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(today.getFullYear(), 11, 31);
      end.setHours(23, 59, 59, 999);
    } else if (earningsFilterType === 'custom') {
      start = new Date(earningsStartDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(earningsEndDate);
      end.setHours(23, 59, 59, 999);
    }
    return { start, end };
  };

  // Filter earnings based on date range
  const filteredEarnings = earningsOrders.filter(order => {
    const { start, end } = getDateRange();
    const orderTime = order.timestamp?.toDate?.() || new Date(order.timestamp);
    return orderTime >= start && orderTime <= end;
  });

  // Calculate earnings breakdown
  const calculateEarnings = () => {
    const breakdown = {
      totalEarnings: 0,
      totalTax: 0,
      byPaymentType: {
        upi: { earnings: 0, tax: 0, count: 0 },
        cash: { earnings: 0, tax: 0, count: 0 },
        card: { earnings: 0, tax: 0, count: 0 },
        manual: { earnings: 0, tax: 0, count: 0 },
      },
    };

    filteredEarnings.forEach(order => {
      let paymentType = (order.paymentType || 'upi').toLowerCase();
      
      // Normalize payment types
      if (paymentType === 'online') paymentType = 'upi';
      if (!breakdown.byPaymentType[paymentType]) paymentType = 'upi';
      
      const earnings = Number(order.subtotal) || 0;
      const tax = Number(order.tax) || 0;

      breakdown.totalEarnings += earnings;
      breakdown.totalTax += tax;

      breakdown.byPaymentType[paymentType].earnings += earnings;
      breakdown.byPaymentType[paymentType].tax += tax;
      breakdown.byPaymentType[paymentType].count += 1;
    });

    return breakdown;
  };

  const earningsData = calculateEarnings();

  const dailyTransitMetrics = sortedDaily.reduce(
    (summary, order) => {
      const total = Number(order.totalCost) || 0;
      const paidAmount = Number(order.paidAmount) || 0;
      const paymentStatus = (order.paymentStatus || "").toLowerCase();
      const remainingAmount = Math.max(total - paidAmount, 0);

      summary.totalOrders += 1;
      summary.totalValue += total;

      if (paymentStatus === "paid") {
        summary.collected += paidAmount > 0 ? paidAmount : total;
      } else if (paidAmount > 0) {
        summary.collected += paidAmount;
        summary.pending += remainingAmount;
      } else {
        summary.pending += total;
      }

      return summary;
    },
    { totalOrders: 0, totalValue: 0, collected: 0, pending: 0 }
  );



  return (
    <div className="fin-app">
      <h1 className="fin-page-title">Financial Management</h1>

      <div className="fin-top-row">
        <div className="fin-back-col">
          <button className="fin-back-btn" onClick={() => navigate(routes.dashboard)}>Back</button>
        </div>

        <div className="fin-nav-center">
          <div className="fin-nav-buttons">
            {["DAILY TRANSIT", "ACCOUNTS", "EARNINGS CALCULATION"].map((tab) => (
              <button
                key={tab}
                className={`fin-nav-btn ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

                </div>

      {/* ACCOUNTS TAB */}
      {activeTab === "ACCOUNTS" && (
        <div className="fin-orders-container">
          <div className="fin-search-bar">
            <input
              type="text"
              placeholder="Search orders..."
              value={filters.searchTerm}
              onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
            />
            <Filter
              className="fin-filter-icon"
              onClick={() => setShowFilterModal(true)}
              style={{ cursor: 'pointer' }}
            />
          </div>

          {loadingAccounts ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
              Loading all customer orders...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#999" }}>
              {allCustomerOrders.length === 0 ? "No orders found" : "No orders match your search"}
            </div>
          ) : (
            <div className="fin-orders-table">
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Specifications</th>
                    <th>Cost</th>
                    <th>Paid</th>
                    <th>Date & Time</th>
                    <th>Print</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <React.Fragment key={order.id}>
                    <tr>
                      <td>{order.id}</td>
                      <td>
                        {order.username}
                        <br />
                        <span className="fin-table-no">{`Table ${order.tableNumber}`}</span>
                        <br />
                        <span className="fin-table-no">{order.phoneNumber}</span>
                      </td>
                      <td>
                        {order.itemDetails && order.itemDetails.map((item, idx) => (
                          <div key={idx} style={{ marginBottom: "10px", paddingBottom: "10px", borderBottom: idx < order.itemDetails.length - 1 ? "1px solid #eee" : "none" }}>
                            <div style={{ fontWeight: "700" }}>{item.quantity}x {item.name}</div>
                            <div style={{ fontSize: "12px", color: "#666", marginTop: "3px" }}>₹{item.price} × {item.quantity} = ₹{item.total}</div>
                          </div>
                        ))}
                      </td>
                      <td>
                        {Array.isArray(order.specs) && order.specs.length > 0 ? (
                          order.specs.map((spec, idx) => (
                            <div key={idx} style={{ marginBottom: "8px", paddingBottom: "8px", borderBottom: idx < order.specs.length - 1 ? "1px solid #eee" : "none" }}>
                              <div style={{ fontWeight: "600", fontSize: "13px" }}>{spec.name}</div>
                              <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
                                {spec.instructions && spec.instructions !== "-" ? spec.instructions : "No special instructions"}
                              </div>
                            </div>
                          ))
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ fontSize: "12px", color: "#666" }}>
                            Subtotal: <span style={{ fontWeight: "700", color: "#000" }}>₹{formatCurrency(order.subtotal)}</span>
                          </div>
                          <div style={{ fontSize: "12px", color: "#666" }}>
                            Tax: <span style={{ fontWeight: "700", color: "#000" }}>₹{formatCurrency(order.tax)}</span>
                          </div>
                          <div style={{ fontSize: "13px", fontWeight: "700", color: "#e74c3c", paddingTop: "4px", borderTop: "1px solid #eee" }}>
                            Total: ₹{formatCurrency(order.totalCost)}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ color: "#000" }}>{order.paymentType || "Online"}</div>
                        <div style={{ color: "#000" }}>₹{formatCurrency(order.paidAmount)}</div>
                      </td>
                      <td>
                        {order.timestamp ? (
                          <>
                            <div style={{ fontSize: "12px", color: "#666" }}>
                              {new Date(order.timestamp.toDate?.() || order.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </div>
                            <strong>{formatTime(order.timestamp)}</strong>
                          </>
                        ) : (
                          "N/A"
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button className="print-btn" title="Print bill" onClick={() => { setBillOrder(order); setShowBillModal(true); }}>
                          <svg
                            width="34"
                            height="34"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M5 20h14v-2H5v2zm7-18v12l4-4h-3V4h-2v6H8l4 4z"
                              fill="#050505"
                            />
                          </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Filter Modal */}
          {showFilterModal && (
            <div className="fin-filter-modal-overlay" onClick={() => setShowFilterModal(false)}>
              <div className="fin-filter-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Filter Options</h3>
                <div className="fin-filter-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={filters.filterBy.customerName}
                      onChange={(e) => setFilters({
                        ...filters,
                        filterBy: { ...filters.filterBy, customerName: e.target.checked }
                      })}
                    />
                    Customer Name
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={filters.filterBy.phone}
                      onChange={(e) => setFilters({
                        ...filters,
                        filterBy: { ...filters.filterBy, phone: e.target.checked }
                      })}
                    />
                    Phone Number
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={filters.filterBy.orderId}
                      onChange={(e) => setFilters({
                        ...filters,
                        filterBy: { ...filters.filterBy, orderId: e.target.checked }
                      })}
                    />
                    Order ID
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={filters.filterBy.table}
                      onChange={(e) => setFilters({
                        ...filters,
                        filterBy: { ...filters.filterBy, table: e.target.checked }
                      })}
                    />
                    Table Number
                  </label>
                </div>
                <button className="fin-close-modal" onClick={() => setShowFilterModal(false)}>Close</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DAILY TRANSIT TAB */}
      {activeTab === "DAILY TRANSIT" && (
        <div className="fin-orders-container fin-transit-layout">
          {loadingTransit ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
              Loading daily transit orders...
            </div>
          ) : dailyTransitOrders.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#999" }}>
              No orders found for today
            </div>
          ) : (
            <div className="fin-transit-board">
              <div className="fin-transit-summary">
                <div className="fin-transit-summary-card">
                  <span>Orders Today</span>
                  <strong>{dailyTransitMetrics.totalOrders}</strong>
                </div>
                <div className="fin-transit-summary-card">
                  <span>Total Value</span>
                  <strong>₹{formatCurrency(dailyTransitMetrics.totalValue)}</strong>
                </div>
                <div className="fin-transit-summary-card">
                  <span>Collected</span>
                  <strong>₹{formatCurrency(dailyTransitMetrics.collected)}</strong>
                </div>
                <div className="fin-transit-summary-card alert">
                  <span>Pending</span>
                  <strong>₹{formatCurrency(dailyTransitMetrics.pending)}</strong>
                </div>
              </div>

              <div className="fin-orders-table fin-transit-table-wrap">
                <table className="fin-transit-table">
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Customer</th>
                      <th>Items</th>
                      <th>Specifications</th>
                      <th>Cost</th>
                      <th>Payment</th>
                      <th>Time</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDaily.map((order) => (
                      <React.Fragment key={order.id}>
                        <tr className="fin-transit-row">
                          <td>
                            <div className="fin-transit-cell-stack">
                              <strong className="fin-transit-id-text">{order.id}</strong>
                              <span className="fin-transit-row-note">Live ticket</span>
                            </div>
                          </td>
                          <td>
                            <div className="fin-transit-cell-stack">
                              <strong>{order.username}</strong>
                              <span className="fin-table-no">{`Table ${order.tableNumber}`}</span>
                            </div>
                          </td>
                          <td>
                            <div className="fin-transit-compact-list">
                              {order.itemDetails && order.itemDetails.length > 0 ? order.itemDetails.map((item, idx) => (
                                <div key={idx} className="fin-transit-compact-item">
                                  <span className="fin-transit-compact-main">{item.quantity}x {item.name}</span>
                                  <span className="fin-transit-compact-sub">₹{item.total}</span>
                                </div>
                              )) : (
                                <span className="fin-transit-row-note">No items</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="fin-transit-compact-list">
                              {order.specs && order.specs.length > 0 ? order.specs.map((spec, idx) => (
                                <div key={idx} className="fin-transit-spec-line">
                                  <strong>{spec.name}</strong>
                                  <span>{spec.instructions && spec.instructions !== "-" ? spec.instructions : "No special instructions"}</span>
                                </div>
                              )) : (
                                <span className="fin-transit-row-note">No special instructions</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="fin-transit-cost-stack">
                              <div><span>Subtotal</span><strong>₹{formatCurrency(order.subtotal)}</strong></div>
                              <div><span>Tax</span><strong>₹{formatCurrency(order.tax)}</strong></div>
                              <div className="total"><span>Total</span><strong>₹{formatCurrency(order.totalCost)}</strong></div>
                            </div>
                          </td>
                          <td>
                            <div className="fin-payment-wrapper fin-transit-payment-stack">
                              <div className={`fin-payment-badge ${String(order.paymentType || "Unknown").toLowerCase().replace(/\s+/g, "-")}`}>
                                {order.paymentType || "Unknown"}
                              </div>
                              <div className="fin-payment-status-text">
                                {order.paid}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="fin-transit-cell-stack">
                              <strong>{formatTime(order.timestamp)}</strong>
                            </div>
                          </td>
                          <td>
                            <div className="fin-transit-actions-col">
                              <button className="print-btn fin-transit-inline-btn" title="Print bill" onClick={() => { setBillOrder(order); setShowBillModal(true); }}>
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    d="M5 20h14v-2H5v2zm7-18v12l4-4h-3V4h-2v6H8l4 4z"
                                    fill="#050505"
                                  />
                                </svg>
                                <span>Print</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EARNINGS CALCULATION TAB */}
      {activeTab === "EARNINGS CALCULATION" && (
        <div className="fin-orders-container fin-earnings-screen">
          <div className="fin-earnings-scroll">
          <div className="fin-earnings-filter-panel">
            <div className="fin-earnings-filter-heading">
              <span>Revenue window</span>
              <h3>Filter by Date</h3>
            </div>
            <div className="fin-earnings-filter-controls">
              <select 
                value={earningsFilterType} 
                onChange={(e) => setEarningsFilterType(e.target.value)}
                className="fin-earnings-control"
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
                <option value="custom">Custom Date Range</option>
              </select>

              {earningsFilterType === 'custom' && (
                <>
                  <input 
                    type="date" 
                    value={earningsStartDate}
                    onChange={(e) => setEarningsStartDate(e.target.value)}
                    className="fin-earnings-control"
                  />
                  <span className="fin-earnings-to">to</span>
                  <input 
                    type="date" 
                    value={earningsEndDate}
                    onChange={(e) => setEarningsEndDate(e.target.value)}
                    className="fin-earnings-control"
                  />
                </>
              )}
            </div>
          </div>

          {loadingEarnings ? (
            <div className="fin-earnings-loading">
              Loading earnings data...
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="fin-earnings-summary-grid">
                <div className="fin-earnings-summary-card earnings">
                  <div className="fin-earnings-card-label">Total Earnings</div>
                  <div className="fin-earnings-card-value">₹{formatCurrency(earningsData.totalEarnings)}</div>
                  <div className="fin-earnings-card-note">Orders: {filteredEarnings.length}</div>
                </div>
                <div className="fin-earnings-summary-card tax">
                  <div className="fin-earnings-card-label">Total Tax</div>
                  <div className="fin-earnings-card-value">₹{formatCurrency(earningsData.totalTax)}</div>
                  <div className="fin-earnings-card-note">From all payments</div>
                </div>
              </div>

              {/* Earnings by Payment Type */}
              <div className="fin-earnings-section">
                <div className="fin-earnings-section-header">
                  <span>Payment mix</span>
                  <h3>Earnings by Payment Type</h3>
                </div>
                <div className="fin-earnings-type-grid">
                  {Object.entries(earningsData.byPaymentType).map(([type, data]) => (
                    <div key={type} className="fin-earnings-type-card">
                      <div className="fin-earnings-type-name">
                        {type}
                      </div>
                      <div className="fin-earnings-type-value">
                        ₹{formatCurrency(data.earnings)}
                      </div>
                      <div className="fin-earnings-type-count">
                        Orders: {data.count}
                      </div>
                      <div className="fin-earnings-chip">
                        Avg: ₹{data.count > 0 ? formatCurrency(data.earnings / data.count) : "0.00"}
                      </div>
                      <div className="fin-earnings-tax-line">
                        Tax: <span>₹{formatCurrency(data.tax)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tax by Payment Type */}
              <div className="fin-earnings-section">
                <div className="fin-earnings-section-header">
                  <span>Tax split</span>
                  <h3>Tax by Payment Type</h3>
                </div>
                <div className="fin-earnings-type-grid tax-grid">
                  {Object.entries(earningsData.byPaymentType).map(([type, data]) => (
                    <div key={`tax-${type}`} className="fin-earnings-type-card tax-card">
                      <div className="fin-earnings-type-name">
                        {type} TAX
                      </div>
                      <div className="fin-earnings-type-value tax-value">
                        ₹{formatCurrency(data.tax)}
                      </div>
                      <div className="fin-earnings-type-count">
                        From {data.count} orders
                      </div>
                      <div className="fin-earnings-chip">
                        Avg Tax: ₹{data.count > 0 ? formatCurrency(data.tax / data.count) : "0.00"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          </div>
        </div>
      )}

      {showBillModal && (
        <BillModal order={billOrder} open={showBillModal} onClose={() => setShowBillModal(false)} />
      )}
    </div>
  );
}

export default App;

// Bill modal mounted at end so Finance can render it
// Render BillModal outside main return using portal-like approach (simple conditional render)
