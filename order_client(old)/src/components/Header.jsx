import { useState } from "react";
import { useNavigate } from "react-router-dom";
// using image icons instead of lucide icons
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
          <img src="/images/Group-15.png" alt="center logo" className="center-logo" />
        </div>

        <div className="header-right">
          <button className="icon-btn" onClick={handleNotificationClick}>
            <img src="/images/Notification.png" alt="notifications" className="icon-img" />
          </button>
          <button className="icon-btn" onClick={handleLogout}>
            <img src="/images/Export.png" alt="logout" className="icon-img" />
          </button>
        </div>
      </header>
      {showNotification && <Notification onClose={handleCloseNotification} />}
    </>
  );
}
