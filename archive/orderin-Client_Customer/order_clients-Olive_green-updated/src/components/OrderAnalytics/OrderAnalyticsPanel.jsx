import React, { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, BarChart3, Calendar, Filter } from "lucide-react";
import { subscribeAllCustomerOrders } from "../../services/orderService";
import "./OrderAnalyticsPanel.css";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ORDER_CATEGORIES = {
  HIGHLY_ORDERED: { label: "Highly Ordered", minPct: 15, color: "#15803d", bg: "#dcfce7" },
  AVERAGE_ORDERED: { label: "Average Ordered", minPct: 5, color: "#b45309", bg: "#fef3c7" },
  LOW_ORDERED: { label: "Low Ordered", minPct: 0.1, color: "#dc2626", bg: "#fee2e2" },
  NOT_ORDERED: { label: "Not Ordered", minPct: 0, color: "#6b7280", bg: "#f1f5f9" },
};

function OrderAnalyticsPanel() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("today");
  const [customDays, setCustomDays] = useState(7);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeAllCustomerOrders((allOrders) => {
      setOrders(allOrders || []);
      setLoading(false);
    });
    return () => { if (typeof unsub === "function") unsub(); };
  }, []);

  const getDateRange = useMemo(() => {
    const now = new Date();
    let start, end;
    if (filterType === "today") {
      start = new Date(now); start.setHours(0,0,0,0);
      end = new Date(now); end.setHours(23,59,59,999);
    } else if (filterType === "custom-days") {
      end = new Date(now); end.setHours(23,59,59,999);
      start = new Date(now); start.setDate(start.getDate() - customDays); start.setHours(0,0,0,0);
    } else if (filterType === "week") {
      const curr = new Date(now);
      const first = curr.getDate() - curr.getDay();
      start = new Date(curr.setDate(first)); start.setHours(0,0,0,0);
      end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23,59,59,999);
    } else if (filterType === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1); start.setHours(0,0,0,0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0); end.setHours(23,59,59,999);
    } else if (filterType === "year") {
      start = new Date(now.getFullYear(), 0, 1); start.setHours(0,0,0,0);
      end = new Date(now.getFullYear(), 11, 31); end.setHours(23,59,59,999);
    } else if (filterType === "custom") {
      start = new Date(startDate); start.setHours(0,0,0,0);
      end = new Date(endDate); end.setHours(23,59,59,999);
    }
    return { start, end };
  }, [filterType, customDays, startDate, endDate]);

  const filteredOrders = useMemo(() => {
    const { start, end } = getDateRange;
    return orders.filter((o) => {
      const ts = o.timestamp?.toDate?.() || new Date(o.timestamp);
      return ts >= start && ts <= end;
    });
  }, [orders, getDateRange]);

  // Build item-wise stats
  const itemStats = useMemo(() => {
    const stats = {};
    filteredOrders.forEach((order) => {
      (order.itemDetails || []).forEach((item) => {
        if (!stats[item.name]) {
          stats[item.name] = { name: item.name, totalQty: 0, orderCount: 0, daysOrdered: new Set() };
        }
        stats[item.name].totalQty += item.quantity || 0;
        stats[item.name].orderCount += 1;
        if (order.timestamp) {
          const d = order.timestamp?.toDate?.() || new Date(order.timestamp);
          stats[item.name].daysOrdered.add(d.toDateString());
        }
      });
    });

    // Calculate percentages
    const totalOrders = filteredOrders.length;
    const itemEntries = Object.entries(stats).map(([name, data]) => {
      const orderPct = totalOrders > 0 ? (data.orderCount / totalOrders) * 100 : 0;
      let category;
      if (orderPct >= ORDER_CATEGORIES.HIGHLY_ORDERED.minPct) category = ORDER_CATEGORIES.HIGHLY_ORDERED;
      else if (orderPct >= ORDER_CATEGORIES.AVERAGE_ORDERED.minPct) category = ORDER_CATEGORIES.AVERAGE_ORDERED;
      else if (orderPct >= ORDER_CATEGORIES.LOW_ORDERED.minPct) category = ORDER_CATEGORIES.LOW_ORDERED;
      else category = ORDER_CATEGORIES.NOT_ORDERED;
      return { ...data, orderPct, category };
    });

    itemEntries.sort((a, b) => b.totalQty - a.totalQty);
    return itemEntries;
  }, [filteredOrders]);

  // Weekday patterns
  const weekdayStats = useMemo(() => {
    const stats = DAYS.map((day, idx) => ({
      day: idx, label: day, orderCount: 0, revenue: 0, items: {}, topItems: [],
    }));

    filteredOrders.forEach((order) => {
      const ts = order.timestamp?.toDate?.() || new Date(order.timestamp);
      const day = ts.getDay();
      stats[day].orderCount += 1;
      stats[day].revenue += Number(order.subtotal || order.totalCost || 0);
      (order.itemDetails || []).forEach((item) => {
        if (!stats[day].items[item.name]) stats[day].items[item.name] = 0;
        stats[day].items[item.name] += item.quantity || 0;
      });
    });

    // Get top items per day
    stats.forEach((stat) => {
      stat.topItems = Object.entries(stat.items)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, qty]) => ({ name, qty }));
    });

    return stats;
  }, [filteredOrders]);

  const avgOrders = useMemo(() => {
    if (weekdayStats.length === 0) return 0;
    return weekdayStats.reduce((s, w) => s + w.orderCount, 0) / weekdayStats.length;
  }, [weekdayStats]);

  const totalItemQty = useMemo(() => itemStats.reduce((s, i) => s + i.totalQty, 0), [itemStats]);
  const avgItemQty = itemStats.length > 0 ? totalItemQty / itemStats.length : 0;

  // Find mode (most frequently ordered items)
  const modeItems = useMemo(() => {
    if (itemStats.length === 0) return [];
    const maxQty = Math.max(...itemStats.map((i) => i.totalQty));
    return itemStats.filter((i) => i.totalQty === maxQty).slice(0, 5);
  }, [itemStats]);

  // Low traffic days
  const lowTrafficDays = useMemo(() => {
    return weekdayStats.filter((w) => w.orderCount < avgOrders * 0.5);
  }, [weekdayStats, avgOrders]);

  // Commonly ordered items across all days
  const commonItems = useMemo(() => {
    return itemStats.filter((item) => item.daysOrdered.size >= 5).slice(0, 10);
  }, [itemStats]);

  if (loading) {
    return <div className="OrderAnalytics-panel"><p className="OrderAnalytics-loading">Loading order analytics...</p></div>;
  }

  return (
    <div className="OrderAnalytics-panel">
      <div className="OrderAnalytics-header">
        <h3><BarChart3 size={20} /> Order Counting &amp; Analytics</h3>
        <p className="OrderAnalytics-subtitle">Track item popularity, weekday patterns, and prepare ingredients smarter.</p>
      </div>

      {/* Filter Controls */}
      <div className="OrderAnalytics-filters">
        <div className="OrderAnalytics-filter-group">
          <Filter size={16} />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="today">Today</option>
            <option value="custom-days">Last N Days</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
          {filterType === "custom-days" && (
            <input type="number" min="1" value={customDays} onChange={(e) => setCustomDays(Number(e.target.value))} />
          )}
          {filterType === "custom" && (
            <>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <span>to</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </>
          )}
        </div>
        <div className="OrderAnalytics-summary">
          <span>{filteredOrders.length} orders</span>
          <span>{itemStats.length} unique items</span>
        </div>
      </div>

      {/* Item Popularity Chart */}
      <div className="OrderAnalytics-section">
        <h4>Item-wise Ordering Trends</h4>
        <div className="OrderAnalytics-chart">
          <div className="OrderAnalytics-bar-chart">
            {itemStats.map((item) => {
              const pct = totalItemQty > 0 ? (item.totalQty / totalItemQty) * 100 : 0;
              return (
                <div key={item.name} className="OrderAnalytics-bar-row">
                  <span className="OrderAnalytics-bar-label" title={item.name}>{item.name}</span>
                  <div className="OrderAnalytics-bar-track">
                    <div
                      className="OrderAnalytics-bar-fill"
                      style={{ width: `${Math.max(2, pct * 3)}%`, background: item.category.color }}
                    />
                  </div>
                  <span className="OrderAnalytics-bar-value">{item.totalQty}x</span>
                  <span className="OrderAnalytics-bar-pct">{item.orderPct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="OrderAnalytics-section">
        <h4>Item Popularity Categories</h4>
        <div className="OrderAnalytics-categories">
          {Object.entries(ORDER_CATEGORIES).map(([key, cat]) => {
            const items = itemStats.filter((i) => i.category.label === cat.label);
            return (
              <div key={key} className="OrderAnalytics-category-card" style={{ borderColor: cat.color, background: cat.bg }}>
                <div className="OrderAnalytics-category-header" style={{ color: cat.color }}>
                  <span>{cat.label}</span>
                  <span className="OrderAnalytics-category-count">{items.length}</span>
                </div>
                <div className="OrderAnalytics-category-items">
                  {items.slice(0, 5).map((item) => (
                    <span key={item.name} className="OrderAnalytics-category-item">{item.name} ×{item.totalQty}</span>
                  ))}
                  {items.length > 5 && <span className="OrderAnalytics-category-more">+{items.length - 5} more</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekday Patterns */}
      <div className="OrderAnalytics-section">
        <h4>Weekday Ordering Patterns</h4>
        <div className="OrderAnalytics-weekday-grid">
          {weekdayStats.map((day) => {
            const maxOrder = Math.max(1, ...weekdayStats.map((w) => w.orderCount));
            const heightPct = Math.max(5, (day.orderCount / maxOrder) * 100);
            return (
              <div key={day.day} className="OrderAnalytics-weekday-col">
                <div className="OrderAnalytics-weekday-bar-track">
                  <div className="OrderAnalytics-weekday-bar" style={{ height: `${heightPct}%` }} />
                </div>
                <span className="OrderAnalytics-weekday-label">{day.label.slice(0, 3)}</span>
                <span className="OrderAnalytics-weekday-count">{day.orderCount}</span>
                <div className="OrderAnalytics-weekday-items">
                  {day.topItems.map((item) => (
                    <span key={item.name} className="OrderAnalytics-weekday-item">{item.name} ×{item.qty}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Statistical Insights */}
      <div className="OrderAnalytics-section">
        <h4>Statistical Insights</h4>
        <div className="OrderAnalytics-insights-grid">
          <div className="OrderAnalytics-insight-card">
            <span className="OrderAnalytics-insight-label">Average Orders/Day</span>
            <span className="OrderAnalytics-insight-value">{avgOrders.toFixed(1)}</span>
          </div>
          <div className="OrderAnalytics-insight-card">
            <span className="OrderAnalytics-insight-label">Average Item Quantity/Order</span>
            <span className="OrderAnalytics-insight-value">{avgItemQty.toFixed(1)}</span>
          </div>
          <div className="OrderAnalytics-insight-card">
            <span className="OrderAnalytics-insight-label">Total Unique Items Ordered</span>
            <span className="OrderAnalytics-insight-value">{itemStats.length}</span>
          </div>
          <div className="OrderAnalytics-insight-card">
            <span className="OrderAnalytics-insight-label">Mode (Most Ordered Items)</span>
            <div className="OrderAnalytics-insight-list">
              {modeItems.map((item) => (
                <span key={item.name} className="OrderAnalytics-insight-tag">{item.name} ×{item.totalQty}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Low Traffic Days */}
      {lowTrafficDays.length > 0 && (
        <div className="OrderAnalytics-section">
          <h4>Low Traffic Days <span className="OrderAnalytics-warning-badge">Action Needed</span></h4>
          <div className="OrderAnalytics-low-traffic">
            {lowTrafficDays.map((day) => (
              <div key={day.day} className="OrderAnalytics-low-traffic-card">
                <TrendingDown size={20} color="#dc2626" />
                <span><strong>{day.label}</strong> — Only {day.orderCount} orders ({(day.orderCount / Math.max(1, avgOrders) * 100).toFixed(0)}% of avg)</span>
                <span className="OrderAnalytics-low-traffic-suggestion">Consider running promotions or reducing staff on {day.label}s.</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commonly Ordered Items */}
      {commonItems.length > 0 && (
        <div className="OrderAnalytics-section">
          <h4>Consistently Popular Items (Ordered 5+ days/week)</h4>
          <div className="OrderAnalytics-common-items">
            {commonItems.map((item) => (
              <div key={item.name} className="OrderAnalytics-common-item">
                <TrendingUp size={16} color="#15803d" />
                <span className="OrderAnalytics-common-name">{item.name}</span>
                <span className="OrderAnalytics-common-qty">{item.totalQty} total</span>
                <span className="OrderAnalytics-common-days">{item.daysOrdered.size} days</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ingredient Prep Recommendations */}
      <div className="OrderAnalytics-section">
        <h4>Ingredient Preparation Recommendations</h4>
        <div className="OrderAnalytics-recommendations">
          {weekdayStats.map((day) => {
            const top3 = day.topItems.slice(0, 3);
            if (top3.length === 0) return null;
            const pctOfWeek = totalItemQty > 0
              ? ((Object.values(day.items).reduce((a, b) => a + b, 0) / totalItemQty) * 100).toFixed(0)
              : 0;
            return (
              <div key={day.day} className="OrderAnalytics-recommendation">
                <Calendar size={16} />
                <span><strong>{day.label}</strong> ({day.orderCount} orders, ~{pctOfWeek}% of weekly volume)</span>
                <div className="OrderAnalytics-recommendation-items">
                  {top3.map((item) => (
                    <span key={item.name} className="OrderAnalytics-rec-item">Stock up: {item.name} (avg {Math.round(item.qty / Math.max(1, day.orderCount))}/order)</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default OrderAnalyticsPanel;

