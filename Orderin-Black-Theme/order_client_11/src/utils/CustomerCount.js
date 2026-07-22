// utils/CustomerCount.js

export const getTodaysCustomersCount = (orders = []) => {
  const today = new Date();

  const customers = new Set();

  orders.forEach((order) => {
    if (!order.timestamp) return;

    const orderDate =
      typeof order.timestamp.toDate === "function"
        ? order.timestamp.toDate()
        : new Date(order.timestamp);

    const isToday =
      orderDate.getDate() === today.getDate() &&
      orderDate.getMonth() === today.getMonth() &&
      orderDate.getFullYear() === today.getFullYear();

    if (!isToday) return;

    customers.add(order.phoneNumber);
  });

  return customers.size;
};