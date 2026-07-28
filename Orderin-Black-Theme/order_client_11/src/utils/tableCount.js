// utils/tableCount.js

export const getOccupiedTablesCount = (orders = []) => {
  const today = new Date();

  const occupiedTables = new Set();

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

    if (
      order.status !== "Delivered" &&
      order.tableNumber !== undefined &&
      order.tableNumber !== null
    ) {
      occupiedTables.add(order.tableNumber);
    }
  });

  return occupiedTables.size;
};