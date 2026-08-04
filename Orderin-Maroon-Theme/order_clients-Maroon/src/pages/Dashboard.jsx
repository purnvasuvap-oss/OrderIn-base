import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import RevenueIcon from "./landingpage/revenue.svg";
import OrdersTodayIcon from "./landingpage/orders_today.svg";
import CustomersIcon from "./landingpage/customers.svg";
import TablesIcon from "./landingpage/tables_occupied.svg";
import MenuIcon from "./landingpage/menu.svg";
import FinanceIcon from "./landingpage/finance.svg";
import OrdersIcon from "./landingpage/orders.svg";
import InventoryIcon from "./landingpage/inventory.svg";
import StaffIcon from "./landingpage/customers.svg";
import {
  Bell,
  LogOut,
  Calendar,
  Plus,
  Package,
  ChevronRight,
  Lock,
  ShieldCheck,
  DoorOpen,
} from "lucide-react";

import { subscribeAllCustomerOrders, subscribeRecentOrders } from "../services/orderService";
import { calculateTodaysRevenue, formatCurrency } from "../utils/financeUtils";
import {
  subscribeDashboardOrders,
  getTodayCustomers,
} from "../utils/dashboardStats";
import { getTodaysCustomersCount } from "../utils/CustomerCount";
import {
  subscribeTables,
  reconcileOccupiedTables,
  reconcileReservations,
} from "../services/tableService";
import { subscribeAcceptingOrders, setAcceptingOrders } from "../firebase";
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
  const [acceptingOrders, setAcceptingOrdersState] = useState(true);
  const [togglingOrders, setTogglingOrders] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

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

  // Time-aware reservation reconciliation (15-min cleanup alert + 30-min
  // no-show auto-clear — see reconcileReservations in tableService.js),
  // mirroring the occupancy reconciliation above so it fires regardless of
  // whether Table Management is open. Runs off a ref so the periodic
  // interval isn't reset every time the live tables feed ticks. No popup
  // here — that's Table Management's job when it's the page open.
  const rawTablesRef = useRef(rawTables);
  useEffect(() => {
    rawTablesRef.current = rawTables;
  }, [rawTables]);

  useEffect(() => {
    reconcileReservations(rawTablesRef.current);
    const interval = setInterval(() => {
      reconcileReservations(rawTablesRef.current);
    }, 60000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Live "Accepting orders" toggle — read straight off Restaurant/{id}.acceptingOrders
  // (defaults true when the field has never been set) so this reflects the same
  // real value the customer app's checkout gate reads.
  useEffect(() => {
    const unsubscribe = subscribeAcceptingOrders((value) => {
      setAcceptingOrdersState(value);
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const handleToggleAcceptingOrders = () => {
    if (togglingOrders) return;
    // Closing is the consequential direction (blocks every customer from
    // ordering) — confirm before applying so an accidental click on the
    // dashboard can't take the restaurant offline. Re-opening is harmless
    // and applies immediately.
    if (acceptingOrders) {
      setShowCloseConfirm(true);
      return;
    }
    applyAcceptingOrders(true);
  };

  const applyAcceptingOrders = async (next) => {
    setTogglingOrders(true);
    try {
      await setAcceptingOrders(next);
      // subscribeAcceptingOrders will push the confirmed value; no need to
      // set local state here, avoiding a flash back to the old value if the
      // write is slow.
    } catch (err) {
      console.error("Failed to update accepting-orders toggle:", err);
    } finally {
      setTogglingOrders(false);
    }
  };

  const handleConfirmClose = () => {
    setShowCloseConfirm(false);
    applyAcceptingOrders(false);
  };

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

        <div className="banner-right">
          <div className="date-card">
            <Calendar size={38} color="white" strokeWidth={2.2} />

            <div>
              <p>{currentDate}</p>
              <h4>{currentTime}</h4>
            </div>
          </div>

          <button
            type="button"
            className={`accepting-toggle ${acceptingOrders ? "is-open" : "is-closed"}`}
            onClick={handleToggleAcceptingOrders}
            disabled={togglingOrders}
            aria-pressed={acceptingOrders}
            title="Toggle whether the restaurant accepts new orders"
          >
            <span className="accepting-toggle-label">Accepting orders</span>
            <span className="accepting-toggle-pill">
              <span className="accepting-toggle-state">{acceptingOrders ? "Open" : "Closed"}</span>
              <span className="accepting-toggle-track">
                <span className="accepting-toggle-thumb" />
              </span>
            </span>
          </button>
        </div>
      </section>

      {showCloseConfirm && (
        <div className="dash-confirm-overlay" onClick={() => setShowCloseConfirm(false)}>
          <div className="dash-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Stop accepting orders?</h3>
            <p>
              Customers won't be able to place new orders on the website until you turn this back
              on. Existing orders already in progress are not affected.
            </p>
            <div className="dash-confirm-actions">
              <button
                type="button"
                className="dash-confirm-btn dash-confirm-btn-ghost"
                onClick={() => setShowCloseConfirm(false)}
                disabled={togglingOrders}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dash-confirm-btn dash-confirm-btn-danger"
                onClick={handleConfirmClose}
                disabled={togglingOrders}
              >
                {togglingOrders ? "Closing…" : "Yes, stop accepting orders"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPI */}

      <h3 className="section-label">Today's numbers</h3>

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
        </div>
      </div>
      
      {/* Modules */}

      <h3 className="section-label">Manage your restaurant</h3>

      <div className="modules-grid">
        <div className="module-card orders-module" onClick={goTo("/orders")}>
          <div className="module-badge">
            <DoorOpen size={12} />
            <span>Open to all</span>
          </div>
          <div className="module-top">
              <img src={OrdersIcon} alt="" />

            <div>
              <h3>Orders</h3>
              <p>Track live orders and view order history.</p>
            </div>
          </div>

          <div className="module-bottom yellow-text">Open Orders →</div>
        </div>

        <div className="module-card tables-module" onClick={goTo(routes.tableManagement)}>
          <div className="module-badge">
            <DoorOpen size={12} />
            <span>Open to all</span>
          </div>
          <div className="module-top">
              <img src={TablesIcon} alt="" />
            <div>
              <h3>Tables</h3>
              <p>Manage the floor, seating and live table status.</p>
            </div>
          </div>

          <div className="module-bottom blue-text">Open Tables →</div>
        </div>

        <div className="module-card menu-module" onClick={goTo("/menu-login")}>
          <div className="module-badge">
            <Lock size={12} />
            <span>PIN</span>
          </div>
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
          <div className="module-badge">
            <Lock size={12} />
            <span>PIN</span>
          </div>
          <div className="module-top">
              <img src={FinanceIcon} alt="" />
            <div>
              <h3>Financial</h3>
              <p>Handle transactions, bills and financial reports.</p>
            </div>
          </div>

          <div className="module-bottom green-text">Open Financial →</div>
        </div>

        <div
          className="module-card inventory-module"
          onClick={goTo("/inventory-login")}
        >
          <div className="module-badge">
            <Lock size={12} />
            <span>PIN</span>
          </div>
          <div className="module-top">

              <img src={InventoryIcon} alt="" />


            <div>
              <h3>Inventory</h3>
              <p>Monitor stock levels and get low-stock alerts.</p>
            </div>
          </div>

          <div className="module-bottom green-text">Open Inventory →</div>
        </div>

        <div className="module-card staff-module" onClick={goTo(routes.staffManagement)}>
          <div className="module-badge">
            <ShieldCheck size={12} />
            <span>Owner &amp; Manager</span>
          </div>
          <div className="module-top">
              <img src={StaffIcon} alt="" />
            <div>
              <h3>Staff Management</h3>
              <p>Profiles, PINs, roster and attendance.</p>
            </div>
          </div>

          <div className="module-bottom purple-text">Open Staff Management →</div>
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
