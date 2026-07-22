// utils/dashboardStats.js

import { subscribeTodaysOrders } from "../services/orderService";

export const subscribeDashboardOrders = (setTodayOrders) => {
  return subscribeTodaysOrders((orders) => {
    setTodayOrders(orders.length);
  });
};