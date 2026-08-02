import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import RevenueIcon from "./landingpage/revenue.svg";
import OrdersTodayIcon from "./landingpage/orders_today.svg";
import CustomersIcon from "./landingpage/customers.svg";
import TablesIcon from "./landingpage/tables_occupied.svg";
import MenuIcon from "./landingpage/menu.svg";
import FinanceIcon from "./landingpage/finance.svg";
import OrdersIcon from "./landingpage/orders.svg";
import InventoryIcon from "./landingpage/inventory.svg";
import { Bell, LogOut, Calendar, Plus, Package, ChevronRight } from "lucide-react";

import { subscribeAllCustomerOrders, subscribeRecentOrders } from "../services/orderService";
import { calculateTodaysRevenue, formatCurrency } from "../utils/financeUtils";
import {
  subscribeDashboardOrders,
  getTodayCustomers,
} from "../utils/dashboardStats";
import { getTodaysCustomersCount } from "../utils/CustomerCount";
import { subscribeTables, reconcileOccupiedTables } from "../services/tableService";
import routes from "../routes";
import "./Dashboard.css";

const Dashboard = () => {
  const navigate = useNavigate();

  const goTo = (path) => () => navigate(path);
  const [dateTime, setDateTime] = useState(new Date());
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [orders, setOrders] = useState([]);
  const todayCustomers = getTodaysCustomersCount(orders);
  const [tablesOccupied, setTablesOccupied] = useState(0);
  const [totalTables, setTotalTables] = useState(0);
  const [rawTables, setRawTables] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeAllCustomerOrders((ordersData) => {
      setOrders(ordersData);

      const revenue = calculateTodaysRevenue(ordersData);
      setTodayRevenue(revenue);
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  // Real table count + Occupied count, both read straight off the stored
  // `tables` collection — the same one Table Management edits — so the two
  // pages can never disagree. "Occupied" here includes tables whose order
  // has already been served but hasn't been manually "Freed" yet (guests
  // are still eating), since reconcileOccupiedTables only ever promotes to
  // occupied, never auto-clears it.
  useEffect(() => {
    const unsubscribe = subscribeTables((tables) => {
      setRawTables(tables);
      setTotalTables(tables.length);
      setTablesOccupied(tables.filter((t) => t.status === "occupied").length);
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeRecentOrders((ordersData) => {
      setRecentOrders(ordersData || []);
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  // Runs the same one-way occupied-promotion Table Management runs, so
  // occupancy stays accurate even if nobody has the Table Management page
  // open at the moment a new order comes in.
  useEffect(() => {
    if (rawTables.length === 0 || recentOrders.length === 0) return;
    reconcileOccupiedTables(rawTables, recentOrders);
  }, [rawTables, recentOrders]);
  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAllCustomerOrders((orders) => {
      const revenue = calculateTodaysRevenue(orders);
      setTodayRevenue(revenue);
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);
  useEffect(() => {
    const unsubscribeOrders = subscribeDashboardOrders(setTodayOrders);

    return () => {
      if (unsubscribeOrders) unsubscribeOrders();
    };
  }, []);
  const currentDate = dateTime.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const currentTime = dateTime.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="dashboard-wrapper">
      {/* Hero */}

      <section className="dashboard-banner">
        <div>
          <h1>Welcome To the Dashboard, Manager 👋</h1>

          <p>Here's an overview of your restaurant operations.</p>
        </div>

        <div className="date-card">
          <Calendar size={38} color="white" strokeWidth={2.2} />

          <div>
            <p>{currentDate}</p>
            <h4>{currentTime}</h4>
          </div>
        </div>
      </section>

      {/* KPI */}

      <div className="stats-grid">
        <div className="stat-card revenue">
          <img src={RevenueIcon} alt="" />

          <div>
            <p>Today's Revenue</p>
            <h2>₹{formatCurrency(todayRevenue)}</h2>
            <span>Live earnings from today's orders</span>
          </div>
        </div>

        <div className="stat-card orders">
          <img src={OrdersTodayIcon} alt="" />

          <div>
            <p>Orders Today</p>
            <h2>{todayOrders}</h2>
            <span>Total orders recored today</span>
          </div>
        </div>

        <div className="stat-card customers">
          <img src={CustomersIcon} alt="" />

          <div>
            <p>Customers Today</p>
            <h2>{todayCustomers}</h2>
            <span>Number of Customers Enjoyed the food</span>
          </div>
        </div>

        <div className="stat-card tables">
          <img src={TablesIcon} alt="" />

          <div>
            <p>Tables Occupied</p>
            <h2>{tablesOccupied} / {totalTables}</h2>

            <span>{totalTables > 0 ? Math.round((tablesOccupied / totalTables) * 100) : 0}% Occupancy</span>
          </div>
          <button
            type="button"
            className="stat-card-link-btn"
            title="Open Table Management"
            aria-label="Open Table Management"
            onClick={goTo(routes.tableManagement)}
          >
            <ChevronRight size={28} strokeWidth={2.0} />
          </button>
        </div>
      </div>
      
      {/* Modules */}

      <div className="modules-grid">
        <div className="module-card menu-module" onClick={goTo("/menu-login")}>
          <div className="module-top">   
              <img src={MenuIcon} alt="" />
            <div>
              <h3>Menu</h3>
              <p>Manage dishes, categories and promotions.</p>
            </div>
          </div>

          <div className="module-bottom">Open Menu →</div>
        </div>

        <div
          className="module-card finance-module"
          onClick={goTo("/finance-login")}
        >
          <div className="module-top">      
              <img src={FinanceIcon} alt="" />
            <div>
              <h3>Financial</h3>
              <p>Handle transactions, bills and financial reports.</p>
            </div>
          </div>

          <div className="module-bottom green-text">Open Financial →</div>
        </div>

        <div className="module-card orders-module" onClick={goTo("/orders")}>
          <div className="module-top">
              <img src={OrdersIcon} alt="" />

            <div>
              <h3>Orders</h3>
              <p>Track live orders and view order history.</p>
            </div>
          </div>

          <div className="module-bottom yellow-text">Open Orders →</div>
        </div>

        <div
          className="module-card inventory-module"
          onClick={goTo("/inventory-login")}
        >
          <div className="module-top">
            
              <img src={InventoryIcon} alt="" />
            

            <div>
              <h3>Inventory</h3>
              <p>Monitor stock levels and get low-stock alerts.</p>
            </div>
          </div>

          <div className="module-bottom green-text">Open Inventory →</div>
        </div>
      </div>

      {/* Footer */}

      <footer className="dashboard-footer">
        <div className="footer-item">
          ⓘ Need help? Contact PurnVasu for queries
        </div>

        <div className="footer-divider"></div>

        <div className="footer-item">✉️ purnvasu.vap@gmail.com</div>
      </footer>
    </div>
  );
};

export default Dashboard;
