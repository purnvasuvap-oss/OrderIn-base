import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import NotificationWatcher from "./NotificationWatcher";

export default function AppLayout({ title }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <NotificationWatcher />
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="app-content">
        <Topbar onMenuClick={() => setOpen((o) => !o)} title={title} />
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
