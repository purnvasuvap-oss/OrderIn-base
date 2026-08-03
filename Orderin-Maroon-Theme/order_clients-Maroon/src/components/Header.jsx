import { useState } from "react";
import { useNavigate } from "react-router-dom";
// using image icons instead of lucide icons
import { FaRegBell,FaSignOutAlt} from 'react-icons/fa'; 
import { FiLogOut } from 'react-icons/fi';
import "./Header.css";
import Notification from "./Notification";

export default function Header() {
  const navigate = useNavigate();
  const [showNotification, setShowNotification] = useState(false);

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
          <h1 className="restaurant-name">XYZ Restaurant</h1>
        </div>

        <div className="header-right">
          <button className="icon-btn" onClick={handleNotificationClick}>
            <FaRegBell size={24} alt="notifications" color="#F2BB46"className="icon-img"/>
          </button>
          <button className="icon-btn" onClick={handleLogout}>
            <FaSignOutAlt size={34} color="#F2BB46" alt="log out" classname="icon-img" />
          </button>
        </div>
      </header>
      {showNotification && <Notification onClose={handleCloseNotification} />}
    </>
  );
}
