import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, LogOut } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import "./Header.css";
import Notification from "./Notification";

const RESTAURANT_ID = "orderin_restaurant_4";

/** Restaurant name from its Firestore profile (falls back to "Restaurant"). */
function useRestaurantName() {
  const [name, setName] = useState("Restaurant");
  useEffect(() => {
    let alive = true;
    getDoc(doc(db, "Restaurant", RESTAURANT_ID))
      .then((snap) => {
        const data = snap && typeof snap.exists === "function" && snap.exists() ? snap.data() : null;
        const value = data && (data.name || data.restaurantName);
        if (alive && value) setName(String(value));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return name;
}

/**
 * Top bar shown on every staff page (Maroon modern UI): logo, restaurant
 * name, notifications and log out. No sidebar — pages use the full width and
 * navigate via the Dashboard's module cards and their own Back buttons.
 */
export default function Header() {
  const navigate = useNavigate();
  const [showNotification, setShowNotification] = useState(false);
  const restaurantName = useRestaurantName();

  const handleLogout = () => {
    // Clear main auth
    localStorage.removeItem("auth");

    // Clear section auth so back/forward cannot bypass menu/finance/inventory login screens
    localStorage.removeItem("menuAuth");
    localStorage.removeItem("financeAuth");
    localStorage.removeItem("inventoryAuth");
    localStorage.removeItem("staffAuth");
    sessionStorage.removeItem("menuAuth");
    sessionStorage.removeItem("financeAuth");
    sessionStorage.removeItem("inventoryAuth");
    sessionStorage.removeItem("staffAuth");

    navigate("/", { replace: true });
  };

  return (
    <>
      <header className="header header--no-nav">
        <div className="header-left">
          <img src="/images/OrderIn.png" alt="OrderIn logo" className="orderin-logo" />
        </div>

        <div className="header-center">
          <span className="header-eyebrow">Restaurant console</span>
          <h1 className="restaurant-name">{restaurantName}</h1>
        </div>

        <div className="header-right">
          <button className="icon-btn" onClick={() => setShowNotification(true)} aria-label="Notifications">
            <Bell size={20} aria-hidden="true" />
          </button>
          <button className="icon-btn logout-btn" onClick={handleLogout} aria-label="Log out">
            <LogOut size={20} aria-hidden="true" />
          </button>
        </div>
      </header>
      {showNotification && <Notification onClose={() => setShowNotification(false)} />}
    </>
  );
}
