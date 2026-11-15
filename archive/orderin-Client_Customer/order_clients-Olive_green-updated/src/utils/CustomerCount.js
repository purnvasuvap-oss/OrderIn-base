export const getTodaysCustomersCount = (orders = []) => {
  const today = new Date();

  const uniqueCustomers = new Set();

  orders.forEach((order) => {
    let orderDate;

    if (order.timestamp?.toDate) {
      orderDate = order.timestamp.toDate();
    } else {
      orderDate = new Date(order.timestamp);
    }

    const isToday =
      orderDate.getDate() === today.getDate() &&
      orderDate.getMonth() === today.getMonth() &&
      orderDate.getFullYear() === today.getFullYear();

    if (isToday) {
      uniqueCustomers.add(
        order.phoneNumber ||
        order.username ||
        order.id
      );
    }
  });

  return uniqueCustomers.size;
};