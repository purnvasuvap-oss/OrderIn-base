import { subscribeTodaysOrders } from "../services/orderService";

export const subscribeDashboardOrders = (callback) => {
  return subscribeTodaysOrders((orders) => {

    const displayOrders = orders.filter((o) => {
      const status = String(o.paymentStatus || "").toLowerCase();

      return (
        status === "paid" ||
        status === "manual"
      );
    });

    callback(displayOrders.length);
  });
};
export const getTodayCustomers = (orders) => {
  return new Set(
    orders.map(order => order.phoneNumber)
  ).size;
};