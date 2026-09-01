import { NavLink } from "react-router-dom";
import { ChefHat } from "lucide-react";
import { NAV_ITEMS } from "../lib/routes";
import { allowedKeys } from "../lib/auth";
import { useAuth } from "../context/AuthContext";
import "./Sidebar.css";

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const keys = allowedKeys(user?.role);
  const items = NAV_ITEMS.filter((i) => keys.includes(i.key));

  return (
    <>
      {open && <div className="sidebar-scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark"><ChefHat size={20} /></div>
          <div>
            <div className="sidebar-brand-name">Orderin POS</div>
            <div className="sidebar-brand-tag">Restaurant Operations</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {items.map((item) => (
            <NavLink
              key={item.key}
              to={item.path}
              className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
              onClick={onClose}
            >
              <item.icon size={18} strokeWidth={2} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
