// utils/financeUtils.js

export const formatCurrency = (value) => {
  const amount = Number(value) || 0;

  return amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const calculateTodaysRevenue = (orders = []) => {
  const today = new Date();

  return orders.reduce((total, order) => {
    if (!order.timestamp) return total;

    const orderDate =
      typeof order.timestamp.toDate === "function"
        ? order.timestamp.toDate()
        : new Date(order.timestamp);

    const isToday =
      orderDate.getDate() === today.getDate() &&
      orderDate.getMonth() === today.getMonth() &&
      orderDate.getFullYear() === today.getFullYear();

    if (!isToday) return total;

    return total + (Number(order.totalCost) || 0);
  }, 0);
};