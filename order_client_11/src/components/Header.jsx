import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, LogOut, Store } from "lucide-react";
import "./Header.css";
import Notification from "./Notification";

export default function Header() {
  const navigate = useNavigate();
  const [showNotification, setShowNotification] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("auth");
    navigate("/");
  };

  const handleNotificationClick = () => {
    setShowNotification(true);
  };

  const handleCloseNotification = () => {
    setShowNotification(false);
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <img src="/images/OrderIn.png" alt="OrderIn logo" className="orderin-logo" />
        </div>

        <div className="header-center">
          <div className="center-mark" aria-label="restaurant operations">
            <Store size={24} />
            <span>Operations Hub</span>
          </div>
        </div>

        <div className="header-right">
          <button className="icon-btn" onClick={handleNotificationClick} aria-label="Open notifications" title="Notifications">
            <Bell size={22} />
          </button>
          <button className="icon-btn" onClick={handleLogout} aria-label="Log out" title="Log out">
            <LogOut size={22} />
          </button>
        </div>
      </header>
      {showNotification && <Notification onClose={handleCloseNotification} />}
    </>
  );
}
