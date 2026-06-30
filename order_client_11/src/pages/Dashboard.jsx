import { useNavigate } from "react-router-dom";
import {
  ClipboardList,
  PackageSearch,
  ReceiptText,
  Utensils,
  DollarSign,
  ShoppingCart,
  Users,
  LayoutGrid,
  CalendarDays,
  Mail,
  HelpCircle,
} from "lucide-react";
// import Header from "./header.jsx"
// import Footer from "./footer.jsx"

import "./Dashboard.css";

const STATS = [
  {
    icon: DollarSign,
    color: "stat-revenue",
    label: "Today's revenue",
    value: "$45,000",
    delta: "12.5%",
    deltaLabel: "vs yesterday",
    deltaTone: "up",
  },
  {
    icon: ShoppingCart,
    color: "stat-orders",
    label: "Orders Today",
    value: "324",
    delta: "8.2%",
    deltaLabel: "vs yesterday",
    deltaTone: "up",
  },
  {
    icon: Users,
    color: "stat-customers",
    label: "Customers Today",
    value: "187",
    delta: "5.6%",
    deltaLabel: "vs yesterday",
    deltaTone: "up",
  },
  {
    icon: LayoutGrid,
    color: "stat-tables",
    label: "Tables Occupied",
    value: "18/25",
    delta: "72%",
    deltaLabel: "Occupancy",
    deltaTone: "neutral",
  },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const goTo = (path) => () => navigate(path);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const cards = [
    {
      icon: Utensils,
      color: "card-menu",
      title: "Menu",
      desc: "Keep dishes, categories, and promotions updated.",
      path: "/menu-login",
    },
    {
      icon: ReceiptText,
      color: "card-finance",
      title: "Financial",
      desc: "Handle transactions, generate bills, and access reports.",
      path: "/finance-login",
    },
    {
      icon: ClipboardList,
      color: "card-orders",
      title: "Orders",
      desc: "Track live orders and view history in real time.",
      path: "/orders",
    },
    {
      icon: PackageSearch,
      color: "card-inventory",
      title: "Inventory",
      desc: "Monitor stock levels and receive low-stock alerts.",
      path: "/inventory-login",
    },
  ];

  return (
    <div className="dash-page">
      <div className="dash-wrap">
        <header className="dash-header">
          <div className="dash-heading">
            <h1>
              Welcome To the Dashboard, Manager <span className="wave">👋</span>
            </h1>
            <p>Here&apos;s an overview of your restaurant operations.</p>
          </div>

          <div className="dash-clock">
            <CalendarDays size={18} className="dash-clock-icon" />
            <div className="dash-clock-text">
              <span className="dash-clock-date">{dateStr}</span>
              <span className="dash-clock-time">{timeStr}</span>
            </div>
          </div>
        </header>

        <section className="stats-grid">
          {STATS.map(({ icon: Icon, color, label, value, delta, deltaLabel, deltaTone }) => (
            <div className="stat-card" key={label}>
              <div className={`stat-icon ${color}`}>
                <Icon size={22} />
              </div>
              <div className="stat-body">
                <span className="stat-label">{label}</span>
                <span className="stat-value">{value}</span>
                <span className={`stat-delta stat-delta-${deltaTone}`}>
                  <strong>{delta}</strong> {deltaLabel}
                </span>
              </div>
            </div>
          ))}
        </section>

        <section className="cards-grid">
          {cards.map(({ icon: Icon, color, title, desc, path }) => (
            <div className="action-card" key={title} onClick={goTo(path)}>
              <div className={`action-icon ${color}`}>
                <Icon size={26} />
              </div>
              <h3>{title}</h3>
              <p>{desc}</p>
              <button onClick={goTo(path)}>Open</button>
            </div>
          ))}
        </section>

        <footer className="dash-footer">
          <span className="dash-footer-item">
            <HelpCircle size={16} />
            Need help? Contact PurnVasu for queries
          </span>
          <span className="dash-footer-item">
            <Mail size={16} />
            OrderIn.vap@gmail.com
          </span>
        </footer>
      </div>
      {/* <Footer /> */}
    </div>
  );
};

export default Dashboard;