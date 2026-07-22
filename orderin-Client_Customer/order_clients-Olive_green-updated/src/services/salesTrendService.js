// src/services/salesTrendService.js
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import { parseOrderTimestamp } from "../utils/orderDateTime";

const RESTAURANT_ID = "orderin_restaurant_3";

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Flatten every customer's pastOrders into a single array of normalized orders. */
export const fetchAllOrdersFlat = async () => {
  const customersRef = collection(db, "Restaurant", RESTAURANT_ID, "customers");
  const snap = await getDocs(customersRef);
  const orders = [];

  snap.docs.forEach((customerDoc) => {
    const data = customerDoc.data();
    if (!Array.isArray(data.pastOrders)) return;

    data.pastOrders.forEach((order) => {
      const timestamp = parseOrderTimestamp(order);
      if (!timestamp) return;
      const items = Array.isArray(order.items)
        ? order.items.map((it) => {
            const price = Number(String(it?.price ?? 0).replace(/[^0-9.-]+/g, "")) || 0;
            const quantity = Number(it?.quantity ?? 1) || 1;
            return { name: it?.name || "Unknown", quantity, price, total: price * quantity };
          })
        : [];
      const total = items.reduce((sum, it) => sum + it.total, 0);
      orders.push({ timestamp, items, total });
    });
  });

  return orders;
};

/** Fetch menu items so dishes can be classified Veg / Non-Veg. */
export const fetchMenuTypeMap = async () => {
  const menuSnap = await getDocs(collection(db, "Restaurant", RESTAURANT_ID, "menu"));
  const map = {};
  menuSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.name) {
      map[data.name.toLowerCase()] = /non/i.test(data.type || "") ? "Non-Veg" : "Veg";
    }
  });
  return map;
};

/**
 * Build day-of-week aggregates: revenue, order count, veg/non-veg split,
 * and per-dish quantities per weekday.
 */
export const buildWeekdayTrends = (orders, menuTypeMap = {}) => {
  const weekday = WEEKDAY_LABELS.map((label, idx) => ({
    day: idx,
    label,
    orderCount: 0,
    revenue: 0,
    vegQty: 0,
    nonVegQty: 0,
    dishCounts: {},
  }));

  orders.forEach((order) => {
    const day = order.timestamp.getDay();
    const bucket = weekday[day];
    bucket.orderCount += 1;
    bucket.revenue += order.total;

    order.items.forEach((it) => {
      const type = menuTypeMap[it.name.toLowerCase()] || null;
      if (type === "Non-Veg") bucket.nonVegQty += it.quantity;
      else if (type === "Veg") bucket.vegQty += it.quantity;

      bucket.dishCounts[it.name] = (bucket.dishCounts[it.name] || 0) + it.quantity;
    });
  });

  return weekday;
};

/**
 * For each dish, compare its quantity on a given weekday vs its own average
 * across all weekdays, to surface "X sales drop/surge by Y% on <day>" insights.
 */
export const buildDishInsights = (weekday, { minAvgQty = 2, topN = 6 } = {}) => {
  const dishTotals = {}; // name -> { [day]: qty }
  weekday.forEach((bucket) => {
    Object.entries(bucket.dishCounts).forEach(([name, qty]) => {
      dishTotals[name] = dishTotals[name] || {};
      dishTotals[name][bucket.day] = qty;
    });
  });

  const insights = [];
  Object.entries(dishTotals).forEach(([name, byDay]) => {
    const values = Object.values(byDay);
    const avg = values.reduce((a, b) => a + b, 0) / 7;
    if (avg < minAvgQty) return;

    Object.entries(byDay).forEach(([dayStr, qty]) => {
      const day = Number(dayStr);
      const deltaPct = Math.round(((qty - avg) / avg) * 100);
      if (Math.abs(deltaPct) >= 40) {
        insights.push({
          dish: name,
          day,
          dayLabel: WEEKDAY_LABELS[day],
          qty,
          avg: Math.round(avg * 10) / 10,
          deltaPct,
          direction: deltaPct > 0 ? "surge" : "drop",
        });
      }
    });
  });

  insights.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  return insights.slice(0, topN);
};
