import { useEffect, useMemo, useState } from "react";
import { subscribeAllCustomerOrders } from "../../services/orderService";

const rankClass = (rank) => {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "default";
};

const formatCurrency = (value) => (Number(value) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const CustomerLoyaltyPanel = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeAllCustomerOrders((allOrders) => {
      setOrders(allOrders || []);
      setLoading(false);
    });
    return () => { if (typeof unsub === "function") unsub(); };
  }, []);

  const topCustomers = useMemo(() => {
    const byPhone = {};
    orders.forEach((order) => {
      const phone = order.phoneNumber || "Unknown";
      if (!byPhone[phone]) {
        byPhone[phone] = {
          phoneNumber: phone,
          name: order.username || "Unknown",
          orderCount: 0,
          totalPaid: 0,
          lastOrderDate: null,
        };
      }
      const entry = byPhone[phone];
      entry.orderCount += 1;
      entry.totalPaid += Number(order.paidAmount) || Number(order.totalCost) || 0;
      const orderTime = order.timestamp instanceof Date ? order.timestamp : null;
      if (orderTime && (!entry.lastOrderDate || orderTime.getTime() > entry.lastOrderDate.getTime())) {
        entry.lastOrderDate = orderTime;
      }
    });

    return Object.values(byPhone)
      .sort((a, b) => b.orderCount - a.orderCount || b.totalPaid - a.totalPaid)
      .slice(0, 10);
  }, [orders]);

  if (loading) {
    return <div className="fin-loyalty-section"><p>Loading customer loyalty data...</p></div>;
  }

  return (
    <div className="fin-loyalty-section">
      <h3>Customer Loyalty — Top 10</h3>
      <p className="fin-loyalty-subtitle">Ranked by number of orders placed.</p>

      {topCustomers.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#999" }}>No customer orders found</div>
      ) : (
        <table className="fin-loyalty-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Total Orders</th>
              <th>Total Amount Paid (₹)</th>
              <th>Last Order Date</th>
            </tr>
          </thead>
          <tbody>
            {topCustomers.map((customer, idx) => {
              const rank = idx + 1;
              return (
                <tr key={customer.phoneNumber}>
                  <td><span className={`fin-loyalty-rank ${rankClass(rank)}`}>{rank}</span></td>
                  <td>
                    <div className="fin-ledger-customer">
                      <strong>{customer.name}</strong>
                    </div>
                  </td>
                  <td>{customer.phoneNumber}</td>
                  <td>{customer.orderCount}</td>
                  <td>₹{formatCurrency(customer.totalPaid)}</td>
                  <td>{customer.lastOrderDate ? customer.lastOrderDate.toLocaleDateString("en-GB") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default CustomerLoyaltyPanel;
