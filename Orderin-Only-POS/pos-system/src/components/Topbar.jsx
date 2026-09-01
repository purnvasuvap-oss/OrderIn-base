import { Menu, Wifi, WifiOff, LogOut, CloudUpload, Printer } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { usePrinterStatus } from "../hooks/usePrinterStatus";
import { ROLE_LABELS } from "../lib/auth";
import "./Topbar.css";

export default function Topbar({ onMenuClick, title }) {
  const { user, logout } = useAuth();
  const { online, pending } = useOnlineStatus();
  const printerConnection = usePrinterStatus();

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="topbar-menu-btn" onClick={onMenuClick} aria-label="Toggle menu">
          <Menu size={20} />
        </button>
        {title && <h1 className="topbar-title">{title}</h1>}
      </div>
      <div className="topbar-right">
        <div className={`status-pill ${online ? "status-online" : "status-offline"}`}>
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{online ? "Online" : "Offline"}</span>
          {pending > 0 && (
            <span className="status-pending"><CloudUpload size={12} /> {pending}</span>
          )}
        </div>
        <div className={`status-pill printer-pill ${printerConnection ? "status-online" : "status-neutral"}`} title={printerConnection ? `Connected: ${printerConnection.name}` : "No hardware printer connected"}>
          <Printer size={14} />
          <span>{printerConnection ? printerConnection.name : "No printer"}</span>
        </div>
        <div className="topbar-user">
          <div className="topbar-avatar">{user?.name?.[0]?.toUpperCase() || "U"}</div>
          <div className="topbar-user-meta">
            <div className="topbar-user-name">{user?.name}</div>
            <div className="topbar-user-role">{ROLE_LABELS[user?.role]}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={logout} title="Log out">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
