// src/utils/earningsUtils.js

export const formatCurrency = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
};

export const calculateTodaysRevenue = (orders = []) => {
  const today = new Date();

  const start = new Date(today);
  start.setHours(0, 0, 0, 0);

  const end = new Date(today);
  end.setHours(23, 59, 59, 999);

  return orders.reduce((total, order) => {
    const orderDate =
      order.timestamp?.toDate?.() ||
      new Date(order.timestamp);

    if (orderDate >= start && orderDate <= end) {
      // Use totalCost (includes tax) instead of subtotal for accurate revenue
      return total + (Number(order.totalCost) || Number(order.total) || Number(order.subtotal) || 0);
    }

    return total;
  }, 0);
};

export const calculateTotalTax = (orders = []) => {
  return orders.reduce((total, order) => {
    return total + (Number(order.tax) || 0);
  }, 0);
};

export const calculateTotalOrders = (orders = []) => {
  return orders.length;
};