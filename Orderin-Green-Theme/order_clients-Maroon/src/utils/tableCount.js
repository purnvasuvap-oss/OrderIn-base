export const getOccupiedTablesCount = (orders = []) => {
  const today = new Date();

  const occupiedTables = new Set();

  orders.forEach((order) => {
    if (!order.timestamp) return;

    const orderDate = new Date(order.timestamp);

    const isToday =
      orderDate.getDate() === today.getDate() &&
      orderDate.getMonth() === today.getMonth() &&
      orderDate.getFullYear() === today.getFullYear();

    if (!isToday) return;

    const tableNumber =
      order.tableNumber ||
      order.tableNo ||
      order.table ||
      null;

    if (tableNumber) {
      occupiedTables.add(String(tableNumber));
    }
  });

  return occupiedTables.size;
};